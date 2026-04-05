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
              <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDU2IiBoZWlnaHQ9IjQ1NSIgdmlld0JveD0iMCAwIDQ1NiA0NTUiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0yMzIuMDY3IDI0OS41ODJDMjMxLjY1MyAyNDguNTc5IDIyOC4xODIgMjQwLjM1MiAyMjEuNDY3IDIzMy42NzRDMjA4LjU2OCAyMjAuODQyIDE5Mi45NzYgMjE5LjcyNiAxODkuMzY0IDIxOS41NjFDMTI4LjI1NiAyMTkuNTMzIDY3LjE0OTIgMjE5LjUwNCA2LjA0MTk3IDIxOS40NzZDMi43MDc4MiAyMTkuNDc2IDAgMjIyLjE3OSAwIDIyNS41MThWMjU5LjYzMkMwIDI2Mi45NzEgMi43MDMxMSAyNjUuNjc0IDYuMDQxOTcgMjY1LjY3NEgxMjguODM2VjI2NS43ODJDMTM1LjI0IDI2NS43ODIgMTQwLjQyIDI3MC45NjIgMTQwLjQyIDI3Ny4zNjdDMTQwLjQyIDI4MC42NjMgMTM5LjA1NSAyODMuNjMgMTM2Ljg0MSAyODUuNzQ5SDEzNi45MDNMNDUuMzU0OCAzNzcuMjk3QzQyLjk5NTUgMzc5LjY1NyA0Mi45OTU1IDM4My40OCA0NS4zNTQ4IDM4NS44NEw2OS40NzU2IDQwOS45NjFDNzEuODM0OSA0MTIuMzIgNzUuNjU4OCA0MTIuMzIgNzguMDE4MSA0MDkuOTYxTDE3MS42OSAzMTYuMjg5QzE3My40MzcgMzE1LjIzNCAxNzUuNDUzIDMxNC41ODkgMTc3LjY0NyAzMTQuNTg5QzE4NC4wNTIgMzE0LjU4OSAxODkuMjMyIDMxOS43NjkgMTg5LjIzMiAzMjYuMTc0SDE4OS41MjhWNDQ4Ljk1OEMxODkuNTI4IDQ1Mi4yOTIgMTkyLjIzMiA0NTUgMTk1LjU3IDQ1NUgyMjkuNjg0QzIzMy4wMjMgNDU1IDIzNS43MjYgNDUyLjI5NyAyMzUuNzI2IDQ0OC45NThMMjM1Ljc1OSAyNjUuNzczQzIzNS43NTkgMjYzLjY1OCAyMzUuMjMyIDI1Ny4yMDIgMjMyLjA3MiAyNDkuNTc4TDIzMi4wNjcgMjQ5LjU4MloiIGZpbGw9IiNFQjY2MTkiLz4KPHBhdGggZD0iTTQ0Ni4zNzQgMjQyLjU3OUM0NDYuMzc0IDI0Mi41NDEgNDQ1LjY3MiAyNDIuNTEzIDQ0NC44OTUgMjQyLjQ5QzQ0NC43OTIgMjQyLjUwOSA0NDQuNjc0IDI0Mi41MjMgNDQ0LjY3OSAyNDIuNTQ2QzQ0NC42OTMgMjQyLjY4MyA0NDYuMzc0IDI0Mi42MzYgNDQ2LjM3NCAyNDIuNTc5WiIgZmlsbD0iI0VCNjYxOSIvPgo8cGF0aCBkPSJNNDU1LjExNiAyMzQuNDc5QzQ1NS4wNzggMjMwLjUzOCA0NTUuMDI2IDIyNi42MSA0NTUuMDU1IDIyMi42NjhDNDU1LjA2OSAyMjAuMTA3IDQ1NS4wNjkgMjE2LjY1NSA0NTUuMDIyIDIxMS42ODJWMjAyLjI3M0M0NTUuMDIyIDIwMi4yMTEgNDU0Ljk4OSAyMDIuMTYgNDU0Ljk4OSAyMDIuMDE4QzQ1NC45NzUgMjAxLjg1MyA0NTQuODk1IDIwMS4zMzEgNDU0LjcwNiAyMDAuN0M0NTQuNTMyIDIwMC4wNzMgNDU0LjI3MyAxOTkuNTE4IDQ1My44NTQgMTk4Ljg4N0M0NTMuNTE1IDE5OC40MDIgNDUzLjE0MyAxOTcuOTc4IDQ1Mi42NTggMTk3LjU4N0M0NTIuNjIgMTk3LjU1NCA0NTIuNTc4IDE5Ny41NDUgNDUyLjU0IDE5Ny41MTZDNDUyLjAyNyAxOTcuMTMgNDUxLjQ4NSAxOTYuODE1IDQ1MC44NTkgMTk2LjYwN0M0NDkuNTQgMTk2LjEzNiA0NDguMzg2IDE5Ni4xODggNDQ4LjA4IDE5Ni4yMTZDNDQ3LjgxNyAxOTYuMjE2IDQ0Ny41NTMgMTk2LjIyNiA0NDcuMjg0IDE5Ni4yMzFIMzI3LjQzNEMzMjUuMDc5IDE5Ni4yNTQgMzIyLjcyOSAxOTYuMjc4IDMyMC4zNzUgMTk2LjMwMUMzMDkuNjQyIDE5Ni4zMDEgMzA0LjI2NCAxODMuMzIzIDMxMS44NTYgMTc1LjczMUMzMTMuMzA2IDE3NC4yODEgMzE0Ljc4IDE3Mi44MDIgMzE2LjI3MyAxNzEuMzA1QzM0NS4xMTcgMTQyLjUwOCAzNzMuOTU3IDExMy43MTUgNDAyLjgwMSA4NC45MTgxQzQwNC44MjYgODIuODkzMSA0MDUuMDA1IDc5Ljg0MTUgNDAzLjU1NCA3Ny41MTA0QzQwMy4zNzEgNzcuMTQ3OCA0MDMuMTgyIDc2Ljc5OTMgNDAzLjAxNyA3Ni41Njg2QzQwMS4wOTEgNzQuNjIzNiAzOTkuNTIzIDczLjA1MDggMzk4LjUxMSA3Mi4wMjg5QzM5NC4yNTggNjcuNzUyOSAzODkuMjE5IDYyLjY3NjMgMzgyLjk1NiA1Ni40Njk1QzM4MS43MTcgNTUuMjQ1MSAzODAuNDc5IDU0LjAxNiAzNzkuMjQgNTIuNzkxNkMzNzkuMTIzIDUyLjY0MDkgMzc4LjE5NSA1MS41NzY2IDM3Ni42NzQgNTAuOTIyQzM3NS45NzcgNTAuNjMgMzc1LjIgNTAuNDA0IDM3NC4yNDkgNTAuNDQxNkMzNzMuNDk1IDUwLjQ2OTkgMzcyLjg1IDUwLjY1ODMgMzcyLjI3NSA1MC44OTM3QzM3Mi4wODcgNTAuOTY0NCAzNzEuOTI3IDUxLjA4NjggMzcxLjc0MyA1MS4xODFDMzcxLjI3NyA1MS40MzUzIDM3MC44OTEgNTEuNjg0OSAzNzAuNTg5IDUxLjk0ODZDMzcwLjQ0NCA1Mi4wNjYzIDM3MC4yNjkgNTIuMTE4MSAzNzAuMTMzIDUyLjI1TDM2Ni4wNjkgNTYuMzE0MUMzNjYuMDE3IDU2LjM2NTkgMzY1Ljk2NSA1Ni40MTMgMzY1LjkxMyA1Ni40NjQ4QzMzNy4wMjcgODUuMzUxMyAzMDguMTQ1IDExNC4yMzggMjc5LjI1OCAxNDMuMTI0QzI3NS4xMTQgMTQ3LjI2OSAyNjguOTY5IDE0Ny4yNjQgMjY0LjkzMyAxNDUuMTY4QzI2MC41MDEgMTQyLjg2NSAyNTkuMTQ1IDEzNy4yMjQgMjU4LjY4OCAxMzQuNjA1QzI1OC42OTMgMTMyLjU0MyAyNTguNjkzIDEzMC40NzEgMjU4LjcyMSAxMjguNDA4VjExMC42MzFDMjU4LjczMSAxMDIuNzA1IDI1OC43NDkgOTQuNzg4NyAyNTguNzU0IDg2Ljg0ODlDMjU4Ljc2NCA3MS4yNTE4IDI1OC43MzUgNTUuNzExMyAyNTguNzIxIDQwLjE1NjZWNi4xNDY0M0MyNTguNzIxIDYuMDA5ODYgMjU4LjY1MSA1Ljg5Njg0IDI1OC42NDEgNS43NjAyN0MyNTguNTk5IDUuMzU5OTkgMjU4LjUyMyA0Ljg5ODQ4IDI1OC4zNjMgNC4zODA0NkMyNTcuNjc2IDIuMTgxMjQgMjU1LjgyIDAuNTk0MjI1IDI1My40ODUgMC4yNjkyODdDMjUzLjM3MiAwLjI0NTc0MSAyNTMuMjYzIDAuMjE3NDg1IDI1My4xNDUgMC4yMDMzNThDMjUyLjk4MSAwLjE4OTIzIDI1Mi44NDQgMC4xMDkxNzMgMjUyLjY3NSAwLjEwOTE3M0gyNTIuMDUzQzI1MS45NDUgMC4xMDQ0NjMgMjUxLjg0MSAwLjA4MDkxNyAyNTEuNzI4IDAuMDgwOTE3QzI1MC43MTEgMC4wNjIwOCAyNDguODkzIDAuMDM4NTMzNyAyNDYuNjI4IDAuMDE5Njk2N0MyMzkuMjc3IC0wLjA0MTUyMzYgMjM1LjM3MyAwLjA1NzM3MDcgMjI2LjQwNiAwLjA4MDkxN0MyMjQuNzY4IDAuMDgwOTE3IDIyMi4xMyAwLjA5MDMzNTUgMjE4LjgzOSAwLjA4MDkxN0MyMTguNzczIDAuMDgwOTE3IDIxOC43MjYgMC4xMDkxNzMgMjE4LjU1NiAwLjEwOTE3M0MyMTguNDE1IDAuMTA5MTczIDIxOC4yOTIgMC4xNzk4MTEgMjE4LjE1MSAwLjE4OTIzQzIxNy40ODcgMC4yNDU3NDEgMjE2Ljg1MSAwLjMzNTIxNyAyMTYuMjgxIDAuNTY1OTdDMjE2LjA3IDAuNjUwNzM3IDIxNS45MDkgMC44MDYxNDIgMjE1LjcxMiAwLjkxNDQ1NUMyMTUuMjU1IDEuMTY4NzUgMjE0LjgwMyAxLjQxMzY0IDIxNC40MzUgMS43NzYyNUMyMTQuMDIxIDIuMTY3MTIgMjEzLjcyIDIuNjUyMTcgMjEzLjQyOCAzLjE0NjY0QzIxMy4zNjIgMy4yNjkwOCAyMTMuMjYzIDMuMzU4NTYgMjEzLjIwMiAzLjQ4MUMyMTIuODgxIDQuMTI2MTYgMjEyLjcwMiA0LjgyNzg0IDIxMi42MzIgNS41NzY2MUMyMTIuNjIyIDUuNjQyNTQgMjEyLjU4OSA1LjY5NDM0IDIxMi41OCA1LjgzMDkxQzIxMi41NzUgNS45MzkyMyAyMTIuNTE5IDYuMDMzNDEgMjEyLjUxOSA2LjE0MTcyVjguMzIyMTFDMjEyLjUxOSA4LjczMTgxIDIxMi41MDUgOS4xMzY4MSAyMTIuNTE5IDkuNTQ2NTFDMjEyLjUxOSA5LjU0NjUxIDIxMi41MTkgMTI3LjY4MyAyMTIuNTc1IDEyNy42ODNWMTM0LjYxQzIxMi41NzUgMTQ1LjM0MiAxOTkuNTkyIDE1MC43MiAxOTIuMDAxIDE0My4xMjlDMTYzLjExNCAxMTQuMjQzIDEzNC4yMzIgODUuMzU2IDEwNS4zNDYgNTYuNDY5NUMxMDQuNzI0IDU1LjkyNzkgMTA0LjEwMiA1NS4zODY0IDEwMy40ODEgNTQuODQ0OEwxMDEuMDc5IDUyLjQ0MzFDOTkuMjA0OCA1MC41Njg4IDk2LjQ0MDQgNTAuMjQ4NiA5NC4xODQ3IDUxLjM0NThDOTMuMTYyOCA1MS43NzkxIDkyLjQ2NTggNTIuMzQ0MiA5Mi4yNzc0IDUyLjUyMzFDOTAuOTU0MSA1My44NDE3IDg5LjYyNjEgNTUuMTU1NiA4OC4zMDI4IDU2LjQ3NDJDODcuMDY5IDU3LjY5ODYgODUuMDIwNSA1OS45MjE0IDgxLjU5NjkgNjMuMzg3NEw3OC43ODA3IDY2LjIwMzVDNzcuMDUyNCA2Ny45MTMgNzUuMDU1NyA2OS44NDg1IDcyLjc0ODIgNzIuMDM4M0M3MS4xMzc2IDczLjU2NDEgNjkuODM3OSA3NC43NjAyIDY5LjE2OTEgNzUuMzcyNEM2OC42MDg3IDc1Ljk2NTggNjcuOTE2NSA3Ni44ODg4IDY3LjQ0NTYgNzguMDMzMUM2Ni4yMjExIDgwLjMxNzEgNjYuNDg5NiA4My4xODUxIDY4LjQxNTcgODUuMTE1OUM2OC40MTU3IDg1LjExNTkgNzAuOTAyMSA4Ny42MDIzIDcwLjkzNTEgODcuNjQ0N0M3Mi42MjU3IDg5LjYxNzkgNzQuMTg5MiA5MS4wMTY1IDc1LjEwNzUgOTEuODA3N0w4Ni4wMTg4IDEwMi43MTlDODYuNDU2OCAxMDMuMTYyIDg2Ljg5MDEgMTAzLjYwNCA4Ny4zMjggMTA0LjA0MkM5OC44NDIxIDExNS41NTYgMTEwLjM1MiAxMjcuMDY2IDEyMS44NjYgMTM4LjU4QzEzMy4zOCAxNTAuMDk0IDE0NC44ODkgMTYxLjYwNCAxNTYuNDAzIDE3My4xMThIMjM1Ljc0OUMyMzkuNjQ0IDE3My4zNDggMjU0LjQ3MyAxNzQuNyAyNjcuMDA1IDE4Ni44MjJDMjgwLjQyMSAxOTkuOCAyODEuNjg4IDIxNS45MjkgMjgxLjg4MSAyMTkuNTZWMjk4LjZMMzY1LjY3OCAzODIuMzk3QzM2Ni41NzcgMzgzLjI2MyAzNjcuMjc5IDM4My45ODQgMzY3Ljc1OSAzODQuNDc4QzM2OC4zODYgMzg1LjEyMyAzNjguODA1IDM4NS41ODUgMzY5LjUyNSAzODYuMjQ0QzM3MC4xOCAzODYuODQ3IDM3MC41MDkgMzg3LjE0OCAzNzAuODkxIDM4Ny40MDNDMzcwLjg5MSAzODcuNDAzIDM3MS4yNTMgMzg3LjYzOCAzNzEuODM3IDM4Ny44ODhDMzcyLjA1OSAzODcuOTkxIDM3Mi4yOCAzODguMDQ4IDM3Mi41MTEgMzg4LjEyM0MzNzIuOTQ5IDM4OC4yNiAzNzMuNDI0IDM4OC4zNzcgMzczLjk5OSAzODguNDFDMzc0LjMgMzg4LjQyOSAzNzQuNTgzIDM4OC4zOTYgMzc0Ljg4NCAzODguMzY4QzM3NS4xNTcgMzg4LjMzNSAzNzUuNDEyIDM4OC4yODMgMzc1LjY2NiAzODguMjE3QzM3Ni43NCAzODcuOTcyIDM3Ny43NzEgMzg3LjUzOSAzNzguNjA5IDM4Ni43MDZMNDAyLjczIDM2Mi41ODVDNDA1LjA4OSAzNjAuMjI2IDQwNS4wODkgMzU2LjQwMiA0MDIuNzMgMzU0LjA0MkM0MDIuNzMgMzU0LjA0MiA0MDEuNTcyIDM1Mi44ODQgNDAxLjUyNSAzNTIuODIzQzQwMS4wOTYgMzUyLjMwNSA0MDAuMjg2IDM1MS40NDggMzk5LjQwNSAzNTAuNkMzOTkuMTI4IDM1MC4zMzEgMzk4LjgzNiAzNTAuMDYzIDM5OC40OTcgMzQ5Ljc2NkMzOTcuOTc0IDM0OS4zMDUgMzk3LjUwMyAzNDguNzg3IDM5Ni45OTkgMzQ4LjMxMUwzODkuODU1IDM0MS4xNjdDMzg5LjM3IDM0MC42NjggMzg4Ljg5NCAzNDAuMTU5IDM4OC40IDMzOS42NjVDMzg1Ljc4MiAzMzcuMDcgMzgzLjM4IDMzNC42ODMgMzgxLjEyNCAzMzIuNDMyTDM2OC4yMDIgMzE5LjUwOUMzNTEuODA5IDMwMy4wMzYgMzUwLjMzNSAzMDEuMTg2IDM0NS45NDEgMjk3LjI0OUMzNDQuNTc2IDI5NS44ODMgMzQzLjIwNSAyOTQuNTEzIDM0MS44MzkgMjkzLjE0N0MzMzguNzYgMjkwLjA2NyAzMzUuNjggMjg2Ljk4NyAzMzIuNiAyODMuOTA3QzMyOS41OTUgMjgwLjkwMyAzMjguNzUzIDI4MC4wMzYgMzI2LjIyNCAyNzcuNTE3QzMyMy44OTcgMjc1LjE5NSAzMjQuMTA0IDI3NS40MTcgMzIyLjgwOSAyNzQuMTE3QzMxOC4xMDUgMjY5LjM5NCAzMTguMTk5IDI2OS4zMjMgMzE2LjQwNSAyNjcuNjdDMzE1Ljg5NiAyNjcuMTk5IDMxNC45NTkgMjY2LjM0NyAzMTMuNzQ0IDI2NS4wNzVDMzEyLjc0MSAyNjQuMDI1IDMxMS45OTIgMjYzLjEyNiAzMTEuODQ2IDI2Mi45OEMzMDQuMjU1IDI1NS4zODggMzA5LjYzMyAyNDIuNDEgMzIwLjM2NSAyNDIuNDFDMzIyLjM3MSAyNDIuNDEgMzI0LjUwNSAyNDIuNDEgMzI2LjY5OSAyNDIuNDA1QzM2NS41MzYgMjQyLjQxNCA0MDQuMzc0IDI0Mi40MjQgNDQzLjIxMSAyNDIuNDI4QzQ0My42MTYgMjQyLjQ0NyA0NDQuMjc1IDI0Mi40NjYgNDQ0Ljg5MiAyNDIuNDlDNDQ1LjAwNSAyNDIuNDcxIDQ0NS4xNyAyNDIuNDQ3IDQ0NS4zODcgMjQyLjQyOEg0NDguOTY2QzQ1MS41MzcgMjQyLjQyOCA0NTMuNjk4IDI0MC44MTMgNDU0LjU3IDIzOC41NTNDNDU1LjA2OSAyMzcuNTU5IDQ1NS4xMjUgMjM2LjQ1MiA0NTUuMTAyIDIzNC40NzlINDU1LjExNloiIGZpbGw9IiNFQjY2MTkiLz4KPC9zdmc+Cg==" width="32" height="32" alt="MFS" style="display:inline-block;vertical-align:middle;" />
              <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px;margin-left:10px;vertical-align:middle;">Operations</span>
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
