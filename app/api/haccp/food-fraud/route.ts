/**
 * app/api/haccp/food-fraud/route.ts
 *
 * BSD 1.6.4 — Food Fraud Vulnerability Assessments
 *
 * GET  — all versions desc + latest flag + review_due (any HACCP role)
 * POST — insert new version (admin only — never overwrites existing rows)
 *
 * F-19 PR3: persistence behind the HaccpAssessments hexagon. This route is
 * presentation only — the role gate, the wall clock and response assembly stay
 * here; everything touching a table moved into the service/adapter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpAssessmentsService } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const result = await haccpAssessmentsService.getFoodFraud(new Date())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/haccp/food-fraud]', err)
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

    const valid = haccpAssessmentsService.validateFoodFraud(body)
    if (!valid.ok) {
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    const assessment = await haccpAssessmentsService.insertFoodFraudAssessment(
      haccpAssessmentsService.buildFoodFraudPersist({ input: body, userId }),
    )
    return NextResponse.json({ assessment }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/food-fraud]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
