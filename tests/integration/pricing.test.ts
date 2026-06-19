/**
 * tests/integration/pricing.test.ts
 *
 * Integration tests for the 5 Pricing API endpoints after the F-15 PR2
 * re-point through `pricingService` + the `pricingActivationEmail` use-case.
 * Hits the running Next.js dev server with cookie-based auth (the `api()`
 * helper). These assert the wire shapes + status codes are byte-identical to
 * the pre-PR2 output: the snake_case key sets, computed is_expired/is_prospect/
 * is_freetext, 'Unknown' fallbacks, and the RBAC 403 paths.
 *
 * Each test seeds its own agreement via POST /api/pricing and removes it in
 * afterAll (cascade deletes its lines).
 *
 * Prereqs: npm run db:up (once) + the dev server the runner auto-boots.
 * Activation-email side-effect: with RESEND_API_KEY unset locally,
 * sendPricingEmail hits the first skip-guard, so the PATCH-activate test only
 * asserts the route's success body (recipient resolution is covered by the
 * unit use-case test).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  type TestUserSet,
} from "./_setup";

const AGREEMENT_KEYS = [
  "id",
  "reference_number",
  "status",
  "is_expired",
  "valid_from",
  "valid_until",
  "notes",
  "created_at",
  "updated_at",
  "customer_id",
  "customer_name",
  "is_prospect",
  "rep_id",
  "rep_name",
  "lines",
].sort();

const LINE_KEYS = [
  "id",
  "product_id",
  "product_name_override",
  "product_name",
  "box_size",
  "code",
  "price",
  "unit",
  "notes",
  "position",
  "is_freetext",
].sort();

describe("/api/pricing integration (F-15 PR2 re-point)", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  const createdIds = new Set<string>();

  async function createAgreement(
    over: Record<string, unknown> = {},
    asUserId?: string,
    asRole = "sales",
  ) {
    const res = await api("/api/pricing", {
      method: "POST",
      role: asRole,
      userId: asUserId ?? users.sales.id,
      body: {
        customer_id: customer.id,
        valid_from: "2026-06-01",
        valid_until: "2026-12-31",
        notes: "ANVIL-TEST agreement",
        lines: [
          { product_name_override: "ANVIL freetext A", price: 12.5, unit: "per_kg" },
          { product_name_override: "ANVIL freetext B", price: 9.9, unit: "per_box", notes: "note B" },
        ],
        ...over,
      },
    });
    if (res.status === 201) {
      createdIds.add((res.body as { id: string }).id);
    }
    return res;
  }

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();
  }, 30_000);

  afterAll(async () => {
    if (createdIds.size === 0) return;
    const supa = getServiceClient();
    await supa.from("price_agreements").delete().in("id", [...createdIds]);
    createdIds.clear();
  }, 30_000);

  // ── Auth gates ──────────────────────────────────────────────

  it("GET /api/pricing 401s for a disallowed role", async () => {
    const res = await api("/api/pricing", {
      method: "GET",
      role: "driver",
      userId: users.driver.id,
    });
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe("Unauthenticated");
  });

  // ── POST create ─────────────────────────────────────────────

  it("POST /api/pricing creates an agreement → 201 { id, reference_number }", async () => {
    const res = await createAgreement();
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["id", "reference_number"].sort());
    expect(typeof body.id).toBe("string");
    expect(String(body.reference_number)).toMatch(/^MFS-\d{4}-\d{4}$/);
  });

  it("POST 400s without customer_id or prospect_name", async () => {
    const res = await api("/api/pricing", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: { valid_from: "2026-06-01" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "customer_id or prospect_name required",
    );
  });

  it("POST 400s without valid_from", async () => {
    const res = await api("/api/pricing", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: { customer_id: customer.id },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("valid_from required");
  });

  // ── GET list ────────────────────────────────────────────────

  it("GET /api/pricing returns { agreements: [...] } with the exact wire keys", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;

    const res = await api("/api/pricing", {
      method: "GET",
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as { agreements: Record<string, unknown>[] };
    expect(Array.isArray(body.agreements)).toBe(true);
    const mine = body.agreements.find((a) => a.id === id);
    expect(mine).toBeDefined();
    expect(Object.keys(mine!).sort()).toEqual(AGREEMENT_KEYS);
    expect(mine!.is_prospect).toBe(false);
    expect(mine!.customer_name).toBe(customer.name);
    expect(mine!.status).toBe("draft");
    expect(mine!.is_expired).toBe(false);
    // The list endpoint carries each agreement's lines (position-sorted),
    // exactly like the pre-PR2 list route — the pricing list page reads the
    // per-card product count + detail view + PDF export from this object with
    // no re-fetch. Held to the same bar as the single-GET (B1 regression guard).
    const lines = mine!.lines as Record<string, unknown>[];
    expect(Array.isArray(lines)).toBe(true);
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(Object.keys(l).sort()).toEqual(LINE_KEYS);
    }
    // at least one line's key shape matches the wire DTO (sanity on values)
    expect(typeof lines[0]!.price).toBe("number");
    expect(typeof lines[0]!.is_freetext).toBe("boolean");
    expect(typeof lines[0]!.product_name).toBe("string");
  });

  // ── GET single ──────────────────────────────────────────────

  it("GET /api/pricing/[id] returns the full agreement with sorted lines", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;

    const res = await api(`/api/pricing/${id}`, {
      method: "GET",
      role: "sales",
      userId: users.sales.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(AGREEMENT_KEYS);
    expect(body.id).toBe(id);
    const lines = body.lines as Record<string, unknown>[];
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.position)).toEqual([0, 1]);
    // freetext lines: no product → is_freetext true, product_name = override
    expect(lines[0]!.is_freetext).toBe(true);
    expect(lines[0]!.product_name).toBe("ANVIL freetext A");
    expect(lines[0]!.box_size).toBeNull();
    expect(lines[0]!.code).toBeNull();
  });

  it("GET /api/pricing/[id] 404s for a missing id", async () => {
    const res = await api(
      "/api/pricing/00000000-0000-0000-0000-0000000000ff",
      { method: "GET", role: "admin", userId: users.admin.id },
    );
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Not found");
  });

  // ── PATCH ───────────────────────────────────────────────────

  it("PATCH /api/pricing/[id] returns { id, reference_number, status, updated_at }", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;

    const res = await api(`/api/pricing/${id}`, {
      method: "PATCH",
      role: "office",
      userId: users.office.id,
      body: { notes: "patched notes" },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["id", "reference_number", "status", "updated_at"].sort(),
    );
    expect(body.id).toBe(id);
  });

  it("PATCH activate (status=active) still returns success even with email disabled locally", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;

    const res = await api(`/api/pricing/${id}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { status: "active" },
    });
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("active");
  });

  it("PATCH 400s on an invalid status", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { status: "expired" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("Invalid status");
  });

  it("PATCH 403s when a sales user edits another rep's agreement", async () => {
    // owned by sales; another sales-role user (admin id is fine as a distinct
    // userId with role sales) attempts the edit
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}`, {
      method: "PATCH",
      role: "sales",
      userId: users.admin.id, // a different user id, still 'sales' role
      body: { notes: "hijack" },
    });
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe(
      "Not authorised to edit this agreement",
    );
  });

  // ── Lines: add / update / delete / replace ──────────────────

  it("POST /api/pricing/[id]/lines adds a line → 201 with the line wire shape", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}/lines`, {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: { product_name_override: "added line", price: 5, unit: "per_kg" },
    });
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(LINE_KEYS);
    expect(body.product_name).toBe("added line");
    expect(body.is_freetext).toBe(true);
    expect(body.position).toBe(2); // max existing (1) + 1
  });

  it("PATCH /api/pricing/lines/[lineId] updates a line", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const single = await api(`/api/pricing/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    const lineId = (
      (single.body as { lines: { id: string }[] }).lines[0]
    ).id;

    const res = await api(`/api/pricing/lines/${lineId}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { price: 20 },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(LINE_KEYS);
    expect(body.price).toBe(20);
  });

  it("PATCH /api/pricing/lines/[lineId] 400s on price <= 0", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const single = await api(`/api/pricing/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    const lineId = (single.body as { lines: { id: string }[] }).lines[0]!.id;
    const res = await api(`/api/pricing/lines/${lineId}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { price: 0 },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("price must be > 0");
  });

  it("DELETE /api/pricing/lines/[lineId] removes a line → { deleted: true }", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const single = await api(`/api/pricing/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    const lineId = (single.body as { lines: { id: string }[] }).lines[0]!.id;
    const res = await api(`/api/pricing/lines/${lineId}`, {
      method: "DELETE",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it("POST /api/pricing/[id]/lines/replace → { replaced: true, count }", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}/lines/replace`, {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: {
        lines: [
          { product_name_override: "replaced 1", price: 3, unit: "per_kg", position: 0 },
          { product_name_override: "replaced 2", price: 4, unit: "per_box", position: 1 },
          { product_name_override: "replaced 3", price: 5, unit: "per_kg", position: 2 },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ replaced: true, count: 3 });

    // verify the agreement now has exactly the 3 replaced lines
    const single = await api(`/api/pricing/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect((single.body as { lines: unknown[] }).lines).toHaveLength(3);
  });

  it("POST replace 400s on a line with price <= 0", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}/lines/replace`, {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { lines: [{ product_name_override: "bad", price: 0, unit: "per_kg", position: 0 }] },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Line 1: price must be > 0",
    );
  });

  // ── DELETE agreement ────────────────────────────────────────

  it("DELETE /api/pricing/[id] 403s for a sales user on a non-owned agreement", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}`, {
      method: "DELETE",
      role: "sales",
      userId: users.admin.id, // different user, sales role
    });
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe(
      "Only admins can delete active/cancelled agreements, or agreements not owned by you",
    );
  });

  it("DELETE /api/pricing/[id] 404s for a missing id", async () => {
    const res = await api(
      "/api/pricing/00000000-0000-0000-0000-0000000000fe",
      { method: "DELETE", role: "admin", userId: users.admin.id },
    );
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Not found");
  });

  it("DELETE /api/pricing/[id] removes an owned draft → { deleted: true }", async () => {
    const created = await createAgreement();
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}`, {
      method: "DELETE",
      role: "sales",
      userId: users.sales.id, // the owner
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    createdIds.delete(id); // already gone
  });

  // ── F-RLS-04d: RLS-cutover proofs (the per-caller authenticated flip) ──
  //
  // The pricing routes now reach the DB as the Postgres `authenticated` role so
  // the price_agreements / price_agreement_lines RLS policies fire. These pin
  // the headline must-fix: under the per-request authenticated client, a real
  // valid (non-admin) caller must still see/create/edit through the screens (no
  // blank lists), the app-layer "sales own only" RBAC must still bite, and the
  // FK-embedded rep name must still resolve via the users_directory_select
  // policy shipped in 04c. If any pricing SELECT policy were missing these would
  // silently go empty / null. (The replace route stays on service-role — its RPC
  // is authenticated-revoked by the T3 hardening — and is exercised above.)

  it("F-RLS-04d: a non-admin (sales) caller can create→list→view→add-line→edit-line under the authenticated cutover", async () => {
    // create as the sales owner (price_agreements_insert + lines insert)
    const created = await createAgreement({}, users.sales.id, "sales");
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    // list as the same sales caller — the agreement is visible (SELECT policy)
    const list = await api("/api/pricing", {
      method: "GET",
      role: "sales",
      userId: users.sales.id,
    });
    expect(list.status).toBe(200);
    const listed = (list.body as { agreements: Record<string, unknown>[] })
      .agreements.find((a) => a.id === id);
    expect(listed).toBeDefined();
    expect((listed!.lines as unknown[]).length).toBe(2);

    // view single as the sales caller (price_agreements_select + lines select)
    const single = await api(`/api/pricing/${id}`, {
      method: "GET",
      role: "sales",
      userId: users.sales.id,
    });
    expect(single.status).toBe(200);
    expect((single.body as { lines: unknown[] }).lines).toHaveLength(2);

    // add a line as the sales owner (price_agreement_lines_insert)
    const added = await api(`/api/pricing/${id}/lines`, {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: { product_name_override: "rls add", price: 7, unit: "per_kg" },
    });
    expect(added.status).toBe(201);
    const newLineId = (added.body as { id: string }).id;

    // edit that line in place as the sales owner (price_agreement_lines_UPDATE —
    // the divergence from routes; a missing UPDATE policy would silently no-op)
    const edited = await api(`/api/pricing/lines/${newLineId}`, {
      method: "PATCH",
      role: "sales",
      userId: users.sales.id,
      body: { price: 13 },
    });
    expect(edited.status).toBe(200);
    expect((edited.body as { price: number }).price).toBe(13);
  });

  it("F-RLS-04d: the sales-own-only RBAC still 403s a sales user on a peer's agreement (RBAC stayed in the app layer, not RLS)", async () => {
    // owned by sales; a DIFFERENT user with the sales role attempts the edit.
    const created = await createAgreement({}, users.sales.id, "sales");
    const id = (created.body as { id: string }).id;
    const res = await api(`/api/pricing/${id}`, {
      method: "PATCH",
      role: "sales",
      userId: users.admin.id, // distinct userId, still 'sales' role
      body: { notes: "hijack" },
    });
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe(
      "Not authorised to edit this agreement",
    );
  });

  it("F-RLS-04d (directory): rep_name is NON-BLANK for a non-admin caller (users_directory_select covers the pricing FK-embed)", async () => {
    // Agreement created by the SALES rep; read the list as a NON-ADMIN third
    // party (office). The rep name embeds through the users table's RLS — before
    // the users_directory_select policy a non-admin saw only their OWN users row,
    // so the FK-embed came back NULL (blank rep name in prod). With the directory
    // policy the name resolves under the authenticated cutover.
    const created = await createAgreement({}, users.sales.id, "sales");
    const id = (created.body as { id: string }).id;

    const res = await api("/api/pricing", {
      method: "GET",
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(200);
    const mine = (res.body as { agreements: Record<string, unknown>[] })
      .agreements.find((a) => a.id === id);
    expect(mine).toBeDefined();
    expect(mine!.rep_id).toBe(users.sales.id);
    // the resolved display name must be present and non-blank
    expect(typeof mine!.rep_name).toBe("string");
    expect((mine!.rep_name as string).length).toBeGreaterThan(0);
    expect(mine!.rep_name).toBe(users.sales.name);
  });
});
