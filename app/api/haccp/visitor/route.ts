/**
 * app/api/haccp/visitor/route.ts
 *
 * PUBLIC — no auth required. Called from /haccp/visitor kiosk page.
 * Inserts visitor health declaration into haccp_health_records.
 * submitted_by = Visitor Kiosk system user (active=false, never logs in).
 *
 * Records are saved whether or not the visitor is excluded — audit trail
 * shows enforcement is active. fit_for_work reflects exclusion result.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// System user UUID for public visitor submissions — never logs in
const VISITOR_KIOSK_USER_ID = '190d6c79-6239-4be7-bdbd-0df474895ebc'

function todayUK(): string {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      visitor_name,
      visitor_company,
      visitor_reason,
      health_questions,
      visitor_declaration_confirmed,
      manager_signed_by,
      fit_for_work,
    } = body

    if (!visitor_name?.trim())    return NextResponse.json({ error: 'Visitor name required' },    { status: 400 })
    if (!visitor_company?.trim()) return NextResponse.json({ error: 'Company required' },         { status: 400 })
    if (!visitor_reason?.trim())  return NextResponse.json({ error: 'Visit reason required' },    { status: 400 })
    if (!manager_signed_by?.trim()) return NextResponse.json({ error: 'Manager sign-off required' }, { status: 400 })

    const { error } = await supabase.from('haccp_health_records').insert({
      submitted_by:                  VISITOR_KIOSK_USER_ID,
      record_type:                   'visitor',
      date:                          todayUK(),
      visitor_name:                  visitor_name.trim(),
      visitor_company:               visitor_company.trim(),
      visitor_reason:                visitor_reason.trim(),
      health_questions:              health_questions ?? {},
      visitor_declaration_confirmed: visitor_declaration_confirmed ?? false,
      fit_for_work:                  fit_for_work ?? false,
      manager_signed_name:           manager_signed_by.trim(),
      manager_signed_at:             new Date().toISOString(),
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/haccp/visitor]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
