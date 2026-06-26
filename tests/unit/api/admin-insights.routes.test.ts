/**
 * tests/unit/api/admin-insights.routes.test.ts
 *
 * F-20 PR2 — route-level tests for the three re-pointed admin-insight routes:
 *   GET /api/admin/prospects     ({ rows } — prospects-this-week)
 *   GET /api/admin/at-risk       ({ rows } — at-risk accounts)
 *   GET /api/admin/commitments   ({ rows } — unreviewed commitments)
 *
 * These call the handlers DIRECTLY (bypassing middleware), mocking the wiring
 * singleton (visitsService — the SERVICE-ROLE singleton, NOT …ForCaller) so no
 * DB / network is touched. They pin the things the re-point must NOT change:
 *   - the x-mfs-user-id presence guard is PRESERVED byte-identical (401
 *     'Unauthenticated')
 *   - the response is the `{ rows: [...] }` wrapper with byte-identical per-row
 *     key sets, asserted via Object.keys(rows[0]).sort()
 *   - the prospects `stage` preserves null for a null pipelineStatus (R1 — the
 *     one shape that is harder to preserve than it looks)
 *   - the at-risk / commitments `hoursAgo` + the derived reason/status pass
 *     through the route's projection (the derivations stay in the route)
 *
 * Precedent: tests/unit/api/admin-products.route.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Visit } from "@/lib/domain";

// ── Mocked wiring singleton (service-role visitsService) ────────────────────
const listProspects = vi.fn();
const listAtRisk = vi.fn();
const listCommitments = vi.fn();

vi.mock("@/lib/wiring/visits", () => ({
  visitsService: {
    listProspects: (...a: unknown[]) => listProspects(...a),
    listAtRisk: (...a: unknown[]) => listAtRisk(...a),
    listCommitments: (...a: unknown[]) => listCommitments(...a),
  },
}));

import { GET as prospectsGET } from "@/app/api/admin/prospects/route";
import { GET as atRiskGET } from "@/app/api/admin/at-risk/route";
import { GET as commitmentsGET } from "@/app/api/admin/commitments/route";

beforeEach(() => {
  vi.clearAllMocks();
});

const AUTHED = { "x-mfs-user-id": "admin-1" };

function req(path: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "GET", headers });
}

/** A full Visit superset; reads populate only the subset they select. */
function visit(overrides: Partial<Visit>): Visit {
  return {
    id: "v1",
    createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    userId: "u1",
    loggedById: "u1",
    loggedByName: "Hakan",
    customerId: null,
    customerName: null,
    visitType: "routine",
    outcome: "positive",
    pipelineStatus: "Logged",
    commitmentMade: false,
    commitmentDetail: null,
    notes: null,
    prospectName: null,
    prospectPostcode: null,
    ...overrides,
  };
}

