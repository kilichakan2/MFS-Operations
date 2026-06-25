/**
 * app/api/haccp/calibration/route.ts
 *
 * GET  — all calibration records (last 6 months) + this-month aggregation
 * POST — submit a new calibration record (manual test OR certified probe)
 *
 * Source: MF-001 p.11 · HB-001 SOP 3 · CA-001 Table 3
 * Frequency: Monthly minimum (HB-001 / CA-001)
 *
 * F-19 PR2: re-pointed off raw Supabase onto the daily-checks hexagon. The
 * 6-month read filter, validation, the persist build and the CA build moved to
 * the service (PR1, byte-identical). The `done_this_month` / `this_month_count`
 * presentation aggregation stays here (route-edge), as does the role gate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller } from '@/lib/wiring/haccp'
import type {
  CreateCalibrationCertifiedInput,
  CreateCalibrationManualInput,
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

function thisMonthUK(): { from: string; to: string } {
  const now = new Date()
  const tz  = 'Europe/London'
  const y   = now.toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 4)
  const m   = now.toLocaleDateString('en-CA', { timeZone: tz }).slice(5, 7)
  return { from: `${y}-${m}-01`, to: `${y}-${m}-31` }
}

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpDailyChecksServiceForCaller(userId)

    const { from, to } = thisMonthUK()

    const records = await svc.listCalibration()

    const thisMonthRec  = records.filter((r) => r.date >= from && r.date <= to)
    const doneThisMonth = thisMonthRec.length > 0

    return NextResponse.json({
      records,
      done_this_month: doneThisMonth,
      this_month_count: thisMonthRec.length,
    })

  } catch (err) {
    console.error('[GET /api/haccp/calibration] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const dc     = await haccpDailyChecksServiceForCaller(userId)
    const submit = await submitHaccpDailyCheckForCaller(userId)

    const body = await req.json()
    const { calibration_mode } = body

    if (calibration_mode === 'certified_probe') {
      const input = body as CreateCalibrationCertifiedInput
      const v = dc.validateCalibrationCertified(input)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await dc.insertCalibrationCertified(
        dc.buildCalibrationCertified({ input, userId, today: todayUK(), nowTime: nowTimeUK() }),
      )
      return NextResponse.json({ ok: true })
    }

    const input = body as CreateCalibrationManualInput
    const v = dc.validateCalibrationManual(input)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const built = dc.buildCalibrationManual({ input, userId, today: todayUK(), nowTime: nowTimeUK() })
    const { id } = await dc.insertCalibrationManual(built)

    const caRows = dc.buildCalibrationCorrectiveActions({ input, userId, sourceId: id })
    const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'calibration')

    return NextResponse.json({
      ok:              true,
      ice_pass:        built.ice_water_pass,
      boil_pass:       built.boiling_water_pass,
      any_fail:        !built.ice_water_pass || !built.boiling_water_pass,
      ca_write_failed,
    })

  } catch (err) {
    console.error('[POST /api/haccp/calibration] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
