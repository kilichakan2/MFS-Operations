/**
 * tests/unit/api/dashboard.route.test.ts
 *
 * F-21 — route-level tests for the re-pointed GET /api/dashboard. Calls the
 * handler DIRECTLY (bypassing middleware), mocking the wiring singleton
 * (dashboardService) so no DB / network is touched. Pins the things the
 * re-point must NOT change:
 *   - x-mfs-user-id guard preserved byte-identical (401 'Unauthenticated')
 *   - happy path returns the service payload UNCHANGED (NextResponse.json) — the
 *     19-key set survives end to end
 *   - the route parses from/to exactly as today (searchParams ?? UTC-today /
 *     now) and passes { now, window:{from,to} } into load
 *   - a service throw → catch → 500 'Server error'
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const load = vi.fn();

vi.mock("@/lib/wiring/dashboard", () => ({
  dashboardService: {
    load: (...a: unknown[]) => load(...a),
  },
}));

import { GET } from "@/app/api/dashboard/route";

beforeEach(() => {
  vi.clearAllMocks();
});

const AUTHED = { "x-mfs-user-id": "admin-1" };

function req(path: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "GET", headers });
}

/** A complete 19-key payload (values arbitrary — the route passes it through). */
function payload() {
  return {
    openComplaints48h: [],
    atRiskAccounts: [],
    unreviewedCommitments: [],
    discrepanciesToday: [],
    complaintsTodayList: [],
    visitsToday: [],
    weekDiscrepancyReasons: [],
    weekDiscrepancyProducts: [],
    weekComplaintCategories: [],
    weekVisitsByRep: [],
    prospectsThisWeek: [],
    hunterFarmer: { existing: 0, prospects: 0 },
    activePricing: 3,
    draftPricing: 1,
    expiredPricing: 0,
    ordersToday: { placed: 1, printed: 2, completed: 0, total: 3 },
    avgResolutionHours: null,
    totalComplaintsWeek: 0,
    openComplaintsWeek: 0,
  };
}

describe("GET /api/dashboard — guard + pass-through + window parse + 500", () => {
  it("returns 401 'Unauthenticated' when x-mfs-user-id is absent", async () => {
    const res = await GET(req("/api/dashboard", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(load).not.toHaveBeenCalled();
  });

  it("returns the service payload unchanged with the exact 19 keys", async () => {
    load.mockResolvedValueOnce(payload());
    const res = await GET(req("/api/dashboard?from=2026-04-08T00:00:00.000Z&to=2026-04-08T12:00:00.000Z", AUTHED));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(Object.keys(payload()).sort());
    expect(body).toEqual(payload());
  });

  it("passes the supplied from/to through as the window + a now Date", async () => {
    load.mockResolvedValueOnce(payload());
    await GET(req("/api/dashboard?from=2026-04-08T00:00:00.000Z&to=2026-04-08T12:00:00.000Z", AUTHED));
    const arg = load.mock.calls[0][0];
    expect(arg.window).toEqual({
      from: "2026-04-08T00:00:00.000Z",
      to: "2026-04-08T12:00:00.000Z",
    });
    expect(arg.now).toBeInstanceOf(Date);
  });

  it("defaults from→UTC-today-midnight and to→now when params absent", async () => {
    load.mockResolvedValueOnce(payload());
    await GET(req("/api/dashboard", AUTHED));
    const arg = load.mock.calls[0][0];
    const now: Date = arg.now;
    const expectedFrom = new Date(now);
    expectedFrom.setUTCHours(0, 0, 0, 0);
    expect(arg.window.from).toBe(expectedFrom.toISOString());
    // to defaults to the same `now` the route built.
    expect(arg.window.to).toBe(now.toISOString());
  });

  it("returns 500 'Server error' when the service throws", async () => {
    load.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("/api/dashboard", AUTHED));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
  });
});
