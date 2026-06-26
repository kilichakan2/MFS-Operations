/**
 * tests/unit/api/haccp-notifications.routes.test.ts
 *
 * F-25 — route-level tests for the three re-pointed routes:
 *   GET  /api/cron/haccp-alarm           (Bearer/CRON_SECRET → usecase → result)
 *   GET  /api/notifications/vapid-key     (pushSender.getPublicKey → 200 / 503)
 *   POST /api/notifications/subscribe     (validate → pushSubscriptions.upsert)
 *
 * They call the handlers DIRECTLY (bypassing middleware), mocking the wiring
 * singletons so no DB / network / vendor is touched. They pin the things the
 * re-point must NOT change:
 *   - cron: 401 on bad/missing Bearer; happy path returns the usecase result
 *     verbatim; 500 { error:'Server error' } when the usecase throws.
 *   - vapid-key: 200 { publicKey } from getPublicKey; 503 when it throws.
 *   - subscribe: 401 missing headers; 400 invalid sub; 200 ok; 500 on a thrown
 *     upsert. Plus: the upsert is called with the byte-identical payload + a
 *     lastUsedIso computed in the route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocked wiring singletons ────────────────────────────────────────────────
const run = vi.fn();
vi.mock("@/lib/wiring/haccpAlarm", () => ({
  runHaccpAlarmCheck: { run: (...a: unknown[]) => run(...a) },
}));

const getPublicKey = vi.fn();
vi.mock("@/lib/wiring/pushSender", () => ({
  pushSender: { getPublicKey: (...a: unknown[]) => getPublicKey(...a) },
}));

const upsert = vi.fn();
vi.mock("@/lib/wiring/pushSubscriptions", () => ({
  pushSubscriptions: { upsert: (...a: unknown[]) => upsert(...a) },
}));

import { GET as cronGET } from "@/app/api/cron/haccp-alarm/route";
import { GET as vapidGET } from "@/app/api/notifications/vapid-key/route";
import { POST as subscribePOST } from "@/app/api/notifications/subscribe/route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secret-token";
});

function get(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "GET", headers });
}

// ── cron ────────────────────────────────────────────────────────────────────
describe("GET /api/cron/haccp-alarm", () => {
  it("401 { error:'Unauthorised' } on a missing Bearer", async () => {
    const res = await cronGET(get("/api/cron/haccp-alarm"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(run).not.toHaveBeenCalled();
  });

  it("401 on a wrong Bearer", async () => {
    const res = await cronGET(
      get("/api/cron/haccp-alarm", { authorization: "Bearer nope" }),
    );
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("happy path: calls run(now) and returns its result verbatim", async () => {
    run.mockResolvedValueOnce({ ok: true, sent: 3, overdue: 2 });
    const res = await cronGET(
      get("/api/cron/haccp-alarm", { authorization: "Bearer secret-token" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 3, overdue: 2 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it("500 { error:'Server error' } when the usecase throws", async () => {
    run.mockRejectedValueOnce(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await cronGET(
      get("/api/cron/haccp-alarm", { authorization: "Bearer secret-token" }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
    errSpy.mockRestore();
  });
});

// ── vapid-key ─────────────────────────────────────────────────────────────────
describe("GET /api/notifications/vapid-key", () => {
  it("200 { publicKey } from getPublicKey", async () => {
    getPublicKey.mockReturnValueOnce("the-public-key");
    const res = await vapidGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: "the-public-key" });
  });

  it("503 { error:'VAPID not configured' } when getPublicKey throws", async () => {
    getPublicKey.mockImplementationOnce(() => {
      throw new Error("VAPID_PUBLIC_KEY not set");
    });
    const res = await vapidGET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "VAPID not configured" });
  });
});

// ── subscribe ─────────────────────────────────────────────────────────────────
function post(body: unknown, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/notifications/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const AUTHED = { "x-mfs-user-role": "admin", "x-mfs-user-id": "user-1" };
const VALID_SUB = {
  endpoint: "https://push.example/device-endpoint",
  keys: { p256dh: "p256dh-long-enough", auth: "auth-long-enough" },
  deviceLabel: "Phone",
};

describe("POST /api/notifications/subscribe", () => {
  it("401 when the auth headers are missing", async () => {
    const res = await subscribePOST(post(VALID_SUB, {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("400 on an invalid subscription shape", async () => {
    const res = await subscribePOST(
      post({ endpoint: "ftp://bad", keys: { p256dh: "x", auth: "y" } }, AUTHED),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid subscription" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("200 { ok:true } and upserts the byte-identical payload + a lastUsedIso", async () => {
    upsert.mockResolvedValueOnce(undefined);
    const res = await subscribePOST(post(VALID_SUB, AUTHED));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg).toMatchObject({
      userId: "user-1",
      endpoint: VALID_SUB.endpoint,
      p256dh: "p256dh-long-enough",
      auth: "auth-long-enough",
      deviceLabel: "Phone",
    });
    expect(typeof arg.lastUsedIso).toBe("string");
    expect(() => new Date(arg.lastUsedIso).toISOString()).not.toThrow();
  });

  it("defaults deviceLabel to null when absent", async () => {
    upsert.mockResolvedValueOnce(undefined);
    const { deviceLabel: _omit, ...noLabel } = VALID_SUB;
    void _omit;
    await subscribePOST(post(noLabel, AUTHED));
    expect(upsert.mock.calls[0][0].deviceLabel).toBeNull();
  });

  it("500 { error:'Failed to save subscription' } when the upsert throws", async () => {
    upsert.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await subscribePOST(post(VALID_SUB, AUTHED));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save subscription" });
    errSpy.mockRestore();
  });
});
