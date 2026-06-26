/**
 * lib/adapters/fake/PushSender.ts
 *
 * Deterministic no-network Fake for the PushSender port (F-25). No `web-push`
 * import — pure JavaScript. Used by the usecase + route unit tests to assert
 * "a push was asked to be sent to this device with this payload" and to script
 * per-endpoint success / expiry so the cleanup path is exercised, without a
 * live push service (which CI must never hit).
 *
 * Boundary discipline (ADR-0002): imports zero vendor SDKs; works in owned
 * PushSubscription / PushPayload shapes only.
 *
 * Construction:
 *   - `createFakePushSender({ publicKey, results })` factory — records every
 *     send in `sent`; returns the per-endpoint boolean from `results` (default
 *     true). `getPublicKey()` returns `publicKey`, or throws if it is undefined
 *     (mirrors the web-push adapter, whose getPublicKey throws when
 *     VAPID_PUBLIC_KEY is unset → the vapid-key route maps to 503).
 *   - `fakePushSender` singleton — for barrel symmetry.
 */

import type {
  PushSender,
  PushSubscription,
  PushPayload,
} from "@/lib/ports";

export interface FakePushSenderSeed {
  /** The key getPublicKey() returns. Undefined → getPublicKey() throws. */
  readonly publicKey?: string;
  /** Per-endpoint send result. Missing endpoint → true. */
  readonly results?: Readonly<Record<string, boolean>>;
}

export interface FakePushSender extends PushSender {
  /** Test inspection: every (subscription, payload) send() received, in order. */
  readonly sent: readonly { subscription: PushSubscription; payload: PushPayload }[];
}

export function createFakePushSender(seed?: FakePushSenderSeed): FakePushSender {
  const sent: { subscription: PushSubscription; payload: PushPayload }[] = [];
  return {
    sent,
    async send(
      subscription: PushSubscription,
      payload: PushPayload,
    ): Promise<boolean> {
      sent.push({ subscription, payload });
      return seed?.results?.[subscription.endpoint] ?? true;
    },
    getPublicKey(): string {
      if (seed?.publicKey === undefined) {
        throw new Error("[fake-push] VAPID_PUBLIC_KEY not set");
      }
      return seed.publicKey;
    },
  };
}

export const fakePushSender: FakePushSender = createFakePushSender({
  publicKey: "fake-vapid-public-key",
});
