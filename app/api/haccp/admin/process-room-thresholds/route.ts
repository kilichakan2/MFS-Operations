/**
 * app/api/haccp/admin/process-room-thresholds/route.ts
 * CCP-3 process-room temperature thresholds — admin only.
 *
 * GET   — list all thresholds (active + inactive), ordered by position
 * PATCH — edit a threshold (target/max/active); audit-logged (who/when/old→new)
 *
 * Admin-only is proven TWO ways: this route-edge isAdmin gate AND DB-level RLS on
 * haccp_process_room_thresholds (is_admin() on writes). The per-caller
 * authenticated client makes is_admin() fire in RLS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller } from '@/lib/wiring/haccp'
import type { UpdateProcessRoomThresholdInput } from '@/lib/domain'

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
    const thresholds = await svc.listProcessRoomThresholds()
    return NextResponse.json({ thresholds })
  } catch (err) {
    console.error('[GET /api/haccp/admin/process-room-thresholds]', err)
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
    const input = (await req.json()) as UpdateProcessRoomThresholdInput

    const v = svc.validateProcessRoomThreshold(input)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const updated = await svc.updateProcessRoomThreshold({ input, changedBy: userId })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/haccp/admin/process-room-thresholds]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
