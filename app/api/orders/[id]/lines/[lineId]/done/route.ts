/**
 * app/api/orders/[id]/lines/[lineId]/done/route.ts
 *
 * POST  /api/orders/{id}/lines/{lineId}/done
 *
 * Butcher marks a single line as done (cut + weighed + labelled). When
 * all lines on the order are done, the order automatically transitions
 * to state='completed'.
 *
 * Auth: this endpoint is hit from the KDS device which doesn't carry
 *       a session cookie. The butcher's identity comes from the body:
 *
 *         { butcher_id: <uuid> }
 *
 *       butcher_id is validated against the users table — must be an
 *       active butcher or warehouse user.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB5)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

const KDS_ALLOWED_ROLES = ['butcher', 'warehouse']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const { id, lineId } = await params

    const body = await req.json().catch(() => null)
    const butcherId = String(body?.butcher_id ?? '').trim()

    if (!butcherId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(butcherId)) {
      return NextResponse.json({ error: 'butcher_id required' }, { status: 400 })
    }

    // Validate the butcher
    const { data: butcher, error: butcherErr } = await supabase
      .from('users')
      .select('id, role, active')
      .eq('id', butcherId)
      .single()

    if (butcherErr || !butcher) {
      return NextResponse.json({ error: 'Butcher not found' }, { status: 404 })
    }
    if (!butcher.active) {
      return NextResponse.json({ error: 'Butcher account inactive' }, { status: 403 })
    }
    if (!KDS_ALLOWED_ROLES.includes(butcher.role)) {
      return NextResponse.json({ error: 'User cannot mark lines done' }, { status: 403 })
    }

    // Validate the order + line
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, state')
      .eq('id', id)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.state === 'placed') {
      return NextResponse.json({ error: 'Order has not been printed yet' }, { status: 409 })
    }
    if (order.state === 'completed') {
      return NextResponse.json({ error: 'Order is already completed' }, { status: 409 })
    }

    const { data: line, error: lineErr } = await supabase
      .from('order_lines')
      .select('id, done_at')
      .eq('id', lineId)
      .eq('order_id', id)
      .single()

    if (lineErr || !line) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 })
    }
    if (line.done_at) {
      // Idempotent — already done, return ok
      return NextResponse.json({ ok: true, already_done: true })
    }

    // Mark the line done — audit trigger emits 'line_done'
    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('order_lines')
      .update({ done_at: now, done_by: butcherId })
      .eq('id', lineId)
      .is('done_at', null)  // guard against TOCTOU race

    if (updateErr) {
      console.error('[POST line/done] update failed', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Check if all lines are now done — if so, transition order to completed.
    // Atomic-ish: we re-query, if all done, update. A race against another
    // butcher hitting Done on the last line at the same instant is possible
    // but benign (whichever lands second sees the order already-completed
    // and the audit trigger short-circuits).
    const { data: remaining, error: countErr } = await supabase
      .from('order_lines')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
      .is('done_at', null)

    if (countErr) {
      console.error('[POST line/done] remaining-lines count failed', countErr)
      // Not fatal — line was marked done, completion just won't auto-fire
      return NextResponse.json({ ok: true })
    }

    const remainingCount = remaining?.length ?? 0
    if (remainingCount === 0) {
      const { error: completeErr } = await supabase
        .from('orders')
        .update({ state: 'completed', completed_at: now })
        .eq('id', id)
        .eq('state', 'printed')  // optimistic guard

      if (completeErr) {
        console.error('[POST line/done] auto-complete failed', completeErr)
        return NextResponse.json({ ok: true, completion_failed: true })
      }
      return NextResponse.json({ ok: true, completed: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/orders/[id]/lines/[lineId]/done]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
