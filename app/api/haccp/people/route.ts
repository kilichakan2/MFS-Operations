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
import { haccpPeopleService } from '@/lib/wiring/haccp'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const result = await haccpPeopleService.getRecords()
    return NextResponse.json(result)

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

    const today = todayUK()
    const now   = new Date()

    // ── Health Declaration (new starter) ──────────────────────────────────────
    if (record_type === 'new_staff_declaration') {
      const v = haccpPeopleService.validateNewStaffDeclaration(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await haccpPeopleService.insertHealthRecord(
        haccpPeopleService.buildNewStaffDeclaration({ input: body, userId, now, today }),
      )
      return NextResponse.json({ ok: true })
    }

    // ── Return to Work ────────────────────────────────────────────────────────
    if (record_type === 'return_to_work') {
      const v = haccpPeopleService.validateReturnToWork(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await haccpPeopleService.insertHealthRecord(
        haccpPeopleService.buildReturnToWork({ input: body, userId, now, today }),
      )
      return NextResponse.json({ ok: true })
    }

    // ── Visitor Log ───────────────────────────────────────────────────────────
    if (record_type === 'visitor') {
      const v = haccpPeopleService.validateVisitor(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })
      // R4: people-visitor uses the truthy check (whitespace-only passes).
      if (!body.manager_signed_by) return NextResponse.json({ error: 'Manager sign-off required' }, { status: 400 })

      // R2: people-visitor passes health_questions RAW and fit_for_work =
      // visitor_declaration_confirmed ?? false. Resolved here, at the edge.
      await haccpPeopleService.insertHealthRecord(
        haccpPeopleService.buildVisitorHealthRecord({
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
