/**
 * app/api/kds/lines/[lineId]/done/route.ts
 *
 * POST  /api/kds/lines/{lineId}/done
 *
 * Butcher marks a single line as done (cut + weighed + labelled). When
 * all lines on the parent order are done, the order automatically
 * transitions to state='completed'.
 *
 * This endpoint lives under /api/kds/ because the KDS terminal is a
 * shared kiosk — no per-user session cookie. The middleware exposes
 * everything under /api/kds as public (no session required). The
 * butcher's identity comes from the request body and is validated
 * against the users table.
 *
 *   POST body:    { butcher_id: <uuid> }
 *   On success:   200 { ok: true, completed?: true, already_done?: true }
 *   400/403/404/409 for the usual failure modes.
 *
 * Was previously POST /api/orders/{id}/lines/{lineId}/done. Moved
 * during ANVIL Verify Layer 3 — the previous URL lived under
 * /api/orders/ which middleware treats as authenticated, but the KDS
 * device has no session cookie so the route was unreachable. The
 * order id is no longer in the URL — it's derived from the line row.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB5)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

const KDS_ALLOWED_ROLES = ['butcher', 'warehouse']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await params

    if (!UUID_RE.test(lineId)) {
      return NextResponse.json({ error: 'invalid lineId' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const butcherId = String(body?.butcher_id ?? '').trim()

    if (!butcherId || !UUID_RE.test(butcherId)) {
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

    // Look up the line — this also gives us the order_id, no need to take
    // it from the URL.
    const { data: line, error: lineErr } = await supabase
      .from('order_lines')
      .select('id, order_id, done_at')
      .eq('id', lineId)
      .single()

    if (lineErr || !line) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 })
    }

    // Idempotency — if the line is already done, return ok regardless of
    // current order state. A second tap from a butcher (or a network
    // retry) should NOT see an error. Must come BEFORE the order-state
    // check, because the first tap may have auto-completed the order,
    // and we don't want to surface 'already completed' as an error.
    if (line.done_at) {
      return NextResponse.json({ ok: true, already_done: true })
    }

    const orderId = line.order_id

    // Validate the parent order state
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, state')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.state === 'placed') {
      return NextResponse.json({ error: 'Order has not been printed yet' }, { status: 409 })
    }
    if (order.state === 'completed') {
      // Should not happen given the line.done_at check above, but guard
      // against an order that was completed by some other path with a
      // remaining un-done line (shouldn't happen by design, but be safe).
      return NextResponse.json({ error: 'Order is already completed' }, { status: 409 })
    }

    // Mark the line done — audit trigger emits 'line_done'
    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('order_lines')
      .update({ done_at: now, done_by: butcherId })
      .eq('id', lineId)
      .is('done_at', null)  // guard against TOCTOU race

    if (updateErr) {
      console.error('[POST kds/lines/done] update failed', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Check if all lines are now done — if so, transition order to completed.
    // Atomic-ish: re-query; if all done, update. A race against another
    // butcher hitting Done on the last line at the same instant is possible
    // but benign (whichever lands second sees the order already-completed
    // and the line.done_at idempotency check above short-circuits).
    //
    // IMPORTANT: head: true means data is null and we MUST read `count`,
    // not `data?.length`. Reading length on a head-only query always
    // returns 0 — which would cause auto-complete to fire after every
    // single line-done tap regardless of remaining lines. Caught by
    // ANVIL Verify Layer 3.
    const { count: remainingCount, error: countErr } = await supabase
      .from('order_lines')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .is('done_at', null)

    if (countErr) {
      console.error('[POST kds/lines/done] remaining-lines count failed', countErr)
      // Not fatal — line was marked done, completion just won't auto-fire
      return NextResponse.json({ ok: true })
    }

    if (remainingCount === 0) {
      const { error: completeErr } = await supabase
        .from('orders')
        .update({ state: 'completed', completed_at: now })
        .eq('id', orderId)
        .eq('state', 'printed')  // optimistic guard

      if (completeErr) {
        console.error('[POST kds/lines/done] auto-complete failed', completeErr)
        return NextResponse.json({ ok: true, completion_failed: true })
      }
      return NextResponse.json({ ok: true, completed: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/kds/lines/[lineId]/done]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
