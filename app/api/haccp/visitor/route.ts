/**
 * app/api/haccp/visitor/route.ts
 *
 * PUBLIC — no auth required. Called from /haccp/visitor kiosk page.
 * Inserts visitor health declaration into haccp_health_records.
 * submitted_by = Visitor Kiosk system user (active=false, never logs in).
 *
 * Records are saved whether or not the visitor is excluded — audit trail
 * shows enforcement is active. fit_for_work reflects exclusion result.
 *
 * F-19 PR4: persistence moved behind the HaccpPeople hexagon (the SHARED
 * buildVisitorHealthRecord). This route is presentation only — no auth, the wall
 * clock (`new Date()`), the EN-GB `todayUK()`, the fixed kiosk user id, and the
 * kiosk's own divergences (R2/R4) stay here; the service assembles the row.
 * Behaviour is byte-identical to the prior inline supabaseService call.
 */

import { NextRequest, NextResponse } from 'next/server'
// F-RLS-04h PR10b: intentionally stays on the service-role singleton — public
// kiosk, no logged-in user, no `x-mfs-user-id` header exists for this route.
import { haccpPeopleService } from '@/lib/wiring/haccp'

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

    const v = haccpPeopleService.validateVisitor(body)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })
    // R4: kiosk uses the trim check (whitespace-only fails).
    if (!body.manager_signed_by?.trim()) return NextResponse.json({ error: 'Manager sign-off required' }, { status: 400 })

    // R2: kiosk defaults health_questions to {} and reads a SEPARATE fit_for_work
    // body field (?? false). Resolved here, at the edge.
    await haccpPeopleService.insertHealthRecord(
      haccpPeopleService.buildVisitorHealthRecord({
        input: {
          ...body,
          health_questions: body.health_questions ?? {},
          fit_for_work: body.fit_for_work ?? false,
        },
        userId: VISITOR_KIOSK_USER_ID,
        now: new Date(),
        today: todayUK(),
      }),
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/haccp/visitor]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
