export const dynamic = 'force-dynamic'

/**
 * GET  /api/compliments          — load all compliments, newest first
 * POST /api/compliments          — post a new compliment
 *   Body: { body: string; recipient_id?: string }
 * All authenticated roles can read and post.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendComplimentEmail }        from '@/lib/compliment-email'
import { complimentsServiceForCaller } from '@/lib/wiring/compliments'
import { toComplimentWireDto }        from '@/lib/api/compliments/dto'
import { ServiceError }               from '@/lib/errors'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complimentsServiceForCaller(userId) → complimentsService.
  const complimentsService = await complimentsServiceForCaller(userId)

  try {
    const list = await complimentsService.listRecent()
    const compliments = list.map(toComplimentWireDto)
    return NextResponse.json({ compliments })
  } catch (err) {
    console.error('[compliments GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complimentsServiceForCaller(userId) → complimentsService.
  const complimentsService = await complimentsServiceForCaller(userId)

  let body: { body?: string; recipient_id?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }

  const input = {
    body:        body?.body ?? '',
    postedBy:    userId,
    recipientId: body?.recipient_id || null,
  }

  const valid = complimentsService.validateCreate(input)
  if (!valid.ok) {
    return NextResponse.json({ error: valid.message }, { status: valid.status })
  }

  let c
  try {
    c = await complimentsService.createCompliment(input)
  } catch (err) {
    console.error('[compliments POST]', err instanceof Error ? err.message : String(err))
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: 'Failed to post' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // Send email notification — await before responding (no fire-and-forget in serverless)
  // Email keeps the route's old 'Someone' fallback (the domain defaults the poster
  // name to 'Unknown'; the poster is always the authenticated caller in practice).
  await sendComplimentEmail({
    body:          c.body,
    postedByName:  c.postedByName === 'Unknown' ? 'Someone' : c.postedByName,
    recipientName: c.recipientName,
  }).catch(err => console.error('[compliments POST] email error:', err))

  return NextResponse.json({ compliment: toComplimentWireDto(c) }, { status: 201 })
}
