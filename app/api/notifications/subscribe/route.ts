/**
 * app/api/notifications/subscribe/route.ts
 *
 * POST /api/notifications/subscribe
 * Stores a Web Push subscription for the current user.
 *
 * Body: { endpoint, keys: { p256dh, auth }, deviceLabel? }
 * Auth: x-mfs-user-role header (any authenticated role)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import { getVapidPublicKey }         from '@/lib/webpush'

const supabase = supabaseService

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { endpoint, keys, deviceLabel } = body

    // Validate subscription shape
    if (
      typeof endpoint !== 'string' || !endpoint.startsWith('https://') ||
      typeof keys?.p256dh !== 'string' || keys.p256dh.length < 10 ||
      typeof keys?.auth   !== 'string' || keys.auth.length   < 10
    ) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    // Upsert subscription — update last_used if endpoint already exists
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id:      userId,
          endpoint,
          p256dh:       keys.p256dh,
          auth:         keys.auth,
          device_label: deviceLabel ?? null,
          last_used:    new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      console.error('[subscribe]', error.message)
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[POST /api/notifications/subscribe]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
