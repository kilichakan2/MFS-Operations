/**
 * app/api/haccp/process-room/route.ts
 *
 * GET  — today's temperature readings + diary phase completions
 * POST — submit temperature session OR a diary phase
 *
 * Batch 4: action field removed from CAPayload — server derives action_taken
 * from protocol lookup (CA-001). Cause validated against valid set.
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
  'A/C or cooling failure',
  'Doors left open',
  'Product held in room too long',
  'Batch too large',
  'Equipment failure',
  'Power interruption',
  'Other',
])

// ─── Protocol lookup (CA-001 CCP 3 verbatim) ─────────────────────────────────

const PROTOCOLS: Record<string, string[]> = {
  product_breach: [
    'Return product to chilled storage immediately',
    'Record time product was above temperature limit',
    'If <2 hours at <8\u00b0C: complete processing within 30 minutes then chill',
    'If >2 hours or >8\u00b0C: segregate product for safety assessment',
    'Reduce batch sizes for future processing',
  ],
  room_breach_high: [
    'Stop loading product into room',
    'Return all product to chilled storage immediately',
    'Investigate cooling failure urgently',
    'Do not resume until temperature below 12\u00b0C',
  ],
  room_breach_amber: [
    'Do NOT stop cutting',
    'Bring product to production progressively in small quantities',
    'Monitor product core temperature — must remain \u22644\u00b0C',
    'If core temp rises above 4\u00b0C, return to chilled storage',
    'Investigate cause — check A/C and cooling unit',
  ],
  equipment_failure: [
    'Document time of failure discovery',
    'Transfer products to chilled storage immediately',
    'Estimate time product was at elevated temperature',
    'Contact refrigeration/maintenance engineer urgently',
    'Assess each product individually (if >2h above limit)',
    'Complete equipment failure log',
  ],
}

function deriveProcRoomAction(
  cause: string,
  productBreached: boolean,
  roomBreached: boolean,
  roomTemp: number,
): string {
  if (cause === 'Equipment failure') return PROTOCOLS.equipment_failure.join(' | ')
  if (productBreached)               return PROTOCOLS.product_breach.join(' | ')
  if (roomBreached) {
    return roomTemp > 15
      ? PROTOCOLS.room_breach_high.join(' | ')
      : PROTOCOLS.room_breach_amber.join(' | ')
  }
  return PROTOCOLS.product_breach.join(' | ')
}

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today       = todayUK()
    const requested   = req.nextUrl.searchParams.get('date')
    const queryDate   = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today

    const [temps, diary] = await Promise.all([
      supabase
        .from('haccp_processing_temps')
        .select('session, product_temp_c, room_temp_c, product_within_limit, room_within_limit, within_limits, submitted_at')
        .eq('date', queryDate)
        .order('submitted_at'),
      supabase
        .from('haccp_daily_diary')
        .select('phase, check_results, issues, what_did_you_do, submitted_at')
        .eq('date', queryDate)
        .order('submitted_at'),
    ])

    if (temps.error) return NextResponse.json({ error: temps.error.message }, { status: 500 })
    if (diary.error) return NextResponse.json({ error: diary.error.message }, { status: 500 })

    return NextResponse.json({
      date:  queryDate,
      temps: temps.data ?? [],
      diary: diary.data ?? [],
    })

  } catch (err) {
    console.error('[GET /api/haccp/process-room]', err)
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
    const { type } = body as { type: 'temps' | 'diary' }

    if (type === 'temps') {
      const { session, date, product_temp_c, room_temp_c, corrective_action } = body as {
        session:       'AM' | 'PM'
        date:          string
        product_temp_c: number
        room_temp_c:    number
        corrective_action?: {
          cause:       string
          disposition: string
          recurrence:  string
          notes:       string
        }
      }

      if (!session || !date || product_temp_c == null || room_temp_c == null) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      // B3: reject past/future dates — HACCP records must be immutable
      if (date !== todayUK()) {
        return NextResponse.json(
          { error: "Readings may only be submitted for today's date." },
          { status: 400 },
        )
      }

      const productPass = product_temp_c <= 4.0
      const roomPass    = room_temp_c    <= 12.0
      const bothPass    = productPass && roomPass
      const hasDeviation = !bothPass

      // B5: if any deviation, require complete corrective_action payload
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

      // ── 1. Insert the reading, select back the id for CA linking ──
      const { data: inserted, error: insertErr } = await supabase
        .from('haccp_processing_temps')
        .insert({
          submitted_by:              userId,
          date,
          session,
          product_temp_c,
          room_temp_c,
          product_within_limit:      productPass,
          room_within_limit:         roomPass,
          within_limits:             bothPass,
          corrective_action_required: hasDeviation,
        })
        .select('id')
        .single()

      if (insertErr || !inserted) {
        // 23505 = unique_violation on idx_haccp_pt_unique
        if (insertErr && (insertErr as { code?: string }).code === '23505') {
          return NextResponse.json(
            { error: `This ${session} check has already been submitted for today.` },
            { status: 409 },
          )
        }
        return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
      }

      // ── 2. If deviation, write one CA row per breached channel ──
      let caWriteFailed = false
      if (hasDeviation && corrective_action) {
        const dispositionEnum = DISPOSITION_MAP[corrective_action.disposition]
        const recurrence = corrective_action.notes
          ? `${corrective_action.recurrence} | Notes: ${corrective_action.notes}`
          : corrective_action.recurrence

        // Derive action_taken server-side per channel
        const productActionText = deriveProcRoomAction(
          corrective_action.cause, true, false, room_temp_c,
        )
        const roomActionText = deriveProcRoomAction(
          corrective_action.cause, false, true, room_temp_c,
        )

        const caRows: Array<Record<string, unknown>> = []
        if (!productPass) {
          caRows.push({
            actioned_by:   userId,
            source_table:  'haccp_processing_temps',
            source_id:     inserted.id,
            ccp_ref:       'CCP3',
            deviation_description:
              `Product: ${product_temp_c}\u00b0C (limit \u22644\u00b0C). Cause: ${corrective_action.cause}`,
            action_taken:             productActionText,
            product_disposition:      dispositionEnum,
            recurrence_prevention:    recurrence,
            management_verification_required: true,
          })
        }
        if (!roomPass) {
          caRows.push({
            actioned_by:   userId,
            source_table:  'haccp_processing_temps',
            source_id:     inserted.id,
            ccp_ref:       'CCP3',
            deviation_description:
              `Room: ${room_temp_c}\u00b0C (limit \u226412\u00b0C). Cause: ${corrective_action.cause}`,
            action_taken:             roomActionText,
            product_disposition:      dispositionEnum,
            recurrence_prevention:    recurrence,
            management_verification_required: room_temp_c > 15,
          })
        }

        const { error: caErr } = await supabase
          .from('haccp_corrective_actions')
          .insert(caRows)

        if (caErr) {
          console.error('[POST /api/haccp/process-room] CA insert failed:', caErr)
          caWriteFailed = true
        }
      }

      return NextResponse.json({
        ok:              true,
        has_deviation:   hasDeviation,
        ca_write_failed: caWriteFailed,
      })
    }

    if (type === 'diary') {
      const { phase, date, check_results, issues, what_did_you_do } = body as {
        phase:            'opening' | 'operational' | 'closing'
        date:             string
        check_results:    Record<string, boolean>
        issues:           boolean
        what_did_you_do?: string
      }

      if (!phase || !date || !check_results) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      // B4: reject past/future dates
      if (date !== todayUK()) {
        return NextResponse.json(
          { error: "Diary entries may only be submitted for today's date." },
          { status: 400 },
        )
      }

      if (issues && !what_did_you_do?.trim()) {
        return NextResponse.json({ error: 'Please describe what was done about the issue' }, { status: 400 })
      }

      // ── 1. Insert diary row, select id back for CA linking ──
      const { data: diaryInserted, error: insertErr } = await supabase
        .from('haccp_daily_diary')
        .insert({
          submitted_by:   userId,
          date,
          phase,
          check_results,
          issues,
          what_did_you_do: what_did_you_do?.trim() || null,
        })
        .select('id')
        .single()

      if (insertErr || !diaryInserted) {
        if (insertErr && (insertErr as { code?: string }).code === '23505') {
          return NextResponse.json(
            { error: `${phase[0].toUpperCase() + phase.slice(1)} checks have already been submitted for today.` },
            { status: 409 },
          )
        }
        return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
      }

      // ── 2. B6: if issues, write basic CA row per failed check item ──
      // Quick version — structured disposition/cause/recurrence TBC.
      let caWriteFailed = false
      if (issues) {
        const failedKeys = Object.entries(check_results)
          .filter(([, ok]) => ok === false)
          .map(([key]) => key)

        if (failedKeys.length > 0) {
          const caRows = failedKeys.map((key) => ({
            actioned_by:   userId,
            source_table:  'haccp_daily_diary',
            source_id:     diaryInserted.id,
            ccp_ref:       `SOP1-${phase}`,
            deviation_description: `Diary (${phase}) — failed check: ${key}`,
            action_taken:  (what_did_you_do ?? '').trim() || 'See diary entry',
            product_disposition:      null,
            recurrence_prevention:    null,
            management_verification_required: false,
          }))

          const { error: caErr } = await supabase
            .from('haccp_corrective_actions')
            .insert(caRows)

          if (caErr) {
            console.error('[POST /api/haccp/process-room] diary CA insert failed:', caErr)
            caWriteFailed = true
          }
        }
      }

      return NextResponse.json({ ok: true, ca_write_failed: caWriteFailed })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/process-room]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
