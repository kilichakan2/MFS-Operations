/**
 * POST /api/screen2/sync
 * Inserts a queued complaint into the `complaints` table.
 * user_id comes from the middleware-injected x-mfs-user-id header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // createClient inside handler — avoids module-level env-var cold-start crash
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )

  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    let body: Record<string, unknown> | null = null
    try { body = await req.json() } catch { /* falls through */ }
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    console.log('[screen2/sync] Received payload keys:', Object.keys(body).join(', '))

    const customer_id     = body.customer_id     as string | undefined
    const category        = body.category        as string | undefined
    const description     = body.description     as string | undefined
    const received_via    = body.received_via    as string | undefined
    const status          = body.status          as string | undefined
    const resolution_note = body.resolution_note as string | null | undefined

    // Validate required fields
    const missing: string[] = []
    if (!customer_id)  missing.push('customer_id')
    if (!category)     missing.push('category')
    if (!description || description.trim().length < 5) missing.push('description (min 5 chars)')
    if (!received_via) missing.push('received_via')
    if (!status)       missing.push('status')
    if (status === 'resolved' && !resolution_note?.trim()) missing.push('resolution_note (required when resolved)')

    if (missing.length > 0) {
      console.warn('[screen2/sync] Validation failed:', missing.join(', '))
      return NextResponse.json(
        { error: `Missing or invalid fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    console.log('[screen2/sync] Inserting for user:', userId, 'status:', status)

    // ── Insert complaint ──────────────────────────────────────────────────────
    // DB constraint: open complaints must have all resolution fields null;
    // resolved complaints must have resolution_note, resolved_by, resolved_at all set.
    const { data: record, error: insertError } = await supabase
      .from('complaints')
      .insert({
        user_id,
        customer_id,
        category,
        description:     description!.trim(),
        received_via,
        status,
        resolution_note: status === 'resolved' ? (resolution_note?.trim() ?? null) : null,
        resolved_by:     status === 'resolved' ? userId : null,
        resolved_at:     status === 'resolved' ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[screen2/sync] Insert error:', insertError.code, insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    console.log('[screen2/sync] Inserted record:', record.id)

    // ── Audit log (non-blocking) ───────────────────────────────────────────────
    const { data: customer } = await supabase
      .from('customers').select('name').eq('id', customer_id!).single()

    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        user_id,
        screen:    'screen2',
        action:    'created',
        record_id: record.id,
        summary:   `Complaint logged: ${customer?.name ?? customer_id} — ${category!.replace(/_/g, ' ')} — ${status!.toUpperCase()} — by ${userName}`,
      })

    if (auditError) console.error('[screen2/sync] Audit log error:', auditError.message)

    return NextResponse.json({ id: record.id }, { status: 201 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[screen2/sync] Unhandled error:', message)
    if (stack) console.error('[screen2/sync] Stack:', stack)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
