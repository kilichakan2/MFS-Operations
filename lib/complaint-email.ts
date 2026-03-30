/**
 * lib/complaint-email.ts
 *
 * Shared Resend email helper for complaint events.
 * Called by three routes:
 *   - /api/screen2/sync    (new complaint posted)
 *   - /api/screen2/resolve (complaint resolved)
 *   - /api/screen2/note    (internal note added)
 *
 * Silently skips if RESEND_API_KEY is not set.
 * Recipients: all active users with a non-null email in public.users
 *             whose role is NOT 'driver' (drivers have no emails anyway).
 */

const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_KEY = process.env.RESEND_API_KEY            ?? ''
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL        ?? 'https://www.mfsops.com'
const FROM       = 'MFS Operations <notifications@mfsglobal.co.uk>'

const supaHeaders = {
  apikey:        SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplaintEmailEvent =
  | { type: 'new_complaint';  complaint: ComplaintContext; author: string }
  | { type: 'resolved';       complaint: ComplaintContext; resolvedBy: string; resolutionNote: string }
  | { type: 'note_added';     complaint: ComplaintContext; noteBody: string; noteAuthor: string }

export interface ComplaintContext {
  id:          string
  customer:    string
  category:    string   // human-readable (spaces not underscores)
  description: string
  receivedVia?: string
  status:      string
  loggedBy?:   string
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function sendComplaintEmail(event: ComplaintEmailEvent): Promise<void> {
  if (!RESEND_KEY) {
    console.log(`[complaint-email] RESEND_API_KEY not set — skipping (${event.type})`)
    return
  }

  const { subject, html } = buildEmail(event)

  // Fetch recipients: all active non-driver users with email
  const res = await fetch(
    `${SUPA_URL}/rest/v1/users?active=eq.true&role=neq.driver&select=name,email`,
    { headers: supaHeaders }
  )

  if (!res.ok) {
    console.error('[complaint-email] failed to fetch recipients:', res.status)
    return
  }

  const all = await res.json() as { name: string; email: string | null }[]
  const recipients = all.filter(u => u.email?.includes('@')).map(u => u.email!)

  if (!recipients.length) {
    console.log('[complaint-email] no recipients with email — skipping')
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_KEY)

  const result = await resend.emails.send({ from: FROM, to: recipients, subject, html })
  console.log(`[complaint-email] sent "${event.type}" to ${recipients.length} recipient(s)`, result?.data?.id)
}

// ─── Email builder ────────────────────────────────────────────────────────────

function buildEmail(event: ComplaintEmailEvent): { subject: string; html: string } {
  const { complaint } = event
  const viewUrl = `${APP_URL}/complaints`
  const statusBadge = badge(
    complaint.status === 'open' ? '🟡 Open' : '✅ Resolved',
    complaint.status === 'open' ? '#FEF3C7' : '#D1FAE5',
    complaint.status === 'open' ? '#92400E' : '#065F46',
  )

  const complaintBlock = `
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr>
          <td style="color:#6B7280;padding:3px 0;width:110px;">Customer</td>
          <td style="color:#111827;font-weight:600;">${esc(complaint.customer)}</td>
        </tr>
        <tr>
          <td style="color:#6B7280;padding:3px 0;">Category</td>
          <td style="color:#111827;">${esc(complaint.category)}</td>
        </tr>
        ${complaint.receivedVia ? `
        <tr>
          <td style="color:#6B7280;padding:3px 0;">Received via</td>
          <td style="color:#111827;">${esc(complaint.receivedVia)}</td>
        </tr>` : ''}
        ${complaint.loggedBy ? `
        <tr>
          <td style="color:#6B7280;padding:3px 0;">Logged by</td>
          <td style="color:#111827;">${esc(complaint.loggedBy)}</td>
        </tr>` : ''}
        <tr>
          <td style="color:#6B7280;padding:3px 0;">Status</td>
          <td>${statusBadge}</td>
        </tr>
        <tr>
          <td style="color:#6B7280;padding:6px 0 3px;vertical-align:top;">Description</td>
          <td style="color:#374151;padding-top:6px;line-height:1.5;">${esc(complaint.description)}</td>
        </tr>
      </table>
    </div>`

  let heroText = ''
  let extraBlock = ''
  let subject = ''

  if (event.type === 'new_complaint') {
    subject   = `🆕 New complaint — ${complaint.customer} (${complaint.category})`
    heroText  = `<strong>${esc(event.author)}</strong> logged a new complaint.`
  } else if (event.type === 'resolved') {
    subject   = `✅ Complaint resolved — ${complaint.customer} (${complaint.category})`
    heroText  = `<strong>${esc(event.resolvedBy)}</strong> resolved a complaint.`
    extraBlock = noteBox('Resolution note', event.resolutionNote, '#D1FAE5', '#065F46', '#A7F3D0')
  } else {
    subject   = `💬 New note — ${complaint.customer} (${complaint.category})`
    heroText  = `<strong>${esc(event.noteAuthor)}</strong> added an internal note.`
    extraBlock = noteBox(`Note from ${event.noteAuthor}`, event.noteBody, '#EFF6FF', '#1E3A5F', '#BFDBFE')
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#16205B;border-radius:8px 8px 0 0;padding:20px 24px;">
          <table width="100%"><tr>
            <td>
              <span style="color:#EB6619;font-size:22px;font-weight:700;letter-spacing:-0.5px;">MFS</span>
              <span style="color:#fff;font-size:16px;font-weight:400;margin-left:6px;">Operations</span>
            </td>
            <td align="right">
              <span style="color:#ffffff60;font-size:12px;">Complaints</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Orange accent bar -->
        <tr><td style="height:3px;background:#EB6619;"></td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:28px 24px;border:1px solid #E5E7EB;border-top:none;">
          <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6;">${heroText}</p>
          ${complaintBlock}
          ${extraBlock}
          <div style="margin-top:24px;">
            <a href="${viewUrl}"
               style="display:inline-block;background:#EB6619;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px;font-weight:700;">
              View in MFS Operations →
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F9FAFB;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:14px 24px;">
          <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;">
            MFS Global Ltd · mfsops.com · This email was sent to team members with notifications enabled.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function badge(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;background:${bg};color:${color};padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;">${text}</span>`
}

function noteBox(label: string, body: string, bg: string, color: string, border: string): string {
  return `
    <div style="background:${bg};border-left:4px solid ${border};border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.05em;">${esc(label)}</p>
      <p style="margin:0;font-size:14px;color:${color};line-height:1.6;">${esc(body)}</p>
    </div>`
}
