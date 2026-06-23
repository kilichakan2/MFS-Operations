/**
 * app/api/haccp/mince-prep/route.ts
 *
 * GET  — today's mince/meatprep/timesep + recent deliveries (16 days) + today's mince batches
 * POST — submit mince | meatprep | time_separation record
 *
 * Source: MMP-001 V1.0 · MMP-MF-001 V1.0 · MMP-HA-001 V1.0 · CA-001 Table 4
 *
 * F-19 PR2: re-pointed off raw Supabase onto the daily-checks hexagon. The
 * range read (incl. mince_batches projection), validation, run-number counting,
 * batch-code derivation, the persist builds and the CA fan-outs moved to the
 * service (PR1, byte-identical). Route-edge concerns kept here:
 *   - kill-date arithmetic (daysFromKill) passed to the service as a param;
 *   - the mince kill-date hard-fail 400 carries two extra response keys;
 *   - the meatprep response `has_deviation` flag INCLUDES the allergen-label
 *     issue, while its CA write gates on temperature only;
 *   - timesep writes NO CA row (no builder exists).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksService, submitHaccpDailyCheck } from '@/lib/wiring/haccp'
import { ConflictError } from '@/lib/errors'
import type {
  CreateMinceInput,
  CreateMeatPrepInput,
  CreateTimeSeparationInput,
} from '@/lib/domain'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function nowTimeUK(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const range = (req.nextUrl.searchParams.get('range') ?? 'today') as 'today' | 'week' | 'last_week'

    const result = await haccpDailyChecksService.listMincePrep(range)

    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/mince-prep] Unhandled:', err)
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

    const body  = await req.json()
    const { form } = body
    const today = todayUK()

    if (body.date && body.date !== today) {
      return NextResponse.json(
        { error: 'Records may only be submitted for today\'s date' },
        { status: 400 }
      )
    }

    const nowTime = nowTimeUK()

    // ── Mince log ─────────────────────────────────────────────────────────────
    if (form === 'mince') {
      const input = body as CreateMinceInput

      const killDateObj  = new Date(input.kill_date + 'T00:00:00')
      const todayObj     = new Date(today + 'T00:00:00')
      const daysFromKill = Math.floor((todayObj.getTime() - killDateObj.getTime()) / 86400000)

      const v = haccpDailyChecksService.validateMince({ input, daysFromKill })
      if (!v.ok) {
        // The kill-date hard-fail 400 carries two extra keys (route-edge detail).
        if (haccpDailyChecksService.killDateHardFail(input.product_species, daysFromKill)) {
          return NextResponse.json({
            error:               v.message,
            kill_date_hard_fail: true,
            days_from_kill:      daysFromKill,
          }, { status: v.status })
        }
        return NextResponse.json({ error: v.message }, { status: v.status })
      }

      const runNum = (await haccpDailyChecksService.countMinceRuns('haccp_mince_log', today)) + 1
      const built  = haccpDailyChecksService.buildMince({ input, userId, today, nowTime, daysFromKill, runNum })

      let id: string
      try {
        ;({ id } = await haccpDailyChecksService.insertMince(built))
      } catch (e) {
        if (e instanceof ConflictError) {
          return NextResponse.json({ error: e.message }, { status: e.httpStatus })
        }
        throw e
      }

      const caRows = haccpDailyChecksService.buildMinceCorrectiveActions({ input, userId, sourceId: id })
      const { ca_write_failed } = await submitHaccpDailyCheck.fileCorrectiveActions(caRows, 'mince')

      return NextResponse.json({
        ok:             true,
        batch_code:     built.batch_code,
        days_from_kill: daysFromKill,
        kill_pass:      built.kill_date_within_limit,
        has_deviation:  !built.input_temp_pass || !built.output_temp_pass,
        ca_write_failed,
      })
    }

    // ── Meat prep log ─────────────────────────────────────────────────────────
    if (form === 'meatprep') {
      const input = body as CreateMeatPrepInput

      const v = haccpDailyChecksService.validateMeatPrep(input)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      let daysFromKill: number | null = null
      if (input.kill_date) {
        const kd = new Date(input.kill_date + 'T00:00:00')
        const td = new Date(today + 'T00:00:00')
        daysFromKill = Math.floor((td.getTime() - kd.getTime()) / 86400000)
      }

      const runNum = (await haccpDailyChecksService.countMinceRuns('haccp_meatprep_log', today)) + 1
      const built  = haccpDailyChecksService.buildMeatPrep({ input, userId, today, nowTime, daysFromKill, runNum })

      let id: string
      try {
        ;({ id } = await haccpDailyChecksService.insertMeatPrep(built))
      } catch (e) {
        if (e instanceof ConflictError) {
          return NextResponse.json({ error: e.message }, { status: e.httpStatus })
        }
        throw e
      }

      // CA write gates on temperature only (NOT the allergen-label issue).
      const caRows = haccpDailyChecksService.buildMeatPrepCorrectiveActions({ input, userId, sourceId: id })
      const { ca_write_failed } = await submitHaccpDailyCheck.fileCorrectiveActions(caRows, 'meatprep')

      // The response flag INCLUDES the allergen-label issue (broader than the CA gate).
      const allergenLabelIssue = (input.allergens_present?.length ?? 0) > 0 && !input.label_check_completed
      const anyDeviation =
        !built.input_temp_pass || !built.output_temp_pass || allergenLabelIssue

      return NextResponse.json({
        ok:              true,
        batch_code:      built.batch_code,
        has_deviation:   anyDeviation,
        ca_write_failed,
      })
    }

    // ── Time separation log ───────────────────────────────────────────────────
    if (form === 'timesep') {
      const input = body as CreateTimeSeparationInput

      const v = haccpDailyChecksService.validateTimeSeparation(input)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      // timesep writes NO CA row — there is no time-separation CA builder.
      await haccpDailyChecksService.insertTimeSeparation(
        haccpDailyChecksService.buildTimeSeparation({ input, userId, today, nowTime }),
      )

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid form type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/mince-prep] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
