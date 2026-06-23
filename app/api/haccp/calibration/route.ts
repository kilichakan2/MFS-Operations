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
import { haccpDailyChecksService, submitHaccpDailyCheck } from '@/lib/wiring/haccp'
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
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { from, to } = thisMonthUK()

    const records = await haccpDailyChecksService.listCalibration()

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
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { calibration_mode } = body

    if (calibration_mode === 'certified_probe') {
      const input = body as CreateCalibrationCertifiedInput
      const v = haccpDailyChecksService.validateCalibrationCertified(input)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await haccpDailyChecksService.insertCalibrationCertified(
        haccpDailyChecksService.buildCalibrationCertified({ input, userId, today: todayUK(), nowTime: nowTimeUK() }),
      )
      return NextResponse.json({ ok: true })
    }

    const input = body as CreateCalibrationManualInput
    const v = haccpDailyChecksService.validateCalibrationManual(input)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const built = haccpDailyChecksService.buildCalibrationManual({ input, userId, today: todayUK(), nowTime: nowTimeUK() })
    const { id } = await haccpDailyChecksService.insertCalibrationManual(built)

    const caRows = haccpDailyChecksService.buildCalibrationCorrectiveActions({ input, userId, sourceId: id })
    const { ca_write_failed } = await submitHaccpDailyCheck.fileCorrectiveActions(caRows, 'calibration')

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
