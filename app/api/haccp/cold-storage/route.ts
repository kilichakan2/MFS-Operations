/**
 * app/api/haccp/cold-storage/route.ts
 *
 * GET  — returns all active cold storage units + today's readings
 * POST — submits readings for a session (AM or PM), plus writes a corrective
 *        action row (one per deviating reading) when any reading fails.
 *
 * Batch 4: action field removed from CAPayload — server derives action_taken
 * from protocol lookup (CA-001). Cause validated against valid set.
 * Disposition pre-filled by client; validated server-side.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

/** UI-label -> DB enum value. DB CHECK constraint limits these five. */
const DISPOSITION_MAP: Record<string, string> = {
  'Accept':             'accept',
  'Conditional accept': 'conditional_accept',
  'Assess':             'assess',
  'Reject':             'reject',
  'Dispose':            'dispose',
}

const VALID_CAUSES = new Set([
  'Door left open',
  'Unit overloaded',
  'Seal damaged',
  'Equipment failure',
  'Power interruption',
  'Other',
])

// ─── Protocol lookup (CA-001 verbatim) ────────────────────────────────────────

const PROTOCOLS: Record<string, string[]> = {
  chiller_critical: [
    'Minimise door openings immediately',
    'Transfer all product to backup unit immediately',
    'Probe individual products to assess core temperature',
    'Segregate any product above the legal limit for assessment',
    'Contact refrigeration engineer urgently',
    'Assess all product for safety before release',
  ],
  chiller_amber: [
    'Check door seals and closure',
    'Verify unit not overloaded / reduce loading',
    'Recheck temperature within 30 minutes',
    'Transfer product to backup chiller if temperature does not recover',
    'Call refrigeration engineer if fault persists',
  ],
  freezer_critical: [
    'Assess product for thawing (ice crystal formation, texture)',
    'Transfer to functioning freezer immediately',
    'Do NOT refreeze if product has fully thawed',
    'Contact refrigeration engineer urgently',
  ],
  freezer_amber: [
    'Keep door closed — minimise openings',
    'Check for ice build-up on coils',
    'Monitor temperature — acceptable short-term if product re-frozen immediately',
    'Call refrigeration engineer if temperature does not recover',
  ],
  equipment_failure: [
    'Document time of failure discovery',
    'Transfer products to backup refrigeration immediately',
    'Estimate time product was at elevated temperature',
    'Contact refrigeration engineer urgently',
    'Assess each product individually (if >2h above limit)',
    'Complete equipment failure log',
  ],
}

