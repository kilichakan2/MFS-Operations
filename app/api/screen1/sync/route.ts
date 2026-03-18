/**
 * POST /api/screen1/sync
 *
 * Receives a queued discrepancy payload from the client's IndexedDB queue
 * and inserts it into the `discrepancies` table.
 * user_id is taken from the session header set by middleware — never trusted
 * from the client payload.
 * Also writes an immutable entry to `audit_log`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // ── Session identity (injected by middleware, not client-supplied) ─────────
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'

    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    // ── Parse payload ─────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const {
      customer_id,
      product_id,
      status,
      ordered_qty,
      sent_qty,
      unit,
      reason,
      note,
    } = body

    // Basic field presence validation
    if (!customer_id || !product_id || !status || !ordered_qty || !unit || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: customer_id, product_id, status, ordered_qty, unit, reason' },
        { status: 400 }
      )
    }

    // ── Insert discrepancy ────────────────────────────────────────────────────
    const { data: record, error: insertError } = await supabase
      .from('discrepancies')
      .insert({
        user_id,
        customer_id,
        product_id,
        status,
        ordered_qty,
        sent_qty:    status === 'not_sent' ? null : sent_qty,
        unit,
        reason,
        note:        note ?? null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[screen1/sync] Insert error:', insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // ── Resolve names for audit summary ───────────────────────────────────────
    const [{ data: customer }, { data: product }] = await Promise.all([
      supabase.from('customers').select('name').eq('id', customer_id).single(),
      supabase.from('products').select('name').eq('id', product_id).single(),
    ])

    const customerName = customer?.name ?? customer_id
    const productName  = product?.name  ?? product_id
    const statusLabel  = status === 'not_sent' ? 'NOT SENT' : 'SHORT'
    const reasonLabel  = reason.replace(/_/g, ' ')

    // ── Write audit log entry ─────────────────────────────────────────────────
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        user_id,
        screen:    'screen1',
        action:    'created',
        record_id: record.id,
        summary:   `Discrepancy logged: ${customerName} — ${productName} — ${statusLabel} — ${reasonLabel} — by ${userName}`,
      })

    if (auditError) {
      // Audit failure is non-fatal — record is already saved
      console.error('[screen1/sync] Audit log error:', auditError.message)
    }

    return NextResponse.json({ id: record.id }, { status: 201 })

  } catch (err) {
    console.error('[screen1/sync] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
