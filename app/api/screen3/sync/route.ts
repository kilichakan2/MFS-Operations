/**
 * POST /api/screen3/sync
 * Inserts a queued visit. Uses raw fetch() to the Supabase REST API
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

    console.log('[screen3/sync] keys:', Object.keys(body).join(', '))

    const id                =  body.id                as string  | undefined
    const customer_id       = (body.customer_id       as string  | undefined) ?? null
    const prospect_name     = (body.prospect_name     as string  | undefined) ?? null
    const prospect_postcode = (body.prospect_postcode as string  | undefined) ?? null
    const visit_type        =  body.visit_type        as string  | undefined
    const outcome           =  body.outcome           as string  | undefined
    const notes             = (body.notes             as string  | undefined) ?? null
    const commitment_detail = (body.commitment_detail as string  | undefined) ?? null
    const commitment_made   = body.commitment_made === true || body.commitment_made === 'true'

    const missing: string[] = []
    if (!customer_id && !prospect_name)  missing.push('customer_id or prospect_name required')
    if (customer_id  && prospect_name)   missing.push('only one of customer_id/prospect_name allowed')
    if (!visit_type)  missing.push('visit_type')
    if (!outcome)     missing.push('outcome')
    if (commitment_made && !commitment_detail) missing.push('commitment_detail')
    if (missing.length > 0) {
      console.warn('[screen3/sync] validation failed:', missing.join(', '))
      return NextResponse.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      ...(id ? { id } : {}),
      user_id:           userId,
      customer_id,
      prospect_name,
      prospect_postcode,
      visit_type,
      outcome,
      commitment_made,
      commitment_detail: commitment_made ? (commitment_detail ?? null) : null,
      notes,
    }

    console.log('[screen3/sync] inserting visit, type:', visit_type, 'outcome:', outcome)
    const { ok, status: httpStatus, text } = await supaPost('visits', payload)

    if (!ok) {
      if (httpStatus === 409 || text.includes('23505')) {
        console.log('[screen3/sync] Duplicate insert — already exists, returning 200')
        return NextResponse.json({ id, duplicate: true }, { status: 200 })
      }
      console.error('[screen3/sync] insert failed:', httpStatus, text.slice(0, 200))
      return NextResponse.json({ error: `Insert failed: ${text.slice(0, 100)}` }, { status: 500 })
    }

    const rows = JSON.parse(text) as { id: string }[]
    const recordId = rows[0]?.id
    console.log('[screen3/sync] inserted:', recordId)

    // Audit log (fire-and-forget)
    let displayName = prospect_name ?? 'Unknown'
    if (customer_id) {
      const customer = await supaGet('customers', `select=name&id=eq.${customer_id}`)
      displayName = customer?.name ?? customer_id
    }
    supaPost('audit_log', {
      user_id:   userId,
      screen:    'screen3',
      action:    'created',
      record_id: recordId ?? null,
      summary:   `Visit logged: ${displayName} — ${visit_type!.replace(/_/g,' ')} — ${outcome!.replace(/_/g,' ')} — by ${userName}`,
    }).catch((e) => console.error('[screen3/sync] audit error:', e))

    return NextResponse.json({ id: recordId }, { status: 201 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stk = err instanceof Error ? err.stack   : undefined
    console.error('[screen3/sync] unhandled error:', msg)
    if (stk) console.error('[screen3/sync] stack:', stk)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
