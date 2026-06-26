/**
 * tests/unit/services/DashboardService.test.ts
 *
 * F-21 — the load-bearing test. With fake repos seeded and a FROZEN `now`,
 * asserts EVERY rollup/group/tally to the value PLUS the exact 19-key response
 * set (+ the nested shapes of visitsToday[].visits[], weekVisitsByRep[].types,
 * ordersToday, hunterFarmer). The service does the byte-identical maths the
 * route did inline (group-by-rep, outcome distribution + drill-down, week
 * rep×visit_type, discrepancy reason/product rollups, complaint category rollup,
 * avgResolutionHours incl. the ms>0 guard + null-when-none, hunter/farmer,
 * pricing active/draft/expired londonToday boundary, orders state tally,
 * open/total complaint week counts).
 *
 * Pricing + Orders are inline read-only stubs (their fakes have no header-seed
 * path); Complaints/Visits/Discrepancies use the real seeded Fakes so the
 * windowed-read behaviour is exercised end to end through the service.
 */
import { describe, it, expect } from "vitest";
import { createDashboardService } from "@/lib/services";
import {
  createFakeComplaintsRepository,
  createFakeVisitsRepository,
  createFakeDiscrepanciesRepository,
} from "@/lib/adapters/fake";
import type {
  OrdersRepository,
  PricingRepository,
} from "@/lib/ports";
import type { Order, PriceAgreementWithLines } from "@/lib/domain";

// Frozen clock: 2026-04-08 12:00 UTC. londonToday(now) → '2026-04-08' (BST).
const NOW = new Date("2026-04-08T12:00:00.000Z");
const TODAY_STR = "2026-04-08";
// Zone 2/3 window = "today" (UTC midnight → now).
const WINDOW = { from: "2026-04-08T00:00:00.000Z", to: "2026-04-08T12:00:00.000Z" };

// ── Ids ──
const U1 = "11111111-1111-1111-1111-111111111111"; // Hakan
const U2 = "22222222-2222-2222-2222-222222222222"; // Mert
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; // Acme
const P1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; // Lamb Mince
const P2 = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // Beef Mince

const PEOPLE = {
  [U1]: { id: U1, name: "Hakan" },
  [U2]: { id: U2, name: "Mert" },
};
const CUSTOMERS = { [C1]: { id: C1, name: "Acme Ltd" } };

// ── Read-only stubs for Pricing + Orders ──
function pricingStub(rows: PriceAgreementWithLines[]): PricingRepository {
  return {
    async listAgreements() {
      return rows;
    },
  } as unknown as PricingRepository;
}
function ordersStub(rows: Order[]): OrdersRepository {
  return {
    async listOrders() {
      return rows;
    },
  } as unknown as OrdersRepository;
}
function agreement(
  status: "active" | "draft" | "cancelled",
  validUntil: string | null,
): PriceAgreementWithLines {
  return {
    id: "ag",
    status,
    validUntil,
  } as unknown as PriceAgreementWithLines;
}
function order(state: "placed" | "printed" | "completed"): Order {
  return { state } as unknown as Order;
}

