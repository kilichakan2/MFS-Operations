/**
 * app/api/haccp/delivery/route.ts
 *
 * GET  — today's deliveries + supplier list + next delivery number
 * POST — submit a new delivery record
 *        delivery_number assigned server-side (COUNT today + 1)
 *        batch_number: DDMM-CC-N (ISO alpha-2 from born_in)
 *
 * Batch 2:
 *   C1  — CCA popup wired to haccp_corrective_actions. Two independent
 *          deviation tracks (temp + contam), one CA row per active track.
 *   C8  — born_in / reared_in / slaughter_site / cut_site mandatory.
 *   fmt — batch code DDMM-CC-N (was DDMM-COUNTRY-SITE-N).
 *
 * Batch 3:
 *   C6  — contamination_type required when deviation flagged.
 *          Server derives action_taken from (temp_status × cause) and
 *          contamination_type — not user-supplied. action field removed
 *          from CAPayload. Cause validated against track-specific sets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// ─── Types ────────────────────────────────────────────────────────────────────

// action is NOT in the payload — server derives it from deviation + cause
type CAPayload = {
  cause:       string
  disposition: string
  recurrence:  string
  notes?:      string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DISPOSITION_MAP: Record<string, string> = {
  'Accept':             'accept',
  'Conditional accept': 'conditional_accept',
  'Assess':             'assess',
  'Reject':             'reject',
  'Dispose':            'dispose',
}

// Valid causes per track — client must send one of these
const VALID_TEMP_CAUSES = new Set([
  'Cold chain break in transport',
  'Inadequate pre-chilling at supplier',
  'Vehicle refrigeration failure',
  'Delivery delayed — product held too long',
  'Other',
])

const VALID_CONTAM_CAUSES = new Set([
  'Contamination during handling',
  'Packaging damaged in transit',
  'Supplier loading error',
  'Missing documentation',
  'Other',
])

const VALID_CONTAM_TYPES = new Set([
  'uncovered', 'contaminated_faecal', 'packaging_damaged', 'missing_docs',
])

// ─── Protocol lookup (CA-001 verbatim) ────────────────────────────────────────

const PROTOCOL_CONDITIONAL_ACCEPT = [
  'Accept conditionally — do NOT reject the delivery',
  'Place immediately into coldest chiller area',
  'Use within reduced shelf life — halve remaining use-by',
  'Document assessment and accelerated use decision',
  'Review supplier performance',
]

const PROTOCOL_REJECT = [
  'REJECT delivery immediately — do NOT accept product',
  'Photograph product and temperature reading',
  'Complete Non-Conformance Report',
  'Notify supplier in writing within 24 hours',
  'Segregate and arrange return or disposal',
]

const PROTOCOL_EQUIPMENT_FAILURE = [
  'Verify product core temperature with calibrated probe',
  'If within conditional limits: accept with reduced shelf life; if exceeds legal limit: REJECT',
  'Document refrigeration failure and photograph vehicle thermometer',
  'Report equipment failure to supplier in writing',
  'Do not use this vehicle until fault is rectified',
]

const PROTOCOL_CONTAM: Record<string, string[]> = {
  uncovered: [
    'If minor exposure only: re-cover immediately, use for immediate processing only',
    'If visible contamination or cross-contamination risk: REJECT',
    'Document incident and notify supplier',
  ],
  contaminated_faecal: [
    'Trim contaminated area using clean knife',
    'Dispose of trimmings as Category 2/3 ABP',
    'Sterilise knife immediately after trimming (≥82°C)',
    'Document trimming action and disposal',
    'If contamination excessive: REJECT entire carcase',
  ],
  packaging_damaged: [
    'If seal broken on vacuum pack or visible ingress: REJECT and dispose',
    'Minor outer damage with intact inner seal: re-pack and use immediately',
    'Document and notify supplier',
  ],
  missing_docs: [
    'Hold product in segregated area',
    'Request traceability documents from supplier within 2 hours',
    'If not received within 2 hours: REJECT delivery',
  ],
}

function deriveTempAction(status: string, cause: string): string {
  if (cause === 'Vehicle refrigeration failure') {
    return PROTOCOL_EQUIPMENT_FAILURE.join(' | ')
  }
  return status === 'urgent'
    ? PROTOCOL_CONDITIONAL_ACCEPT.join(' | ')
    : PROTOCOL_REJECT.join(' | ')
}

function deriveContamAction(contamType: string): string {
  const steps = PROTOCOL_CONTAM[contamType]
  return steps ? steps.join(' | ') : 'Assess and take appropriate action per CA-001'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function nowTimeUK(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function tempStatus(temp: number, category: string): 'pass' | 'urgent' | 'fail' {
  switch (category) {
    case 'lamb':
    case 'beef':
    case 'red_meat':   return temp <= 5.0   ? 'pass' : temp <= 8.0   ? 'urgent' : 'fail'
    case 'offal':      return temp <= 3.0   ? 'pass' : 'fail'
    case 'mince_prep': return temp <= 4.0   ? 'pass' : 'fail'
    case 'frozen':     return temp <= -18.0 ? 'pass' : temp <= -15.0 ? 'urgent' : 'fail'
    default:           return 'fail'
  }
}

// Batch number: DDMM-CC-N (ISO alpha-2 from born_in, N = delivery number today)
function buildBatchNumber(
  date: string,
  countryCode: string,
  deliveryNumber: number,
): string {
  const d  = new Date(date + 'T00:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}${mm}-${countryCode}-${deliveryNumber}`
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today = todayUK()
    const range = req.nextUrl.searchParams.get('range') ?? 'today'

    // This week = Monday of current ISO week through today
    const weekStart = (() => {
      const d   = new Date(today + 'T00:00:00')
      const day = d.getDay() === 0 ? 7 : d.getDay()  // Sunday = 7
      d.setDate(d.getDate() - (day - 1))
      return d.toLocaleDateString('en-CA')
    })()

    // Last week = Mon–Sun of previous ISO week
    const lastWeekStart = (() => {
      const d   = new Date(today + 'T00:00:00')
      const day = d.getDay() === 0 ? 7 : d.getDay()
      d.setDate(d.getDate() - (day - 1) - 7)
      return d.toLocaleDateString('en-CA')
    })()
    const lastWeekEnd = (() => {
      const d   = new Date(today + 'T00:00:00')
      const day = d.getDay() === 0 ? 7 : d.getDay()
      d.setDate(d.getDate() - day)          // previous Sunday
      return d.toLocaleDateString('en-CA')
    })()

    const baseQuery = supabase
      .from('haccp_deliveries')
      .select(`
        id, date, time_of_delivery, supplier, product, product_category, species,
        temperature_c, temp_status, covered_contaminated, contamination_notes, notes,
        born_in, reared_in, slaughter_site, cut_site, batch_number, delivery_number,
        allergens_identified, allergen_notes,
        submitted_at, users!inner(name)
      `)

    const [deliveries, suppliers] = await Promise.all([
      (range === 'week'      ? baseQuery.gte('date', weekStart).lte('date', today)
       : range === 'last_week' ? baseQuery.gte('date', lastWeekStart).lte('date', lastWeekEnd)
       : baseQuery.eq('date', today)
      ).order('date', { ascending: false }).order('delivery_number', { ascending: false }),
      supabase
        .from('haccp_suppliers')
        .select('id, name')
        .eq('active', true)
        .order('name'),
    ])

    if (deliveries.error) return NextResponse.json({ error: deliveries.error.message }, { status: 500 })
    if (suppliers.error)  return NextResponse.json({ error: suppliers.error.message  }, { status: 500 })

    const allDeliveries = deliveries.data ?? []
    const nextNumber    = allDeliveries.filter(d => d.date === today).length + 1

    return NextResponse.json({
      date:        today,
      deliveries:  allDeliveries,
      suppliers:   suppliers.data ?? [],
      next_number: nextNumber,
    })

  } catch (err) {
    console.error('[GET /api/haccp/delivery] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const {
      supplier_id, supplier_name,
      product, product_category, temperature_c,
      covered_contaminated, contamination_type, contamination_notes, notes,
      born_in, reared_in, slaughter_site, cut_site,
      allergens_identified, allergen_notes,
      corrective_action_temp,
      corrective_action_contam,
    } = body as {
      supplier_id?:              string
      supplier_name?:            string
      product:                   string
      product_category:          string
      temperature_c:             number
      covered_contaminated:      string
      contamination_type?:       string
      contamination_notes?:      string
      notes?:                    string
      born_in?:                  string
      reared_in?:                string
      slaughter_site?:           string
      allergens_identified:      boolean
      allergen_notes?:           string
      cut_site?:                 string
      corrective_action_temp?:   CAPayload
      corrective_action_contam?: CAPayload
    }

    // ── Supplier resolution (C2) ──────────────────────────────────────────────
    if (!supplier_id && !supplier_name?.trim()) {
      return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    }

    let resolvedSupplierId: string | null = null
    let resolvedSupplierName: string

    if (supplier_id) {
      const { data: sup, error: supErr } = await supabase
        .from('haccp_suppliers')
        .select('id, name, active')
        .eq('id', supplier_id)
        .single()

      if (supErr || !sup) {
        return NextResponse.json({ error: 'Unknown supplier' }, { status: 400 })
      }
      if (!sup.active) {
        return NextResponse.json({ error: 'Supplier is no longer approved' }, { status: 400 })
      }
      resolvedSupplierId   = sup.id
      resolvedSupplierName = sup.name
    } else {
      resolvedSupplierName = supplier_name!.trim()
    }

    // ── Basic validation ──────────────────────────────────────────────────────
    if (!product?.trim())
      return NextResponse.json({ error: 'Product description is required' }, { status: 400 })
    if (!product_category)
      return NextResponse.json({ error: 'Select a product category' }, { status: 400 })
    if (temperature_c == null || isNaN(temperature_c))
      return NextResponse.json({ error: 'Temperature is required' }, { status: 400 })
    if (!covered_contaminated)
      return NextResponse.json({ error: 'Covered / contaminated field is required' }, { status: 400 })

    // ── C8: traceability mandatory on every delivery ──────────────────────────
    const missing: string[] = []
    if (!born_in?.trim())        missing.push('Born in')
    if (!reared_in?.trim())      missing.push('Reared in')
    if (!slaughter_site?.trim()) missing.push('Slaughter site')
    if (!cut_site?.trim())       missing.push('Cut site')
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Traceability required: ${missing.join(', ')}` },
        { status: 400 },
      )
    }

    const today  = todayUK()
    const status = tempStatus(temperature_c, product_category)
    // Allergens on an allergen-free site = automatic non-conformance
    const hasDeviationAllergen = allergens_identified === true
    const corrective_action_required = status !== 'pass' || covered_contaminated !== 'no' || hasDeviationAllergen

    // ── C1: pre-validate CA payloads before any DB write ─────────────────────
    const hasDeviationTemp   = status === 'urgent' || status === 'fail'
    const hasDeviationContam = covered_contaminated === 'yes' || covered_contaminated === 'yes_actioned'

    if (hasDeviationTemp) {
      if (!corrective_action_temp) {
        return NextResponse.json(
          { error: 'Corrective action required for temperature deviation' },
          { status: 400 },
        )
      }
      const { cause, disposition, recurrence } = corrective_action_temp
      if (!cause?.trim() || !disposition?.trim() || !recurrence?.trim()) {
        return NextResponse.json(
          { error: 'Corrective action incomplete (temp track)' },
          { status: 400 },
        )
      }
      if (!VALID_TEMP_CAUSES.has(cause)) {
        return NextResponse.json(
          { error: `Invalid temperature cause: ${cause}` },
          { status: 400 },
        )
      }
      if (!DISPOSITION_MAP[disposition]) {
        return NextResponse.json(
          { error: `Invalid disposition: ${disposition}` },
          { status: 400 },
        )
      }
    }

    if (hasDeviationContam) {
      // C6: contamination_type required
      if (!contamination_type?.trim() || !VALID_CONTAM_TYPES.has(contamination_type)) {
        return NextResponse.json(
          { error: 'Contamination type required (uncovered / contaminated_faecal / packaging_damaged / missing_docs)' },
          { status: 400 },
        )
      }
      if (!corrective_action_contam) {
        return NextResponse.json(
          { error: 'Corrective action required for contamination deviation' },
          { status: 400 },
        )
      }
      const { cause, disposition, recurrence } = corrective_action_contam
      if (!cause?.trim() || !disposition?.trim() || !recurrence?.trim()) {
        return NextResponse.json(
          { error: 'Corrective action incomplete (contamination track)' },
          { status: 400 },
        )
      }
      if (!VALID_CONTAM_CAUSES.has(cause)) {
        return NextResponse.json(
          { error: `Invalid contamination cause: ${cause}` },
          { status: 400 },
        )
      }
      if (!DISPOSITION_MAP[disposition]) {
        return NextResponse.json(
          { error: `Invalid disposition: ${disposition}` },
          { status: 400 },
        )
      }
    }

    // ── Count today's deliveries (delivery_number) ────────────────────────────
    const { count, error: countErr } = await supabase
      .from('haccp_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('date', today)

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    const deliveryNumber = (count ?? 0) + 1

    // born_in guaranteed non-null after C8 check above
    const batchNumber = buildBatchNumber(today, born_in!.trim(), deliveryNumber)

    // ── Insert delivery, select id back for CA source_id ─────────────────────
    const { data: inserted, error: insertErr } = await supabase
      .from('haccp_deliveries')
      .insert({
        submitted_by:              userId,
        date:                      today,
        time_of_delivery:          nowTimeUK(),
        supplier:                  resolvedSupplierName,
        supplier_id:               resolvedSupplierId,
        product:                   product.trim(),
        product_category,
        temperature_c,
        temp_status:               status,
        covered_contaminated,
        contamination_type:        hasDeviationContam ? contamination_type!.trim() : null,
        contamination_notes:       contamination_notes?.trim() || null,
        corrective_action_required,
        notes:                     notes?.trim() || null,
        born_in:                   born_in!.trim(),
        reared_in:                 reared_in!.trim(),
        slaughter_site:            slaughter_site!.trim(),
        cut_site:                  cut_site!.trim(),
        delivery_number:           deliveryNumber,
        batch_number:              batchNumber,
        allergens_identified:      hasDeviationAllergen,
        allergen_notes:            hasDeviationAllergen ? (allergen_notes?.trim() || null) : null,
      })
      .select('id')
      .single()

    if (insertErr) {
      // C11: unique_violation on uq_haccp_deliveries_date_num → clean 409
      if ((insertErr as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'Another delivery was logged at the same moment. Please retry.' },
          { status: 409 },
        )
      }
      console.error('[POST /api/haccp/delivery]', insertErr.message)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // ── C1: insert CA rows (one per active track) ─────────────────────────────
    let caWriteFailed = false

    if ((hasDeviationTemp || hasDeviationContam) && inserted) {
      const caRows: Array<Record<string, unknown>> = []

      if (hasDeviationTemp && corrective_action_temp) {
        const ca         = corrective_action_temp
        const actionText = deriveTempAction(status, ca.cause)
        const rec        = ca.notes?.trim()
          ? `${ca.recurrence} | Notes: ${ca.notes.trim()}`
          : ca.recurrence

        caRows.push({
          actioned_by:                     userId,
          source_table:                    'haccp_deliveries',
          source_id:                       inserted.id,
          ccp_ref:                         'CCP1',
          deviation_description:           `Temperature: ${temperature_c}°C (${status}) on ${product_category}. Cause: ${ca.cause}`,
          action_taken:                    actionText,
          product_disposition:             DISPOSITION_MAP[ca.disposition],
          recurrence_prevention:           rec,
          management_verification_required: status === 'fail',
          resolved:                        false,
        })
      }

      if (hasDeviationContam && corrective_action_contam) {
        const ca         = corrective_action_contam
        const actionText = deriveContamAction(contamination_type!)
        const rec        = ca.notes?.trim()
          ? `${ca.recurrence} | Notes: ${ca.notes.trim()}`
          : ca.recurrence

        caRows.push({
          actioned_by:                     userId,
          source_table:                    'haccp_deliveries',
          source_id:                       inserted.id,
          ccp_ref:                         'CCP1',
          deviation_description:           `Contamination: ${covered_contaminated} (${contamination_type}). Cause: ${ca.cause}`,
          action_taken:                    actionText,
          product_disposition:             DISPOSITION_MAP[ca.disposition],
          recurrence_prevention:           rec,
          management_verification_required: covered_contaminated === 'yes',
          resolved:                        false,
        })
      }

      // Allergen CA — automatic when allergens identified on allergen-free site
      if (hasDeviationAllergen) {
        caRows.push({
          actioned_by:                     userId,
          source_table:                    'haccp_deliveries',
          source_id:                       inserted.id,
          ccp_ref:                         'CCP1',
          deviation_description:           `Allergen identified in delivery — MFS is an allergen-free site. ${allergen_notes?.trim() ? `Details: ${allergen_notes.trim()}` : 'No further detail provided.'}`,
          action_taken:                    'Delivery quarantined pending management review. Do not process until CA resolved.',
          product_disposition:             'Quarantine — pending management review',
          recurrence_prevention:           'Review supplier specification. Ensure allergen-free status confirmed on all future deliveries.',
          management_verification_required: true,
          resolved:                        false,
        })
      }

      if (caRows.length > 0) {
        const { error: caErr } = await supabase
          .from('haccp_corrective_actions')
          .insert(caRows)

        if (caErr) {
          console.error('[POST /api/haccp/delivery] CA insert failed:', caErr)
          caWriteFailed = true
        }
      }
    }

    return NextResponse.json({
      ok:                         true,
      temp_status:                status,
      corrective_action_required,
      delivery_number:            deliveryNumber,
      batch_number:               batchNumber,
      ca_write_failed:            caWriteFailed,
    })

  } catch (err) {
    console.error('[POST /api/haccp/delivery] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
