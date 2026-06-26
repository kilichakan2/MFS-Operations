/**
 * tests/integration/dashboardRoutes.test.ts
 *
 * F-21 — booted-server smoke for the TWO re-pointed admin routes:
 *   GET /api/dashboard            (→ DashboardService)
 *   GET /api/detail/discrepancy   (→ DiscrepanciesRepository.findDetailById)
 *
 * Runs against the globalSetup-booted dev server wired to LOCAL Supabase
 * (the shared api() helper signs an admin session cookie; middleware verifies
 * it and injects the x-mfs-user-id request header the routes guard on).
 *
 * What this proves end-to-end (the surfaces the unit + adapter layers can't):
 *   - /api/dashboard as admin → 200 with the EXACT 19-key payload shape the
 *     route emitted before the re-point (byte-identity smoke, not value-by-value
 *     — the unit suite freezes the clock and checks every total).
 *   - /api/detail/discrepancy as admin → 404 on a well-formed unknown id (the
 *     null→404 contract the re-point had to preserve).
 *   - /api/detail/discrepancy as admin → 200 with the EXACT 12-key detail object
 *     for a seeded discrepancy (joins resolved, reason underscore→space applied
 *     at the route, RAW reason mapped through the adapter).
 *
 * Auth note (verified against middleware.ts): the routes' OWN missing-header
 * 401 guard is UNREACHABLE through the booted server — middleware 307-redirects
 * an unauthenticated request to /login BEFORE the handler runs, and once a
 * request reaches the route the x-mfs-user-id header is always present. So the
 * end-to-end auth assertion here is the middleware 307 for a no-cookie request
 * (the real production behaviour); the route's literal 401 branch is covered by
 * the unit tests (tests/unit/api/dashboard.route.test.ts +
 * detail-discrepancy.route.test.ts).
 *
 * Prereqs:
 *   npm run db:up            (one terminal)
 *   npm run db:reset         (fresh seed)
 *   npm run test:integration -- dashboardRoutes   (another)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestCustomer,
  setupTestUsers,
  getTestProduct,
} from "./_setup";
import { INTEGRATION_BASE_URL } from "./_config";

// The 19 top-level keys GET /api/dashboard must emit (DashboardPayload).
const DASHBOARD_KEYS = [
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
];

// The 12 keys GET /api/detail/discrepancy must emit.
const DETAIL_KEYS = [
  "id",
  "createdAt",
  "status",
  "reason",
  "orderedQty",
  "sentQty",
  "unit",
  "note",
  "customer",
  "product",
  "category",
  "loggedBy",
];

const MISSING_ID = "00000000-0000-0000-0000-0000000000fe";
const RAW_REASON = "out_of_stock"; // adapter carries raw; route renders "out of stock"

let adminId = "";
let discrepancyId = "";
let customerId = "";

beforeAll(async () => {
  const supa = getServiceClient();
  const users = await setupTestUsers();
  const cust = await setupTestCustomer();
  const prod = await getTestProduct();
  adminId = users.admin.id;
  customerId = cust.id;

  // Dedicated discrepancy so the detail-route 200 case has a real row.
  await supa.from("discrepancies").delete().eq("customer_id", customerId);
  const { data, error } = await supa
    .from("discrepancies")
    .insert({
      created_at: new Date().toISOString(),
      user_id: adminId,
      customer_id: customerId,
      product_id: prod.id,
      ordered_qty: 12,
      sent_qty: 9,
      unit: "kg",
      status: "short",
      reason: RAW_REASON,
      note: "route smoke seed",
    })
    .select("id")
    .single();
  if (error) throw new Error(`seed discrepancy: ${error.message}`);
  discrepancyId = data.id as string;
}, 30_000);

afterAll(async () => {
  await getServiceClient()
    .from("discrepancies")
    .delete()
    .eq("customer_id", customerId);
});

describe("GET /api/dashboard (F-21 re-point smoke)", () => {
  it("no session cookie → middleware 307s to /login (route 401 guard is behind it)", async () => {
    const res = await fetch(`${INTEGRATION_BASE_URL}/api/dashboard`, {
      redirect: "manual",
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("/login");
  });

  it("non-admin session → middleware 307s (admin-only path)", async () => {
    const res = await api("/api/dashboard", {
      role: "warehouse",
      userId: adminId,
    });
    expect(res.status).toBe(307);
  });

  it("admin → 200 with the exact 19-key payload shape", async () => {
    const res = await api("/api/dashboard", { role: "admin", userId: adminId });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([...DASHBOARD_KEYS].sort());
    // Spot-check the array/object zones render real structures, not nulls.
    expect(Array.isArray(body.discrepanciesToday)).toBe(true);
    expect(Array.isArray(body.visitsToday)).toBe(true);
    expect(typeof body.hunterFarmer).toBe("object");
    expect(typeof body.ordersToday).toBe("object");
    // KPI numbers are numbers (no NaN / undefined leaking onto the wire).
    expect(Number.isNaN(body.activePricing as number)).toBe(false);
    expect(typeof body.totalComplaintsWeek).toBe("number");
  });

  it("admin with from/to window params → 200 (window plumbed through)", async () => {
    const from = "2026-04-01T00:00:00.000Z";
    const to = "2026-04-30T23:59:59.999Z";
    const res = await api(
      `/api/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { role: "admin", userId: adminId },
    );
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual(
      [...DASHBOARD_KEYS].sort(),
    );
  });
});

describe("GET /api/detail/discrepancy (F-21 re-point smoke)", () => {
  it("no session cookie → middleware 307s to /login", async () => {
    const res = await fetch(
      `${INTEGRATION_BASE_URL}/api/detail/discrepancy?id=${discrepancyId}`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("/login");
  });

  it("admin, missing id → 400 id required", async () => {
    const res = await api("/api/detail/discrepancy", {
      role: "admin",
      userId: adminId,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "id required" });
  });

  it("admin, unknown id → 404 Not found (null→404 contract preserved)", async () => {
    const res = await api(`/api/detail/discrepancy?id=${MISSING_ID}`, {
      role: "admin",
      userId: adminId,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("admin, known id → 200 with the exact 12-key detail + rendered reason", async () => {
    const res = await api(`/api/detail/discrepancy?id=${discrepancyId}`, {
      role: "admin",
      userId: adminId,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([...DETAIL_KEYS].sort());
    expect(body.id).toBe(discrepancyId);
    expect(body.status).toBe("short");
    // Route renders underscore→space; the adapter carried the RAW enum.
    expect(body.reason).toBe("out of stock");
    expect(body.orderedQty).toBe(12);
    expect(body.sentQty).toBe(9);
    expect(body.unit).toBe("kg");
    expect(typeof body.customer).toBe("string");
    expect(typeof body.product).toBe("string");
    expect(typeof body.loggedBy).toBe("string");
  });
});
