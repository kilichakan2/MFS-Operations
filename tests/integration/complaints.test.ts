/**
 * tests/integration/complaints.test.ts
 *
 * Integration tests for the 8 complaint/compliment API endpoints after the
 * F-17 PR2 re-point through complaintsService / complimentsService. Hits the
 * running Next.js dev server with cookie-based auth (the api() helper →
 * x-mfs-* headers via the middleware). These assert the wire shapes are
 * byte-identical to the pre-PR2 output: the key SETS + ORDER (the byte-identity
 * tripwire), exact status codes, and the carry-forward branches:
 *   - W1: screen2/sync duplicate-replay → 200 { id, duplicate: true } (NOT 500),
 *     proving supabase-js surfaces the unique-violation through the adapter.
 *   - G1: detail/complaint prettifies BOTH category and received_via at the edge.
 *   - the two screen2 GETs return a BARE ARRAY (not a { complaints } wrapper).
 *   - resolve / note not-found 404s; the 401-unauthenticated path on every route.
 *
 * Self-seeding (like tests/integration/cash.test.ts): every row is created via
 * the service client and removed in afterAll. The screen2 list GETs return ALL
 * complaints, so assertions locate the suite's own rows by id rather than
 * asserting array length.
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

const COMPLIMENT_KEYS = [
  "id",
  "body",
  "created_at",
  "posted_by_id",
  "posted_by_name",
  "recipient_id",
  "recipient_name",
];

const RECIPIENT_KEYS = ["id", "name", "role"];

const ALL_ITEM_KEYS = [
  "id",
  "createdAt",
  "category",
  "description",
  "status",
  "resolutionNote",
  "resolvedAt",
  "customer",
  "loggedBy",
  "resolvedBy",
  "notes",
];

const NOTE_KEYS = ["id", "body", "author", "createdAt"];

const OPEN_ITEM_KEYS = [
  "id",
  "createdAt",
  "category",
  "description",
  "customer",
  "loggedBy",
];

const DETAIL_KEYS = [
  "id",
  "createdAt",
  "category",
  "description",
  "receivedVia",
  "status",
  "resolutionNote",
  "resolvedAt",
  "customer",
  "loggedBy",
  "resolvedBy",
];

// A fixed UUID space for the suite's client-supplied complaint ids so the W1
// duplicate-replay is deterministic and cleanup is targeted.
const SYNC_ID = "11111111-2222-4333-8444-555555550001";

describe("/api/complaints + /api/compliments integration (F-17 PR2 re-point)", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  const createdComplaintIds = new Set<string>();
  const createdComplimentIds = new Set<string>();

  // Seed a complaint row directly (bypassing the route) so the read routes have
  // a known row to find. Returns the new id.
  async function seedComplaint(opts: {
    category?: string;
    receivedVia?: string;
    description?: string;
    status?: "open" | "resolved";
    ownerId?: string;
  } = {}): Promise<string> {
    const supa = getServiceClient();
    const resolved = opts.status === "resolved";
    const ownerId = opts.ownerId ?? users.office.id;
    const { data, error } = await supa
      .from("complaints")
      .insert({
        customer_id: customer.id,
        category: opts.category ?? "quality",
        description: opts.description ?? "seed complaint description",
        received_via: opts.receivedVia ?? "phone",
        user_id: ownerId,
        status: opts.status ?? "open",
        resolution_note: resolved ? "seed resolution" : null,
        resolved_by: resolved ? ownerId : null,
        resolved_at: resolved ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`seedComplaint failed: ${error.message}`);
    createdComplaintIds.add(data.id);
    return data.id;
  }

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    if (createdComplaintIds.size) {
      // complaint_notes cascade off complaint_id (ON DELETE CASCADE); audit_log
      // rows reference record_id by value (no FK) — leave them (test noise only).
      await supa
        .from("complaints")
        .delete()
        .in("id", [...createdComplaintIds]);
    }
    if (createdComplimentIds.size) {
      await supa
        .from("compliments")
        .delete()
        .in("id", [...createdComplimentIds]);
    }
    // also drop any sync-id complaint that may have been created via the route
    await supa.from("complaints").delete().eq("id", SYNC_ID);
    createdComplaintIds.clear();
    createdComplimentIds.clear();
  }, 30_000);

  // ── 401 unauthenticated path on every route (no cookie → middleware 307) ──

  it("every route redirects (307) without a session (middleware gate)", async () => {
    const paths: Array<[string, "GET" | "POST"]> = [
      ["/api/compliments", "GET"],
      ["/api/compliments", "POST"],
      ["/api/compliments/users", "GET"],
      ["/api/screen2/all", "GET"],
      ["/api/screen2/open", "GET"],
      ["/api/screen2/sync", "POST"],
      ["/api/screen2/resolve", "POST"],
      ["/api/screen2/note", "POST"],
      ["/api/detail/complaint?id=x", "GET"],
    ];
    for (const [path, method] of paths) {
      const res = await api(path, { method });
      expect(res.status, `${method} ${path}`).toBe(307);
    }
  });

  // ── compliments GET / POST (snake_case) ─────────────────────

  it("POST /api/compliments → 201 { compliment } snake_case key SET + ORDER; GET lists it", async () => {
    const post = await api("/api/compliments", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: { body: "Great teamwork today", recipient_id: users.admin.id },
    });
    expect(post.status).toBe(201);
    const compliment = (post.body as { compliment: Record<string, unknown> })
      .compliment;
    expect(Object.keys(compliment)).toEqual(COMPLIMENT_KEYS);
    expect(compliment.body).toBe("Great teamwork today");
    expect(compliment.posted_by_id).toBe(users.office.id);
    expect(compliment.posted_by_name).toBe(users.office.name);
    expect(compliment.recipient_id).toBe(users.admin.id);
    expect(compliment.recipient_name).toBe(users.admin.name);
    createdComplimentIds.add(compliment.id as string);

    const get = await api("/api/compliments", {
      role: "office",
      userId: users.office.id,
    });
    expect(get.status).toBe(200);
    const list = (get.body as { compliments: Record<string, unknown>[] })
      .compliments;
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((c) => c.id === compliment.id);
    expect(found).toBeDefined();
    expect(Object.keys(found as Record<string, unknown>)).toEqual(
      COMPLIMENT_KEYS,
    );
  });

  it("POST /api/compliments with no recipient → recipient_id/name null (adapter defaults pass through)", async () => {
    const post = await api("/api/compliments", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: { body: "Whole-team shoutout" },
    });
    expect(post.status).toBe(201);
    const compliment = (post.body as { compliment: Record<string, unknown> })
      .compliment;
    expect(Object.keys(compliment)).toEqual(COMPLIMENT_KEYS);
    expect(compliment.recipient_id).toBe(null);
    expect(compliment.recipient_name).toBe(null);
    expect(compliment.posted_by_name).toBe(users.office.name);
    createdComplimentIds.add(compliment.id as string);
  });

  it("POST /api/compliments 400 'body required' on a blank body", async () => {
    const res = await api("/api/compliments", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: { body: "   " },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("body required");
  });

  // ── compliments/users GET ───────────────────────────────────

  it("GET /api/compliments/users → { users: [{id,name,role}] } key SET + ORDER", async () => {
    const res = await api("/api/compliments/users", {
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(200);
    const list = (res.body as { users: Record<string, unknown>[] }).users;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(Object.keys(list[0])).toEqual(RECIPIENT_KEYS);
    // our test users are active → present
    expect(list.some((u) => u.id === users.office.id)).toBe(true);
  });

  // ── screen2/all GET (bare array, camelCase, category prettified) ──

  it("GET /api/screen2/all → BARE ARRAY; item key SET + ORDER; category prettified; notes nested", async () => {
    const id = await seedComplaint({
      category: "missing_item",
      status: "open",
    });
    const res = await api("/api/screen2/all", {
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true); // bare array, NOT { complaints }
    const arr = res.body as Record<string, unknown>[];
    const found = arr.find((c) => c.id === id);
    expect(found).toBeDefined();
    expect(Object.keys(found as Record<string, unknown>)).toEqual(ALL_ITEM_KEYS);
    expect(found!.category).toBe("missing item"); // prettified at the edge
    expect(found!.customer).toBe(customer.name);
    expect(Array.isArray(found!.notes)).toBe(true);
  });

  it("GET /api/screen2/all nests a note with the note key SET + ORDER", async () => {
    const id = await seedComplaint({ status: "open" });
    // add a note via the (already re-pointed) note route
    const note = await api("/api/screen2/note", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: { complaint_id: id, body: "internal note for all-list" },
    });
    expect(note.status).toBe(201);

    const res = await api("/api/screen2/all", {
      role: "office",
      userId: users.office.id,
    });
    const arr = res.body as Record<string, unknown>[];
    const found = arr.find((c) => c.id === id) as Record<string, unknown>;
    const notes = found.notes as Record<string, unknown>[];
    expect(notes.length).toBeGreaterThan(0);
    expect(Object.keys(notes[0])).toEqual(NOTE_KEYS);
    expect(notes[0].author).toBe(users.office.name);
  });

  // ── screen2/open GET (bare array, trimmed shape, category prettified) ──

  it("GET /api/screen2/open → BARE ARRAY; trimmed item key SET + ORDER; category prettified; only open", async () => {
    const openId = await seedComplaint({
      category: "missing_item",
      status: "open",
    });
    const resolvedId = await seedComplaint({ status: "resolved" });

    const res = await api("/api/screen2/open", {
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const arr = res.body as Record<string, unknown>[];
    const found = arr.find((c) => c.id === openId);
    expect(found).toBeDefined();
    expect(Object.keys(found as Record<string, unknown>)).toEqual(OPEN_ITEM_KEYS);
    expect(found!.category).toBe("missing item");
    // a resolved complaint must NOT appear in the open list
    expect(arr.find((c) => c.id === resolvedId)).toBeUndefined();
  });

  // ── detail/complaint GET (G1: BOTH prettifies; key order) ──

  it("GET /api/detail/complaint → key SET + ORDER; G1 both category AND receivedVia prettified", async () => {
    const id = await seedComplaint({
      category: "missing_item",
      receivedVia: "in_person",
      status: "open",
    });
    const res = await api(`/api/detail/complaint?id=${id}`, {
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(DETAIL_KEYS); // exact order (key-order caution §5)
    expect(body.category).toBe("missing item"); // G1 prettify #1
    expect(body.receivedVia).toBe("in person"); // G1 prettify #2
    expect(body.customer).toBe(customer.name);
    expect(body.loggedBy).toBe(users.office.name);
  });

  it("GET /api/detail/complaint 404 on an unknown id", async () => {
    const res = await api(
      "/api/detail/complaint?id=00000000-0000-0000-0000-000000000000",
      { role: "office", userId: users.office.id },
    );
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Not found");
  });

  // ── screen2/note POST ───────────────────────────────────────

  it("POST /api/screen2/note → 201 { id, body, author, createdAt } key SET + ORDER", async () => {
    const id = await seedComplaint({ status: "open" });
    const res = await api("/api/screen2/note", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: { complaint_id: id, body: "chased the supplier" },
    });
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(NOTE_KEYS);
    expect(body.body).toBe("chased the supplier");
    expect(body.author).toBe(users.office.name);
  });

  it("POST /api/screen2/note 404 'Complaint not found' on an unknown complaint", async () => {
    const res = await api("/api/screen2/note", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: {
        complaint_id: "00000000-0000-0000-0000-000000000000",
        body: "note on a ghost",
      },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Complaint not found");
  });

  it("POST /api/screen2/note 400 'body required' on a blank note", async () => {
    const id = await seedComplaint({ status: "open" });
    const res = await api("/api/screen2/note", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: { complaint_id: id, body: "   " },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("body required");
  });

  // ── screen2/resolve POST ────────────────────────────────────

  it("POST /api/screen2/resolve → 200 { id } resolving an open complaint", async () => {
    const id = await seedComplaint({ status: "open" });
    const res = await api("/api/screen2/resolve", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: { complaint_id: id, resolution_note: "credited the customer" },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["id"]);
    expect(body.id).toBe(id);

    // it must now be resolved → no longer in the open list
    const open = await api("/api/screen2/open", {
      role: "office",
      userId: users.office.id,
    });
    const arr = open.body as Record<string, unknown>[];
    expect(arr.find((c) => c.id === id)).toBeUndefined();
  });

  it("POST /api/screen2/resolve 404 on an already-resolved / unknown id", async () => {
    const id = await seedComplaint({ status: "resolved" });
    const res = await api("/api/screen2/resolve", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: { complaint_id: id, resolution_note: "again" },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe(
      "Complaint not found or already resolved",
    );
  });

  it("POST /api/screen2/resolve 400 'resolution_note required' when missing", async () => {
    const id = await seedComplaint({ status: "open" });
    const res = await api("/api/screen2/resolve", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: { complaint_id: id },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "resolution_note required",
    );
  });

  // ── screen2/sync POST — W1 the duplicate-replay tripwire (LAST) ──

  it("POST /api/screen2/sync → 201 { id } on first insert", async () => {
    const res = await api("/api/screen2/sync", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: {
        id: SYNC_ID,
        customer_id: customer.id,
        category: "missing_item",
        description: "two boxes short on the delivery",
        received_via: "in_person",
        status: "open",
      },
    });
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["id"]);
    expect(body.id).toBe(SYNC_ID);
    createdComplaintIds.add(SYNC_ID);
  });

  it("W1: POST /api/screen2/sync REPLAY (same id) → 200 { id, duplicate: true }, NOT 500", async () => {
    // The till's offline queue retries a failed POST forever — a duplicate
    // replay MUST surface as a 200, proving supabase-js exposes the 23505
    // unique-violation through the adapter's catch (not a swallowed 500).
    const res = await api("/api/screen2/sync", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: {
        id: SYNC_ID,
        customer_id: customer.id,
        category: "missing_item",
        description: "two boxes short on the delivery",
        received_via: "in_person",
        status: "open",
      },
    });
    expect(res.status).toBe(200); // NOT 500
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["id", "duplicate"]);
    expect(body.id).toBe(SYNC_ID);
    expect(body.duplicate).toBe(true);
  });

  it("POST /api/screen2/sync 400 'Missing: ...' cascade preserved", async () => {
    const res = await api("/api/screen2/sync", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: { status: "resolved" }, // everything else missing
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Missing: customer_id, category, description, received_via, resolution_note",
    );
  });

  // ── F-RLS-04f authenticated cutover assertions ──────────────
  // The routes now run as the authenticated caller (RLS fires). These prove the
  // shared-board policy, the FK embeds resolving under the badge, and the raw
  // audit_log writes still succeeding (service-role) after the flip.

  it("F-RLS-04f shared board: a complaint LOGGED BY user-A is visible to user-B via screen2/all and screen2/open", async () => {
    // Seed a complaint OWNED BY admin, then read it as office (a different,
    // non-admin user). Under the dropped owner-only baseline policy office would
    // NOT see it; the permissive valid-user policy means it does — the shared board.
    const id = await seedComplaint({
      category: "missing_item",
      status: "open",
      ownerId: users.admin.id,
    });

    const all = await api("/api/screen2/all", {
      role: "office",
      userId: users.office.id,
    });
    expect(all.status).toBe(200);
    const allArr = all.body as Record<string, unknown>[];
    const inAll = allArr.find((c) => c.id === id);
    expect(inAll, "user-B sees user-A's complaint in /all").toBeDefined();
    // FK embeds resolve under the badge (customers_select + users_directory_select).
    expect(inAll!.customer).toBe(customer.name);
    expect(inAll!.loggedBy).toBe(users.admin.name);

    const open = await api("/api/screen2/open", {
      role: "office",
      userId: users.office.id,
    });
    const openArr = open.body as Record<string, unknown>[];
    expect(
      openArr.find((c) => c.id === id),
      "user-B sees user-A's open complaint in /open",
    ).toBeDefined();
  });

  it("F-RLS-04f shared board: user-B can open the DETAIL of a complaint logged by user-A (FK names non-blank)", async () => {
    const id = await seedComplaint({
      category: "missing_item",
      receivedVia: "in_person",
      status: "open",
      ownerId: users.admin.id,
    });
    const res = await api(`/api/detail/complaint?id=${id}`, {
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.customer).toBe(customer.name); // customers embed under the badge
    expect(body.loggedBy).toBe(users.admin.name); // users embed under the badge
  });

  it("F-RLS-04f the raw audit_log write still succeeds (service-role) after the route flip", async () => {
    const supa = getServiceClient();
    const id = await seedComplaint({ status: "open" });
    const before = new Date().toISOString();

    const res = await api("/api/screen2/resolve", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: { complaint_id: id, resolution_note: "audit-still-works check" },
    });
    expect(res.status).toBe(200);

    // The audit write is fire-and-forget; poll briefly for the row.
    let auditRow: unknown = null;
    for (let i = 0; i < 20 && !auditRow; i++) {
      const { data } = await supa
        .from("audit_log")
        .select("id, action, record_id")
        .eq("record_id", id)
        .eq("action", "resolved")
        .gte("created_at", before)
        .maybeSingle();
      if (data) {
        auditRow = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(auditRow, "audit_log resolved row written via service-role").not.toBeNull();
  });
});
