/**
 * POST /api/screen1/sync
 * Inserts a queued discrepancy into the `discrepancies` table.
 * user_id comes from the middleware-injected x-mfs-user-id header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // Initialise client inside the handler — avoids any module-level
  // env-var timing issues on cold starts.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown> | null = null
    try { body = await req.json() } catch { /* falls through to null check */ }
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    console.log('[screen1/sync] Received payload keys:', Object.keys(body).join(', '))

    const customer_id = body.customer_id as string | undefined
    const product_id  = body.product_id  as string | undefined
    const status      = body.status      as string | undefined
    const unit        = body.unit        as string | undefined
    const reason      = body.reason      as string | undefined
    const note        = body.note        as string | null | undefined

    // Coerce quantities to numbers — guard against string values from JSON
    const ordered_qty = body.ordered_qty != null ? Number(body.ordered_qty) : NaN
    const sent_qty    = body.sent_qty    != null ? Number(body.sent_qty)    : null

    // ── Validate ──────────────────────────────────────────────────────────────
    const missing: string[] = []
    if (!customer_id) missing.push('customer_id')
    if (!product_id)  missing.push('product_id')
    if (!status)      missing.push('status')
    if (!unit)        missing.push('unit')
    if (!reason)      missing.push('reason')
    if (isNaN(ordered_qty) || ordered_qty <= 0) missing.push('ordered_qty (must be > 0)')
    if (status === 'short' && (sent_qty === null || isNaN(sent_qty) || sent_qty <= 0))
      missing.push('sent_qty (required when status=short)')

    if (missing.length > 0) {
      console.warn('[screen1/sync] Validation failed:', missing.join(', '))
      return NextResponse.json(
        { error: `Missing or invalid fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // ── Insert discrepancy ────────────────────────────────────────────────────
    console.log('[screen1/sync] Inserting for user:', userId, 'status:', status)

    const { data: record, error: insertError } = await supabase
      .from('discrepancies')
      .insert({
        user_id:     userId,
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
      console.error('[screen1/sync] Insert error:', insertError.code, insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    console.log('[screen1/sync] Inserted record:', record.id)

    // ── Audit log (non-blocking) ───────────────────────────────────────────────
    const [{ data: customer }, { data: product }] = await Promise.all([
      supabase.from('customers').select('name').eq('id', customer_id!).single(),
      supabase.from('products') .select('name').eq('id', product_id!).single(),
    ])

    const statusLabel = status === 'not_sent' ? 'NOT SENT' : 'SHORT'
    const reasonLabel = reason!.replace(/_/g, ' ')

    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        user_id:   userId,
        screen:    'screen1',
        action:    'created',
        record_id: record.id,
        summary:   `Discrepancy logged: ${customer?.name ?? customer_id} — ${product?.name ?? product_id} — ${statusLabel} — ${reasonLabel} — by ${userName}`,
      })

    if (auditError) {
      console.error('[screen1/sync] Audit log error:', auditError.message)
    }

    return NextResponse.json({ id: record.id }, { status: 201 })

  } catch (err: unknown) {
    // Log the full error including stack so Vercel runtime logs show the root cause
    const message = err instanceof Error ? err.message : String(err)
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[screen1/sync] Unhandled error:', message)
    if (stack) console.error('[screen1/sync] Stack:', stack)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
