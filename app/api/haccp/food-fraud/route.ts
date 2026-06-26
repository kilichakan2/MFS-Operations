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
import { haccpAssessmentsServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpAssessmentsServiceForCaller(userId)
    const result = await svc.getFoodFraud(new Date())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/haccp/food-fraud]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const svc = await haccpAssessmentsServiceForCaller(userId)

    const body = await req.json()

    const valid = svc.validateFoodFraud(body)
    if (!valid.ok) {
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    const assessment = await svc.insertFoodFraudAssessment(
      svc.buildFoodFraudPersist({ input: body, userId }),
    )
    return NextResponse.json({ assessment }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/food-fraud]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