function buildService(opts?: {
  pricing?: PriceAgreementWithLines[];
  orders?: Order[];
}) {
  const complaints = createFakeComplaintsRepository({
    people: PEOPLE,
    customers: CUSTOMERS,
    complaints: [
      // Zone 1: open > 48h (created 3 days before NOW).
      { id: "co-old", createdAt: "2026-04-05T12:00:00.000Z", customerId: C1, userId: U1, category: "weight", description: "old open", status: "open" },
      // Zone 1: open but only 12h old — NOT > 48h.
      { id: "co-fresh", createdAt: "2026-04-08T00:00:00.000Z", customerId: C1, userId: U1, category: "quality", description: "fresh open", status: "open" },
      // Zone 2 today: one open + one resolved within the window.
      { id: "ct-open", createdAt: "2026-04-08T08:00:00.000Z", customerId: C1, userId: U1, category: "delivery", description: "today open", status: "open" },
      { id: "ct-res", createdAt: "2026-04-08T06:00:00.000Z", customerId: C1, userId: U2, category: "missing_item", description: "today resolved", status: "resolved", resolutionNote: "done", resolvedAt: "2026-04-08T10:00:00.000Z" },
    ],
  });

  const visits = createFakeVisitsRepository({
    people: PEOPLE,
    customers: CUSTOMERS,
    visits: [
      // Zone 1 at-risk (within 7 days): at_risk + lost.
      { id: "v-atrisk", createdAt: "2026-04-04T12:00:00.000Z", userId: U1, customerId: C1, outcome: "at_risk", visitType: "routine" },
      { id: "v-lost", createdAt: "2026-04-03T12:00:00.000Z", userId: U2, prospectName: "Walk-in Cafe", outcome: "lost", visitType: "new_pitch" },
      // Zone 1 commitments (> 24h ago, commitment_made true).
      { id: "v-commit", createdAt: "2026-04-06T12:00:00.000Z", userId: U1, customerId: C1, outcome: "positive", visitType: "routine", commitmentMade: true, commitmentDetail: "send samples" },
      // Zone 2 today visits: two by Hakan, one by Mert (within WINDOW).
      { id: "vt-1", createdAt: "2026-04-08T09:00:00.000Z", userId: U1, customerId: C1, outcome: "positive", visitType: "routine", pipelineStatus: "Won", notes: "good chat" },
      { id: "vt-2", createdAt: "2026-04-08T10:00:00.000Z", userId: U1, prospectName: "New Cafe", outcome: "at_risk", visitType: "new_pitch", pipelineStatus: "In Talks", notes: null },
      { id: "vt-3", createdAt: "2026-04-08T11:00:00.000Z", userId: U2, customerId: C1, outcome: "neutral", visitType: "routine", pipelineStatus: "Logged", notes: null },
    ],
  });

  const discrepancies = createFakeDiscrepanciesRepository({
    people: PEOPLE,
    customers: CUSTOMERS,
    products: {
      [P1]: { id: P1, name: "Lamb Mince", category: "meat" },
      [P2]: { id: P2, name: "Beef Mince", category: "meat" },
    },
    discrepancies: [
      // Today window — two on P1 (out_of_stock), one on P2 (supplier_short).
      { id: "d1", createdAt: "2026-04-08T07:00:00.000Z", userId: U1, customerId: C1, productId: P1, status: "short", reason: "out_of_stock", orderedQty: 10, sentQty: 7 },
      { id: "d2", createdAt: "2026-04-08T08:00:00.000Z", userId: U1, customerId: C1, productId: P1, status: "not_sent", reason: "out_of_stock", orderedQty: 5, sentQty: null },
      { id: "d3", createdAt: "2026-04-08T09:00:00.000Z", userId: U2, customerId: C1, productId: P2, status: "short", reason: "supplier_short", orderedQty: 8, sentQty: 4 },
    ],
  });

  return createDashboardService({
    complaints,
    visits,
    discrepancies,
    orders: ordersStub(opts?.orders ?? [order("placed"), order("printed"), order("printed"), order("completed")]),
    pricing: pricingStub(
      opts?.pricing ?? [
        agreement("active", null), // active ongoing
        agreement("active", "2026-12-31"), // active future → active
        agreement("active", "2026-01-01"), // active past → expired
        agreement("draft", null), // draft
        agreement("cancelled", null), // counted nowhere
      ],
    ),
  });
}

