/**
 * app/api/haccp/allergen-assessment/route.ts
 *
 * SALSA 1.4.1 — Site allergen identification and cross-contamination risk
 *
 * GET  — fetch all assessments desc + latest (backward compatible)
 * POST — insert new assessment (admin only — never overwrites)
 *
 * F-19 PR3: persistence behind the HaccpAssessments hexagon. This route is
 * presentation only — the role gate, the wall clock and response assembly stay
 * here; everything touching a table moved into the service/adapter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpAssessmentsService } from '@/lib/wiring/haccp'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const result = await haccpAssessmentsService.listAllergenAssessments()
    // backward compatible: assessment = latest (existing callers unaffected)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/haccp/allergen-assessment]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST — insert (admin only) ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()

    const valid = haccpAssessmentsService.validateAllergenAssessment(body)
    if (!valid.ok) {
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    // Always insert a fresh record — keeps full history, latest is newest
    const assessment = await haccpAssessmentsService.insertAllergenAssessment(
      haccpAssessmentsService.buildAllergenAssessmentPersist({
        input: body,
        userId,
        now: new Date(),
      }),
    )
    return NextResponse.json({ assessment }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/allergen-assessment]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
