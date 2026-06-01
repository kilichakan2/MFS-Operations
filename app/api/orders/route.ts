/**
 * app/api/orders/route.ts
 *
 *   GET  /api/orders                — list orders (filtered by query params)
 *   POST /api/orders                — create a new order
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 *
 * Auth: mfs_role cookie. RLS is enforced at the DB layer but this API
 * uses the service-role client which bypasses RLS, so we re-check the
 * role allow-list here.
 *
 * Roles permitted:
 *   GET  — admin, sales, office, warehouse, butcher
 *   POST — admin, sales, office
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import {
  validateCreateOrderRequest,
  normaliseCreateOrder,
  type CreateOrderRequest,
} from '@/lib/orders/validation'

const supabase = supabaseService

const ROLES_READ   = ['admin', 'sales', 'office', 'warehouse', 'butcher']
const ROLES_CREATE = ['admin', 'sales', 'office']

// ─── GET /api/orders ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !ROLES_READ.includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const url = req.nextUrl
    const state          = url.searchParams.get('state')          // optional filter
    const deliveryDate   = url.searchParams.get('delivery_date')  // YYYY-MM-DD
    const customerId     = url.searchParams.get('customer_id')
    const createdBy      = url.searchParams.get('created_by')
    const limitStr       = url.searchParams.get('limit')
    const limit          = limitStr ? Math.min(200, Math.max(1, parseInt(limitStr, 10) || 50)) : 50

    let query = supabase
      .from('orders')
      .select(`
        id, reference, customer_id, delivery_date, delivery_notes, order_notes,
        state, created_by, created_at, printed_by, printed_at, completed_at,
        customer:customer_id ( id, name, postcode ),
        creator:created_by   ( id, name ),
        lines:order_lines ( id, line_number, product_id, ad_hoc_description, quantity, uom, notes, done_at, done_by )
      `)
      .order('delivery_date', { ascending: true })
      .order('created_at',   { ascending: true })
      .limit(limit)

    if (state)        query = query.eq('state', state)
    if (deliveryDate) query = query.eq('delivery_date', deliveryDate)
    if (customerId)   query = query.eq('customer_id', customerId)
    if (createdBy)    query = query.eq('created_by', createdBy)

    const { data, error } = await query
    if (error) {
      console.error('[GET /api/orders] DB error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ orders: data ?? [] })
  } catch (err) {
    console.error('[GET /api/orders]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST /api/orders ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value

    if (!role || !ROLES_CREATE.includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (!userId) {
      return NextResponse.json({ error: 'Missing user identity' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const validation = validateCreateOrderRequest(body)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const normalised = normaliseCreateOrder(body as CreateOrderRequest)

    // Verify the referenced customer exists (cheap, prevents FK violations
    // bubbling up as 500s)
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, active')
      .eq('id', normalised.customer_id)
      .single()
    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    if (customer.active === false) {
      return NextResponse.json({ error: 'Customer is inactive' }, { status: 400 })
    }

    // Verify all referenced product_ids exist (one query, not N)
    const productIds = normalised.lines
      .map(l => l.product_id)
      .filter((id): id is string => id !== null)
    if (productIds.length > 0) {
      const { data: products, error: prodErr } = await supabase
        .from('products')
        .select('id')
        .in('id', productIds)
      if (prodErr) {
        return NextResponse.json({ error: prodErr.message }, { status: 500 })
      }
      const foundIds = new Set((products ?? []).map(p => p.id))
      const missing = productIds.filter(id => !foundIds.has(id))
      if (missing.length > 0) {
        return NextResponse.json({ error: `Unknown product_id(s): ${missing.join(', ')}` }, { status: 400 })
      }
    }

    // SET LOCAL app.current_user_id is what the audit triggers read. The
    // supabase-js client doesn't expose SET LOCAL through .from(),
    // so we run the inserts via a single RPC that sets the variable
    // and inserts atomically. For now use a single transaction via
    // .rpc() — fallback: insert order, then insert lines, with the
    // user_id set via a Postgres function called first.

    // The simplest atomic approach with supabase-js: insert the order
    // first to get the id, then bulk-insert lines. The audit trigger
    // captures NULL user_id which is acceptable for v1 — SB2 acceptance
    // criteria don't require user attribution on creates (only that
    // the audit log captures the creation). We'll wire SET LOCAL via
    // a Postgres helper function in a follow-up commit if needed.
    //
    // Order is inserted with explicit created_by so attribution still
    // exists in orders.created_by; audit log payload also contains it.

    const { data: created, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id:    normalised.customer_id,
        delivery_date:  normalised.delivery_date,
        delivery_notes: normalised.delivery_notes,
        order_notes:    normalised.order_notes,
        created_by:     userId,
      })
      .select('id, reference')
      .single()

    if (orderErr || !created) {
      console.error('[POST /api/orders] order insert failed', orderErr)
      return NextResponse.json({ error: orderErr?.message ?? 'Failed to create order' }, { status: 500 })
    }

    const linesPayload = normalised.lines.map(l => ({ ...l, order_id: created.id }))

    const { error: linesErr } = await supabase
      .from('order_lines')
      .insert(linesPayload)

    if (linesErr) {
      // Rollback: delete the order we just created so we don't leave
      // an empty order behind. ON DELETE CASCADE handles any partial
      // lines that may have been inserted before the error.
      await supabase.from('orders').delete().eq('id', created.id)
      console.error('[POST /api/orders] lines insert failed, order rolled back', linesErr)
      return NextResponse.json({ error: linesErr.message }, { status: 500 })
    }

    return NextResponse.json({ id: created.id, reference: created.reference }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/orders]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