describe("DashboardService.load — frozen now, every total + 19-key set", () => {
  it("produces the exact 19 top-level keys", async () => {
    const svc = buildService();
    const payload = await svc.load({ now: NOW, window: WINDOW });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "openComplaints48h",
        "atRiskAccounts",
        "unreviewedCommitments",
        "discrepanciesToday",
        "complaintsTodayList",
        "visitsToday",
        "weekDiscrepancyReasons",
        "weekDiscrepancyProducts",
        "weekComplaintCategories",
        "weekVisitsByRep",
        "prospectsThisWeek",
        "hunterFarmer",
        "activePricing",
        "draftPricing",
        "expiredPricing",
        "ordersToday",
        "avgResolutionHours",
        "totalComplaintsWeek",
        "openComplaintsWeek",
      ].sort(),
    );
  });

  it("Zone 1: open>48h excludes the fresh open complaint, computes hoursAgo + spaced category", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    expect(payload.openComplaints48h.map((c) => c.id)).toEqual(["co-old"]);
    const row = payload.openComplaints48h[0];
    expect(row.category).toBe("weight");
    expect(row.customer).toBe("Acme Ltd");
    expect(row.loggedBy).toBe("Hakan");
    expect(row.hoursAgo).toBe(72); // 3 days
  });

  it("Zone 1: at-risk uses gte-only window, RAW outcome, customer fallback to prospect", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    // gte-only 7-day window catches v-atrisk, v-lost AND vt-2 (today's at_risk
    // visit) — they are all within 7 days, outcome IN (at_risk, lost).
    expect(payload.atRiskAccounts.map((r) => r.id).sort()).toEqual(
      ["v-atrisk", "v-lost", "vt-2"].sort(),
    );
    const lost = payload.atRiskAccounts.find((r) => r.id === "v-lost")!;
    expect(lost.outcome).toBe("lost"); // RAW
    expect(lost.customer).toBe("Walk-in Cafe"); // prospect fallback
    expect(lost.rep).toBe("Mert");
  });

  it("Zone 1: commitments — detail + rep + hoursAgo, fallback detail ''", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    expect(payload.unreviewedCommitments.map((r) => r.id)).toEqual(["v-commit"]);
    const c = payload.unreviewedCommitments[0];
    expect(c.detail).toBe("send samples");
    expect(c.rep).toBe("Hakan");
    expect(c.hoursAgo).toBe(48);
  });

  it("Zone 2: discrepanciesToday — spaced reason, qty pass-through, joins", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    expect(payload.discrepanciesToday.length).toBe(3);
    const d2 = payload.discrepanciesToday.find((d) => d.id === "d2")!;
    expect(d2.reason).toBe("out of stock"); // underscore→space
    expect(d2.orderedQty).toBe(5);
    expect(d2.sentQty).toBeNull();
    expect(d2.product).toBe("Lamb Mince");
    expect(d2.customer).toBe("Acme Ltd");
    expect(d2.loggedBy).toBe("Hakan");
    // newest first.
    expect(payload.discrepanciesToday[0].id).toBe("d3");
  });

  it("Zone 2: complaintsTodayList — spaced category, status, resolutionNote", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    // co-fresh (created at the window's from edge, 00:00:00Z) is in-window too.
    expect(payload.complaintsTodayList.map((c) => c.id).sort()).toEqual(
      ["co-fresh", "ct-open", "ct-res"].sort(),
    );
    const res = payload.complaintsTodayList.find((c) => c.id === "ct-res")!;
    expect(res.category).toBe("missing item"); // underscore→space
    expect(res.status).toBe("resolved");
    expect(res.resolutionNote).toBe("done");
    const open = payload.complaintsTodayList.find((c) => c.id === "ct-open")!;
    expect(open.resolutionNote).toBeNull();
  });

  it("Zone 2: visitsToday grouped by rep with outcome distribution + drill-down", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    const hakan = payload.visitsToday.find((r) => r.rep === "Hakan")!;
    const mert = payload.visitsToday.find((r) => r.rep === "Mert")!;
    expect(hakan.count).toBe(2);
    expect(hakan.outcomes).toEqual({ positive: 1, neutral: 0, at_risk: 1, lost: 0 });
    expect(mert.count).toBe(1);
    expect(mert.outcomes.neutral).toBe(1);
    // drill-down shape + transforms.
    const drill = hakan.visits.find((v) => v.id === "vt-2")!;
    expect(Object.keys(drill).sort()).toEqual(
      ["id", "customer", "visitType", "outcome", "pipelineStatus", "notes"].sort(),
    );
    expect(drill.customer).toBe("New Cafe"); // prospect fallback
    expect(drill.visitType).toBe("new pitch"); // underscore→space
    expect(drill.outcome).toBe("at_risk"); // RAW outcome in drill-down
    expect(drill.pipelineStatus).toBe("In Talks");
  });

  it("Zone 3: discrepancy reason rollup (sorted desc) + product top-5 slice", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    expect(payload.weekDiscrepancyReasons).toEqual([
      { reason: "out of stock", count: 2 },
      { reason: "supplier short", count: 1 },
    ]);
    expect(payload.weekDiscrepancyProducts).toEqual([
      { product: "Lamb Mince", count: 2 },
      { product: "Beef Mince", count: 1 },
    ]);
  });

  it("Zone 3: complaint category rollup + avgResolutionHours (ms>0 guard)", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    // Only the two within-window complaints are in the week rollup.
    const cats = Object.fromEntries(
      payload.weekComplaintCategories.map((c) => [c.category, c.count]),
    );
    // In-window complaints: ct-open (delivery), ct-res (missing_item),
    // co-fresh (quality, at the from edge).
    expect(cats).toEqual({ delivery: 1, "missing item": 1, quality: 1 });
    // ct-res resolved 06:00→10:00 = 4h (the only resolved row → avg = 4).
    expect(payload.avgResolutionHours).toBe(4);
    expect(payload.totalComplaintsWeek).toBe(3);
    expect(payload.openComplaintsWeek).toBe(2); // ct-open + co-fresh
  });

  it("avgResolutionHours is null when no complaint resolved", async () => {
    const svc = createDashboardService({
      complaints: createFakeComplaintsRepository({
        complaints: [
          { id: "x", createdAt: "2026-04-08T08:00:00.000Z", category: "weight", status: "open" },
        ],
      }),
      visits: createFakeVisitsRepository(),
      discrepancies: createFakeDiscrepanciesRepository(),
      orders: ordersStub([]),
      pricing: pricingStub([]),
    });
    const payload = await svc.load({ now: NOW, window: WINDOW });
    expect(payload.avgResolutionHours).toBeNull();
  });

  it("Zone 3: weekVisitsByRep totals + types map; hunterFarmer split", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    // weekVisits = listWeekForDashboard over WINDOW → only the 3 today visits.
    const hakan = payload.weekVisitsByRep.find((r) => r.rep === "Hakan")!;
    expect(hakan.total).toBe(2);
    expect(hakan.types).toEqual({
      routine: 1,
      new_pitch: 1,
      complaint_followup: 0,
      delivery_issue: 0,
    });
    // hunterFarmer: vt-1 (cust) + vt-3 (cust) existing; vt-2 (prospect).
    expect(payload.hunterFarmer).toEqual({ existing: 2, prospects: 1 });
  });

  it("Pricing snapshot: active/draft/expired via londonToday boundary", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    expect(payload.activePricing).toBe(2); // null + future
    expect(payload.draftPricing).toBe(1);
    expect(payload.expiredPricing).toBe(1); // active + past validUntil
  });

  it("Pricing boundary: validUntil == today is NOT expired (< not <=)", async () => {
    const svc = buildService({
      pricing: [agreement("active", TODAY_STR)],
    });
    const payload = await svc.load({ now: NOW, window: WINDOW });
    expect(payload.expiredPricing).toBe(0);
    expect(payload.activePricing).toBe(1);
  });

  it("ordersToday tally by state + total", async () => {
    const payload = await buildService().load({ now: NOW, window: WINDOW });
    expect(payload.ordersToday).toEqual({
      placed: 1,
      printed: 2,
      completed: 1,
      total: 4,
    });
  });

  it("does not read the clock itself (now is injected — deterministic)", async () => {
    // Two loads with the SAME frozen now must be identical.
    const a = await buildService().load({ now: NOW, window: WINDOW });
    const b = await buildService().load({ now: NOW, window: WINDOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
