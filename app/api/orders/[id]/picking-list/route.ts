/**
 * app/api/orders/[id]/picking-list/route.ts
 *
 *   GET  /api/orders/[id]/picking-list           — fetch + render only
 *   POST /api/orders/[id]/picking-list           — print: render + transition
 *                                                  state to 'printed' atomically
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB4)
 *
 * GET is for previewing or for re-rendering an already-printed order
 * (e.g. when the paper is lost). It does NOT change state.
 *
 * POST is the office "Print picking list" action. It:
 *   1. Loads the order with lines + customer + creator
 *   2. If state='placed', transitions to 'printed' (audit trigger fires)
 *   3. If state='printed', this is a reprint (audit trigger emits 'reprinted')
 *   4. If state='completed', returns 403 (can't reprint a completed order)
 *   5. Returns the rendered HTML (the office page injects this into an iframe)
 *
 * Auth: same as the other order endpoints — mfs_role cookie + mfs_user_id.
 *
 *   GET   — any back-office role (admin/sales/office/warehouse/butcher)
 *   POST  — admin/office/warehouse only (per Frame spec — anyone with order
 *           visibility *except* sales reps can trigger print; sales reps can
 *           ask office to print)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import { renderPickingListHtml, type PickingListData } from '@/lib/orders/pickingList'
import type { OrderUom, OrderState } from '@/lib/orders/types'

const supabase = supabaseService

const ROLES_READ  = ['admin', 'sales', 'office', 'warehouse', 'butcher']
const ROLES_PRINT = ['admin', 'office', 'warehouse']

interface FetchedOrder {
  id:             string
  reference:      string
  customer_id:    string
  delivery_date:  string
  order_notes:    string | null
  delivery_notes: string | null
  state:          OrderState
  created_at:     string
  customer:       { id: string; name: string; postcode: string | null } | null
  creator:        { id: string; name: string } | null
  lines: Array<{
    line_number:        number
    product_id:         string | null
    ad_hoc_description: string | null
    quantity:           number
    uom:                OrderUom
    notes:              string | null
  }>
}

async function fetchOrder(id: string): Promise<FetchedOrder | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, reference, customer_id, delivery_date, order_notes, delivery_notes,
      state, created_at,
      customer:customer_id ( id, name, postcode ),
      creator:created_by   ( id, name ),
      lines:order_lines (
        line_number, product_id, ad_hoc_description, quantity, uom, notes
      )
    `)
    .eq('id', id)
    .single<FetchedOrder>()

  if (error || !data) return null
  return data
}

/**
 * Map a fetched order into the picking-list render shape. Resolves
 * product names + codes + pack sizes from the products catalogue in a
 * single query.
 */
async function toPickingListData(
  order: FetchedOrder,
  printedBy: string,
): Promise<PickingListData> {
  const productIds = order.lines
    .map(l => l.product_id)
    .filter((id): id is string => id !== null)

  const productMap = new Map<string, { code: string | null; name: string; box_size: string | null }>()
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, code, name, box_size')
      .in('id', productIds)
    for (const p of products ?? []) {
      productMap.set(p.id, { code: p.code, name: p.name, box_size: p.box_size })
    }
  }

  return {
    reference:         order.reference,
    customer_name:     order.customer?.name     ?? '—',
    customer_postcode: order.customer?.postcode ?? null,
    order_date:        order.created_at.slice(0, 10),
    delivery_date:     order.delivery_date,
    sales_rep:         order.creator?.name      ?? '—',
    printed_at:        new Date().toISOString(),
    printed_by:        printedBy,
    delivery_notes:    order.delivery_notes,
    order_notes:       order.order_notes,
    lines: order.lines.map(l => {
      const prod = l.product_id ? productMap.get(l.product_id) : undefined
      return {
        line_number:  l.line_number,
        product_code: prod?.code ?? '',
        description:  l.ad_hoc_description ?? prod?.name ?? '(unknown product)',
        quantity:     l.quantity,
        uom:          l.uom,
        pack:         prod?.box_size ?? null,
        notes:        l.notes,
      }
    }),
  }
}

// ─── GET /api/orders/[id]/picking-list ────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !ROLES_READ.includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!userId) {
      return NextResponse.json({ error: 'Missing user identity' }, { status: 401 })
    }

    const { id } = await params
    const order = await fetchOrder(id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Look up the printing user's name for the footer
    const { data: userRow } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .single()

    const data = await toPickingListData(order, userRow?.name ?? 'unknown')

    const html = renderPickingListHtml(data)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('[GET /api/orders/[id]/picking-list]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST /api/orders/[id]/picking-list ───────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !ROLES_PRINT.includes(role)) {
      return NextResponse.json({ error: 'Unauthorised — only office/warehouse can print picking lists' }, { status: 401 })
    }
    if (!userId) {
      return NextResponse.json({ error: 'Missing user identity' }, { status: 401 })
    }

    const { id } = await params
    const order = await fetchOrder(id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // State guard
    if (order.state === 'completed') {
      return NextResponse.json({ error: 'Order is completed — cannot reprint a completed order' }, { status: 403 })
    }

    // State transition: placed → printed (audit trigger emits 'printed').
    // Already-printed orders bump printed_at (audit trigger emits 'reprinted').
    const now = new Date().toISOString()

    if (order.state === 'placed') {
      const { error: txErr } = await supabase
        .from('orders')
        .update({ state: 'printed', printed_at: now, printed_by: userId })
        .eq('id', id)
        .eq('state', 'placed')  // optimistic-lock against concurrent transitions
      if (txErr) {
        return NextResponse.json({ error: txErr.message }, { status: 500 })
      }
    } else if (order.state === 'printed') {
      // Reprint — keep state=printed, update printed_at + printed_by so the
      // audit trigger writes a 'reprinted' row
      const { error: txErr } = await supabase
        .from('orders')
        .update({ printed_at: now, printed_by: userId })
        .eq('id', id)
      if (txErr) {
        return NextResponse.json({ error: txErr.message }, { status: 500 })
      }
    }

    // Look up the printing user's name
    const { data: userRow } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .single()

    const data = await toPickingListData(order, userRow?.name ?? 'unknown')
    // Override the printed_at in the rendered sheet to match what we just wrote
    data.printed_at = now

    const html = renderPickingListHtml(data)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('[POST /api/orders/[id]/picking-list]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
