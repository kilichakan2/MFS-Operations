/**
 * app/api/haccp/calibration/route.ts
 *
 * GET  — all calibration records this month + most recent record
 * POST — submit a new calibration record (manual test OR certified probe)
 *
 * Source: MF-001 p.11 · HB-001 SOP 3 · CA-001 Table 3
 * Frequency: Monthly minimum (HB-001 / CA-001)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

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

    // All records this month + last 6 months of history for the log
    const { data, error } = await supabase
      .from('haccp_calibration_log')
      .select(`
        id, date, time_of_check, thermometer_id,
        calibration_mode, cert_reference, purchase_date,
        ice_water_result_c, ice_water_pass,
        boiling_water_result_c, boiling_water_pass,
        action_taken, verified_by, submitted_at,
        users!inner(name)
      `)
      .gte('date', new Date(new Date().setMonth(new Date().getMonth() - 6))
        .toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))
      .order('submitted_at', { ascending: false })

    if (error) {
      console.error('[GET /api/haccp/calibration]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const records      = data ?? []
    const thisMonthRec = records.filter((r) => r.date >= from && r.date <= to)
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
      const { thermometer_id, cert_reference, purchase_date, notes, verified_by } = body
      if (!thermometer_id?.trim())  return NextResponse.json({ error: 'Probe ID / name is required' }, { status: 400 })
      if (!cert_reference?.trim())  return NextResponse.json({ error: 'Certificate reference is required' }, { status: 400 })
      if (!purchase_date)           return NextResponse.json({ error: 'Purchase date is required' }, { status: 400 })
      if (!verified_by?.trim())     return NextResponse.json({ error: 'Verified by is required' }, { status: 400 })

      const { error } = await supabase.from('haccp_calibration_log').insert({
        submitted_by:     userId,
        date:             todayUK(),
        time_of_check:    nowTimeUK(),
        thermometer_id:   thermometer_id.trim(),
        calibration_mode: 'certified_probe',
        cert_reference:   cert_reference.trim(),
        purchase_date,
        verified_by:      verified_by.trim(),
        action_taken:     notes?.trim() || null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // Manual test mode
    const { thermometer_id, ice_water_result_c, boiling_water_result_c, action_taken, verified_by } = body
    if (!thermometer_id?.trim())         return NextResponse.json({ error: 'Probe ID / name is required' }, { status: 400 })
    if (ice_water_result_c == null)      return NextResponse.json({ error: 'Ice water reading is required' }, { status: 400 })
    if (boiling_water_result_c == null)  return NextResponse.json({ error: 'Boiling water reading is required' }, { status: 400 })
    if (!verified_by?.trim())            return NextResponse.json({ error: 'Verified by is required' }, { status: 400 })

    const icePass     = ice_water_result_c    >= -1 && ice_water_result_c    <= 1
    const boilPass    = boiling_water_result_c >= 99 && boiling_water_result_c <= 101
    const anyFail     = !icePass || !boilPass

    if (anyFail && !action_taken?.trim()) {
      return NextResponse.json({ error: 'Action taken is required when a test fails' }, { status: 400 })
    }

    const { error } = await supabase.from('haccp_calibration_log').insert({
      submitted_by:           userId,
      date:                   todayUK(),
      time_of_check:          nowTimeUK(),
      thermometer_id:         thermometer_id.trim(),
      calibration_mode:       'manual',
      ice_water_result_c,
      ice_water_pass:         icePass,
      boiling_water_result_c,
      boiling_water_pass:     boilPass,
      verified_by:            verified_by.trim(),
      action_taken:           action_taken?.trim() || null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ice_pass: icePass, boil_pass: boilPass, any_fail: anyFail })

  } catch (err) {
    console.error('[POST /api/haccp/calibration] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