// ── GET /api/admin/prospects ────────────────────────────────────────────────
describe("GET /api/admin/prospects — guard + {rows} shape + R1 null stage", () => {
  it("returns 401 'Unauthenticated' when x-mfs-user-id is absent", async () => {
    const res = await prospectsGET(req("/api/admin/prospects", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(listProspects).not.toHaveBeenCalled();
  });

  it("returns the exact 7-key rows with underscore→space on outcome/visitType", async () => {
    listProspects.mockResolvedValueOnce([
      visit({
        id: "p1",
        prospectName: "New Cafe",
        prospectPostcode: "SW1A 1AA",
        outcome: "at_risk",
        visitType: "new_pitch",
        pipelineStatus: "In Talks",
        loggedByName: "Hakan",
      }),
    ]);
    const res = await prospectsGET(req("/api/admin/prospects", AUTHED));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["rows"]);
    expect(Object.keys(body.rows[0]).sort()).toEqual(
      ["id", "name", "outcome", "postcode", "rep", "stage", "visitType"].sort(),
    );
    expect(body.rows[0]).toEqual({
      id: "p1",
      name: "New Cafe",
      postcode: "SW1A 1AA",
      outcome: "at risk", // underscore→space
      visitType: "new pitch", // underscore→space
      rep: "Hakan",
      stage: "In Talks",
    });
  });

  it("R1: a null pipelineStatus yields stage === null (NOT 'Logged')", async () => {
    listProspects.mockResolvedValueOnce([
      visit({
        id: "p2",
        prospectName: "Blank Stage Cafe",
        outcome: "neutral",
        visitType: "routine",
        pipelineStatus: null,
      }),
    ]);
    const res = await prospectsGET(req("/api/admin/prospects", AUTHED));
    const body = await res.json();
    expect(body.rows[0].stage).toBeNull();
  });

  it("rep falls back to 'Unknown' when loggedByName is null", async () => {
    listProspects.mockResolvedValueOnce([
      visit({ prospectName: "X", loggedByName: null, pipelineStatus: "Won" }),
    ]);
    const res = await prospectsGET(req("/api/admin/prospects", AUTHED));
    const body = await res.json();
    expect(body.rows[0].rep).toBe("Unknown");
  });
});

// ── GET /api/admin/at-risk ──────────────────────────────────────────────────
describe("GET /api/admin/at-risk — guard + {rows} shape + derivation", () => {
  it("returns 401 'Unauthenticated' when x-mfs-user-id is absent", async () => {
    const res = await atRiskGET(req("/api/admin/at-risk", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(listAtRisk).not.toHaveBeenCalled();
  });

  it("returns the exact 6-key rows with RAW outcome + hoursAgo + reason", async () => {
    listAtRisk.mockResolvedValueOnce([
      visit({
        id: "a1",
        outcome: "lost",
        customerName: "Acme Ltd",
        loggedByName: "Mert",
        createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
      }),
    ]);
    const res = await atRiskGET(req("/api/admin/at-risk", AUTHED));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["rows"]);
    expect(Object.keys(body.rows[0]).sort()).toEqual(
      ["customer", "hoursAgo", "id", "outcome", "reason", "rep"].sort(),
    );
    const row = body.rows[0];
    expect(row.id).toBe("a1");
    expect(row.customer).toBe("Acme Ltd");
    expect(row.outcome).toBe("lost"); // RAW — no underscore→space here
    expect(row.rep).toBe("Mert");
    expect(typeof row.hoursAgo).toBe("number");
    // deriveAtRiskReason stays in the route: "Lost — last visit Nh ago".
    expect(row.reason).toBe(`Lost — last visit ${row.hoursAgo}h ago`);
  });

  it("customer falls back customerName → prospectName → 'Unknown'", async () => {
    listAtRisk.mockResolvedValueOnce([
      visit({ outcome: "at_risk", customerName: null, prospectName: "Walk-in Cafe" }),
    ]);
    const res = await atRiskGET(req("/api/admin/at-risk", AUTHED));
    const body = await res.json();
    expect(body.rows[0].customer).toBe("Walk-in Cafe");
  });
});

// ── GET /api/admin/commitments ──────────────────────────────────────────────
describe("GET /api/admin/commitments — guard + {rows} shape + derivation", () => {
  it("returns 401 'Unauthenticated' when x-mfs-user-id is absent", async () => {
    const res = await commitmentsGET(req("/api/admin/commitments", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(listCommitments).not.toHaveBeenCalled();
  });

  it("returns the exact 6-key rows with hoursAgo + derived status", async () => {
    listCommitments.mockResolvedValueOnce([
      visit({
        id: "k1",
        commitmentMade: true,
        commitmentDetail: "send samples",
        customerName: "Acme Ltd",
        loggedByName: "Hakan",
        createdAt: new Date(Date.now() - 48 * 3_600_000).toISOString(),
      }),
    ]);
    const res = await commitmentsGET(req("/api/admin/commitments", AUTHED));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["rows"]);
    expect(Object.keys(body.rows[0]).sort()).toEqual(
      ["customer", "detail", "hoursAgo", "id", "rep", "status"].sort(),
    );
    const row = body.rows[0];
    expect(row.id).toBe("k1");
    expect(row.detail).toBe("send samples");
    expect(row.customer).toBe("Acme Ltd");
    expect(row.rep).toBe("Hakan");
    // > 24h → deriveCommitmentStatus = 'overdue' (stays in the route).
    expect(row.status).toBe("overdue");
  });

  it("detail falls back to '' when commitmentDetail is null", async () => {
    listCommitments.mockResolvedValueOnce([
      visit({ commitmentMade: true, commitmentDetail: null }),
    ]);
    const res = await commitmentsGET(req("/api/admin/commitments", AUTHED));
    const body = await res.json();
    expect(body.rows[0].detail).toBe("");
  });

  it("passes the raw `from` param (string | null) through to listCommitments", async () => {
    listCommitments.mockResolvedValueOnce([]);
    await commitmentsGET(req("/api/admin/commitments?to=2026-06-30T00:00:00.000Z", AUTHED));
    const arg = listCommitments.mock.calls[0][0];
    expect(arg.from).toBeNull(); // no ?from → null, not a default
    expect(arg.to).toBe("2026-06-30T00:00:00.000Z");
  });
});
