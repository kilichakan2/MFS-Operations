/**
 * lib/adapters/web-push/PushSender.ts
 *
 * The web-push adapter for the PushSender port (F-25). The ONLY file in the app
 * allowed to import `web-push` (enforced by the no-restricted-imports lint rule
 * in `.eslintrc.json`). Closes the last vendor-outside-adapter breach (the old
 * `lib/webpush.ts`, now deleted).
 *
 * PURE RELOCATION of `sendPushNotification` / `getVapidPublicKey` that used to
 * live in `lib/webpush.ts` — every value `web-push` sees, the { TTL: 300,
 * urgency: 'high' } options, the url/tag/requireInteraction defaults, the
 * boolean return, and the 404/410-warn vs other-error console.error logging are
 * byte-for-byte identical. The cron's behaviour does not change; only the import
 * site moves behind this adapter.
 *
 * Lazy VAPID init (mirrors the old module's `initWebPush()` + F-12 / F-TD-04
 * lazy clients): `setVapidDetails` runs once on the first send, reading
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (subject defaults to
 * 'mailto:hakan@mfsglobal.co.uk'); throws if public/private are absent. So a
 * unit test can load this module with no keys set, and `getPublicKey()`'s throw
 * is what the vapid-key route maps to 503.
 *
 * Construction (factory only — F-06 template; wiring holds the singleton):
 *   - `createWebPushSender()` — no deps; reads env lazily per call.
 */
import webpush from "web-push";
import type {
  PushSender,
  PushSubscription,
  PushPayload,
} from "@/lib/ports";

export function createWebPushSender(): PushSender {
  let initialised = false;

  function initWebPush(): void {
    if (initialised) return;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:hakan@mfsglobal.co.uk";

    if (!publicKey || !privateKey) {
      throw new Error(
        "[webpush] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in env",
      );
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    initialised = true;
  }

  return {
    async send(
      subscription: PushSubscription,
      payload: PushPayload,
    ): Promise<boolean> {
      initWebPush();

      const data = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/haccp",
        tag: payload.tag ?? "haccp-alarm",
        requireInteraction: payload.requireInteraction ?? true,
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth,
            },
          },
          data,
          {
            TTL: 300, // 5 minutes — if device is offline, discard after 5 min
            urgency: "high",
          },
        );
        return true;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404 or 410 = subscription expired/invalid — caller should delete it
        if (status === 404 || status === 410) {
          console.warn(
            "[webpush] Subscription expired:",
            subscription.endpoint.slice(-20),
          );
          return false;
        }
        console.error("[webpush] Send failed:", (err as Error).message);
        return false;
      }
    },

    getPublicKey(): string {
      const key = process.env.VAPID_PUBLIC_KEY;
      if (!key) throw new Error("[webpush] VAPID_PUBLIC_KEY not set");
      return key;
    },
  };
}
