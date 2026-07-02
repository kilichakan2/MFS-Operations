/**
 * app/api/haccp/admin/mince-thresholds/route.ts
 * CCP-M Mince & Meat Prep thresholds — admin only.
 *
 * GET   — list all 9 band rows (6 temp channels + 3 kill-day limits), ordered
 *         by position
 * PATCH — edit a row's numbers (pass/amber); audit-logged (who/when/old→new).
 *         Band STRUCTURE is code-locked: a value's null-ness cannot change
 *         (no adding/removing amber bands or limits via the app — including
 *         the documented `kill_days_imported_vac` no-limit row), kill-day
 *         rows stay binary and whole-day.
 *
 * Admin-only is proven TWO ways: this route-edge isAdmin gate AND DB-level RLS
 * on haccp_mince_thresholds (is_admin() on writes). The per-caller
 * authenticated client makes is_admin() fire in RLS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller } from '@/lib/wiring/haccp'
import type { UpdateMinceThresholdInput } from '@/lib/domain'

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
    const thresholds = await svc.listMinceThresholds()
    return NextResponse.json({ thresholds })
  } catch (err) {
    console.error('[GET /api/haccp/admin/mince-thresholds]', err)
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
    const input = (await req.json()) as UpdateMinceThresholdInput

    // The structure lock needs the CURRENT row (null-ness + kind comparison).
    const all = await svc.listMinceThresholds()
    const current = all.find((t) => t.id === input.id)
    if (!current) return NextResponse.json({ error: 'Threshold not found' }, { status: 404 })

    const v = svc.validateMinceThreshold(input, current)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const updated = await svc.updateMinceThreshold({ input, changedBy: userId })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/haccp/admin/mince-thresholds]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
