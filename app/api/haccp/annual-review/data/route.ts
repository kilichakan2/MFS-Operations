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

    // ── Section 3.6 — Temperature Control ───────────────────────────────────

    // Sub-panel 1: Calibration — latest record per thermometer (current state)
    const { data: calibRaw, error: calibErr } = await supabase
      .from('haccp_calibration_log')
      .select('thermometer_id, calibration_mode, date, cert_reference, ice_water_result_c, ice_water_pass, boiling_water_result_c, boiling_water_pass')
      .order('thermometer_id', { ascending: true })
      .order('date',           { ascending: false })
      .order('submitted_at',   { ascending: false })

    if (calibErr) throw calibErr

    // JS-side dedup: latest per thermometer_id (same pattern as training)
    const calibSeen = new Set<string>()
    const calibration = (calibRaw ?? []).filter(r => {
      if (calibSeen.has(r.thermometer_id)) return false
      calibSeen.add(r.thermometer_id)
      return true
    })

    // Sub-panel 2: Cold storage — latest reading per unit (current state)
    const { data: unitsRaw, error: unitsErr } = await supabase
      .from('haccp_cold_storage_units')
      .select('id, name, unit_type, target_temp_c, max_temp_c')
      .eq('active', true)
      .order('position', { ascending: true })

    if (unitsErr) throw unitsErr

    // Fetch all cold storage temps, deduplicate to latest per unit in JS
    const { data: tempsRaw, error: tempsErr } = await supabase
      .from('haccp_cold_storage_temps')
      .select('unit_id, temperature_c, temp_status, date, session')
      .order('date',         { ascending: false })
      .order('submitted_at', { ascending: false })

    if (tempsErr) throw tempsErr

    const tempsByUnit = new Map<string, { temperature_c: number; temp_status: string; date: string; session: string }>()
    for (const t of tempsRaw ?? []) {
      if (!tempsByUnit.has(t.unit_id)) {
        tempsByUnit.set(t.unit_id, {
          temperature_c: Number(t.temperature_c),
          temp_status:   t.temp_status,
          date:          t.date,
          session:       t.session,
        })
      }
    }

    const coldStorage = (unitsRaw ?? []).map(u => ({
      name:          u.name,
      unit_type:     u.unit_type,
      target_temp_c: Number(u.target_temp_c),
      max_temp_c:    Number(u.max_temp_c),
      latest:        tempsByUnit.get(u.id) ?? null,
    }))

    // Sub-panel 3: Delivery temps — period-filtered, exclude dry_goods
    let deliveryTemps: {
      total:    number
      pass:     number
      urgent:   number
      fail:     number
      temp_cas: number
    } = { total: 0, pass: 0, urgent: 0, fail: 0, temp_cas: 0 }

    if (from && to) {
      const { data: delivRaw, error: delivErr } = await supabase
        .from('haccp_deliveries')
        .select('temp_status')
        .gte('date', from)
        .lte('date', to)
        .neq('product_category', 'dry_goods')

      if (delivErr) throw delivErr

      const delivs = delivRaw ?? []
      deliveryTemps = {
        total:    delivs.length,
        pass:     delivs.filter(d => d.temp_status === 'pass').length,
        urgent:   delivs.filter(d => d.temp_status === 'urgent').length,
        fail:     delivs.filter(d => d.temp_status === 'fail').length,
        // temp_cas = deliveries where temp was not pass (NOT corrective_action_required
        // which also captures contamination CAs and would inflate the count)
        temp_cas: delivs.filter(d => d.temp_status !== 'pass').length,
      }
    }

    // ── Response ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      '3.2': { staff_training: staffTraining, allergen_training: allergenTraining },
      '3.3': healthData,
      '3.4': cleaningData,
      '3.6': { calibration, cold_storage: coldStorage, delivery_temps: deliveryTemps },
    })

  } catch (err) {
    console.error('[GET /api/haccp/annual-review/data]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
