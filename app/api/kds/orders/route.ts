/**
 * app/api/kds/orders/route.ts
 *
 *   GET /api/kds/orders
 *
 * Returns the live KDS queue: all orders in state='printed', ordered
 * by delivery_date ASC then printed_at ASC. Includes lines + customer
 * name + recent audit entries (so the client can detect 'reprinted'
 * or 'edited' actions to flash orange).
 *
 * Auth: no cookie required. The KDS device is in a physical-access-
 *       controlled room (production floor) and the URL itself is
 *       considered the access token. This endpoint is read-only;
 *       mutations (line-Done) go through a separate endpoint that
 *       validates the butcher_id explicitly.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB5)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// How far back to look for audit entries that should cause the card
// to flash orange. 60 seconds is enough that a butcher will see the
// flash even if they were briefly looking at another card.
const FLASH_LOOKBACK_MS = 60_000

export async function GET(_req: NextRequest) {
  try {
    // 1. All printed orders, plus the most recent completed ones
    //    (so the KDS can show a "just finished" fade-out)
    const since = new Date(Date.now() - 90_000).toISOString()  // last 90s

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, reference, state, delivery_date, delivery_notes, order_notes,
        printed_at, completed_at,
        customer:customer_id ( id, name ),
        lines:order_lines (
          id, line_number, product_id, ad_hoc_description, quantity, uom, notes,
          done_at, done_by
        )
      `)
      .or(`state.eq.printed,and(state.eq.completed,completed_at.gte.${since})`)
      .order('delivery_date', { ascending: true })
      .order('printed_at',    { ascending: true })
      .limit(100)

    if (error) {
      console.error('[GET /api/kds/orders] DB error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Recent audit-log entries that should cause the card to flash:
    //    edited / line_edited / reprinted within the lookback window.
    const orderIds = (orders ?? []).map(o => o.id)
    let recentFlashes: Array<{ order_id: string; action: string; created_at: string }> = []

    if (orderIds.length > 0) {
      const flashSince = new Date(Date.now() - FLASH_LOOKBACK_MS).toISOString()
      const { data: auditRows } = await supabase
        .from('order_audit_log')
        .select('order_id, action, created_at')
        .in('order_id', orderIds)
        .in('action', ['edited', 'line_edited', 'reprinted', 'line_added'])
        .gte('created_at', flashSince)

      recentFlashes = (auditRows ?? []).map(r => ({
        order_id:   r.order_id,
        action:     r.action,
        created_at: r.created_at,
      }))
    }

    return NextResponse.json({
      orders:        orders ?? [],
      recent_flashes: recentFlashes,
      server_time:   new Date().toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/kds/orders]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
