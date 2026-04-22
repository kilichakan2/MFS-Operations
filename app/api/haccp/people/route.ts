/**
 * app/api/haccp/people/route.ts
 *
 * GET  — recent health records (all types)
 * POST — submit a health declaration, return to work, or visitor log
 *
 * Source: MFS Health Monitoring Forms V1.0
 * Reg 852/2004 Annex II Ch VIII
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('haccp_health_records')
      .select('id, record_type, date, staff_name, visitor_name, visitor_company, fit_for_work, health_questions, exclusion_reason, illness_type, absence_from, absence_to, manager_signed_name, submitted_at, users!submitted_by(name)')
      .order('submitted_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[GET /api/haccp/people]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ records: data ?? [] })

  } catch (err) {
    console.error('[GET /api/haccp/people] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { record_type } = body

    if (!record_type) return NextResponse.json({ error: 'record_type required' }, { status: 400 })

    // ── Health Declaration (new starter) ──────────────────────────────────────
    if (record_type === 'new_staff_declaration') {
      const {
        staff_name, start_date, health_questions,
        fit_for_work, exclusion_reason, manager_signed_by,
      } = body

      if (!staff_name?.trim()) return NextResponse.json({ error: 'Staff name required' }, { status: 400 })
      if (!start_date)         return NextResponse.json({ error: 'Start date required' },  { status: 400 })
      if (!manager_signed_by)  return NextResponse.json({ error: 'Manager sign-off required' }, { status: 400 })

      const { error } = await supabase.from('haccp_health_records').insert({
        submitted_by:       userId,
        record_type:        'new_staff_declaration',
        date:               todayUK(),
        staff_name:         staff_name.trim(),
        health_questions,
        fit_for_work:       fit_for_work ?? true,
        exclusion_reason:   exclusion_reason?.trim() || null,
        manager_signed_name: manager_signed_by.trim(),
        manager_signed_at:  new Date().toISOString(),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Return to Work ────────────────────────────────────────────────────────
    if (record_type === 'return_to_work') {
      const {
        staff_name, absence_from, absence_to, illness_type,
        health_questions, symptom_free_48h, medical_certificate_provided,
        manager_signed_by,
      } = body

      if (!staff_name?.trim())  return NextResponse.json({ error: 'Staff name required' },  { status: 400 })
      if (!illness_type)        return NextResponse.json({ error: 'Illness type required' }, { status: 400 })
      if (!manager_signed_by)   return NextResponse.json({ error: 'Manager sign-off required' }, { status: 400 })

      // Map page shorthand to DB constraint values
      const illnessTypeMap: Record<string, string> = {
        gi:      'gastrointestinal',
        other:   'other_illness',
        serious: 'serious_illness',
      }
      const illnessTypeDB = illnessTypeMap[illness_type] ?? illness_type

      const { error } = await supabase.from('haccp_health_records').insert({
        submitted_by:                userId,
        record_type:                 'return_to_work',
        date:                        todayUK(),
        staff_name:                  staff_name.trim(),
        absence_from:                absence_from || null,
        absence_to:                  absence_to   || null,
        return_date:                 todayUK(),
        illness_type:                illnessTypeDB,
        health_questions,
        symptom_free_48h:            symptom_free_48h            ?? null,
        medical_certificate_provided:medical_certificate_provided ?? null,
        fit_for_work:                true,
        manager_signed_name: manager_signed_by.trim(),
        manager_signed_at:           new Date().toISOString(),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Visitor Log ───────────────────────────────────────────────────────────
    if (record_type === 'visitor') {
      const {
        visitor_name, visitor_company, visitor_reason,
        health_questions, visitor_declaration_confirmed,
        manager_signed_by,
      } = body

      if (!visitor_name?.trim())  return NextResponse.json({ error: 'Visitor name required' }, { status: 400 })
      if (!visitor_company?.trim()) return NextResponse.json({ error: 'Company required' },    { status: 400 })
      if (!visitor_reason?.trim())  return NextResponse.json({ error: 'Visit reason required' }, { status: 400 })
      if (!manager_signed_by)       return NextResponse.json({ error: 'Manager sign-off required' }, { status: 400 })

      const { error } = await supabase.from('haccp_health_records').insert({
        submitted_by:                  userId,
        record_type:                   'visitor',
        date:                          todayUK(),
        visitor_name:                  visitor_name.trim(),
        visitor_company:               visitor_company.trim(),
        visitor_reason:                visitor_reason.trim(),
        health_questions,
        visitor_declaration_confirmed: visitor_declaration_confirmed ?? false,
        fit_for_work:                  visitor_declaration_confirmed ?? false,
        manager_signed_name: manager_signed_by.trim(),
        manager_signed_at:             new Date().toISOString(),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid record_type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/people] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
