/**
 * lib/webpush.ts
 *
 * Web Push notification sender using VAPID.
 * Server-side only — never import this in client components.
 *
 * Required environment variables (add to Vercel dashboard):
 *   VAPID_PUBLIC_KEY   — generated VAPID public key
 *   VAPID_PRIVATE_KEY  — generated VAPID private key
 *   VAPID_SUBJECT      — mailto:hakan@mfsglobal.co.uk
 */

import webpush from 'web-push'

let initialised = false

function initWebPush() {
  if (initialised) return
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject    = process.env.VAPID_SUBJECT ?? 'mailto:hakan@mfsglobal.co.uk'

  if (!publicKey || !privateKey) {
    throw new Error('[webpush] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in env')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  initialised = true
}

export interface PushPayload {
  title: string
  body:  string
  url?:  string  // where to navigate on tap (default: /haccp)
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * Sends a push notification to a single subscription.
 * Returns true on success, false on failure.
 * Throws if VAPID keys are not configured.
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload:       PushPayload,
): Promise<boolean> {
  initWebPush()

  const data = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    url:   payload.url ?? '/haccp',
  })

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth:   subscription.keys.auth,
        },
      },
      data,
      {
        TTL: 300,  // 5 minutes — if device is offline, discard after 5 min
        urgency: 'high',
      }
    )
    return true
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    // 404 or 410 = subscription expired/invalid — caller should delete it
    if (status === 404 || status === 410) {
      console.warn('[webpush] Subscription expired:', subscription.endpoint.slice(-20))
      return false
    }
    console.error('[webpush] Send failed:', (err as Error).message)
    return false
  }
}

/**
 * Returns the VAPID public key for use in push subscription on the client.
 */
export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) throw new Error('[webpush] VAPID_PUBLIC_KEY not set')
  return key
}
