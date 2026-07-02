/**
 * app/api/haccp/admin/goods-in-thresholds/route.ts
 * CCP-1 Goods In temperature thresholds — admin only.
 *
 * GET   — list all 11 category band rows, ordered by position
 * PATCH — edit a row's numbers (pass/amber); audit-logged (who/when/old→new).
 *         Band STRUCTURE is code-locked: a value's null-ness cannot change
 *         (no adding/removing amber bands or temperature CCPs via the app).
 *
 * Admin-only is proven TWO ways: this route-edge isAdmin gate AND DB-level RLS
 * on haccp_goods_in_thresholds (is_admin() on writes). The per-caller
 * authenticated client makes is_admin() fire in RLS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller } from '@/lib/wiring/haccp'
import type { UpdateGoodsInThresholdInput } from '@/lib/domain'

function isAdmin(req: NextRequest) {
  return req.headers.get('x-mfs-user-role') === 'admin'
}

// ─── GET — list all ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const svc = await haccpDailyChecksServiceForCaller(userId)
    const thresholds = await svc.listGoodsInThresholds()
    return NextResponse.json({ thresholds })
  } catch (err) {
    console.error('[GET /api/haccp/admin/goods-in-thresholds]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PATCH — update (audit-logged) ──────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const svc = await haccpDailyChecksServiceForCaller(userId)
    const input = (await req.json()) as UpdateGoodsInThresholdInput

    // The structure lock needs the CURRENT row (null-ness comparison).
    const all = await svc.listGoodsInThresholds()
    const current = all.find((t) => t.id === input.id)
    if (!current) return NextResponse.json({ error: 'Threshold not found' }, { status: 404 })

    const v = svc.validateGoodsInThreshold(input, current)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const updated = await svc.updateGoodsInThreshold({ input, changedBy: userId })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/haccp/admin/goods-in-thresholds]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
