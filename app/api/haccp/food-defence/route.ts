/**
 * app/api/haccp/food-defence/route.ts
 * SALSA 4.2.3 / BSD 4.4 — Food Defence Plans
 * GET  — all versions desc + latest + review_due (any HACCP role)
 * POST — insert new version (admin only — never overwrites)
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

    const result = await haccpAssessmentsService.getFoodDefence(new Date())
    return NextResponse.json(result)
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

    const valid = haccpAssessmentsService.validateFoodDefence(body)
    if (!valid.ok) {
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    const plan = await haccpAssessmentsService.insertFoodDefencePlan(
      haccpAssessmentsService.buildFoodDefencePersist({ input: body, userId }),
    )
    return NextResponse.json({ plan }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/food-defence]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
