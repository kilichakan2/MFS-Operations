/**
 * app/api/orders/[id]/route.ts
 *
 *   GET /api/orders/[id]            — read a single order with its lines
 *   PUT /api/orders/[id]            — edit (full replace of editable fields)
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 *
 * Auth and edit rules:
 *   - GET   open to any back-office role
 *   - PUT while state='placed':    admin/sales/office allowed
 *   - PUT while state='printed':   admin/office only (sales locked out)
 *   - PUT while state='completed': nobody (returns 403)
 *
 * The lock-out point matches the DB CHECK constraints; this layer
 * provides clear 4xx errors instead of relying on a DB exception.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import {
  validateUpdateOrderRequest,
  type UpdateOrderRequest,
} from '@/lib/orders/validation'

const supabase = supabaseService

const ROLES_READ            = ['admin', 'sales', 'office', 'warehouse', 'butcher']
const ROLES_EDIT_PLACED     = ['admin', 'sales', 'office']
const ROLES_EDIT_PRINTED    = ['admin', 'office']

// ─── GET /api/orders/[id] ─────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !ROLES_READ.includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { id } = await params

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, reference, customer_id, delivery_date, delivery_notes, order_notes,
        state, created_by, created_at, printed_by, printed_at, completed_at,
        customer:customer_id ( id, name, postcode ),
        creator:created_by   ( id, name ),
        printer:printed_by   ( id, name ),
        lines:order_lines ( id, line_number, product_id, ad_hoc_description, quantity, uom, notes, done_at, done_by )
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order: data })
  } catch (err) {
    console.error('[GET /api/orders/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PUT /api/orders/[id] ─────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!userId) return NextResponse.json({ error: 'Missing user identity' }, { status: 401 })

    const { id } = await params

    const body = await req.json().catch(() => null)
    const validation = validateUpdateOrderRequest(body)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const update = body as UpdateOrderRequest

    // Load current order to check state
    const { data: existing, error: loadErr } = await supabase
      .from('orders')
      .select('id, state')
      .eq('id', id)
      .single()

    if (loadErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // State-based permission check
    if (existing.state === 'completed') {
      return NextResponse.json({ error: 'Order is completed and cannot be edited' }, { status: 403 })
    }
    if (existing.state === 'placed' && !ROLES_EDIT_PLACED.includes(role)) {
      return NextResponse.json({ error: 'You do not have permission to edit this order' }, { status: 403 })
    }
    if (existing.state === 'printed' && !ROLES_EDIT_PRINTED.includes(role)) {
      return NextResponse.json({ error: 'This order is locked. Only office can amend it after printing.' }, { status: 403 })
    }

    // Build the orders-row patch (omit lines — handled separately)
    const orderPatch: Record<string, unknown> = {}
    if (update.delivery_date  !== undefined) orderPatch.delivery_date  = update.delivery_date
    if (update.delivery_notes !== undefined) orderPatch.delivery_notes = update.delivery_notes
    if (update.order_notes    !== undefined) orderPatch.order_notes    = update.order_notes

    if (Object.keys(orderPatch).length > 0) {
      const { error: patchErr } = await supabase
        .from('orders')
        .update(orderPatch)
        .eq('id', id)
      if (patchErr) {
        return NextResponse.json({ error: patchErr.message }, { status: 500 })
      }
    }

    // Replace lines if provided (full replace pattern — simpler than diff,
    // and the audit log captures the old lines via ON DELETE)
    if (update.lines !== undefined) {
      // Verify product_ids exist (same check as create)
      const productIds = update.lines
        .map(l => l.product_id)
        .filter((id): id is string => typeof id === 'string')
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id')
          .in('id', productIds)
        const foundIds = new Set((products ?? []).map(p => p.id))
        const missing = productIds.filter(pid => !foundIds.has(pid))
        if (missing.length > 0) {
          return NextResponse.json({ error: `Unknown product_id(s): ${missing.join(', ')}` }, { status: 400 })
        }
      }

      // Delete existing lines
      const { error: delErr } = await supabase
        .from('order_lines')
        .delete()
        .eq('order_id', id)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }

      // Insert new lines
      const linesPayload = update.lines.map((l, i) => ({
        order_id:           id,
        line_number:        i + 1,
        product_id:         l.product_id ?? null,
        ad_hoc_description: l.product_id ? null : (l.ad_hoc_description ?? null),
        quantity:           l.quantity,
        uom:                l.uom,
        notes:              l.notes ?? null,
      }))
      const { error: insErr } = await supabase
        .from('order_lines')
        .insert(linesPayload)
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PUT /api/orders/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
