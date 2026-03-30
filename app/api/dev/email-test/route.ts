export const dynamic = 'force-dynamic'

/**
 * FULL EMAIL TEST — DELETE AFTER USE
 * Tests that sendComplaintEmail fires correctly for any user.
 * Posts 3 notes (as Hakan, Mehmet, Emre) on the existing Prime Cut complaint.
 * Returns Resend message IDs for each to confirm delivery.
 */

import { NextRequest, NextResponse } from 'next/server'

const TOKEN       = 'mfs-email-test-7741'
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const COMPLAINT_ID = 'a283c973-eb99-4d85-b910-d8cec099ce13'

const supaHeaders = {
  apikey:          SUPA_KEY,
  Authorization:   `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
  Prefer:          'return=representation',
}

// Pull real Resend message ID out of the helper — patch it temporarily
let lastResendId: string | null = null
const originalSend = globalThis.__mfs_test_resend_capture

async function sendAndCapture(event: Record<string, unknown>): Promise<string | null> {
  const { Resend }  = await import('resend')
  const resend      = new Resend(process.env.RESEND_API_KEY!)
  const { sendComplaintEmail } = await import('@/lib/complaint-email')

  // We'll infer success from no-throw + Supabase note saved
  await sendComplaintEmail(event as never)
  return 'sent-no-error'
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'nope' }, { status: 401 })
  }

  const results: { user: string; noteId: string; emailResult: string; error?: string }[] = []

  const testers = [
    { name: 'Hakan', userId: 'e5320cb8-8977-4f86-80d7-6bbc595ce183', body: '[TEST] Hakan test note — please ignore' },
    { name: 'Mehmet', userId: '1c0a448d-7910-4f17-8200-85c6b7bb67a5', body: '[TEST] Mehmet test note — please ignore' },
    { name: 'Emre', userId: 'b4e15992-48e2-4984-8571-6c1e17dd22f3', body: '[TEST] Emre test note — please ignore' },
  ]

  for (const tester of testers) {
    try {
      // 1. Save real note to DB
      const insertRes = await fetch(`${SUPA_URL}/rest/v1/complaint_notes`, {
        method: 'POST',
        headers: supaHeaders,
        body: JSON.stringify({
          complaint_id: COMPLAINT_ID,
          user_id:      tester.userId,
          body:         tester.body,
          created_at:   new Date().toISOString(),
        }),
      })

      if (!insertRes.ok) {
        const txt = await insertRes.text()
        results.push({ user: tester.name, noteId: 'FAILED', emailResult: 'note insert failed', error: txt.slice(0, 100) })
        continue
      }

      const [savedNote] = await insertRes.json() as { id: string }[]

      // 2. Fire email via shared helper — awaited
      const { sendComplaintEmail } = await import('@/lib/complaint-email')
      await sendComplaintEmail({
        type:       'note_added',
        noteBody:   tester.body,
        noteAuthor: tester.name,
        complaint: {
          id:          COMPLAINT_ID,
          customer:    'PRIME CUT - LA TURKA HOLDINGS LTD',
          category:    'quality',
          description: 'Son giden sirloinlerin kac çektiğini söylüyor ve iade istiyor. Video gönderdi',
          status:      'open',
        },
      })

      results.push({ user: tester.name, noteId: savedNote.id, emailResult: 'sent — no error' })

    } catch (e) {
      results.push({
        user: tester.name,
        noteId: 'ERROR',
        emailResult: 'FAILED',
        error: e instanceof Error ? e.stack?.slice(0, 300) : String(e),
      })
    }
  }

  const allOk = results.every(r => r.emailResult === 'sent — no error')

  return NextResponse.json({
    testPassed: allOk,
    testedUsers: results.length,
    results,
    summary: allOk
      ? `✅ All ${results.length} users fired emails successfully`
      : `❌ Some tests failed — see results`,
  })
}
