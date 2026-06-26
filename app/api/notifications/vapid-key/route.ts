/**
 * app/api/notifications/vapid-key/route.ts
 *
 * GET /api/notifications/vapid-key
 * Returns the VAPID public key for the client to use when subscribing.
 * Public key is safe to expose — it's not the private key.
 *
 * F-25 — re-pointed onto the PushSender port (lib/wiring/pushSender). The route
 * imports ZERO adapters and ZERO vendor SDKs. `getPublicKey()` throws when
 * VAPID_PUBLIC_KEY is unset → mapped to 503 (byte-identical to today).
 */

import { NextResponse } from 'next/server'
import { pushSender } from '@/lib/wiring/pushSender'

export async function GET() {
  try {
    const key = pushSender.getPublicKey()
    return NextResponse.json({ publicKey: key })
  } catch {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 })
  }
}
