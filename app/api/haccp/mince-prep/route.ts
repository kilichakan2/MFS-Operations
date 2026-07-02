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
 *   - timesep files an MMP-TS CA row when its free-text corrective action is
 *     non-empty (mince-unit bug fix 1; previously it never wrote one).
 *
 * Mince unit: the CCP-M bands are DB-driven (`haccp_mince_thresholds`) — the
 * POST loads them fresh and REFUSES to grade without them (empty set → 500,
 * never a hardcoded fallback). Amber is DISPLAY ONLY: the service's pass
 * booleans are blind to it, so an amber reading still 400s without a CA and
 * still files the register row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller } from '@/lib/wiring/haccp'
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
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpDailyChecksServiceForCaller(userId)

    const range = (req.nextUrl.searchParams.get('range') ?? 'today') as 'today' | 'week' | 'last_week'

    const result = await svc.listMincePrep(range)

    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/mince-prep] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const dc     = await haccpDailyChecksServiceForCaller(userId)
    const submit = await submitHaccpDailyCheckForCaller(userId)

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

      // FAIL-CLOSED: never grade a CCP against a missing rulebook (mirror the
      // delivery route's stance — no hardcoded fallback exists any more).
      const thresholds = await dc.listMinceThresholds()
      if (thresholds.length === 0) {
        return NextResponse.json({ error: 'Could not load mince/prep thresholds' }, { status: 500 })
      }

      const killDateObj  = new Date(input.kill_date + 'T00:00:00')
      const todayObj     = new Date(today + 'T00:00:00')
      const daysFromKill = Math.floor((todayObj.getTime() - killDateObj.getTime()) / 86400000)

      const v = dc.validateMince({ input, daysFromKill, thresholds })
      if (!v.ok) {
        // The kill-date hard-fail 400 carries two extra keys (route-edge detail).
        let hardFail = false
        try {
          hardFail = dc.killDateHardFail(input.product_species, daysFromKill, thresholds)
        } catch {
          // An invalid species has no kill-day row (fail-closed resolver) —
          // the 400 below already carries the validation message; the
          // hard-fail extras simply don't apply.
        }
        if (hardFail) {
          return NextResponse.json({
            error:               v.message,
            kill_date_hard_fail: true,
            days_from_kill:      daysFromKill,
          }, { status: v.status })
        }
        return NextResponse.json({ error: v.message }, { status: v.status })
      }

      const runNum = (await dc.countMinceRuns('haccp_mince_log', today)) + 1
      const built  = dc.buildMince({ input, userId, today, nowTime, daysFromKill, runNum, thresholds })

      let id: string
      try {
        ;({ id } = await dc.insertMince(built))
      } catch (e) {
        if (e instanceof ConflictError) {
          return NextResponse.json({ error: e.message }, { status: e.httpStatus })
        }
        throw e
      }

      const caRows = dc.buildMinceCorrectiveActions({ input, userId, sourceId: id, thresholds })
      const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'mince')

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

      // FAIL-CLOSED: never grade a CCP against a missing rulebook.
      const thresholds = await dc.listMinceThresholds()
      if (thresholds.length === 0) {
        return NextResponse.json({ error: 'Could not load mince/prep thresholds' }, { status: 500 })
      }

      const v = dc.validateMeatPrep(input, thresholds)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      let daysFromKill: number | null = null
      if (input.kill_date) {
        const kd = new Date(input.kill_date + 'T00:00:00')
        const td = new Date(today + 'T00:00:00')
        daysFromKill = Math.floor((td.getTime() - kd.getTime()) / 86400000)
      }

      const runNum = (await dc.countMinceRuns('haccp_meatprep_log', today)) + 1
      const built  = dc.buildMeatPrep({ input, userId, today, nowTime, daysFromKill, runNum, thresholds })

      let id: string
      try {
        ;({ id } = await dc.insertMeatPrep(built))
      } catch (e) {
        if (e instanceof ConflictError) {
          return NextResponse.json({ error: e.message }, { status: e.httpStatus })
        }
        throw e
      }

      // CA write gates on temperature only (NOT the allergen-label issue).
      const caRows = dc.buildMeatPrepCorrectiveActions({ input, userId, sourceId: id, thresholds })
      const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'meatprep')

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

      const v = dc.validateTimeSeparation(input)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      // Bug fix 1 (server half): a non-empty free-text corrective action now
      // files an MMP-TS row into the CA register, linked to the new timesep id.
      const { id } = await dc.insertTimeSeparation(
        dc.buildTimeSeparation({ input, userId, today, nowTime }),
      )

      const caRows = dc.buildTimeSeparationCorrectiveActions({ input, userId, sourceId: id })
      const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'timesep')

      return NextResponse.json({ ok: true, ca_write_failed })
    }

    return NextResponse.json({ error: 'Invalid form type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/mince-prep] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
