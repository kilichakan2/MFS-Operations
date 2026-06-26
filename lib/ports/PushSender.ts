/**
 * lib/ports/PushSender.ts
 *
 * The PushSender port — the app's own socket for "deliver this push to this
 * device" (F-25). The push vendor (currently web-push / VAPID) plugs in behind
 * it via an adapter; the rest of the app never sees `web-push` again. Closes
 * the last vendor-outside-adapter breach (the old `lib/webpush.ts`).
 *
 * Pure TypeScript: no `web-push` import, no framework import. The
 * `PushSubscription` / `PushPayload` shapes are app-owned (they were owned
 * shapes in `lib/webpush.ts` already — not vendor types) and move here verbatim.
 */

/** Owned push-payload shape (moved from lib/webpush.ts — app-owned, not vendor). */
export interface PushPayload {
  title: string;
  body: string;
  /** Where to navigate on tap. Adapter applies the default '/haccp'. */
  url?: string;
  /** Notification tag (same tag replaces, unique tag stacks). Adapter default 'haccp-alarm'. */
  tag?: string;
  /** Keep the notification on screen until tapped. Adapter default true. */
  requireInteraction?: boolean;
}

/** Owned subscription shape (moved from lib/webpush.ts). */
export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSender {
  /**
   * Deliver one push. Returns true on success; false on expiry (404/410) OR any
   * other send failure (byte-identical to today's boolean). NEVER throws for a
   * send error — only the VAPID-not-configured init can throw. The adapter
   * applies the url/tag/requireInteraction defaults + { TTL: 300, urgency: 'high' }
   * + the 404/410-warn vs other-error-console.error logging VERBATIM.
   */
  send(subscription: PushSubscription, payload: PushPayload): Promise<boolean>;
  /**
   * The VAPID public key. Throws if VAPID_PUBLIC_KEY is unset (today's
   * behaviour — the vapid-key route maps the throw → 503).
   */
  getPublicKey(): string;
}
