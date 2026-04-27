/**
 * app/api/notifications/vapid-key/route.ts
 *
 * GET /api/notifications/vapid-key
 * Returns the VAPID public key for the client to use when subscribing.
 * Public key is safe to expose — it's not the private key.
 */

import { NextResponse }  from 'next/server'
import { getVapidPublicKey } from '@/lib/webpush'

export async function GET() {
  try {
    const key = getVapidPublicKey()
    return NextResponse.json({ publicKey: key })
  } catch {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 })
  }
}
