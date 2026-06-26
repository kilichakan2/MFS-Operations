/**
 * tests/unit/adapters/fake/PushSender.test.ts
 *
 * F-25 — the Fake PushSender: a no-network, no-SDK stand-in that records every
 * send and scripts per-endpoint success/expiry so the usecase + route tests can
 * exercise the escalation + cleanup paths without a live push service.
 *
 * Runs the shared PushSender contract against the Fake, plus Fake-specific
 * assertions (records every send; getPublicKey throws when no key seeded).
 */
import { describe, it, expect } from "vitest";
import { pushSenderContract } from "@/lib/ports/__contracts__/PushSender.contract";
import { createFakePushSender } from "@/lib/adapters/fake";

const OK = "https://push.example/ok";
const EXPIRY = "https://push.example/expired";
const OTHER = "https://push.example/error";

pushSenderContract(async () => ({
  sender: createFakePushSender({
    publicKey: "vapid-pub-key",
    results: { [OK]: true, [EXPIRY]: false, [OTHER]: false },
  }),
  okEndpoint: OK,
  expiryEndpoint: EXPIRY,
  otherErrorEndpoint: OTHER,
  publicKey: "vapid-pub-key",
}));

describe("createFakePushSender — Fake-specific behaviour", () => {
  it("records every send in order", async () => {
    const sender = createFakePushSender({ publicKey: "k" });
    await sender.send(
      { endpoint: OK, keys: { p256dh: "p", auth: "a" } },
      { title: "T1", body: "B1" },
    );
    await sender.send(
      { endpoint: OTHER, keys: { p256dh: "p", auth: "a" } },
      { title: "T2", body: "B2" },
    );
    expect(sender.sent.map((s) => s.subscription.endpoint)).toEqual([OK, OTHER]);
    expect(sender.sent.map((s) => s.payload.title)).toEqual(["T1", "T2"]);
  });

  it("defaults a send to true when the endpoint is not scripted", async () => {
    const sender = createFakePushSender({ publicKey: "k" });
    const ok = await sender.send(
      { endpoint: "https://push.example/unknown", keys: { p256dh: "p", auth: "a" } },
      { title: "T", body: "B" },
    );
    expect(ok).toBe(true);
  });

  it("getPublicKey throws when no publicKey is seeded (mirrors VAPID-unset)", () => {
    const sender = createFakePushSender();
    expect(() => sender.getPublicKey()).toThrow();
  });
});
