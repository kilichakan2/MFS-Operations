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
import { complaintsServiceForCaller } from '@/lib/wiring/complaints'
import { toNoteWireDto }             from '@/lib/api/complaints/dto'

// audit_log is a cross-cutting write with no owned port yet (F-TD-31) — it
// stays as a raw REST fetch. Only the complaint/note DATA surface moved to the
// service.
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const auditHeaders = {
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
}

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Someone'
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complaintsServiceForCaller(userId) → complaintsService.
    const complaintsService = await complaintsServiceForCaller(userId)

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const complaint_id = (body.complaint_id as string ?? '').trim()
    const noteBody     = (body.body         as string ?? '').trim()

    const valid = complaintsService.validateNote({
      complaintId: complaint_id,
      body:        noteBody,
      userId,
    })
    if (!valid.ok) {
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(complaint_id)) {
      return NextResponse.json({ error: 'Invalid complaint_id' }, { status: 400 })
    }

    // 1. Existence check + email context (was a raw fetch; now the owned port).
    //    null on miss → 404 BEFORE inserting the note (preserve the ordering).
    const ctx = await complaintsService.findEmailContext(complaint_id)
    if (!ctx) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })

    // 2. Insert the note
    const savedNote = await complaintsService.createNote({
      complaintId: complaint_id,
      body:        noteBody,
      userId,
    })

    // 3. Send email — awaited so errors surface in this request context
    try {
      const { sendComplaintEmail } = await import('@/lib/complaint-email')
      await sendComplaintEmail({
        type:       'note_added',
        noteBody,
        noteAuthor: userName,
        complaint: {
          id:          complaint_id,
          customer:    ctx.customerName,
          category:    ctx.category.replace(/_/g, ' '),
          description: ctx.description,
          status:      ctx.status,
        },
      })
    } catch (e) {
      console.error('[screen2/note] email error:', e instanceof Error ? e.stack : String(e))
    }

    // 4. Audit log (fire-and-forget) — raw REST, F-TD-31 (no owned port yet)
    fetch(`${SUPA_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: auditHeaders,
      body: JSON.stringify({
        user_id:   userId,
        screen:    'screen2',
        action:    'note_added',
        record_id: complaint_id,
        summary:   `Note added by ${userName} on complaint ${complaint_id}: "${noteBody.slice(0, 80)}"`,
      }),
    }).catch(e => console.error('[screen2/note] audit error:', e))

    return NextResponse.json(
      toNoteWireDto({
        id:          savedNote.id,
        complaintId: complaint_id,
        body:        savedNote.body,
        authorName:  userName,
        createdAt:   savedNote.createdAt,
      }),
      { status: 201 },
    )

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screen2/note] error:', msg)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

