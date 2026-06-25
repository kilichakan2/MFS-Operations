/**
 * tests/integration/haccpDocsLookupsRoutes.test.ts
 *
 * Integration tests for the F-19 PR9b Cluster F "docs & lookups" route re-point.
 * The 8 HACCP admin/lookup route files now call the three service singletons from
 * `@/lib/wiring/haccp` (`haccpHandbookService`, `haccpSuppliersService`,
 * `haccpLookupsService` — built + proved byte-identical in PR9a) instead of inline
 * `supabaseService.from(...)` / `.rpc(...)`. Each route is now a thin doorman:
 * role-check → parse params/body → ask the service → return.
 *
 * The intent is BYTE-IDENTICAL behaviour on the happy path. These tests drive the
 * LIVE HTTP routes on the booted dev server via `api()`, so they catch any
 * wiring/ordering mistake the re-point could introduce — the layer the PR9a unit
 * parity suites (tests/unit/services/Haccp{Handbook,Suppliers,Lookups}Service.test.ts)
 * cannot reach.
 *
 * The 8 routes:
 *   GET   /api/haccp/handbook          (warehouse|butcher|admin)  section/doc → entries
 *   GET   /api/haccp/search            (warehouse|butcher|admin)  q<2 → {results:[]}
 *   GET   /api/haccp/documents         (warehouse|butcher|admin)  BARE ARRAY (R-F-B1)
 *   GET   /api/haccp/users             (warehouse|butcher|admin)  admins-first sort
 *   GET   /api/haccp/customers         (warehouse|butcher|admin)  {customers} id+name
 *   GET   /api/haccp/supplier-code     (+driver)                  slice(0,4) fallback
 *   GET/POST/PATCH /api/haccp/recall   (GET any HACCP role; POST/PATCH admin-only)
 *   GET/POST/PATCH /api/haccp/admin/suppliers  (admin-only; POST → 201)
 *
 * R6 note: the sanctioned DB-error → HTTP 500 `{ error: 'Server error' }` delta is
 * exercised deterministically at the unit level (the PR9a adapters throw → route
 * catch). A clean DB-error injection is not feasible at the integration level
 * without corrupting the shared local schema, so here we prove the happy/validation
 * branches and the writes that an auditor relies on.
 *
 * Self-seeding: these tables ship no seed rows, so the suite plants its own
 * fixtures (an ANVIL-TEST supplier, an SOP entry, a document) and cleans them up.
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed). Run via
 * npm run test:integration (auto-boots the local-wired dev server).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  TEST_PREFIX,
  type TestUserSet,
} from "./_setup";

// Unique-ish fixtures so parallel/repeated runs don't collide on the name index.
const FIX_SUPPLIER = `${TEST_PREFIX}Cluster F Supplier`;
const FIX_SOP_REF = `${TEST_PREFIX}SOP-001`;
const FIX_SECTION = `${TEST_PREFIX}section`;
const FIX_DOC = `${TEST_PREFIX}HBDOC`;
const FIX_DOCUMENT_REF = `${TEST_PREFIX}DOC-001`;

describe("/api/haccp/* docs & lookups — F-19 PR9b byte-identical doorman re-point", () => {
  let users: TestUserSet;
  let admin: { role: string; userId: string; name: string };
  let warehouse: { role: string; userId: string; name: string };
  let supplierId: string;

  beforeAll(async () => {
    users = await setupTestUsers();
    admin = { role: "admin", userId: users.admin.id, name: users.admin.name };
    warehouse = {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    };
    await setupTestCustomer();

    const supa = getServiceClient();

    // Supplier fixture (supplier-code lookup + recall GET + admin list).
    const { data: existingSup } = await supa
      .from("haccp_suppliers")
      .select("id")
      .eq("name", FIX_SUPPLIER)
      .maybeSingle();
    if (existingSup) {
      supplierId = existingSup.id;
    } else {
      const { data, error } = await supa
        .from("haccp_suppliers")
        .insert({
          name: FIX_SUPPLIER,
          active: true,
          position: 999,
          label_code: "CFXX",
          contact_name: "Old Contact",
          categories: ["meat"],
        })
        .select("id")
        .single();
      if (error) throw new Error(`seed supplier: ${error.message}`);
      supplierId = data.id;
    }

    // SOP content fixture (handbook + search). section_key + source_doc carry the
    // fixture markers so handbook?section= and ?doc= both resolve our row.
    await supa
      .from("haccp_sop_content")
      .upsert(
        {
          sop_ref: FIX_SOP_REF,
          title: "Cluster F fixture SOP about steriliser cleaning",
          content_md: "Steriliser must reach 82C. Cluster F fixture content.",
          version: "V4.1",
          active: true,
          section_key: FIX_SECTION,
          source_doc: FIX_DOC,
        },
        { onConflict: "sop_ref" },
      );

    // Document register fixture (documents bare-array route).
    await supa.from("haccp_documents").upsert(
      {
        doc_ref: FIX_DOCUMENT_REF,
        title: "Cluster F fixture document",
        version: "1.0",
        category: "ZZ-fixture",
        description: "fixture",
        purpose: "fixture",
      },
      { onConflict: "doc_ref" },
    );
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    // Remove only the fixtures this suite planted; never touch real rows.
    await supa.from("haccp_suppliers").delete().eq("name", FIX_SUPPLIER);
    await supa.from("haccp_sop_content").delete().eq("sop_ref", FIX_SOP_REF);
    await supa.from("haccp_documents").delete().eq("doc_ref", FIX_DOCUMENT_REF);
    await supa.from("haccp_recall_config").delete().eq("updated_by", admin.userId);
  });

  // ── Role gates ──────────────────────────────────────────────────────────────

  it("the 6 HACCP-role read routes 401 for a disallowed role (sales)", async () => {
    const paths = [
      "/api/haccp/handbook?section=" + FIX_SECTION,
      "/api/haccp/search?q=ster",
      "/api/haccp/documents",
      "/api/haccp/users",
      "/api/haccp/customers",
    ];
    for (const path of paths) {
      const res = await api(path, {
        role: "sales",
        userId: users.sales.id,
        name: users.sales.name,
      });
      expect(res.status, path).toBe(401);
      expect((res.body as { error: string }).error).toBe("Unauthorised");
    }
  });

  it("supplier-code 401 for an out-of-allowlist role (office), 200 for driver", async () => {
    const denied = await api("/api/haccp/supplier-code?name=" + encodeURIComponent(FIX_SUPPLIER), {
      role: "office",
      userId: users.office.id,
      name: users.office.name,
    });
    expect(denied.status).toBe(401);

    const allowed = await api("/api/haccp/supplier-code?name=" + encodeURIComponent(FIX_SUPPLIER), {
      role: "driver",
      userId: users.driver.id,
      name: users.driver.name,
    });
    expect(allowed.status).toBe(200);
  });

  it("recall POST/PATCH + admin/suppliers GET/POST/PATCH 403 for a non-admin (warehouse)", async () => {
    const r1 = await api("/api/haccp/recall", {
      method: "POST",
      ...warehouse,
      body: { internal_team: [], regulatory: [], other_contacts: [] },
    });
    expect(r1.status).toBe(403);

    const r2 = await api("/api/haccp/recall", {
      method: "PATCH",
      ...warehouse,
      body: { id: supplierId, contact_name: "x" },
    });
    expect(r2.status).toBe(403);

    const r3 = await api("/api/haccp/admin/suppliers", { ...warehouse });
    expect(r3.status).toBe(403);
    expect((r3.body as { error: string }).error).toBe("Admin only");
  });

  // ── 1. handbook ───────────────────────────────────────────────────────────

  it("handbook neither section nor doc → 400 'Missing section or doc parameter'", async () => {
    const res = await api("/api/haccp/handbook", { ...warehouse });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Missing section or doc parameter",
    );
  });

  it("handbook ?section= → 200 { section, doc:null, entries } (key order)", async () => {
    const res = await api("/api/haccp/handbook?section=" + FIX_SECTION, {
      ...warehouse,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["section", "doc", "entries"]);
    expect(body.section).toBe(FIX_SECTION);
    expect(body.doc).toBeNull();
    expect(Array.isArray(body.entries)).toBe(true);
    expect((body.entries as { sop_ref: string }[]).some((e) => e.sop_ref === FIX_SOP_REF)).toBe(true);
  });

  it("handbook ?doc= → 200 { section:null, doc, entries }", async () => {
    const res = await api("/api/haccp/handbook?doc=" + FIX_DOC, { ...warehouse });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["section", "doc", "entries"]);
    expect(body.section).toBeNull();
    expect(body.doc).toBe(FIX_DOC);
  });

  // ── 2. search ─────────────────────────────────────────────────────────────

  it("search q<2 → 200 { results: [] }", async () => {
    const res = await api("/api/haccp/search?q=a", { ...warehouse });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [] });
  });

  it("search valid q → 200 { results, query } with the trimmed query echoed", async () => {
    const res = await api("/api/haccp/search?q=" + encodeURIComponent("  steriliser  "), {
      ...warehouse,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["results", "query"]);
    expect(body.query).toBe("steriliser");
    expect(Array.isArray(body.results)).toBe(true);
  });

  // ── 3. documents — R-F-B1 BARE ARRAY ──────────────────────────────────────

  it("documents → 200 BARE ARRAY (not { documents: [...] })", async () => {
    const res = await api("/api/haccp/documents", { ...warehouse });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const arr = res.body as { doc_ref: string }[];
    expect(arr.some((d) => d.doc_ref === FIX_DOCUMENT_REF)).toBe(true);
  });

  // ── 4. users — admins-first sort ──────────────────────────────────────────

  it("users → 200 { users } with admins first then name order", async () => {
    const res = await api("/api/haccp/users", { ...warehouse });
    expect(res.status).toBe(200);
    const body = res.body as { users: { role: string; name: string }[] };
    expect(Array.isArray(body.users)).toBe(true);
    // Admins-first invariant: no non-admin precedes any admin.
    let seenNonAdmin = false;
    for (const u of body.users) {
      if (u.role !== "admin") seenNonAdmin = true;
      else expect(seenNonAdmin, "an admin appeared after a non-admin").toBe(false);
    }
  });

  // ── 5. customers — HACCP lookups (R-F-D1), id+name, name order ─────────────

  it("customers → 200 { customers } id+name in name order", async () => {
    const res = await api("/api/haccp/customers", { ...warehouse });
    expect(res.status).toBe(200);
    const body = res.body as { customers: { id: string; name: string }[] };
    expect(Array.isArray(body.customers)).toBe(true);
    const names = body.customers.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
    // id+name only — no extra columns leak.
    if (body.customers.length) {
      expect(Object.keys(body.customers[0]).sort()).toEqual(["id", "name"]);
    }
  });

  // ── 6. supplier-code — DB match + slice fallback ──────────────────────────

  it("supplier-code missing name → 400 'name is required'", async () => {
    const res = await api("/api/haccp/supplier-code", { ...warehouse });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("name is required");
  });

  it("supplier-code matched name → DB label_code; unmatched → slice(0,4).toUpperCase()", async () => {
    const matched = await api(
      "/api/haccp/supplier-code?name=" + encodeURIComponent(FIX_SUPPLIER),
      { ...warehouse },
    );
    expect(matched.status).toBe(200);
    expect((matched.body as { label_code: string }).label_code).toBe("CFXX");

    const unmatched = await api(
      "/api/haccp/supplier-code?name=" + encodeURIComponent("zzqx unknown supplier"),
      { ...warehouse },
    );
    expect(unmatched.status).toBe(200);
    expect((unmatched.body as { label_code: string }).label_code).toBe("ZZQX");
  });

  // ── 7. recall — GET / POST / PATCH ────────────────────────────────────────

  it("recall GET → 200 { config, suppliers } (config null when no config row)", async () => {
    const res = await api("/api/haccp/recall", { ...warehouse });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["config", "suppliers"]);
    expect(Array.isArray(body.suppliers)).toBe(true);
  });

  it("recall POST non-array field → 400 'Invalid payload'", async () => {
    const res = await api("/api/haccp/recall", {
      method: "POST",
      ...admin,
      body: { internal_team: "nope", regulatory: [], other_contacts: [] },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid payload");
  });

  it("recall POST valid → 200 { config } persisted with updated_by/updated_at", async () => {
    const res = await api("/api/haccp/recall", {
      method: "POST",
      ...admin,
      body: {
        internal_team: [{ name: "Hakan", phone: "111" }],
        regulatory: [],
        other_contacts: [],
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { config: Record<string, unknown> };
    expect(body.config).toBeTruthy();
    expect(body.config.updated_by).toBe(admin.userId);
    expect(typeof body.config.updated_at).toBe("string");
    expect(body.config.internal_team).toEqual([{ name: "Hakan", phone: "111" }]);
  });

  it("recall PATCH missing id → 400 'Supplier ID required'", async () => {
    const res = await api("/api/haccp/recall", {
      method: "PATCH",
      ...admin,
      body: { contact_name: "x" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Supplier ID required");
  });

  it("recall PATCH valid → 200 { supplier } with contact fields trimmed-or-nulled", async () => {
    const res = await api("/api/haccp/recall", {
      method: "PATCH",
      ...admin,
      body: {
        id: supplierId,
        contact_name: "  New Name  ",
        contact_phone: "   ",
        contact_email: "a@b.com",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { supplier: Record<string, unknown> };
    expect(Object.keys(body.supplier).sort()).toEqual(
      ["contact_email", "contact_name", "contact_phone", "id", "name"].sort(),
    );
    expect(body.supplier.contact_name).toBe("New Name"); // trimmed
    expect(body.supplier.contact_phone).toBeNull(); // whitespace → null
    expect(body.supplier.contact_email).toBe("a@b.com");
  });

  // ── 8. admin/suppliers — GET / POST(201) / PATCH ──────────────────────────

  it("admin/suppliers GET → 200 { suppliers }", async () => {
    const res = await api("/api/haccp/admin/suppliers", { ...admin });
    expect(res.status).toBe(200);
    const body = res.body as { suppliers: { name: string }[] };
    expect(Array.isArray(body.suppliers)).toBe(true);
    expect(body.suppliers.some((s) => s.name === FIX_SUPPLIER)).toBe(true);
  });

  it("admin/suppliers POST missing name → 400 'Name is required'", async () => {
    const res = await api("/api/haccp/admin/suppliers", {
      method: "POST",
      ...admin,
      body: { name: "   " },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Name is required");
  });

  it("admin/suppliers POST valid → 201 { supplier } with position, label_code, defaults", async () => {
    const createdName = `${TEST_PREFIX}Cluster F Created`;
    const res = await api("/api/haccp/admin/suppliers", {
      method: "POST",
      ...admin,
      body: { name: createdName, label_code: "abcdefghij" },
    });
    expect(res.status).toBe(201);
    const body = res.body as { supplier: Record<string, unknown> };
    expect(body.supplier.name).toBe(createdName);
    expect(typeof body.supplier.position).toBe("number");
    // label_code trim→upper→slice(0,6).
    expect(body.supplier.label_code).toBe("ABCDEF");
    expect(body.supplier.active).toBe(true);
    expect(body.supplier.address).toBeNull();

    // cleanup the created row
    const supa = getServiceClient();
    await supa.from("haccp_suppliers").delete().eq("name", createdName);
  });

  it("admin/suppliers PATCH missing id → 400 'id required'", async () => {
    const res = await api("/api/haccp/admin/suppliers", {
      method: "PATCH",
      ...admin,
      body: { name: "x" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("id required");
  });

  it("admin/suppliers PATCH no whitelisted fields → 400 'No valid fields to update'", async () => {
    const res = await api("/api/haccp/admin/suppliers", {
      method: "PATCH",
      ...admin,
      body: { id: supplierId, bogus_field: "x" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("No valid fields to update");
  });

  it("admin/suppliers PATCH valid → 200 { supplier } with whitelisted field written", async () => {
    const res = await api("/api/haccp/admin/suppliers", {
      method: "PATCH",
      ...admin,
      body: { id: supplierId, notes: "patched by cluster-f test" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { supplier: Record<string, unknown> };
    expect(body.supplier.id).toBe(supplierId);
    expect(body.supplier.notes).toBe("patched by cluster-f test");
  });
});
