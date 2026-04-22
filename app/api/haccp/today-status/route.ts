/**
 * app/api/haccp/today-status/route.ts
 * Returns today's HACCP completion state for the home screen tiles.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}
function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}
function getMonthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today = todayUK()
    const nowHour = new Date().getHours()
    const openingOverdueCutoff   = 10  // Opening checks expected by 10:00
    const operationalOverdueCutoff = 13  // Operational checks expected by 13:00
    const closingOverdueCutoff   = 17  // Closing checks expected by 17:00
    const amOverdueCutoff = 10
    const pmOverdueCutoff = 14

    const [cold, room, diary, cleaning, deliveries, mince, returns, ccas, weekly, monthly, cal] =
      await Promise.all([
        supabase.from('haccp_cold_storage_temps').select('session').eq('date', today),
        supabase.from('haccp_processing_temps').select('session').eq('date', today),
        supabase.from('haccp_daily_diary').select('phase').eq('date', today),
        supabase.from('haccp_cleaning_log').select('submitted_at, issues').eq('date', today).order('submitted_at', { ascending: false }).limit(20),
        supabase.from('haccp_deliveries').select('temp_status').eq('date', today),
        supabase.from('haccp_mince_log').select('id, input_temp_pass, output_temp_pass, corrective_action').eq('date', today),
        supabase.from('haccp_returns').select('id').eq('date', today),
        supabase.from('haccp_corrective_actions').select('id').eq('resolved', false),
        supabase.from('haccp_weekly_review').select('id').gte('week_ending', getWeekStart()).limit(1),
        supabase.from('haccp_monthly_review').select('id').gte('month_year', getMonthStart()).limit(1),
        supabase.from('haccp_calibration_log').select('id').gte('date', getMonthStart()).limit(1),
      ])

    const coldSessions = (cold.data ?? []).map((r) => r.session)
    const roomSessions = (room.data ?? []).map((r) => r.session)
    const phases       = (diary.data ?? []).map((r) => r.phase)

    const amColdDone = coldSessions.includes('AM')
    const pmColdDone = coldSessions.includes('PM')
    const amRoomDone = roomSessions.includes('AM')
    const pmRoomDone = roomSessions.includes('PM')

    let total = 6, done = 0
    if (amColdDone) done++
    if (pmColdDone) done++
    if (amRoomDone) done++
    if (pmRoomDone) done++
    if (phases.includes('opening')) done++
    if (phases.includes('closing')) done++

    return NextResponse.json({
      cold_storage: {
        am_done:    amColdDone,
        pm_done:    pmColdDone,
        am_overdue: !amColdDone && nowHour >= amOverdueCutoff,
        pm_overdue: !pmColdDone && nowHour >= pmOverdueCutoff,
      },
      processing_room: {
        am_done:    amRoomDone,
        pm_done:    pmRoomDone,
        am_overdue: !amRoomDone && nowHour >= amOverdueCutoff,
        pm_overdue: !pmRoomDone && nowHour >= pmOverdueCutoff,
      },
      daily_diary: {
        opening:              phases.includes('opening'),
        operational:          phases.includes('operational'),
        closing:              phases.includes('closing'),
        opening_overdue:      !phases.includes('opening')     && nowHour >= openingOverdueCutoff,
        operational_overdue:  !phases.includes('operational') && nowHour >= operationalOverdueCutoff,
        closing_overdue:      !phases.includes('closing')     && nowHour >= closingOverdueCutoff,
      },
      cleaning: {
        count_today:     (cleaning.data ?? []).length,
        has_issues_today:(cleaning.data ?? []).some((r) => (r as {issues?: boolean}).issues),
        overdue:         (cleaning.data ?? []).length === 0 && nowHour >= 15,
        last_logged_at:  (cleaning.data?.[0] as {submitted_at?: string} | undefined)?.submitted_at ?? null,
      },
      deliveries: {
        count_today: (deliveries.data ?? []).length,
        deviations:  (deliveries.data ?? []).filter((d) => d.temp_status !== 'pass').length,
      },
      mince_runs: {
        count_today:    (mince.data ?? []).length,
        has_deviations: (mince.data ?? []).some((r) => {
          const row = r as { input_temp_pass?: boolean; output_temp_pass?: boolean; corrective_action?: string }
          return row.input_temp_pass === false || row.output_temp_pass === false || !!row.corrective_action
        }),
      },
      product_returns: { count_today: (returns.data ?? []).length },
      corrective_actions: { open: (ccas.data ?? []).length },
      calibration_due:    (cal.data ?? []).length === 0,
      weekly_review_due:  (weekly.data ?? []).length === 0,
      monthly_review_due: (monthly.data ?? []).length === 0,
      total_checks:       total,
      completed_checks:   done,
    })
  } catch (err) {
    console.error('[GET /api/haccp/today-status]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
