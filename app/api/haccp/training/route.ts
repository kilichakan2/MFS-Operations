/**
 * app/api/haccp/training/route.ts
 *
 * Actual haccp_staff_training columns:
 *   id, submitted_at, logged_by, staff_user_id, staff_name,
 *   training_type, completion_date, confirmation_items,
 *   supervisor_signed_by (uuid — unused), supervisor_signed_at,
 *   document_version, job_role, refresh_date, supervisor_name
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
        .select('id, staff_name, job_role, training_type, document_version, completion_date, refresh_date, supervisor_name, confirmation_items, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(100),
      supabase
        .from('haccp_allergen_training')
        .select('id, staff_name, job_role, training_completed, certification_date, refresh_date, reviewed_by, confirmation_items, supervisor_name, document_version, submitted_at')
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
        completion_date, refresh_date,
        supervisor, confirmation_items,
      } = body

      if (!staff_name?.trim())       return NextResponse.json({ error: 'Staff name required' },       { status: 400 })
      if (!job_role?.trim())         return NextResponse.json({ error: 'Job role required' },          { status: 400 })
      if (!document_version?.trim()) return NextResponse.json({ error: 'Document version required' }, { status: 400 })
      if (!completion_date)          return NextResponse.json({ error: 'Completion date required' },  { status: 400 })
      if (!refresh_date)             return NextResponse.json({ error: 'Refresh date required' },     { status: 400 })
      if (!supervisor?.trim())       return NextResponse.json({ error: 'Supervisor name required' },  { status: 400 })

      const { error } = await supabase.from('haccp_staff_training').insert({
        logged_by:            userId,
        staff_name:           staff_name.trim(),
        job_role:             job_role.trim(),
        training_type,
        document_version:     document_version.trim(),
        completion_date,
        refresh_date,
        supervisor_name:      supervisor.trim(),
        supervisor_signed_at: new Date().toISOString(),
        confirmation_items:   confirmation_items ?? {},
      })

      if (error) {
        console.error('[POST /api/haccp/training] staff insert:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    // ── Allergen Awareness ───────────────────────────────────────────────────
    // Uses haccp_allergen_training (different table + different column names)
    // certification_date, training_completed — NOT completion_date, training_type
    if (training_type === 'allergen_awareness') {
      const {
        staff_name, job_role, certification_date, refresh_date,
        supervisor, confirmation_items,
      } = body

      if (!staff_name?.trim())      return NextResponse.json({ error: 'Staff name required' },      { status: 400 })
      if (!job_role?.trim())        return NextResponse.json({ error: 'Job role required' },         { status: 400 })
      if (!certification_date)      return NextResponse.json({ error: 'Completion date required' }, { status: 400 })
      if (!refresh_date)            return NextResponse.json({ error: 'Refresh date required' },    { status: 400 })
      if (!supervisor?.trim())      return NextResponse.json({ error: 'Supervisor name required' }, { status: 400 })

      const { error } = await supabase.from('haccp_allergen_training').insert({
        logged_by:          userId,
        staff_name:         staff_name.trim(),
        job_role:           job_role.trim(),
        training_completed: 'allergen_awareness',
        certification_date,
        refresh_date,
        supervisor_name:    supervisor.trim(),
        confirmation_items: confirmation_items ?? {},
      })

      if (error) {
        console.error('[POST /api/haccp/training] allergen insert:', error.message)
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
