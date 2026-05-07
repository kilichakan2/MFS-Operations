/**
 * app/api/haccp/annual-review/data/route.ts
 *
 * Returns live reference data for annual review data panels.
 * Data is for context only — not stored with the review record.
 *
 * Sections with data panels added phase by phase:
 *   Phase 2: 3.2 Training
 *   Phase 3: 3.3 Hygiene, 3.4 Cleaning (period-filtered)
 *   Phase 4: 3.5–3.8 (Temperature, Suppliers, Incidents…)
 *   Phase 5: 3.11 Allergens, 3.12 Labelling
 *
 * Query params:
 *   from  — review period start (ISO date) — for period-filtered sections
 *   to    — review period end   (ISO date)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')  // ISO date e.g. 2025-05-01
    const to   = searchParams.get('to')    // ISO date e.g. 2026-05-01

    // ── Section 3.2 — Training (current state, not period-filtered) ──────────

    const { data: staffRaw, error: staffErr } = await supabase
      .from('haccp_staff_training')
      .select('staff_name, job_role, training_type, completion_date, refresh_date, supervisor_name')
      .order('staff_name', { ascending: true })
      .order('training_type', { ascending: true })
      .order('completion_date', { ascending: false })

    if (staffErr) throw staffErr

    const staffSeen  = new Set<string>()
    const staffTraining = (staffRaw ?? []).filter(r => {
      const key = `${r.staff_name}::${r.training_type}`
      if (staffSeen.has(key)) return false
      staffSeen.add(key)
      return true
    })

    const { data: allergenRaw, error: allergenErr } = await supabase
      .from('haccp_allergen_training')
      .select('staff_name, job_role, certification_date, refresh_date')
      .order('staff_name', { ascending: true })
      .order('certification_date', { ascending: false })

    if (allergenErr) throw allergenErr

    const allergenSeen    = new Set<string>()
    const allergenTraining = (allergenRaw ?? []).filter(r => {
      if (allergenSeen.has(r.staff_name)) return false
      allergenSeen.add(r.staff_name)
      return true
    })

    // ── Section 3.3 — Personal Hygiene & Health (period activity) ────────────

    let healthData: {
      new_staff:  unknown[]
      exclusions: unknown[]
      visitors:   unknown[]
    } = { new_staff: [], exclusions: [], visitors: [] }

    if (from && to) {
      const healthQuery = supabase
        .from('haccp_health_records')
        .select(
          'id, record_type, date, staff_name, fit_for_work, exclusion_reason,' +
          'illness_type, absence_from, absence_to, symptom_free_48h, return_date,' +
          'visitor_name, visitor_company, visitor_declaration_confirmed'
        )
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })

      const { data: healthRaw, error: healthErr } = await healthQuery
      if (healthErr) throw healthErr

      const records = (healthRaw ?? []) as unknown as Array<{ record_type: string; [key: string]: unknown }>
      healthData = {
        new_staff:  records.filter(r => r.record_type === 'new_staff_declaration'),
        exclusions: records.filter(r => r.record_type === 'return_to_work'),
        visitors:   records.filter(r => r.record_type === 'visitor'),
      }
    }

    // ── Section 3.4 — Cleaning & Disinfection (period activity) ─────────────

    let cleaningData: {
      total:            number
      issues_count:     number
      issues_list:      { date: string; what_did_you_do: string | null }[]
      sanitiser_checks: number
      low_temp_list:    { date: string; sanitiser_temp_c: number }[]
      last_log_date:    string | null
    } = {
      total: 0, issues_count: 0, issues_list: [],
      sanitiser_checks: 0, low_temp_list: [], last_log_date: null,
    }

    if (from && to) {
      const { data: cleaningRaw, error: cleaningErr } = await supabase
        .from('haccp_cleaning_log')
        .select('date, issues, what_did_you_do, sanitiser_temp_c')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })

      if (cleaningErr) throw cleaningErr

      const records = cleaningRaw ?? []
      cleaningData = {
        total:            records.length,
        issues_count:     records.filter(r => r.issues === true).length,
        issues_list:      records
          .filter(r => r.issues === true)
          .map(r => ({ date: r.date, what_did_you_do: r.what_did_you_do })),
        sanitiser_checks: records.filter(r => r.sanitiser_temp_c !== null).length,
        low_temp_list:    records
          .filter(r => r.sanitiser_temp_c !== null && Number(r.sanitiser_temp_c) < 82)
          .map(r => ({ date: r.date, sanitiser_temp_c: Number(r.sanitiser_temp_c) })),
        last_log_date:    records.length > 0 ? records[0].date : null,
      }
    }

    // ── Response ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      '3.2': { staff_training: staffTraining, allergen_training: allergenTraining },
      '3.3': healthData,
      '3.4': cleaningData,
    })

  } catch (err) {
    console.error('[GET /api/haccp/annual-review/data]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
