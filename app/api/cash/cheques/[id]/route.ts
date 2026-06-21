export const dynamic = 'force-dynamic'

/**
 * PATCH /api/cash/cheques/[id]
 *   { action: 'bank' }          → office + admin, marks cheque as banked
 *   { action: 'edit', ...fields } → admin only
 *
 * DELETE /api/cash/cheques/[id] → admin only
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401/403 role gates + the action branching stay here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashServiceForCaller }      from '@/lib/wiring/cash'
import { toChequeEditWireDto }       from '@/lib/api/cash/dto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04e: run as the authenticated caller (RLS fires). Built once after
    // the 401 gate; the per-action role 403s below still fire before any DB call.
    // Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
    const cashService = await cashServiceForCaller(userId)

    const { id } = await params
    const body   = await req.json().catch(() => null)
    if (!body)   return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    if (body.action === 'bank') {
      if (!['office', 'admin'].includes(role ?? '')) {
        return NextResponse.json({ error: 'Office or admin only' }, { status: 403 })
      }
      const res = await cashService.bankCheque(id, userId)
      if (!res) return NextResponse.json({ error: 'Already banked or not found' }, { status: 404 })
      return NextResponse.json({ ok: true, banked_at: res.bankedAt })

    } else if (body.action === 'edit') {
      if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

      const patch: Record<string, unknown> = {}
      if (body.date          != null) patch.date         = body.date
      if (body.customer_id   != null) patch.customerId   = body.customer_id
      if (body.amount        != null) patch.amount       = Number(body.amount)
      if (body.driver_id     != null) patch.driverId     = body.driver_id
      if (body.cheque_number != null) patch.chequeNumber = body.cheque_number
      if (body.notes         != null) patch.notes        = body.notes

      const c = await cashService.updateCheque(id, patch)
      // Missing id → null (adapter .maybeSingle). Today's .single set an error
      // → accidental 500 on an unreachable path; PR2 returns an explicit 404
      // (Gate-2 ruling D2, plan §15.6).
      if (!c) return NextResponse.json({ error: 'Cheque not found' }, { status: 404 })
      return NextResponse.json({ ok: true, record: toChequeEditWireDto(c) })

    } else {
      return NextResponse.json({ error: 'action must be bank or edit' }, { status: 400 })
    }
  } catch (err) {
    console.error('[cash/cheques/[id] PATCH] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    // F-RLS-04e: run as the authenticated caller (RLS fires).
    // Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
    const cashService = await cashServiceForCaller(userId)

    const { id } = await params
    await cashService.deleteCheque(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cash/cheques/[id] DELETE] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
