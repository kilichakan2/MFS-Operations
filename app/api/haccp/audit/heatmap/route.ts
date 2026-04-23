/**
 * app/api/haccp/audit/heatmap/route.ts
 *
 * GET /api/haccp/audit/heatmap?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns heatmap data for ALL sections in one call.
 * Lightweight — only fetches date, session, status fields.
 * No full row data. Fires on page load so heatmap is always
 * fully populated regardless of which section tab is active.
 *
 * Returns:
 * {
 *   deliveries: { 'YYYY-MM-DD': { has_records, has_deviations } }
 *   cold_am:    { ... }
 *   cold_pm:    { ... }
 *   room_am:    { ... }
 *   room_pm:    { ... }
 *   diary_open: { ... }
 *   diary_close:{ ... }
 *   cleaning:   { ... }
 *   mince:      { ... }
 * }
 *
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

type DayMap = Record<string, { has_records: boolean; has_deviations: boolean }>

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function mark(map: DayMap, date: string, isDeviation: boolean) {
  if (!map[date]) map[date] = { has_records: false, has_deviations: false }
  map[date].has_records   = true
  if (isDeviation) map[date].has_deviations = true
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl
    const from = searchParams.get('from') ?? daysAgo(30)
    const to   = searchParams.get('to')   ?? todayUK()

    // Fetch all sections in parallel — minimal fields only
    const [
      deliveries,
      coldStorageTemps,
      processingTemps,
      dailyDiary,
      cleaningLog,
      minceLog,
    ] = await Promise.all([
      supabase.from('haccp_deliveries')
        .select('date, temp_status, corrective_action_required')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_cold_storage_temps')
        .select('date, session, temp_status, corrective_action_required')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_processing_temps')
        .select('date, session, within_limits, corrective_action_required')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_daily_diary')
        .select('date, phase, issues')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_cleaning_log')
        .select('date, issues')
        .gte('date', from).lte('date', to),

      supabase.from('haccp_mince_log')
        .select('date, input_temp_pass, output_temp_pass, corrective_action')
        .gte('date', from).lte('date', to),
    ])

    // ── Deliveries ────────────────────────────────────────────────────────────
    const delivMap: DayMap = {}
    for (const r of deliveries.data ?? []) {
      mark(delivMap, r.date, r.temp_status !== 'pass' || r.corrective_action_required)
    }

    // ── Cold Storage — AM and PM separately ───────────────────────────────────
    const coldAmMap: DayMap = {}
    const coldPmMap: DayMap = {}
    for (const r of coldStorageTemps.data ?? []) {
      const isDeviation = r.temp_status !== 'pass' || r.corrective_action_required
      if (r.session === 'AM') mark(coldAmMap, r.date, isDeviation)
      else                    mark(coldPmMap, r.date, isDeviation)
    }

    // ── Process Room — AM and PM separately ───────────────────────────────────
    const roomAmMap: DayMap = {}
    const roomPmMap: DayMap = {}
    for (const r of processingTemps.data ?? []) {
      const isDeviation = !r.within_limits || r.corrective_action_required
      if (r.session === 'AM') mark(roomAmMap, r.date, isDeviation)
      else                    mark(roomPmMap, r.date, isDeviation)
    }

    // ── Daily Diary — Opening, Operational and Closing separately ────────────
    const diaryOpenMap:        DayMap = {}
    const diaryOperationalMap: DayMap = {}
    const diaryCloseMap:       DayMap = {}
    for (const r of dailyDiary.data ?? []) {
      if (r.phase === 'opening')     mark(diaryOpenMap,        r.date, r.issues)
      if (r.phase === 'operational') mark(diaryOperationalMap, r.date, r.issues)
      if (r.phase === 'closing')     mark(diaryCloseMap,       r.date, r.issues)
    }

    // ── Cleaning ──────────────────────────────────────────────────────────────
    const cleanMap: DayMap = {}
    for (const r of cleaningLog.data ?? []) {
      mark(cleanMap, r.date, r.issues)
    }

    // ── Mince / Prep ──────────────────────────────────────────────────────────
    const minceMap: DayMap = {}
    for (const r of minceLog.data ?? []) {
      const isDeviation = !r.input_temp_pass || !r.output_temp_pass || !!r.corrective_action
      mark(minceMap, r.date, isDeviation)
    }

    return NextResponse.json({
      deliveries:  delivMap,
      cold_am:     coldAmMap,
      cold_pm:     coldPmMap,
      room_am:     roomAmMap,
      room_pm:     roomPmMap,
      diary_open:        diaryOpenMap,
      diary_operational: diaryOperationalMap,
      diary_close:       diaryCloseMap,
      cleaning:    cleanMap,
      mince:       minceMap,
    })

  } catch (err) {
    console.error('[GET /api/haccp/audit/heatmap]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
