/**
 * tests/integration/admin-context-rls.test.ts
 *
 * Integration tests for the F-RLS-04i admin-context RLS cutover. 15 admin
 * routes stopped using the RLS-bypassing service-role singleton and now run as
 * the per-request AUTHENTICATED caller (…ForCaller(userId) → minted DB token →
 * app.current_user_id GUC), so the pre-existing GUC RLS policies on customers /
 * products / audit_log / visits finally fire under the one key.
 *
 * These exercise the FULL real path end-to-end: a signed session cookie →
 * middleware verify → trusted x-mfs-user-id/role headers → requireRole →
 * …ForCaller(userId) → minted token → GUC → LIVE Postgres RLS. Nothing here is
 * mocked; the booted dev server talks to local Supabase.
 *
 * Matrix (ANVIL F-RLS-04i, Gate-3 approved):
 *   - per-route guards:   401 absent identity / 307 non-admin path-gate / 200 admin
 *   - R-VIS (HIGH):       an admin caller sees ANOTHER rep's rows (cross-rep),
 *                         NOT silently narrowed to own. Proven on /api/map/data
 *                         (visits layer) and /api/admin/customers + products.
 *   - R-AUDIT (MED):      the import-confirm ADMIN round-trip lands an audit_log
 *                         row authored as the caller (user_id = caller), and the
 *                         fire-and-forget geocode never blocks the 201.
 *   - R-SEC (MED):        a non-admin caller (valid identity, sales role) is
 *                         refused admin data by the path-gate (307) — cannot read
 *                         cross-rep rows.
 *
 * The /api/admin/visits cross-rep proof lives in visits.test.ts (F-RLS-04g);
 * this file adds the customers / products / map-data / import-audit surfaces.
 *
 * Self-seeding (like visits.test.ts): rows created via the service client
 * (RLS-bypass) and removed in afterAll. Admin lists return ALL rows, so
 * assertions locate this suite's own rows by id/name, never by length.
 *
 * Prereqs: npm run db:up (once) + the dev server the runner auto-boots.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  TEST_PREFIX,
  type TestUserSet,
} from "./_setup";

const ADMIN_CTX = "ANVIL-ADMINCTX-";

describe("admin-context RLS cutover integration — F-RLS-04i", () => {
  let users: TestUserSet;
  // A customer owned by a DIFFERENT rep (sales) so the admin cross-rep read has
  // a foreign row to find; a customer + product to prove the admin list paths.
  const repBCustomerName = `${ADMIN_CTX}repB-customer`;
  const adminProductCode = `${ADMIN_CTX}P1`;
  let repBCustomerId: string;
  let repBVisitId: string;
  let adminProductId: string;
  const createdCustomerIds = new Set<string>();
  const createdProductIds = new Set<string>();
  const createdVisitIds = new Set<string>();
  const createdAuditSummaries = new Set<string>();

  beforeAll(async () => {
    users = await setupTestUsers();
    const supa = getServiceClient();

    // A customer "created_by" the sales rep (a different rep than admin).
    // lat/lng set so it (and its visit) is plottable on the Map View — the map
    // reads filter out un-geocoded rows by design (you cannot draw a pin without
    // coordinates), so the cross-rep proof needs coords, not RLS narrowing.
    const { data: cust, error: cErr } = await supa
      .from("customers")
      .insert({
        name: repBCustomerName,
        active: true,
        postcode: "ZZ9 9ZZ",
        lat: 51.5072,
        lng: -0.1276,
        created_by: users.sales.id,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(`seed customer failed: ${cErr.message}`);
    repBCustomerId = cust.id;
    createdCustomerIds.add(cust.id);

    // A product (admin-only surface) to confirm the products list path.
    const { data: prod, error: pErr } = await supa
      .from("products")
      .insert({
        name: `${ADMIN_CTX}product`,
        code: adminProductCode,
        active: true,
        created_by: users.admin.id,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(`seed product failed: ${pErr.message}`);
    adminProductId = prod.id;
    createdProductIds.add(prod.id);

    // A visit OWNED BY the sales rep on that customer — the cross-rep row the
    // admin map read must surface (the R-VIS tripwire).
    const { data: visit, error: vErr } = await supa
      .from("visits")
      .insert({
        user_id: users.sales.id,
        customer_id: repBCustomerId,
        visit_type: "routine",
        outcome: "positive",
        notes: "admin-ctx cross-rep visit",
      })
      .select("id")
      .single();
    if (vErr) throw new Error(`seed visit failed: ${vErr.message}`);
    repBVisitId = visit.id;
    createdVisitIds.add(visit.id);
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    if (createdVisitIds.size)
      await supa.from("visits").delete().in("id", [...createdVisitIds]);
    if (createdCustomerIds.size)
      await supa.from("customers").delete().in("id", [...createdCustomerIds]);
    if (createdProductIds.size)
      await supa.from("products").delete().in("id", [...createdProductIds]);
    if (createdAuditSummaries.size)
      await supa
        .from("audit_log")
        .delete()
        .in("summary", [...createdAuditSummaries]);
  }, 30_000);

  // ── Per-route guards ─────────────────────────────────────────

  it("GET /api/admin/customers — absent identity is unauthenticated (no 200 data leak)", async () => {
    // No role/userId → no signed session → middleware 307s to /login.
    const res = await api("/api/admin/customers");
    expect([307, 401]).toContain(res.status);
    // Critically: NOT 200 with a customer array.
    expect(res.status).not.toBe(200);
  });

  it("GET /api/admin/customers — admin sees the list (200, cross-rep customer present)", async () => {
    const res = await api("/api/admin/customers", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ id: string; name: string }>;
    expect(Array.isArray(rows)).toBe(true);
    // R-VIS: the customer created_by the SALES rep is visible to ADMIN.
    const repBRow = rows.find((r) => r.id === repBCustomerId);
    expect(
      repBRow,
      "admin sees a customer created by another rep (cross-rep, not narrowed to own)",
    ).toBeDefined();
    // Byte-identical 7-field shape preserved.
    expect(Object.keys(repBRow as object)).toEqual([
      "id",
      "name",
      "postcode",
      "lat",
      "lng",
      "active",
      "created_at",
    ]);
  });

  it("GET /api/admin/customers — non-admin (sales) is path-gated (307), no cross-rep leak", async () => {
    // R-SEC: a valid non-admin identity is redirected by the /api/admin/* gate
    // BEFORE the handler runs — it never reaches the all-rows list.
    const res = await api("/api/admin/customers", {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(307);
  });

  it("GET /api/admin/products — admin sees the list (200, seeded product present, shape intact)", async () => {
    const res = await api("/api/admin/products", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ id: string; code: string }>;
    expect(Array.isArray(rows)).toBe(true);
    const seeded = rows.find((r) => r.id === adminProductId);
    expect(seeded, "admin sees the seeded product (RLS presence policy)").toBeDefined();
    expect(Object.keys(seeded as object)).toEqual([
      "id",
      "name",
      "category",
      "code",
      "box_size",
      "active",
      "created_at",
    ]);
  });

  it("GET /api/admin/products — non-admin (sales) is path-gated (307)", async () => {
    const res = await api("/api/admin/products", {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(307);
  });

  // ── R-VIS: cross-rep visibility on /api/map/data (the headline risk) ──

  it("GET /api/map/data?layer=visits — admin sees ANOTHER rep's visit (cross-rep, not empty)", async () => {
    const res = await api("/api/map/data?layer=visits", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(res.status).toBe(200);
    const body = res.body as { visits: Array<{ id: string }> };
    expect(Array.isArray(body.visits)).toBe(true);
    const crossRep = body.visits.find((v) => v.id === repBVisitId);
    expect(
      crossRep,
      "admin map sees a visit owned by another rep — R-VIS proven at the integration layer",
    ).toBeDefined();
  });

  it("GET /api/map/data?layer=customers — admin sees the cross-rep customer", async () => {
    const res = await api("/api/map/data?layer=customers", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(res.status).toBe(200);
    const body = res.body as { customers: Array<{ id: string }> };
    expect(Array.isArray(body.customers)).toBe(true);
    // The cross-rep customer has a postcode set; whether geocoded or not it is a
    // customer row the admin must be able to enumerate (RLS presence policy).
    const crossRep = body.customers.find((c) => c.id === repBCustomerId);
    expect(
      crossRep,
      "admin map customers includes a customer created by another rep",
    ).toBeDefined();
  });

  it("GET /api/map/data — non-admin (sales) is path-gated (307), no map data leak", async () => {
    const res = await api("/api/map/data?layer=all", {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(307);
  });

  // ── R-AUDIT: import-confirm round-trip lands an audit row authored as caller ──

  it("POST /api/admin/import/confirm — admin import lands an audit_log row with user_id=caller (201, geocode non-blocking)", async () => {
    const supa = getServiceClient();
    const uniqueName = `${ADMIN_CTX}imported-cust-${Date.now()}`;

    const res = await api("/api/admin/import/confirm", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: {
        type: "customers",
        rows: [{ name: uniqueName, postcode: "EC1A 1BB" }],
      },
    });

    // The import succeeds with 201 even though geocode is fire-and-forget.
    expect(res.status).toBe(201);
    const result = res.body as { inserted: number; skipped: number };
    expect(result.inserted).toBe(1);

    // Track the new customer for cleanup.
    const { data: newCust } = await supa
      .from("customers")
      .select("id")
      .eq("name", uniqueName)
      .maybeSingle();
    if (newCust) createdCustomerIds.add(newCust.id);

    // R-AUDIT: an audit_log row was written, authored as the ADMIN caller
    // (the WITH CHECK user_id = GUC policy passed BECAUSE the row's user_id
    // equals the caller — a forged author would have thrown 42501).
    const { data: auditRows, error: auditErr } = await supa
      .from("audit_log")
      .select("user_id, screen, action, summary")
      .eq("screen", "screen5")
      .eq("action", "imported")
      .order("created_at", { ascending: false })
      .limit(10);
    expect(auditErr).toBeNull();
    const ours = (auditRows ?? []).find(
      (r) => r.user_id === users.admin.id && /imported via AI import/.test(r.summary),
    );
    expect(
      ours,
      "an audit_log row authored as the admin caller landed (user_id = caller)",
    ).toBeDefined();
    if (ours?.summary) createdAuditSummaries.add(ours.summary);
  });

  it("POST /api/admin/import/confirm — non-admin (sales) is path-gated (307), no import", async () => {
    const res = await api("/api/admin/import/confirm", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { type: "customers", rows: [{ name: `${ADMIN_CTX}should-not-insert` }] },
    });
    expect(res.status).toBe(307);

    // Belt-and-braces: confirm nothing was inserted under that name.
    const supa = getServiceClient();
    const { data } = await supa
      .from("customers")
      .select("id")
      .eq("name", `${ADMIN_CTX}should-not-insert`)
      .maybeSingle();
    expect(data, "non-admin import inserted no customer").toBeNull();
  });

  // ── Sanity: the test prefix used by setupTestUsers is intact ──
  it("uses the shared TEST_PREFIX users (no orphaned fixtures)", () => {
    expect(users.admin.name.startsWith(TEST_PREFIX)).toBe(true);
    expect(users.sales.name.startsWith(TEST_PREFIX)).toBe(true);
  });
});
