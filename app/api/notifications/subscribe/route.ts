/**
 * app/api/notifications/subscribe/route.ts
 *
 * POST /api/notifications/subscribe
 * Stores a Web Push subscription for the current user.
 *
 * Body: { endpoint, keys: { p256dh, auth }, deviceLabel? }
 * Auth: x-mfs-user-role header (any authenticated role)
 *
 * F-25 (R7) — re-pointed onto the PushSubscriptionsRepository port
 * (lib/wiring/pushSubscriptions). The route imports ZERO adapters and ZERO
 * vendor SDKs (the old dead `@/lib/webpush` import + the raw `supabaseService`
 * upsert are both gone). The validation, the 401/400/500/200 shapes and the
 * upsert payload are byte-identical; `last_used` is computed here as
 * `new Date().toISOString()` and passed into the port (the adapter never calls
 * `new Date()`).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pushSubscriptions } from '@/lib/wiring/pushSubscriptions'

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
    try {
      await pushSubscriptions.upsert({
        userId,
        endpoint,
        p256dh:      keys.p256dh,
        auth:        keys.auth,
        deviceLabel: deviceLabel ?? null,
        lastUsedIso: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[subscribe]', (err as Error).message)
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[POST /api/notifications/subscribe]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
