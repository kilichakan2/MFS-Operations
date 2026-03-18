/**
 * POST /api/screen3/sync
 *
 * Receives a queued visit payload from the client's IndexedDB queue
 * and inserts it into the `visits` table.
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
      prospect_name,
      prospect_postcode,
      visit_type,
      outcome,
      commitment_made,
      commitment_detail,
      notes,
    } = body

    // Exactly one of customer_id or prospect_name must be present
    if (!customer_id && !prospect_name) {
      return NextResponse.json(
        { error: 'Either customer_id or prospect_name is required' },
        { status: 400 }
      )
    }

    if (!visit_type || !outcome) {
      return NextResponse.json(
        { error: 'Missing required fields: visit_type, outcome' },
        { status: 400 }
      )
    }

    // ── Insert visit ──────────────────────────────────────────────────────────
    const { data: record, error: insertError } = await supabase
      .from('visits')
      .insert({
        user_id,
        customer_id:       customer_id    ?? null,
        prospect_name:     prospect_name  ?? null,
        prospect_postcode: prospect_postcode ?? null,
        visit_type,
        outcome,
        commitment_made:   commitment_made ?? false,
        commitment_detail: commitment_made ? (commitment_detail ?? null) : null,
        notes:             notes ?? null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[screen3/sync] Insert error:', insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // ── Resolve display name for audit summary ────────────────────────────────
    let displayName = prospect_name ?? 'Unknown'
    if (customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('name')
        .eq('id', customer_id)
        .single()
      displayName = customer?.name ?? customer_id
    }

    const visitTypeLabel = visit_type.replace(/_/g, ' ')
    const outcomeLabel   = outcome.replace(/_/g, ' ')

    // ── Write audit log entry ─────────────────────────────────────────────────
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        user_id,
        screen:    'screen3',
        action:    'created',
        record_id: record.id,
        summary:   `Visit logged: ${displayName} — ${visitTypeLabel} — ${outcomeLabel} — by ${userName}`,
      })

    if (auditError) {
      console.error('[screen3/sync] Audit log error:', auditError.message)
    }

    return NextResponse.json({ id: record.id }, { status: 201 })

  } catch (err) {
    console.error('[screen3/sync] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
