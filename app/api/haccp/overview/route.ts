/**
 * app/api/haccp/overview/route.ts
 *
 * GET /api/haccp/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Admin-only. Returns aggregated HACCP data for a date range.
 * Used by the weekly/monthly overview overlay on the reviews page.
 *
 * Sections returned:
 *   goods_in        — deliveries (variable days)
 *   cold_storage    — CCP2 readings (Mon-Fri expected)
 *   process_room    — CCP3 checks (Mon-Fri expected)
 *   cleaning        — SOP2 entries (Mon-Fri expected)
 *   mince           — CCP-M mince runs (variable)
 *   meatprep        — CCP-M prep runs (variable)
 *   returns         — SOP12 product returns (variable)
 *   calibration     — SOP3 (done/not done for period)
 *   corrective_actions — all CAs raised in period
 *
 * "Mon-Fri expected" sections include a missing_days array
 * so the UI can show red dots for gaps.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

/** Generate all Mon-Fri dates between from and to inclusive */
function workingDays(from: string, to: string): string[] {
  const days: string[] = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow >= 1 && dow <= 5) {  // Mon=1 … Fri=5
      days.push(cur.toLocaleDateString('en-CA'))
    }
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to date parameters required' }, { status: 400 })
    }

    const expected = workingDays(from, to)

    // ── Parallel queries across all sections ─────────────────────────────────
    const [
      deliveries,
      coldStorage,
      processingTemps,
      dailyDiary,
      cleaning,
      mince,
      meatprep,
      returns,
      calibration,
      corrActions,
    ] = await Promise.all([
      supabase.from('haccp_deliveries')
        .select('date, temp_status, corrective_action_required, product_category')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_cold_storage_temps')
        .select('date, temp_status, session')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_processing_temps')
        .select('date, session, product_temp_pass, room_temp_pass')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_daily_diary')
        .select('date, phase, issues')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_cleaning_log')
        .select('date, issues, what_was_cleaned')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_mince_log')
        .select('date, product_species, input_temp_pass, output_temp_pass, corrective_action')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_meatprep_log')
        .select('date, product_name, input_temp_pass, output_temp_pass, corrective_action')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_returns')
        .select('date, return_code, disposition, temperature_c')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_calibration_log')
        .select('date, calibration_mode, ice_water_pass, boiling_water_pass')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_corrective_actions')
        .select('ccp_ref, management_verification_required, management_verified_at, source_table')
        .gte('submitted_at', from + 'T00:00:00Z').lte('submitted_at', to + 'T23:59:59Z'),
    ])

    // ── Goods In (variable) ───────────────────────────────────────────────────
    const delivData = deliveries.data ?? []
    const delivByDate = [...new Set(delivData.map(r => r.date))]
    const goods_in = {
      total:          delivData.length,
      entries_by_date: delivByDate.sort(),
      temp_fails:     delivData.filter(r => r.temp_status === 'fail').length,
      temp_urgent:    delivData.filter(r => r.temp_status === 'urgent').length,
      ca_raised:      delivData.filter(r => r.corrective_action_required).length,
    }

    // ── Cold Storage (Mon-Fri expected) ───────────────────────────────────────
    const csData = coldStorage.data ?? []
    const csDates = [...new Set(csData.map(r => r.date))]
    const cold_storage = {
      total:          csData.length,
      entries_by_date: csDates.sort(),
      missing_days:   expected.filter(d => !csDates.includes(d)),
      fails:          csData.filter(r => r.temp_status === 'fail').length,
      urgent:         csData.filter(r => r.temp_status === 'urgent').length,
    }

    // ── Process Room (Mon-Fri expected) ───────────────────────────────────────
    const ptData  = processingTemps.data ?? []
    const ddData  = dailyDiary.data      ?? []
    const prDates = [...new Set([...ptData.map(r => r.date), ...ddData.map(r => r.date)])]
    const process_room = {
      total:           ptData.length,
      entries_by_date: prDates.sort(),
      missing_days:    expected.filter(d => !prDates.includes(d)),
      product_fails:   ptData.filter(r => r.product_temp_pass === false).length,
      room_fails:      ptData.filter(r => r.room_temp_pass === false).length,
      diary_issues:    ddData.filter(r => r.issues).length,
    }

    // ── Cleaning (Mon-Fri expected) ───────────────────────────────────────────
    const clData    = cleaning.data ?? []
    const clDates   = [...new Set(clData.map(r => r.date))]
    const cleaning_out = {
      total:           clData.length,
      entries_by_date: clDates.sort(),
      missing_days:    expected.filter(d => !clDates.includes(d)),
      issues:          clData.filter(r => r.issues).length,
    }

    // ── Mince (variable) ─────────────────────────────────────────────────────
    const mnData = mince.data ?? []
    const mince_out = {
      total:           mnData.length,
      entries_by_date: [...new Set(mnData.map(r => r.date))].sort(),
      deviations:      mnData.filter(r => r.corrective_action != null).length,
      by_species:      mnData.reduce((acc, r) => {
        acc[r.product_species] = (acc[r.product_species] ?? 0) + 1; return acc
      }, {} as Record<string, number>),
    }

    // ── Meat Prep (variable) ──────────────────────────────────────────────────
    const mpData = meatprep.data ?? []
    const meatprep_out = {
      total:           mpData.length,
      entries_by_date: [...new Set(mpData.map(r => r.date))].sort(),
      deviations:      mpData.filter(r => r.corrective_action != null).length,
    }

    // ── Product Returns (variable) ────────────────────────────────────────────
    const rtData = returns.data ?? []
    const returns_out = {
      total:           rtData.length,
      entries_by_date: [...new Set(rtData.map(r => r.date))].sort(),
      by_code:         rtData.reduce((acc, r) => {
        acc[r.return_code] = (acc[r.return_code] ?? 0) + 1; return acc
      }, {} as Record<string, number>),
      dispositions: rtData.reduce((acc, r) => {
        acc[r.disposition] = (acc[r.disposition] ?? 0) + 1; return acc
      }, {} as Record<string, number>),
    }

    // ── Calibration (done/not done) ───────────────────────────────────────────
    const calData = calibration.data ?? []
    const calibration_out = {
      done:  calData.length > 0,
      total: calData.length,
      any_fail: calData.some(r =>
        r.ice_water_pass === false || r.boiling_water_pass === false
      ),
    }

    // ── Corrective Actions ────────────────────────────────────────────────────
    const caData = corrActions.data ?? []
    const corrective_actions = {
      total:      caData.length,
      unresolved: caData.filter(r => r.management_verification_required && !r.management_verified_at).length,
      by_ccp:     caData.reduce((acc, r) => {
        acc[r.ccp_ref] = (acc[r.ccp_ref] ?? 0) + 1; return acc
      }, {} as Record<string, number>),
    }

    return NextResponse.json({
      from,
      to,
      expected_days:     expected,
      goods_in,
      cold_storage,
      process_room,
      cleaning:          cleaning_out,
      mince:             mince_out,
      meatprep:          meatprep_out,
      returns:           returns_out,
      calibration:       calibration_out,
      corrective_actions,
    })

  } catch (err) {
    console.error('[GET /api/haccp/overview] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
