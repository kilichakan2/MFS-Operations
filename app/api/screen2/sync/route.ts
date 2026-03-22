/**
 * POST /api/screen2/sync
 * Inserts a queued complaint. Uses raw fetch() to the Supabase REST API
 * rather than the supabase-js client, to avoid any cold-start initialisation
 * issues with the client library.
 */

import { NextRequest, NextResponse } from 'next/server'

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

async function supaGet(table: string, params: string) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey':         SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
    },
  })
  if (!res.ok) return null
  const rows = await res.json() as { name?: string }[]
  return rows[0] ?? null
}

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    let body: Record<string, unknown> | null = null
    try { body = await req.json() } catch { /* fall through */ }
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    console.log('[screen2/sync] keys:', Object.keys(body).join(', '))

    const customer_id     = body.customer_id     as string | undefined
    const category        = body.category        as string | undefined
    const description     = body.description     as string | undefined
    const received_via    = body.received_via    as string | undefined
    const status          = body.status          as string | undefined
    const resolution_note = (body.resolution_note as string | null | undefined) ?? null

    const missing: string[] = []
    if (!customer_id)  missing.push('customer_id')
    if (!category)     missing.push('category')
    if (!description || description.trim().length < 5) missing.push('description')
    if (!received_via) missing.push('received_via')
    if (!status)       missing.push('status')
    if (status === 'resolved' && !resolution_note?.trim()) missing.push('resolution_note')
    if (missing.length > 0) {
      console.warn('[screen2/sync] validation failed:', missing.join(', '))
      return NextResponse.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      user_id:     userId,
      customer_id,
      category,
      description:     description!.trim(),
      received_via,
      status,
      resolution_note: status === 'resolved' ? (resolution_note?.trim() ?? null) : null,
      resolved_by:     status === 'resolved' ? userId : null,
      resolved_at:     status === 'resolved' ? new Date().toISOString() : null,
    }

    console.log('[screen2/sync] inserting complaint, status:', status)
    const { ok, status: httpStatus, text } = await supaPost('complaints', payload)

    if (!ok) {
      console.error('[screen2/sync] insert failed:', httpStatus, text.slice(0, 200))
      return NextResponse.json({ error: `Insert failed: ${text.slice(0, 100)}` }, { status: 500 })
    }

    const rows = JSON.parse(text) as { id: string }[]
    const recordId = rows[0]?.id
    console.log('[screen2/sync] inserted:', recordId)

    // Audit log (fire-and-forget)
    const customer = await supaGet('customers', `select=name&id=eq.${customer_id}`)
    const label = category!.replace(/_/g, ' ')
    supaPost('audit_log', {
      user_id:   userId,
      screen:    'screen2',
      action:    'created',
      record_id: recordId ?? null,
      summary:   `Complaint logged: ${customer?.name ?? customer_id} — ${label} — ${status!.toUpperCase()} — by ${userName}`,
    }).catch((e) => console.error('[screen2/sync] audit error:', e))

    return NextResponse.json({ id: recordId }, { status: 201 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stk = err instanceof Error ? err.stack   : undefined
    console.error('[screen2/sync] unhandled error:', msg)
    if (stk) console.error('[screen2/sync] stack:', stk)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
