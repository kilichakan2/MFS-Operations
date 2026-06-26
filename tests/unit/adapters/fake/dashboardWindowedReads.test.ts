/**
 * tests/unit/adapters/fake/dashboardWindowedReads.test.ts
 *
 * F-21 — focused fake-level tests for the windowed read methods ADDED to the
 * existing Complaints / Visits ports for the admin dashboard (R5: these two
 * ports never had a shared `__contracts__` file, so per the plan's R5 decision
 * (b) the NEW methods get focused fake-unit + live-Supabase integration tests
 * rather than re-contracting already-shipped methods).
 *
 * Verifies window filtering, ordering, limit, the gte-only at-risk window (R1),
 * and RAW-enum carry — the things the DashboardService relies on.
 */
import { describe, it, expect } from "vitest";
import {
  createFakeComplaintsRepository,
  createFakeVisitsRepository,
} from "@/lib/adapters/fake";

const FROM = "2026-04-01T00:00:00.000Z";
const TO = "2026-04-30T23:59:59.999Z";

// ── ComplaintsRepository new methods ────────────────────────────────────────
describe("Fake ComplaintsRepository — F-21 dashboard reads", () => {
  it("listOpenOlderThan: open + created_at < before, oldest first", async () => {
    const repo = createFakeComplaintsRepository({
      complaints: [
        { id: "old", createdAt: "2026-04-01T00:00:00.000Z", category: "weight", status: "open" },
        { id: "newer", createdAt: "2026-04-05T00:00:00.000Z", category: "weight", status: "open" },
        { id: "resolved", createdAt: "2026-04-01T00:00:00.000Z", category: "weight", status: "resolved" },
        { id: "after", createdAt: "2026-04-20T00:00:00.000Z", category: "weight", status: "open" },
      ],
    });
    const before = "2026-04-10T00:00:00.000Z";
    const rows = await repo.listOpenOlderThan(before);
    // resolved excluded; after-cutoff excluded; oldest first.
    expect(rows.map((r) => r.id)).toEqual(["old", "newer"]);
    expect(rows.every((r) => r.status === "open")).toBe(true);
  });

  it("listTodayWithNames: window inclusive, newest first, capped at 50", async () => {
    const complaints = Array.from({ length: 55 }, (_, i) => ({
      id: `c${String(i).padStart(3, "0")}`,
      createdAt: new Date(Date.parse(FROM) + i * 1000).toISOString(),
      category: "quality" as const,
      status: "open" as const,
    }));
    const repo = createFakeComplaintsRepository({ complaints });
    const rows = await repo.listTodayWithNames({ from: FROM, to: TO });
    expect(rows.length).toBe(50);
    expect(rows[0].id).toBe("c054"); // newest first
  });

  it("listWeekRollup: trimmed shape with RAW category + resolvedAt", async () => {
    const repo = createFakeComplaintsRepository({
      complaints: [
        {
          id: "r1",
          createdAt: "2026-04-08T00:00:00.000Z",
          category: "missing_item",
          status: "resolved",
          resolvedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          id: "before",
          createdAt: "2026-03-01T00:00:00.000Z",
          category: "weight",
          status: "open",
        },
      ],
    });
    const rows = await repo.listWeekRollup({ from: FROM, to: TO });
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual({
      category: "missing_item", // RAW (no underscore→space)
      status: "resolved",
      createdAt: "2026-04-08T00:00:00.000Z",
      resolvedAt: "2026-04-09T00:00:00.000Z",
    });
  });
});

// ── VisitsRepository new methods ────────────────────────────────────────────
describe("Fake VisitsRepository — F-21 dashboard reads", () => {
  const seed = {
    people: { u1: { id: "u1", name: "Hakan" } },
    customers: { cust1: { id: "cust1", name: "Acme" } },
    visits: [
      { id: "v1", createdAt: "2026-04-08T12:00:00.000Z", userId: "u1", customerId: "cust1", outcome: "at_risk" as const, visitType: "routine" as const },
      { id: "v2", createdAt: "2026-04-09T12:00:00.000Z", userId: "u1", prospectName: "New Cafe", outcome: "lost" as const, visitType: "new_pitch" as const },
      { id: "v3", createdAt: "2026-04-10T12:00:00.000Z", userId: "u1", customerId: "cust1", outcome: "positive" as const, visitType: "routine" as const },
      { id: "before", createdAt: "2026-03-01T00:00:00.000Z", userId: "u1", customerId: "cust1", outcome: "at_risk" as const, visitType: "routine" as const },
    ],
  };

  it("listTodayForDashboard: window inclusive, newest first, capped at 50, RAW enums", async () => {
    const repo = createFakeVisitsRepository(seed);
    const rows = await repo.listTodayForDashboard({ from: FROM, to: TO });
    expect(rows.map((r) => r.id)).toEqual(["v3", "v2", "v1"]); // newest first
    // RAW enum carry.
    const v2 = rows.find((r) => r.id === "v2");
    expect(v2?.outcome).toBe("lost");
    expect(v2?.visitType).toBe("new_pitch");
  });

  it("listWeekForDashboard: window inclusive, no limit", async () => {
    const repo = createFakeVisitsRepository(seed);
    const rows = await repo.listWeekForDashboard({ from: FROM, to: TO });
    // 3 in-window rows; the March row is excluded.
    expect(rows.map((r) => r.id).sort()).toEqual(["v1", "v2", "v3"]);
  });

  it("listAtRiskSince (R1): gte-only, NO upper bound — includes future rows", async () => {
    const repo = createFakeVisitsRepository({
      ...seed,
      visits: [
        ...seed.visits,
        // A future-dated at-risk row: a clock-skewed created_at past `now`.
        { id: "future", createdAt: "2099-01-01T00:00:00.000Z", userId: "u1", customerId: "cust1", outcome: "at_risk" as const, visitType: "routine" as const },
      ],
    });
    const rows = await repo.listAtRiskSince(FROM);
    // at_risk + lost only; gte FROM (the March 'before' row excluded); future
    // INCLUDED (no lte). v3 positive excluded.
    expect(rows.map((r) => r.id).sort()).toEqual(["future", "v1", "v2"].sort());
    // newest first → the future row leads.
    expect(rows[0].id).toBe("future");
  });
});
