/**
 * POST /api/screen2/sync
 * Inserts a queued complaint. Uses raw fetch() to the Supabase REST API
 * rather than the supabase-js client, to avoid any cold-start initialisation
 * issues with the client library.
 */

import { NextRequest, NextResponse } from 'next/server'
import { complaintsServiceForCaller } from '@/lib/wiring/complaints'
import type {
  ComplaintCategory,
  ComplaintReceivedVia,
  ComplaintStatus,
} from '@/lib/domain'

// audit_log is a cross-cutting write with no owned port yet (F-TD-31) — it
// stays as a raw REST fetch. Only the complaint DATA surface moved to the
// service.
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

async function supaPost(table: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':         SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Prefer':         'return=representation',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complaintsServiceForCaller(userId) → complaintsService.
    const complaintsService = await complaintsServiceForCaller(userId)

    let body: Record<string, unknown> | null = null
    try { body = await req.json() } catch { /* fall through */ }
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    console.log('[screen2/sync] keys:', Object.keys(body).join(', '))

    const id              = body.id              as string | undefined
    const customer_id     = body.customer_id     as string | undefined
    const category        = body.category        as string | undefined
    const description     = body.description     as string | undefined
    const received_via    = body.received_via    as string | undefined
    const status          = body.status          as string | undefined
    const resolution_note = (body.resolution_note as string | null | undefined) ?? null

    const input = {
      ...(id ? { id } : {}),
      customerId:     (customer_id ?? '') as string,
      category:       (category ?? '') as ComplaintCategory,
      description:    (description ?? '') as string,
      receivedVia:    (received_via ?? '') as ComplaintReceivedVia,
      status:         (status ?? '') as ComplaintStatus,
      resolutionNote: resolution_note,
      loggedBy:       userId,
    }

    const valid = complaintsService.validateCreate(input)
    if (!valid.ok) {
      console.warn('[screen2/sync] validation failed:', valid.message)
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    console.log('[screen2/sync] inserting complaint, status:', status)
    const created = await complaintsService.createComplaint(input)

    // 23505 = unique_violation — already inserted on a previous retry. The
    // adapter maps it to duplicate:true; the till's offline queue needs a 200
    // here (a 500 would make it retry forever) — W1.
    if (created.duplicate) {
      console.log('[screen2/sync] Duplicate insert — already exists, returning 200')
      return NextResponse.json({ id: created.id, duplicate: true }, { status: 200 })
    }

    const recordId = created.id
    console.log('[screen2/sync] inserted:', recordId)

    // Customer name now comes back with the create receipt (no second read).
    const label = category!.replace(/_/g, ' ')

    // Audit log (fire-and-forget) — raw REST, F-TD-31 (no owned port yet)
    supaPost('audit_log', {
      user_id:   userId,
      screen:    'screen2',
      action:    'created',
      record_id: recordId ?? null,
      summary:   `Complaint logged: ${created.customerName} — ${label} — ${status!.toUpperCase()} — by ${userName}`,
    }).catch((e) => console.error('[screen2/sync] audit error:', e))

    // Send email — awaited so errors surface in this request context
    try {
      const { sendComplaintEmail } = await import('@/lib/complaint-email')
      await sendComplaintEmail({
        type:      'new_complaint',
        author:    userName,
        complaint: {
          id:          recordId ?? '',
          customer:    created.customerName,
          category:    label,
          description: (description ?? '').trim(),
          receivedVia: received_via?.replace(/_/g, ' '),
          status:      status ?? 'open',
          loggedBy:    userName,
        },
      })
    } catch (e) {
      console.error('[screen2/sync] email error:', e instanceof Error ? e.stack : String(e))
    }

    return NextResponse.json({ id: recordId }, { status: 201 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stk = err instanceof Error ? err.stack   : undefined
    console.error('[screen2/sync] unhandled error:', msg)
    if (stk) console.error('[screen2/sync] stack:', stk)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
