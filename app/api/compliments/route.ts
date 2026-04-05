export const dynamic = 'force-dynamic'

/**
 * GET  /api/compliments          — load all compliments, newest first
 * POST /api/compliments          — post a new compliment
 *   Body: { body: string; recipient_id?: string }
 * All authenticated roles can read and post.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { sendComplimentEmail }        from '@/lib/compliment-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('compliments')
    .select(`
      id, body, created_at,
      poster:users!compliments_posted_by_fkey(id, name),
      recipient:users!compliments_recipient_id_fkey(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[compliments GET]', error.message)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }

  const compliments = (data ?? []).map(c => ({
    id:             c.id,
    body:           c.body,
    created_at:     c.created_at,
    posted_by_id:   (c.poster as { id: string; name: string } | null)?.id   ?? null,
    posted_by_name: (c.poster as { id: string; name: string } | null)?.name ?? 'Unknown',
    recipient_id:   (c.recipient as { id: string; name: string } | null)?.id   ?? null,
    recipient_name: (c.recipient as { id: string; name: string } | null)?.name ?? null,
  }))

  return NextResponse.json({ compliments })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  let body: { body?: string; recipient_id?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }

  if (!body?.body?.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('compliments')
    .insert({
      body:         body.body.trim(),
      posted_by:    userId,
      recipient_id: body.recipient_id || null,
    })
    .select(`
      id, body, created_at,
      poster:users!compliments_posted_by_fkey(id, name),
      recipient:users!compliments_recipient_id_fkey(id, name)
    `)
    .single()

  if (error) {
    console.error('[compliments POST]', error.message)
    return NextResponse.json({ error: 'Failed to post' }, { status: 500 })
  }

  const c = data

  // Send email notification — await before responding (no fire-and-forget in serverless)
  await sendComplimentEmail({
    body:          c.body,
    postedByName:  (c.poster  as { id: string; name: string } | null)?.name ?? 'Someone',
    recipientName: (c.recipient as { id: string; name: string } | null)?.name ?? null,
  }).catch(err => console.error('[compliments POST] email error:', err))

  return NextResponse.json({
    compliment: {
      id:             c.id,
      body:           c.body,
      created_at:     c.created_at,
      posted_by_id:   (c.poster as { id: string; name: string } | null)?.id   ?? null,
      posted_by_name: (c.poster as { id: string; name: string } | null)?.name ?? 'Unknown',
      recipient_id:   (c.recipient as { id: string; name: string } | null)?.id   ?? null,
      recipient_name: (c.recipient as { id: string; name: string } | null)?.name ?? null,
    },
  }, { status: 201 })
}