function deriveColdStorageAction(
  cause: string,
  worstStatus: 'amber' | 'critical',
  worstUnitType: string,
): string {
  if (cause === 'Equipment failure') return PROTOCOLS.equipment_failure.join(' | ')
  if (worstUnitType === 'freezer') {
    return worstStatus === 'critical'
      ? PROTOCOLS.freezer_critical.join(' | ')
      : PROTOCOLS.freezer_amber.join(' | ')
  }
  return worstStatus === 'critical'
    ? PROTOCOLS.chiller_critical.join(' | ')
    : PROTOCOLS.chiller_amber.join(' | ')
}

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function tempStatus(temp: number, targetC: number, maxC: number): 'pass' | 'amber' | 'critical' {
  if (temp <= targetC) return 'pass'
  if (temp <= maxC)    return 'amber'
  return 'critical'
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Accept ?date= param for historical date viewing, default to today
    const requestedDate = req.nextUrl.searchParams.get('date')
    const today         = todayUK()
    const queryDate     = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today

    const [units, readings] = await Promise.all([
      supabase.from('haccp_cold_storage_units')
        .select('id, name, unit_type, target_temp_c, max_temp_c')
        .eq('active', true)
        .order('position'),
      supabase.from('haccp_cold_storage_temps')
        .select('unit_id, session, temperature_c, temp_status, comments')
        .eq('date', queryDate),
    ])

    if (units.error) return NextResponse.json({ error: units.error.message }, { status: 500 })

    return NextResponse.json({
      units:    units.data ?? [],
      readings: readings.data ?? [],
      date:     queryDate,
    })
  } catch (err) {
    console.error('[GET /api/haccp/cold-storage]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { session, date, readings, comments, corrective_action } = body as {
      session:  'AM' | 'PM'
      date:     string
      readings: { unit_id: string; temperature_c: number; unit_type: string }[]
      comments: string
      corrective_action?: {
        cause:       string
        disposition: string
        recurrence:  string
        notes:       string
      }
    }

    if (!session || !date || !Array.isArray(readings) || readings.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── A4: reject past/future dates — HACCP records must be immutable after-the-fact ──
    if (date !== todayUK()) {
      return NextResponse.json(
        { error: "Readings may only be submitted for today's date." },
        { status: 400 },
      )
    }

    // ── A3 + A6: derive unit_type AND thresholds from DB, not from client ──
    const { data: units, error: unitsErr } = await supabase
      .from('haccp_cold_storage_units')
      .select('id, name, unit_type, target_temp_c, max_temp_c')
      .eq('active', true)

    if (unitsErr || !units || units.length === 0) {
      return NextResponse.json({ error: 'Could not load active units' }, { status: 500 })
    }
    const unitById = new Map<string, {
      id: string; name: string; unit_type: string;
      target_temp_c: number; max_temp_c: number
    }>(units.map((u) => [u.id, u]))
    const unitNameById = new Map<string, string>(units.map((u) => [u.id, u.name]))

    // Every submitted reading must correspond to an active unit
    for (const r of readings) {
      if (!unitById.has(r.unit_id)) {
        return NextResponse.json(
          { error: `Unknown or inactive unit: ${r.unit_id}` },
          { status: 400 },
        )
      }
    }

    // Pre-compute statuses using the SERVER-side unit config, so a malformed
    // client body cannot mis-classify a reading. Thresholds are DB-driven (A6).
    const readingsWithStatus = readings.map((r) => {
      const u = unitById.get(r.unit_id)!
      return {
        ...r,
        unit_type: u.unit_type,
        status:    tempStatus(r.temperature_c, Number(u.target_temp_c), Number(u.max_temp_c)),
      }
    })
    const hasDeviation = readingsWithStatus.some((r) => r.status !== 'pass')

    if (hasDeviation) {
      if (!corrective_action) {
        return NextResponse.json({ error: 'Corrective action required for deviation' }, { status: 400 })
      }
      const { cause, disposition, recurrence } = corrective_action
      if (!cause || !disposition || !recurrence) {
        return NextResponse.json({ error: 'Incomplete corrective action' }, { status: 400 })
      }
      if (!VALID_CAUSES.has(cause)) {
        return NextResponse.json({ error: `Invalid cause: ${cause}` }, { status: 400 })
      }
      if (!DISPOSITION_MAP[disposition]) {
        return NextResponse.json({ error: `Invalid disposition: ${disposition}` }, { status: 400 })
      }
    }

    // ── 1. Insert readings, select IDs back so we can link CA rows to them ──
    const rows = readingsWithStatus.map((r) => ({
      submitted_by:               userId,
      date,
      session,
      unit_id:                    r.unit_id,
      temperature_c:              r.temperature_c,
      temp_status:                r.status,
      comments:                   comments || null,
      corrective_action_required: r.status !== 'pass',
    }))

    const { data: inserted, error: insertErr } = await supabase
      .from('haccp_cold_storage_temps')
      .insert(rows)
      .select('id, unit_id, temperature_c, temp_status')

    if (insertErr || !inserted) {
      // 23505 = Postgres unique_violation — surface a clear message instead
      // of leaking the Postgres error. Triggered by idx_haccp_cst_unique if
      // any (date, session, unit_id) already exists for this submission.
      if (insertErr && (insertErr as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'This session has already been submitted for one or more units.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
    }

    // ── 2. For every deviating reading, write one CA row ───────────────────
    const deviations = inserted.filter((r) => r.temp_status !== 'pass')
    let caWriteFailed = false

    if (deviations.length > 0 && corrective_action) {
      const dispositionEnum =
        DISPOSITION_MAP[corrective_action.disposition] ?? null

      // Build recurrence text — append operator notes if present
      const recurrence = corrective_action.notes
        ? `${corrective_action.recurrence} | Notes: ${corrective_action.notes}`
        : corrective_action.recurrence

      // Derive action_taken server-side from the worst deviation's unit type + status
      const worstDev    = deviations.find((r) => r.temp_status === 'critical') ?? deviations[0]
      const worstUnit   = unitById.get(worstDev.unit_id)
      const worstType   = worstUnit?.unit_type ?? 'chiller'
      const worstStatus = (worstDev.temp_status === 'critical' ? 'critical' : 'amber') as 'amber' | 'critical'
      const actionText  = deriveColdStorageAction(corrective_action.cause, worstStatus, worstType)

      const caRows = deviations.map((r) => ({
        actioned_by:   userId,
        source_table:  'haccp_cold_storage_temps',
        source_id:     r.id,
        ccp_ref:       'CCP2',
        deviation_description:
          `${unitNameById.get(r.unit_id) ?? 'Unknown unit'}: ${r.temperature_c}°C (${r.temp_status}). Cause: ${corrective_action.cause}`,
        action_taken:             actionText,
        product_disposition:      dispositionEnum,
        recurrence_prevention:    recurrence,
        management_verification_required: r.temp_status === 'critical',
      }))

      const { error: caErr } = await supabase
        .from('haccp_corrective_actions')
        .insert(caRows)

      if (caErr) {
        console.error('[POST /api/haccp/cold-storage] CA insert failed:', caErr)
        caWriteFailed = true
      }
    }

    return NextResponse.json({
      ok:              true,
      has_deviation:   deviations.length > 0,
      ca_write_failed: caWriteFailed,
    })

  } catch (err) {
    console.error('[POST /api/haccp/cold-storage]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
