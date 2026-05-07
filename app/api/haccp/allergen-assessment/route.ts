/**
 * app/api/haccp/allergen-assessment/route.ts
 *
 * SALSA 1.4.1 — Site allergen identification and cross-contamination risk
 *
 * GET  — fetch all assessments desc + latest (backward compatible)
 * POST — insert new assessment (admin only — never overwrites)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('haccp_allergen_assessment')
      .select(`
        id, site_status, raw_materials, cross_contam_risk, procedure_notes,
        assessed_at, next_review_date,
        assessor:assessed_by(name),
        updater:updated_by(name)
      `)
      .order('assessed_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const all        = data ?? []
    const latest     = all[0] ?? null

    // backward compatible: assessment = latest (existing callers unaffected)
    return NextResponse.json({ assessment: latest, all_assessments: all })
  } catch (err) {
    console.error('[GET /api/haccp/allergen-assessment]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST — upsert (admin only) ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const {
      site_status,
      raw_materials,
      cross_contam_risk,
      procedure_notes,
      next_review_date,
    } = body

    if (!site_status || !next_review_date) {
      return NextResponse.json({ error: 'site_status and next_review_date required' }, { status: 400 })
    }

    // Always insert a fresh record — keeps full history, latest is newest
    const { data, error } = await supabase
      .from('haccp_allergen_assessment')
      .insert({
        assessed_by:       userId,
        assessed_at:       new Date().toISOString(),
        next_review_date,
        site_status,
        raw_materials:     raw_materials    ?? [],
        cross_contam_risk: cross_contam_risk ?? '',
        procedure_notes:   procedure_notes  ?? null,
        updated_by:        userId,
        updated_at:        new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ assessment: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/allergen-assessment]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
