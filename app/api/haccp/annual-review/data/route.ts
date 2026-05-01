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

    // ── Section 3.2 — Training (current state, not period-filtered) ──────────

    // Latest food safety training record per staff_name + training_type
    const { data: staffRaw, error: staffErr } = await supabase
      .from('haccp_staff_training')
      .select('staff_name, job_role, training_type, completion_date, refresh_date, supervisor_name')
      .order('staff_name', { ascending: true })
      .order('training_type', { ascending: true })
      .order('completion_date', { ascending: false })

    if (staffErr) throw staffErr

    // Deduplicate: keep first (latest) per staff_name + training_type
    const staffSeen  = new Set<string>()
    const staffTraining = (staffRaw ?? []).filter(r => {
      const key = `${r.staff_name}::${r.training_type}`
      if (staffSeen.has(key)) return false
      staffSeen.add(key)
      return true
    })

    // Latest allergen training record per staff_name
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

    // ── Response ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      '3.2': {
        staff_training:    staffTraining,
        allergen_training: allergenTraining,
      },
      // Further sections populated in later phases
    })

  } catch (err) {
    console.error('[GET /api/haccp/annual-review/data]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
