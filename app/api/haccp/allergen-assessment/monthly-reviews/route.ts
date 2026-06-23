/**
 * app/api/haccp/allergen-assessment/monthly-reviews/route.ts
 *
 * SALSA 1.4.2 — monthly allergen monitoring records
 *
 * GET  — list all past monthly reviews (newest first)
 * POST — run review for a given month (admin only)
 *        Queries live delivery data, aggregates, upserts record.
 *
 * F-19 PR3: persistence + the aggregate-then-upsert behind the HaccpAssessments
 * hexagon. This route is presentation only — the role gate, the wall clock and
 * response assembly stay here; the aggregation + UPSERT-on-month_year moved into
 * the service. Re-running a month still OVERWRITES it (preserved).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpAssessmentsService } from '@/lib/wiring/haccp'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const reviews = await haccpAssessmentsService.listMonthlyReviews()
    return NextResponse.json({ reviews })
  } catch (err) {
    console.error('[GET /api/haccp/allergen-assessment/monthly-reviews]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST — run monthly review ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { month_year, notes } = body as { month_year: string; notes?: string }

    const result = await haccpAssessmentsService.runMonthlyReview({
      input: { month_year, notes },
      userId,
      now: new Date(),
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status })
    }

    return NextResponse.json(result.result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/allergen-assessment/monthly-reviews]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
