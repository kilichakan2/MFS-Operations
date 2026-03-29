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
const RESEND_KEY = process.env.RESEND_API_KEY          ?? ''
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL     ?? 'https://www.mfsops.com'

// Email recipients — hardcoded to Hakan + Ege; expand via users table when ready
const NOTIFY_ROLES = ['admin', 'office']

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

    // 3. Fire email — skip gracefully if RESEND_API_KEY not set
    if (RESEND_KEY) {
      sendNoteEmail({
        complaint,
        noteBody,
        authorName: userName,
        appUrl:     APP_URL,
      }).catch(e => console.error('[screen2/note] email error:', e))
    } else {
      console.log('[screen2/note] RESEND_API_KEY not set — skipping email notification')
    }

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

// ─── Email helper ─────────────────────────────────────────────────────────────

interface EmailPayload {
  complaint: { id: string; category: string; description: string; status: string; customers: { name: string } | null }
  noteBody:   string
  authorName: string
  appUrl:     string
}

async function sendNoteEmail({ complaint, noteBody, authorName, appUrl }: EmailPayload) {
  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_KEY)

  const customer  = complaint.customers?.name ?? 'Unknown customer'
  const category  = complaint.category.replace(/_/g, ' ')
  const statusBadge = complaint.status === 'open'
    ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">OPEN</span>'
    : '<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">RESOLVED</span>'

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <div style="background:#16205B;padding:20px 24px;border-radius:8px 8px 0 0;">
        <img src="${appUrl}/icons/icon-192.png" alt="MFS" style="width:32px;height:32px;vertical-align:middle;margin-right:8px;" />
        <span style="color:#fff;font-size:18px;font-weight:700;vertical-align:middle;">MFS Operations</span>
      </div>
      <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;font-size:15px;">
          <strong>${authorName}</strong> added a note to a complaint.
        </p>
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:16px;margin-bottom:16px;">
          <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">COMPLAINT</p>
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;">${customer} — ${category}</p>
          <p style="margin:0 0 8px;font-size:13px;color:#374151;">"${complaint.description.slice(0, 120)}${complaint.description.length > 120 ? '…' : ''}"</p>
          ${statusBadge}
        </div>
        <div style="background:#EFF6FF;border-left:4px solid #16205B;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#6B7280;font-weight:600;">NOTE FROM ${authorName.toUpperCase()}</p>
          <p style="margin:0;font-size:14px;color:#1E3A5F;">${noteBody}</p>
        </div>
        <a href="${appUrl}/complaints"
           style="display:inline-block;background:#EB6619;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
          View complaint →
        </a>
      </div>
      <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:12px;">
        MFS Global Ltd · mfsops.com
      </p>
    </div>
  `

  // Fetch all admin/office users with email addresses to notify
  const usersRes = await fetch(
    `${SUPA_URL}/rest/v1/users?role=in.(admin,office)&active=eq.true&select=name,email`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  )

  if (!usersRes.ok) {
    console.error('[screen2/note] failed to fetch notification recipients')
    return
  }

  const recipients = (await usersRes.json() as { name: string; email: string | null }[])
    .filter(u => u.email?.includes('@'))

  if (!recipients.length) {
    console.log('[screen2/note] no admin/office users with email — skipping')
    return
  }

  await resend.emails.send({
    from:    'MFS Operations <notifications@mfsglobal.co.uk>',
    to:      recipients.map(u => u.email!),
    subject: `💬 New note on complaint — ${customer} (${category})`,
    html,
  })

  console.log(`[screen2/note] email sent to ${recipients.length} recipient(s)`)
}
