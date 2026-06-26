/**
 * app/api/haccp/people/route.ts
 *
 * GET  — recent health records (all types)
 * POST — submit a health declaration, return to work, or visitor log
 *
 * Source: MFS Health Monitoring Forms V1.0
 * Reg 852/2004 Annex II Ch VIII
 *
 * F-19 PR4: persistence moved behind the HaccpPeople hexagon. This route is
 * presentation only — the cookie role gate, the wall clock (`new Date()`), the
 * EN-CA `todayUK()` helper, and the per-route divergences (R2/R4) stay here; the
 * service owns validate/build/write. Behaviour is byte-identical to the prior
 * inline supabaseService calls.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpPeopleServiceForCaller } from '@/lib/wiring/haccp'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpPeopleServiceForCaller(userId)
    const result = await svc.getRecords()
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/people] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpPeopleServiceForCaller(userId)

    const body = await req.json()
    const { record_type } = body

    if (!record_type) return NextResponse.json({ error: 'record_type required' }, { status: 400 })

    const today = todayUK()
    const now   = new Date()

    // ── Health Declaration (new starter) ──────────────────────────────────────
    if (record_type === 'new_staff_declaration') {
      const v = svc.validateNewStaffDeclaration(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await svc.insertHealthRecord(
        svc.buildNewStaffDeclaration({ input: body, userId, now, today }),
      )
      return NextResponse.json({ ok: true })
    }

    // ── Return to Work ────────────────────────────────────────────────────────
    if (record_type === 'return_to_work') {
      const v = svc.validateReturnToWork(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await svc.insertHealthRecord(
        svc.buildReturnToWork({ input: body, userId, now, today }),
      )
      return NextResponse.json({ ok: true })
    }

    // ── Visitor Log ───────────────────────────────────────────────────────────
    if (record_type === 'visitor') {
      const v = svc.validateVisitor(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })
      // R4: people-visitor uses the truthy check (whitespace-only passes).
      if (!body.manager_signed_by) return NextResponse.json({ error: 'Manager sign-off required' }, { status: 400 })

      // R2: people-visitor passes health_questions RAW and fit_for_work =
      // visitor_declaration_confirmed ?? false. Resolved here, at the edge.
      await svc.insertHealthRecord(
        svc.buildVisitorHealthRecord({
          input: {
            ...body,
            health_questions: body.health_questions,
            fit_for_work: body.visitor_declaration_confirmed ?? false,
          },
          userId,
          now,
          today,
        }),
      )
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid record_type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/people] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
