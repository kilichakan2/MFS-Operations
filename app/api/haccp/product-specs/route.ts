/**
 * app/api/haccp/product-specs/route.ts
 *
 * BSD 1.6.2 — Product Specifications
 *
 * GET   — all active specs + review status (any logged-in role)
 * POST  — create spec (admin only)
 * PATCH — update spec (admin only); deactivate via active=false
 *
 * F-19 PR3: persistence behind the HaccpAssessments hexagon. This route is
 * presentation only — the role gate, the wall clock and response assembly stay
 * here. The PATCH dynamic-allergens nuance stays at the route edge because it
 * depends on `'allergens' in body`, which only the route can see; the route
 * hands the ready `updates` map to the service.
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
    const result = await svc.getProductSpecs(new Date())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/haccp/product-specs]', err)
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

    const valid = svc.validateProductSpec(body)
    if (!valid.ok) {
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    const spec = await svc.insertProductSpec(
      svc.buildProductSpecPersist({
        input: body,
        userId,
        now: new Date(),
      }),
    )
    return NextResponse.json({ spec }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/product-specs]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const svc = await haccpAssessmentsServiceForCaller(userId)

    const body = await req.json()
    const { id, allergens, ...rest } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const updates: Record<string, unknown> = {
      ...rest,
      updated_at: new Date().toISOString(),
    }

    // Only update allergens if it was explicitly included in the request body
    if ('allergens' in body) {
      updates.allergens = Array.isArray(allergens) && allergens.length > 0 ? allergens : null
    }

    const spec = await svc.updateProductSpec(id, updates)
    return NextResponse.json({ spec })
  } catch (err) {
    console.error('[PATCH /api/haccp/product-specs]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
