/**
 * POST /api/screen2/resolve
 * Marks an open complaint as resolved.
 * Uses raw fetch() to Supabase REST — avoids cold-start client issues.
 *
 * Body: { complaint_id: string, resolution_note: string }
 *
 * The DB enforces complaints_resolution_check: when status='resolved',
 * resolution_note, resolved_by, and resolved_at must ALL be non-null.
 * This route sets all three atomically.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    let body: Record<string, unknown> | null = null
    try { body = await req.json() } catch { /* fall through */ }
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const complaint_id    = body.complaint_id    as string | undefined
    const resolution_note = body.resolution_note as string | undefined

    if (!complaint_id?.trim())    return NextResponse.json({ error: 'complaint_id required' }, { status: 400 })
    if (!resolution_note?.trim()) return NextResponse.json({ error: 'resolution_note required' }, { status: 400 })

    // UUID format sanity check
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(complaint_id)) return NextResponse.json({ error: 'Invalid complaint_id' }, { status: 400 })

    console.log('[screen2/resolve] resolving complaint:', complaint_id, 'by:', userName)

    // PATCH the complaint — DB constraint requires all four fields set together
    const res = await fetch(
      `${SUPA_URL}/rest/v1/complaints?id=eq.${complaint_id}&status=eq.open`,
      {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Prefer':         'return=representation',
        },
        body: JSON.stringify({
          status:          'resolved',
          resolution_note: resolution_note.trim(),
          resolved_by:     userId,
          resolved_at:     new Date().toISOString(),
        }),
      }
    )

    const text = await res.text()

    if (!res.ok) {
      console.error('[screen2/resolve] Supabase error:', res.status, text.slice(0, 200))
      return NextResponse.json({ error: `Update failed: ${text.slice(0, 100)}` }, { status: 500 })
    }

    const rows = JSON.parse(text) as { id: string }[]
    if (rows.length === 0) {
      // No row matched — either wrong ID or already resolved
      return NextResponse.json(
        { error: 'Complaint not found or already resolved' },
        { status: 404 }
      )
    }

    console.log('[screen2/resolve] resolved:', rows[0].id)

    // Audit log (fire-and-forget)
    fetch(`${SUPA_URL}/rest/v1/audit_log`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({
        user_id:   userId,
        screen:    'screen2',
        action:    'resolved',
        record_id: rows[0].id,
        summary:   `Complaint resolved by ${userName}: "${resolution_note.trim().slice(0, 80)}"`,
      }),
    }).catch((e) => console.error('[screen2/resolve] audit error:', e))

    return NextResponse.json({ id: rows[0].id }, { status: 200 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stk = err instanceof Error ? err.stack   : undefined
    console.error('[screen2/resolve] Unhandled error:', msg)
    if (stk) console.error('[screen2/resolve] Stack:', stk)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
