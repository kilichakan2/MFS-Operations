export const dynamic = 'force-dynamic'

/**
 * POST /api/screen2/note
 *
 * Adds an internal note to a complaint.
 * Body: { complaint_id: string, body: string }
 *
 * After saving, fires an email via Resend to all admin/office users
 * notifying them a note was added. Silently skips email if RESEND_API_KEY
 * is not set — safe to deploy before the key is added to Vercel.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const supaHeaders = {
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
}

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Someone'
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const complaint_id = (body.complaint_id as string ?? '').trim()
    const noteBody     = (body.body         as string ?? '').trim()

    if (!complaint_id) return NextResponse.json({ error: 'complaint_id required' }, { status: 400 })
    if (!noteBody)     return NextResponse.json({ error: 'body required' },         { status: 400 })

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(complaint_id)) {
      return NextResponse.json({ error: 'Invalid complaint_id' }, { status: 400 })
    }

    // 1. Fetch the complaint so we can include context in the email
    const compRes = await fetch(
      `${SUPA_URL}/rest/v1/complaints?id=eq.${complaint_id}&select=id,category,description,status,customers(name)`,
      { headers: supaHeaders }
    )
    if (!compRes.ok) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    const comps = await compRes.json() as {
      id: string; category: string; description: string; status: string
      customers: { name: string } | null
    }[]
    if (!comps.length) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    const complaint = comps[0]

    // 2. Insert the note
    const insertRes = await fetch(`${SUPA_URL}/rest/v1/complaint_notes`, {
      method: 'POST',
      headers: { ...supaHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        complaint_id,
        user_id:    userId,
        body:       noteBody,
        created_at: new Date().toISOString(),
      }),
    })

    if (!insertRes.ok) {
      const text = await insertRes.text()
      console.error('[screen2/note] insert error:', insertRes.status, text.slice(0, 200))
      return NextResponse.json({ error: 'Failed to save note' }, { status: 500 })
    }

    const [savedNote] = await insertRes.json() as { id: string; created_at: string }[]

    // 3. Fire email via shared helper (fire-and-forget)
    import('@/lib/complaint-email').then(({ sendComplaintEmail }) =>
      sendComplaintEmail({
        type:       'note_added',
        noteBody,
        noteAuthor: userName,
        complaint: {
          id:          complaint_id,
          customer:    complaint.customers?.name ?? 'Unknown',
          category:    complaint.category.replace(/_/g, ' '),
          description: complaint.description,
          status:      complaint.status,
        },
      })
    ).catch(e => console.error('[screen2/note] email error:', e))

    // 4. Audit log (fire-and-forget)
    fetch(`${SUPA_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        user_id:   userId,
        screen:    'screen2',
        action:    'note_added',
        record_id: complaint_id,
        summary:   `Note added by ${userName} on complaint ${complaint_id}: "${noteBody.slice(0, 80)}"`,
      }),
    }).catch(e => console.error('[screen2/note] audit error:', e))

    return NextResponse.json({
      id:        savedNote.id,
      body:      noteBody,
      author:    userName,
      createdAt: savedNote.created_at,
    }, { status: 201 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screen2/note] error:', msg)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

