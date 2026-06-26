/**
 * tests/integration/haccpAlarmCron.test.ts
 *
 * F-25 — the HACCP overdue-alarm cron route over real HTTP against the local
 * stack (F-INFRA-01), the booted-server counterpart to the adapter contract
 * tests in tests/integration/adapters/supabase/*.
 *
 * GET /api/cron/haccp-alarm:
 *   - without `Authorization: Bearer ${CRON_SECRET}` → 401 (the route's own
 *     guard; /api/cron is PUBLIC at the middleware so no 307 redirect)
 *   - wrong Bearer token → 401
 *   - with the Bearer secret → 200 { ok:true, sent:number, overdue:number }
 *     — the exact wire shape runHaccpAlarmCheck.run() returns, proven through
 *     the wired Supabase adapters end-to-end (no mocks).
 *
 * Shape/auth smoke: it does NOT seed overdue rows or push subscriptions — the
 * per-branch escalation/cleanup behaviour is pinned exhaustively in the
 * usecase unit suite (frozen-clock fakes). Here we prove the route boots,
 * authenticates, runs against the LIVE adapters, and returns the owned
 * { ok, sent, overdue } shape with the seed's natural state.
 *
 * The shared test secret is injected into the booted dev server by
 * _globalSetup.ts (INTEGRATION_CRON_SECRET) so the 200-path authenticates.
 *
 * Prerequisites:
 *   npm run db:up
 *   npm run test:integration -- haccpAlarmCron
 */
import { describe, it, expect } from "vitest";
import { INTEGRATION_BASE_URL, INTEGRATION_CRON_SECRET } from "./_config";

const ALARM_PATH = "/api/cron/haccp-alarm";

async function getAlarm(opts: {
  bearer?: string;
}): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (opts.bearer !== undefined) {
    headers["Authorization"] = `Bearer ${opts.bearer}`;
  }
  const res = await fetch(`${INTEGRATION_BASE_URL}${ALARM_PATH}`, {
    method: "GET",
    headers,
    redirect: "manual",
  });
  const raw = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
  return { status: res.status, body };
}

describe("/api/cron/haccp-alarm integration (F-25)", () => {
  it("rejects a request with no Bearer header as 401", async () => {
    const res = await getAlarm({});
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe("Unauthorised");
  });

  it("rejects a wrong Bearer token as 401", async () => {
    const res = await getAlarm({ bearer: "not-the-real-secret" });
    expect(res.status).toBe(401);
  });

  it("with the Bearer secret: returns 200 { ok:true, sent, overdue } against the live adapters", async () => {
    const res = await getAlarm({ bearer: INTEGRATION_CRON_SECRET });
    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean; sent: number; overdue: number };
    expect(body.ok).toBe(true);
    expect(typeof body.sent).toBe("number");
    expect(typeof body.overdue).toBe("number");
    // Both counts are non-negative integers (no NaN leaking from the loop).
    expect(body.sent).toBeGreaterThanOrEqual(0);
    expect(body.overdue).toBeGreaterThanOrEqual(0);
    // The response carries exactly the three owned keys — no vendor shape leak.
    expect(Object.keys(body).sort()).toEqual(["ok", "overdue", "sent"]);
  });
});
