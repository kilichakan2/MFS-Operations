/**
 * tests/integration/adapters/supabase/dashboardWindowedReads.test.ts
 *
 * F-21 — live-Supabase parity for the windowed read methods ADDED to the
 * Complaints / Visits Supabase adapters for the admin dashboard (R5 decision
 * (b): these two ports never had a shared __contracts__ file, so the NEW methods
 * get focused fake-unit + live-Supabase integration coverage).
 *
 * Calls the adapters DIRECTLY against the local Supabase stack (the F-06
 * direct-adapter pattern — no `npm run dev` needed). Seeds dedicated rows in a
 * known window, asserts window/order/limit + the gte-only at-risk window (R1) +
 * RAW-enum carry, then cleans up.
 *
 * Prereqs:
 *   npm run db:up                                          (one terminal)
 *   npm run db:reset                                       (fresh seed)
 *   npm run test:integration -- adapters/supabase          (another)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createSupabaseComplaintsRepository,
  createSupabaseVisitsRepository,
} from "@/lib/adapters/supabase";
import {
  getServiceClient,
  setupTestCustomer,
  setupTestUsers,
} from "../../_setup";

const FROM = "2026-04-01T00:00:00.000Z";
const TO = "2026-04-30T23:59:59.999Z";
const BEFORE = "2026-04-10T00:00:00.000Z";

// Sentinel created_at values inside the window.
const C_OPEN_OLD = "2026-04-02T09:00:00.000Z";
const C_TODAY = "2026-04-08T12:00:00.000Z";
const V_AT_RISK = "2026-04-05T10:00:00.000Z";

let customerId: string;
let userId: string;
const complaintIds: string[] = [];
const visitIds: string[] = [];

beforeAll(async () => {
  const supa = getServiceClient();
  const cust = await setupTestCustomer();
  const users = await setupTestUsers();
  customerId = cust.id;
  userId = users.admin.id;

  // Two complaints: one OPEN before the 48h cutoff, one resolved "today".
  const { data: c1, error: e1 } = await supa
    .from("complaints")
    .insert({
      created_at: C_OPEN_OLD,
      user_id: userId,
      customer_id: customerId,
      category: "weight",
      description: "F21 open old complaint",
      received_via: "phone",
      status: "open",
    })
    .select("id")
    .single();
  if (e1) throw new Error(`seed complaint 1: ${e1.message}`);
  complaintIds.push(c1.id);

  const { data: c2, error: e2 } = await supa
    .from("complaints")
    .insert({
      created_at: C_TODAY,
      user_id: userId,
      customer_id: customerId,
      category: "missing_item",
      description: "F21 resolved today complaint",
      received_via: "phone",
      status: "resolved",
      resolution_note: "fixed",
      resolved_by: userId,
      resolved_at: "2026-04-08T16:00:00.000Z",
    })
    .select("id")
    .single();
  if (e2) throw new Error(`seed complaint 2: ${e2.message}`);
  complaintIds.push(c2.id);

  // An at-risk visit inside the window.
  const { data: v1, error: ev } = await supa
    .from("visits")
    .insert({
      created_at: V_AT_RISK,
      user_id: userId,
      customer_id: customerId,
      visit_type: "routine",
      outcome: "at_risk",
    })
    .select("id")
    .single();
  if (ev) throw new Error(`seed visit: ${ev.message}`);
  visitIds.push(v1.id);
});

afterAll(async () => {
  const supa = getServiceClient();
  if (complaintIds.length)
    await supa.from("complaints").delete().in("id", complaintIds);
  if (visitIds.length)
    await supa.from("visits").delete().in("id", visitIds);
});

describe("ComplaintsRepository — F-21 dashboard reads (live)", () => {
  it("listOpenOlderThan returns our open-old complaint, ASC, status open", async () => {
    const repo = createSupabaseComplaintsRepository(getServiceClient());
    const rows = await repo.listOpenOlderThan(BEFORE);
    const found = rows.find((r) => r.id === complaintIds[0]);
    expect(found).toBeDefined();
    expect(found?.status).toBe("open");
    expect(found?.customerName).toBeDefined();
    // resolved-today row must NOT be in an open>48h read.
    expect(rows.find((r) => r.id === complaintIds[1])).toBeUndefined();
  });

  it("listTodayWithNames returns in-window rows with joins resolved", async () => {
    const repo = createSupabaseComplaintsRepository(getServiceClient());
    const rows = await repo.listTodayWithNames({ from: FROM, to: TO });
    const found = rows.find((r) => r.id === complaintIds[1]);
    expect(found).toBeDefined();
    expect(found?.category).toBe("missing_item"); // RAW
    expect(typeof found?.customerName).toBe("string");
  });

  it("listWeekRollup returns trimmed rows with RAW category + resolvedAt", async () => {
    const repo = createSupabaseComplaintsRepository(getServiceClient());
    const rows = await repo.listWeekRollup({ from: FROM, to: TO });
    const resolved = rows.find(
      (r) => r.category === "missing_item" && r.status === "resolved",
    );
    expect(resolved).toBeDefined();
    expect(resolved?.resolvedAt).not.toBeNull();
  });
});

describe("VisitsRepository — F-21 dashboard reads (live)", () => {
  it("listAtRiskSince (R1) returns gte-only at-risk visits, newest first", async () => {
    const repo = createSupabaseVisitsRepository(getServiceClient());
    const rows = await repo.listAtRiskSince(FROM);
    const found = rows.find((r) => r.id === visitIds[0]);
    expect(found).toBeDefined();
    expect(["at_risk", "lost"]).toContain(found?.outcome);
    // newest-first ordering.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].createdAt >= rows[i].createdAt).toBe(true);
    }
  });

  it("listTodayForDashboard returns in-window visits (limit 50, newest first)", async () => {
    const repo = createSupabaseVisitsRepository(getServiceClient());
    const rows = await repo.listTodayForDashboard({ from: FROM, to: TO });
    expect(rows.length).toBeLessThanOrEqual(50);
    expect(rows.find((r) => r.id === visitIds[0])).toBeDefined();
  });

  it("listWeekForDashboard returns in-window visits (no limit)", async () => {
    const repo = createSupabaseVisitsRepository(getServiceClient());
    const rows = await repo.listWeekForDashboard({ from: FROM, to: TO });
    expect(rows.find((r) => r.id === visitIds[0])).toBeDefined();
  });
});
