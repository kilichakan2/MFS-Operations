export const dynamic = 'force-dynamic'

/**
 * PATCH /api/cash/month/[id] → admin only. Locks/unlocks a month.
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401/403 gates + the is_locked boolean gate stay here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashService }               from '@/lib/wiring/cash'
import { toMonthLockWireDto }        from '@/lib/api/cash/dto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { id }  = await params
    const body    = await req.json().catch(() => null)

    if (typeof body?.is_locked !== 'boolean') {
      return NextResponse.json({ error: 'is_locked (boolean) required' }, { status: 400 })
    }

    const m = await cashService.setMonthLocked(id, body.is_locked)
    // Missing id → null (adapter .maybeSingle). Today's .single set an error
    // → accidental 500 on an unreachable path; PR2 returns an explicit 404
    // (Gate-2 ruling D2, plan §15.6).
    if (!m) return NextResponse.json({ error: 'Month not found' }, { status: 404 })
    return NextResponse.json(toMonthLockWireDto(m))
  } catch (err) {
    console.error('[cash/month/[id] PATCH] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
