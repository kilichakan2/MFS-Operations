/**
 * lib/compliment-email.ts
 *
 * Email notification for new compliments posted on /compliments.
 * Sent to ALL active users with an email address (including drivers —
 * unlike complaints, compliments are positive and everyone should see them).
 *
 * Silently skips if RESEND_API_KEY is not set.
 */

const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_KEY = process.env.RESEND_API_KEY            ?? ''
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL        ?? 'https://www.mfsops.com'
const FROM       = 'MFS Operations <notifications@mfsglobal.co.uk>'

export interface ComplimentEmailData {
  body:           string
  postedByName:   string
  recipientName:  string | null   // null = whole team
}

export async function sendComplimentEmail(data: ComplimentEmailData): Promise<void> {
  if (!RESEND_KEY) {
    console.log('[compliment-email] RESEND_API_KEY not set — skipping')
    return
  }

  // All active users with an email — everyone gets compliments
  const res = await fetch(
    `${SUPA_URL}/rest/v1/users?active=eq.true&select=name,email`,
    {
      headers: {
        apikey:        SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
      },
    }
  )

  if (!res.ok) {
    console.error('[compliment-email] failed to fetch recipients:', res.status)
    return
  }

  const all       = await res.json() as { name: string; email: string | null }[]
  const recipients = all.filter(u => u.email?.includes('@')).map(u => u.email!)

  if (!recipients.length) {
    console.log('[compliment-email] no recipients with email — skipping')
    return
  }

  const { Resend } = await import('resend')
  const resend     = new Resend(RESEND_KEY)

  const { subject, html } = buildEmail(data)
  const result = await resend.emails.send({ from: FROM, to: recipients, subject, html })
  console.log(`[compliment-email] sent to ${recipients.length} recipient(s)`, result?.data?.id)
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;')
}

function buildEmail(data: ComplimentEmailData): { subject: string; html: string } {
  const { body, postedByName, recipientName } = data
  const forLine = recipientName
    ? `For <strong>${esc(recipientName)}</strong> ⭐`
    : 'For the whole team 🙌'

  const subject = recipientName
    ? `⭐ ${esc(postedByName)} gave ${esc(recipientName)} a shoutout`
    : `⭐ ${esc(postedByName)} shared a team shoutout`

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
              <span style="color:#ffffff60;font-size:12px;">Kudos ⭐</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Gold accent bar -->
        <tr><td style="height:3px;background:#F59E0B;"></td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:28px 24px;border:1px solid #E5E7EB;border-top:none;">

          <!-- For line -->
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:0.05em;">
            ${forLine}
          </p>

          <!-- Message box -->
          <div style="background:#FFFBEB;border-left:4px solid #FCD34D;border-radius:0 8px 8px 0;padding:16px 18px;margin:16px 0;">
            <p style="margin:0;font-size:15px;color:#111827;line-height:1.7;">${esc(body)}</p>
          </div>

          <!-- Posted by -->
          <p style="margin:12px 0 0;font-size:13px;color:#6B7280;">
            Posted by <strong style="color:#111827;">${esc(postedByName)}</strong>
          </p>

          <!-- CTA -->
          <div style="margin-top:24px;">
            <a href="${APP_URL}/compliments"
               style="display:inline-block;background:#EB6619;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px;font-weight:700;">
              View in MFS Operations →
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F9FAFB;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:14px 24px;">
          <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;">
            MFS Global Ltd · mfsops.com · Sent to all team members with notifications enabled.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}
