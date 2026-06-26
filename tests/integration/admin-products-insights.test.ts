/**
 * tests/integration/admin-products-insights.test.ts
 *
 * ANVIL F-20 PR2 — live-endpoint smoke for the 5 re-pointed admin routes,
 * against the REAL local Supabase stack + the REAL Next.js routes booted by
 * the integration runner. Proves the things the unit suite (mocked wiring)
 * cannot: the REAL Supabase adapters return data that the routes project into
 * BYTE-IDENTICAL wire shapes, and the one sanctioned behaviour change
 * (products/[id] PATCH missing-id → 404) fires off the real `maybeSingle`
 * null path.
 *
 *   GET   /api/admin/products        (bare array, 7 keys)
 *   PATCH /api/admin/products/[id]   (5-key subset; missing-id → 404)
 *   GET   /api/admin/prospects       ({ rows } — 7 camelCase keys)
 *   GET   /api/admin/at-risk         ({ rows })
 *   GET   /api/admin/commitments     ({ rows })
 *
 * AUTH NOTE (defence-in-depth, proven where each layer is reachable):
 *   /api/admin/* is admin-gated by the middleware prefix. A NON-admin (or
 *   unauthenticated) caller is 307-redirected BEFORE the handler runs, so the
 *   handler's own guards (products 403 'Admin only', insights 401
 *   'Unauthenticated') are NOT reachable through the real middleware stack —
 *   they are last-line-of-defence code, proven directly at the UNIT layer
 *   (admin-products.route.test.ts / admin-insights.routes.test.ts). Here we
 *   prove the END-TO-END block: a non-admin gets 307, an admin gets 200.
 *
 * R1 NOTE (the null-stage invariant):
 *   `visits.pipeline_status` is `NOT NULL DEFAULT 'Logged'` in the schema
 *   (baseline migration line 1324) — the DB physically REJECTS a NULL. So a
 *   seeded integration row can never carry a NULL pipeline_status, and the
 *   `stage: null` branch cannot be produced from real data. R1's defensive
 *   null→null mapping is therefore proven where a null CAN exist: at the
 *   mapper/route UNIT layer (VisitsRepository.test.ts:660 feeds a literal
 *   `pipeline_status: null` through the real `toProspectVisit` mapper;
 *   admin-insights.routes.test.ts:115 asserts the route emits stage:null).
 *   Here we prove the OTHER half: a non-null pipeline_status round-trips to a
 *   non-null `stage` (NOT swallowed), confirming the same code path is live.
 *
 * Self-seeding (mirrors visits.test.ts): rows are created via the service
 * client (RLS-bypass) and removed in afterAll. Lists return ALL rows, so
 * assertions locate the suite's own rows by id, never by length.
 *
 * Prereqs: npm run db:up (once) + the dev server the runner auto-boots.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  type TestUserSet,
} from "./_setup";

// ── Byte-identical wire key sets (the whole point of the PR) ────────────────
const PRODUCT_LIST_KEYS = [
  "id",
  "name",
  "category",
  "code",
  "box_size",
  "active",
  "created_at",
].sort();

const PRODUCT_PATCH_KEYS = [
  "id",
  "name",
  "category",
  "active",
  "created_at",
].sort();

const PROSPECT_ROW_KEYS = [
  "id",
  "name",
  "postcode",
  "outcome",
  "visitType",
  "rep",
  "stage",
].sort();

const AT_RISK_ROW_KEYS = [
  "id",
  "customer",
  "outcome",
  "rep",
  "hoursAgo",
  "reason",
].sort();

const COMMITMENT_ROW_KEYS = [
  "id",
  "customer",
  "detail",
  "rep",
  "hoursAgo",
  "status",
].sort();

const UNKNOWN_ID = "00000000-0000-0000-0000-0000000000fe";
const WIDE_FROM = new Date(Date.now() - 30 * 86_400_000).toISOString();
const WIDE_TO = new Date(Date.now() + 86_400_000).toISOString();

describe("/api/admin (products + insights) — F-20 PR2 re-point live smoke", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  const createdVisitIds = new Set<string>();
  let knownProductId = "";

  /** Seed a visit directly (service client → RLS-bypass). Returns the id. */
  async function seedVisit(opts: {
    ownerId: string;
    customerId?: string | null;
    prospectName?: string | null;
    prospectPostcode?: string | null;
    visitType?: string;
    outcome?: string;
    pipelineStatus?: string;
    commitmentMade?: boolean;
    commitmentDetail?: string | null;
    createdAt?: string;
  }): Promise<string> {
    const supa = getServiceClient();
    // visits_customer_check: EXACTLY one of customer_id / prospect_name.
    const usingProspect =
      opts.prospectName != null || opts.customerId == null;
    const { data, error } = await supa
      .from("visits")
      .insert({
        user_id: opts.ownerId,
        customer_id: usingProspect ? null : (opts.customerId ?? customer.id),
        prospect_name: usingProspect ? (opts.prospectName ?? "Seed Prospect") : null,
        prospect_postcode: usingProspect
          ? (opts.prospectPostcode ?? "SW1A 1AA")
          : null,
        visit_type: opts.visitType ?? "routine",
        outcome: opts.outcome ?? "positive",
        pipeline_status: opts.pipelineStatus ?? "Logged",
        commitment_made: opts.commitmentMade ?? false,
        commitment_detail: opts.commitmentMade
          ? (opts.commitmentDetail ?? "seed commitment detail")
          : null,
        ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(`seedVisit failed: ${error.message}`);
    createdVisitIds.add(data.id);
    return data.id;
  }

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();

    // A known product for the GET list + PATCH round-trip. Reuse if present.
    const supa = getServiceClient();
    const name = "ANVIL-TEST-product-f20pr2";
    const { data: existing } = await supa
      .from("products")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (existing) {
      knownProductId = existing.id;
    } else {
      const { data, error } = await supa
        .from("products")
        .insert({
          name,
          code: "ANVIL-F20-001",
          category: "TestCat",
          box_size: "10 kg",
          active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(`seed product failed: ${error.message}`);
      knownProductId = data.id;
    }
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    if (createdVisitIds.size) {
      await supa.from("visits").delete().in("id", [...createdVisitIds]);
    }
    createdVisitIds.clear();
    // Leave the product active (the round-trip restores it) — it's a reusable
    // idempotent fixture, like getTestProduct's.
  }, 30_000);

  // ── End-to-end middleware block: non-admin / unauthenticated → 307 ─────────

  it("non-admin and unauthenticated callers are 307'd from every admin route (middleware gate)", async () => {
    const paths = [
      "/api/admin/products",
      "/api/admin/prospects",
      "/api/admin/at-risk",
      "/api/admin/commitments",
    ];
    for (const path of paths) {
      // unauthenticated
      const anon = await api(path, { method: "GET" });
      expect(anon.status, `anon ${path}`).toBe(307);
      // authenticated non-admin (sales)
      const sales = await api(path, {
        method: "GET",
        role: "sales",
        userId: users.sales.id,
        name: users.sales.name,
      });
      expect(sales.status, `sales ${path}`).toBe(307);
    }
    // PATCH products/[id] too
    const anonPatch = await api(`/api/admin/products/${knownProductId}`, {
      method: "PATCH",
      body: { active: true },
    });
    expect(anonPatch.status, "anon PATCH").toBe(307);
    const salesPatch = await api(`/api/admin/products/${knownProductId}`, {
      method: "PATCH",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { active: true },
    });
    expect(salesPatch.status, "sales PATCH").toBe(307);
  });

  // ── GET /api/admin/products — bare array, exact 7 keys ─────────────────────

  it("GET /api/admin/products returns a BARE array of the exact 7 keys (admin, real adapter)", async () => {
    const res = await api("/api/admin/products", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(res.status).toBe(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body), "response is a BARE array, not { rows }").toBe(
      true,
    );
    expect(body.length).toBeGreaterThan(0);
    const known = body.find((r) => r.id === knownProductId);
    expect(known, "seeded product present in the list").toBeDefined();
    expect(Object.keys(known as Record<string, unknown>).sort()).toEqual(
      PRODUCT_LIST_KEYS,
    );
    // box_size is the wire key (NOT boxSize) — the toListRow map-back.
    expect(known).toHaveProperty("box_size");
    expect(known).not.toHaveProperty("boxSize");
    // name ASC ordering preserved.
    for (let i = 1; i < body.length; i++) {
      expect(
        String(body[i]!.name) >= String(body[i - 1]!.name),
        "products ordered name ASC",
      ).toBe(true);
    }
  });

  // ── PATCH /api/admin/products/[id] — 5-key subset + round-trip ─────────────

  it("PATCH /api/admin/products/[id] returns the exact 5-key SUBSET and round-trips active", async () => {
    // Flip active → false
    const off = await api(`/api/admin/products/${knownProductId}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { active: false },
    });
    expect(off.status).toBe(200);
    const offBody = off.body as Record<string, unknown>;
    expect(Object.keys(offBody).sort()).toEqual(PRODUCT_PATCH_KEYS);
    expect(offBody).not.toHaveProperty("code");
    expect(offBody).not.toHaveProperty("box_size");
    expect(offBody.id).toBe(knownProductId);
    expect(offBody.active).toBe(false);

    // Restore active → true
    const on = await api(`/api/admin/products/${knownProductId}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { active: true },
    });
    expect(on.status).toBe(200);
    expect((on.body as Record<string, unknown>).active).toBe(true);
  });

  it("PATCH /api/admin/products/[id] on a MISSING id → 404 (the one sanctioned change; real maybeSingle null path)", async () => {
    const res = await api(`/api/admin/products/${UNKNOWN_ID}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { active: false },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Product not found");
  });

  // ── GET /api/admin/prospects — { rows }, 7 camelCase keys, stage round-trip ─

  it("GET /api/admin/prospects returns { rows } with the exact 7 keys; a non-null pipeline_status round-trips to stage (R1 live half)", async () => {
    const id = await seedVisit({
      ownerId: users.sales.id,
      prospectName: "ANVIL Prospect Talks",
      prospectPostcode: "EC1A 1BB",
      outcome: "positive",
      visitType: "new_pitch",
      pipelineStatus: "In Talks",
    });
    const res = await api(
      `/api/admin/prospects?from=${WIDE_FROM}&to=${WIDE_TO}`,
      { role: "admin", userId: users.admin.id, name: users.admin.name },
    );
    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Record<string, unknown>[] }).rows;
    expect(Array.isArray(rows)).toBe(true);
    const row = rows.find((r) => r.id === id);
    expect(row, "seeded prospect present").toBeDefined();
    expect(Object.keys(row as Record<string, unknown>).sort()).toEqual(
      PROSPECT_ROW_KEYS,
    );
    // The non-null half of R1: a real (non-null) pipeline_status is NOT
    // swallowed — it surfaces on `stage`. (The null→null half is unit-proven;
    // the DB's NOT NULL constraint forbids a null row here.)
    expect(row!.stage).toBe("In Talks");
    // Enum prettify (underscore → space) preserved at the edge.
    expect(row!.visitType).toBe("new pitch");
    expect(row!.name).toBe("ANVIL Prospect Talks");
    expect(row!.rep).toBe(users.sales.name);
  });

  // ── GET /api/admin/at-risk — { rows }, exact keys ──────────────────────────

  it("GET /api/admin/at-risk returns { rows } with the exact keys (outcome IN at_risk/lost)", async () => {
    const id = await seedVisit({
      ownerId: users.sales.id,
      customerId: customer.id,
      outcome: "at_risk",
      visitType: "routine",
    });
    const res = await api(`/api/admin/at-risk?from=${WIDE_FROM}&to=${WIDE_TO}`, {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Record<string, unknown>[] }).rows;
    const row = rows.find((r) => r.id === id);
    expect(row, "seeded at-risk visit present").toBeDefined();
    expect(Object.keys(row as Record<string, unknown>).sort()).toEqual(
      AT_RISK_ROW_KEYS,
    );
    expect(row!.outcome).toBe("at_risk");
    expect(row!.customer).toBe(customer.name);
    expect(typeof row!.hoursAgo).toBe("number");
    expect(typeof row!.reason).toBe("string");
  });

  // ── GET /api/admin/commitments — { rows }, exact keys, lt(to) window ───────

  it("GET /api/admin/commitments returns { rows } with the exact keys (commitment_made=true, older than the window)", async () => {
    // Commitments window is `created_at < to`; seed a row safely in the past.
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const id = await seedVisit({
      ownerId: users.sales.id,
      customerId: customer.id,
      outcome: "positive",
      commitmentMade: true,
      commitmentDetail: "ANVIL will trial 5 boxes",
      createdAt: past,
    });
    // Explicit window so the seeded past row falls strictly before `to`.
    const to = new Date(Date.now() - 86_400_000).toISOString();
    const res = await api(
      `/api/admin/commitments?from=${WIDE_FROM}&to=${to}`,
      { role: "admin", userId: users.admin.id, name: users.admin.name },
    );
    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Record<string, unknown>[] }).rows;
    const row = rows.find((r) => r.id === id);
    expect(row, "seeded commitment present").toBeDefined();
    expect(Object.keys(row as Record<string, unknown>).sort()).toEqual(
      COMMITMENT_ROW_KEYS,
    );
    expect(row!.detail).toBe("ANVIL will trial 5 boxes");
    expect(row!.customer).toBe(customer.name);
    expect(typeof row!.hoursAgo).toBe("number");
    expect(typeof row!.status).toBe("string");
  });
});
