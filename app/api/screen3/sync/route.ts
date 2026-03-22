/**
 * POST /api/screen3/sync
 * Inserts a queued visit into the `visits` table.
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

    console.log('[screen3/sync] Received payload keys:', Object.keys(body).join(', '))

    const customer_id        = (body.customer_id        as string  | undefined) ?? null
    const prospect_name      = (body.prospect_name      as string  | undefined) ?? null
    const prospect_postcode  = (body.prospect_postcode  as string  | undefined) ?? null
    const visit_type         = body.visit_type          as string  | undefined
    const outcome            = body.outcome             as string  | undefined
    const notes              = (body.notes              as string  | undefined) ?? null
    const commitment_detail  = (body.commitment_detail  as string  | undefined) ?? null

    // Explicit boolean coercion — DB has CHECK constraint on commitment_made/detail pair
    const commitment_made = body.commitment_made === true || body.commitment_made === 'true'

    // Validate
    const missing: string[] = []
    if (!customer_id && !prospect_name) missing.push('customer_id or prospect_name (one required)')
    if (customer_id  && prospect_name)  missing.push('only one of customer_id / prospect_name allowed')
    if (!visit_type)  missing.push('visit_type')
    if (!outcome)     missing.push('outcome')
    if (commitment_made && !commitment_detail?.trim()) missing.push('commitment_detail (required when commitment_made=true)')

    if (missing.length > 0) {
      console.warn('[screen3/sync] Validation failed:', missing.join(', '))
      return NextResponse.json(
        { error: `Missing or invalid fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    console.log('[screen3/sync] Inserting for user:', userId, 'visit_type:', visit_type, 'outcome:', outcome)

    // ── Insert visit ──────────────────────────────────────────────────────────
    // DB constraints enforced here:
    //   visits_customer_check:   exactly one of customer_id/prospect_name non-null
    //   visits_commitment_check: commitment_detail required iff commitment_made=true
    const { data: record, error: insertError } = await supabase
      .from('visits')
      .insert({
        user_id,
        customer_id,
        prospect_name,
        prospect_postcode,
        visit_type,
        outcome,
        commitment_made,
        commitment_detail: commitment_made ? (commitment_detail ?? null) : null,
        notes,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[screen3/sync] Insert error:', insertError.code, insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    console.log('[screen3/sync] Inserted record:', record.id)

    // ── Audit log (non-blocking) ───────────────────────────────────────────────
    let displayName = prospect_name ?? 'Unknown'
    if (customer_id) {
      const { data: customer } = await supabase
        .from('customers').select('name').eq('id', customer_id).single()
      displayName = customer?.name ?? customer_id
    }

    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        user_id,
        screen:    'screen3',
        action:    'created',
        record_id: record.id,
        summary:   `Visit logged: ${displayName} — ${visit_type!.replace(/_/g, ' ')} — ${outcome!.replace(/_/g, ' ')} — by ${userName}`,
      })

    if (auditError) console.error('[screen3/sync] Audit log error:', auditError.message)

    return NextResponse.json({ id: record.id }, { status: 201 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[screen3/sync] Unhandled error:', message)
    if (stack) console.error('[screen3/sync] Stack:', stack)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
