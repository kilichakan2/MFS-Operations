/**
 * app/api/haccp/training/route.ts
 *
 * GET  — fetch all training records (staff + allergen)
 * POST — log a training record
 *
 * training_type values:
 *   'butchery_process_room' → haccp_staff_training
 *   'warehouse_operative'   → haccp_staff_training
 *   'allergen_awareness'    → haccp_allergen_training (Tab 3 — future)
 *
 * Document versions are stored so EHO can verify which version each
 * staff member signed — critical when document is updated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const [staff, allergen] = await Promise.all([
      supabase
        .from('haccp_staff_training')
        .select('id, staff_name, job_role, training_completed, document_version, certification_date, refresh_date, reviewed_by, confirmation_items, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(100),
      supabase
        .from('haccp_allergen_training')
        .select('id, staff_name, training_type, completion_date, confirmation_items, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(100),
    ])

    if (staff.error) {
      console.error('[GET /api/haccp/training] staff:', staff.error.message)
      return NextResponse.json({ error: staff.error.message }, { status: 500 })
    }

    return NextResponse.json({
      staff:   staff.data   ?? [],
      allergen:allergen.data ?? [],
    })

  } catch (err) {
    console.error('[GET /api/haccp/training] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value

    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const body = await req.json()
    const { training_type } = body

    // ── Butchery & Process Room / Warehouse Operative ────────────────────────
    if (training_type === 'butchery_process_room' || training_type === 'warehouse_operative') {
      const {
        staff_name, job_role, document_version,
        certification_date, refresh_date,
        reviewed_by, confirmation_items,
      } = body

      if (!staff_name?.trim())    return NextResponse.json({ error: 'Staff name required' },       { status: 400 })
      if (!job_role?.trim())      return NextResponse.json({ error: 'Job role required' },          { status: 400 })
      if (!document_version?.trim()) return NextResponse.json({ error: 'Document version required' }, { status: 400 })
      if (!certification_date)    return NextResponse.json({ error: 'Completion date required' },   { status: 400 })
      if (!refresh_date)          return NextResponse.json({ error: 'Refresh date required' },      { status: 400 })
      if (!reviewed_by?.trim())   return NextResponse.json({ error: 'Supervisor name required' },   { status: 400 })

      const { error } = await supabase.from('haccp_staff_training').insert({
        logged_by:          userId,
        staff_name:         staff_name.trim(),
        job_role:           job_role.trim(),
        training_completed: training_type,
        document_version:   document_version.trim(),
        certification_date,
        refresh_date,
        reviewed_by:        reviewed_by.trim(),
        review_date:        certification_date,
        confirmation_items: confirmation_items ?? {},
      })

      if (error) {
        console.error('[POST /api/haccp/training] staff insert:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid training_type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/training] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
