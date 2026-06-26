/**
 * tests/unit/adapters/web-push/PushSender.test.ts
 *
 * F-25 — the web-push adapter, with the `web-push` module MOCKED (vitest
 * vi.mock). CI must never hit a real push service, so the adapter's vendor-call
 * internals are pinned against the mock:
 *   - sendNotification is called with the right subscription + the JSON data
 *     (defaults applied) + { TTL: 300, urgency: 'high' }
 *   - success → true
 *   - a 404/410 statusCode → false + console.warn (the cleanup-trigger path)
 *   - any other error → false + console.error
 *   - getPublicKey returns VAPID_PUBLIC_KEY, or throws when it is unset (→ 503)
 *
 * These are exactly the byte-identical behaviours moved off lib/webpush.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const setVapidDetails = vi.fn();
const sendNotification = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...a: unknown[]) => setVapidDetails(...a),
    sendNotification: (...a: unknown[]) => sendNotification(...a),
  },
}));

import { createWebPushSender } from "@/lib/adapters/web-push";

const SUB = {
  endpoint: "https://push.example/device-abc-endpoint",
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = "pub-key";
  process.env.VAPID_PRIVATE_KEY = "priv-key";
  delete process.env.VAPID_SUBJECT;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("createWebPushSender — send", () => {
  it("calls sendNotification with the subscription, the JSON data (defaults applied) and { TTL: 300, urgency: 'high' }", async () => {
    sendNotification.mockResolvedValueOnce(undefined);
    const sender = createWebPushSender();
    const ok = await sender.send(SUB, { title: "Title", body: "Body" });

    expect(ok).toBe(true);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [sub, data, opts] = sendNotification.mock.calls[0];
    expect(sub).toEqual({
      endpoint: SUB.endpoint,
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    });
    expect(JSON.parse(data as string)).toEqual({
      title: "Title",
      body: "Body",
      url: "/haccp",
      tag: "haccp-alarm",
      requireInteraction: true,
    });
    expect(opts).toEqual({ TTL: 300, urgency: "high" });
  });

  it("passes through explicit url/tag/requireInteraction without applying defaults", async () => {
    sendNotification.mockResolvedValueOnce(undefined);
    const sender = createWebPushSender();
    await sender.send(SUB, {
      title: "T",
      body: "B",
      url: "/custom",
      tag: "haccp-cold_am",
      requireInteraction: false,
    });
    const data = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(data).toMatchObject({
      url: "/custom",
      tag: "haccp-cold_am",
      requireInteraction: false,
    });
  });

  it("initialises VAPID once (setVapidDetails called a single time across two sends)", async () => {
    sendNotification.mockResolvedValue(undefined);
    const sender = createWebPushSender();
    await sender.send(SUB, { title: "T", body: "B" });
    await sender.send(SUB, { title: "T", body: "B" });
    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    expect(setVapidDetails).toHaveBeenCalledWith(
      "mailto:hakan@mfsglobal.co.uk",
      "pub-key",
      "priv-key",
    );
  });

  it("returns false and warns on a 404 statusCode (expired subscription)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendNotification.mockRejectedValueOnce({ statusCode: 404 });
    const sender = createWebPushSender();
    const ok = await sender.send(SUB, { title: "T", body: "B" });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[webpush] Subscription expired:",
      SUB.endpoint.slice(-20),
    );
    warn.mockRestore();
  });

  it("returns false and warns on a 410 statusCode (expired subscription)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    const sender = createWebPushSender();
    const ok = await sender.send(SUB, { title: "T", body: "B" });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("returns false and console.errors on any other send error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { statusCode: 500 }),
    );
    const sender = createWebPushSender();
    const ok = await sender.send(SUB, { title: "T", body: "B" });
    expect(ok).toBe(false);
    expect(error).toHaveBeenCalledWith("[webpush] Send failed:", "boom");
    error.mockRestore();
  });

  it("throws when VAPID public/private keys are unset (init guard)", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const sender = createWebPushSender();
    await expect(sender.send(SUB, { title: "T", body: "B" })).rejects.toThrow();
  });
});

describe("createWebPushSender — getPublicKey", () => {
  it("returns VAPID_PUBLIC_KEY when set", () => {
    process.env.VAPID_PUBLIC_KEY = "the-public-key";
    expect(createWebPushSender().getPublicKey()).toBe("the-public-key");
  });

  it("throws when VAPID_PUBLIC_KEY is unset (→ vapid-key route 503)", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    expect(() => createWebPushSender().getPublicKey()).toThrow();
  });
});
