/**
 * lib/ports/__contracts__/PushSender.contract.ts
 *
 * Shared behavioural contract for PushSender (F-25). Both adapters (web-push +
 * Fake) pass the SAME suite.
 *
 * Pattern matches the other __contracts__ files (the setup-closure shape locked
 * at F-06 Gate 1). The setup closure yields `{ sender, okEndpoint,
 * expiryEndpoint, otherErrorEndpoint, publicKey }`. The contract drives `send`
 * against three scripted endpoints and asserts the boolean result, plus
 * `getPublicKey`.
 *
 * `send` returns a BOOLEAN, never throws for a send error (byte-identical to the
 * old lib/webpush.ts). So the contract asserts:
 *   - a known-good endpoint → true
 *   - a 404/410-expiry endpoint → false (the cleanup-trigger path)
 *   - any-other-error endpoint → false
 *   - getPublicKey returns the configured key
 *
 * The web-push adapter's vendor-call internals ({ TTL: 300, urgency: 'high' },
 * the defaults, the two console outputs) are pinned by its own unit test with a
 * mocked `web-push` module — they cannot be exercised through this contract
 * without a live push service, which CI must not hit.
 */
import { describe, it, expect } from "vitest";
import type { PushSender, PushSubscription } from "@/lib/ports";

export interface PushSenderContractSetup {
  sender: PushSender;
  /** An endpoint scripted to deliver successfully. */
  okEndpoint: string;
  /** An endpoint scripted to fail as expired (404/410 — the cleanup path). */
  expiryEndpoint: string;
  /** An endpoint scripted to fail with a non-expiry error. */
  otherErrorEndpoint: string;
  /** The configured VAPID public key getPublicKey() must return. */
  publicKey: string;
}

const PAYLOAD = {
  title: "T",
  body: "B",
  url: "/haccp",
  tag: "haccp-cold_am",
  requireInteraction: true,
} as const;

function sub(endpoint: string): PushSubscription {
  return { endpoint, keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" } };
}

export function pushSenderContract(
  setup: () => Promise<PushSenderContractSetup>,
): void {
  describe("PushSender contract", () => {
    it("send returns true for a deliverable endpoint", async () => {
      const ctx = await setup();
      await expect(ctx.sender.send(sub(ctx.okEndpoint), PAYLOAD)).resolves.toBe(
        true,
      );
    });

    it("send returns false (no throw) for an expired (404/410) endpoint", async () => {
      const ctx = await setup();
      await expect(
        ctx.sender.send(sub(ctx.expiryEndpoint), PAYLOAD),
      ).resolves.toBe(false);
    });

    it("send returns false (no throw) for any other send error", async () => {
      const ctx = await setup();
      await expect(
        ctx.sender.send(sub(ctx.otherErrorEndpoint), PAYLOAD),
      ).resolves.toBe(false);
    });

    it("getPublicKey returns the configured key", async () => {
      const ctx = await setup();
      expect(ctx.sender.getPublicKey()).toBe(ctx.publicKey);
    });
  });
}
