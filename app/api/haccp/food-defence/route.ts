/**
 * app/api/haccp/food-defence/route.ts
 * SALSA 4.2.3 / BSD 4.4 — Food Defence Plans
 * GET  — all versions desc + latest + review_due (any HACCP role)
 * POST — insert new version (admin only — never overwrites)
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

    const { data, error } = await supabase
      .from('haccp_food_defence_plans')
      .select(`
        id, version, issue_date, next_review_date,
        team, physical_perimeter, physical_internal,
        cyber_controls, backup_recovery, emergency_contacts,
        personnel_notes, goods_notes, incident_notes, created_at,
        preparer:prepared_by ( name ),
        approver:approved_by ( name ),
        creator:created_by   ( name )
      `)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const plans      = data ?? []
    const latest     = plans[0] ?? null
    const review_due = latest ? new Date(latest.next_review_date) < new Date() : true

    return NextResponse.json({ plans, latest, review_due })
  } catch (err) {
    console.error('[GET /api/haccp/food-defence]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const {
      version, issue_date, next_review_date,
      team, physical_perimeter, physical_internal,
      cyber_controls, backup_recovery, emergency_contacts,
      personnel_notes, goods_notes, incident_notes,
      prepared_by, approved_by,
    } = body

    if (!version?.trim())  return NextResponse.json({ error: 'Version required' },    { status: 400 })
    if (!issue_date)       return NextResponse.json({ error: 'Issue date required' },  { status: 400 })
    if (!next_review_date) return NextResponse.json({ error: 'Review date required' }, { status: 400 })

    const { data, error } = await supabase
      .from('haccp_food_defence_plans')
      .insert({
        version:            version.trim(),
        issue_date,
        next_review_date,
        team:               Array.isArray(team)               ? team               : [],
        physical_perimeter: Array.isArray(physical_perimeter) ? physical_perimeter : [],
        physical_internal:  Array.isArray(physical_internal)  ? physical_internal  : [],
        cyber_controls:     Array.isArray(cyber_controls)     ? cyber_controls     : [],
        backup_recovery:    Array.isArray(backup_recovery)    ? backup_recovery    : [],
        emergency_contacts: Array.isArray(emergency_contacts) ? emergency_contacts : [],
        personnel_notes:    personnel_notes?.trim()  || null,
        goods_notes:        goods_notes?.trim()      || null,
        incident_notes:     incident_notes?.trim()   || null,
        prepared_by:        prepared_by  || null,
        approved_by:        approved_by  || null,
        created_by:         userId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ plan: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/food-defence]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
