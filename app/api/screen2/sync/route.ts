/**
 * POST /api/screen2/sync
 *
 * Receives a queued complaint payload from the client's IndexedDB queue
 * and inserts it into the `complaints` table.
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
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'

    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const {
      customer_id,
      category,
      description,
      received_via,
      status,
      resolution_note,
    } = body

    if (!customer_id || !category || !description || !received_via || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: customer_id, category, description, received_via, status' },
        { status: 400 }
      )
    }

    // ── Insert complaint ──────────────────────────────────────────────────────
    const { data: record, error: insertError } = await supabase
      .from('complaints')
      .insert({
        user_id,
        customer_id,
        category,
        description,
        received_via,
        status,
        // resolved fields only populated if already resolved at time of logging
        resolution_note: status === 'resolved' ? (resolution_note ?? null) : null,
        resolved_by:     status === 'resolved' ? userId : null,
        resolved_at:     status === 'resolved' ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[screen2/sync] Insert error:', insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // ── Resolve customer name for audit summary ───────────────────────────────
    const { data: customer } = await supabase
      .from('customers')
      .select('name')
      .eq('id', customer_id)
      .single()

    const customerName = customer?.name ?? customer_id
    const categoryLabel = category.replace(/_/g, ' ')

    // ── Write audit log entry ─────────────────────────────────────────────────
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        user_id,
        screen:    'screen2',
        action:    'created',
        record_id: record.id,
        summary:   `Complaint logged: ${customerName} — ${categoryLabel} — ${status.toUpperCase()} — by ${userName}`,
      })

    if (auditError) {
      console.error('[screen2/sync] Audit log error:', auditError.message)
    }

    return NextResponse.json({ id: record.id }, { status: 201 })

  } catch (err) {
    console.error('[screen2/sync] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
