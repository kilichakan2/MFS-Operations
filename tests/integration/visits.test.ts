/**
 * tests/integration/visits.test.ts
 *
 * Integration tests for the Visits RLS cutover (F-RLS-04g). The 7 read +
 * own-mutate visit handlers now run as the per-request AUTHENTICATED caller
 * (visitsServiceForCaller → minted JWT → app.current_user_id GUC), so the
 * GUC-based RLS policies on `visits` (own-row OR is_admin()) and the NEW
 * `visit_notes` policies fire. Owner-scoping is enforced at the DB.
 *
 * These prove the cutover MATRIX (plan §10.4):
 *   - sales SEES OWN visit + own notes (200)
 *   - sales is BLOCKED on another rep's visit → RLS hides the row → null →
 *     existing 404 (the OWNER-ONLY proof — this is what separates Visits from
 *     the complaints shared board)
 *   - admin SEES ALL reps (is_admin())
 *   - office SEES EMPTY (owns no visits, not admin → /admin/visits returns zero
 *     of OUR seeded rows). This is the spec-LOCKED intended behaviour (plan §9).
 *   - cross-rep NOTES isolation → 404 (route verifyVisitOwnership AND RLS deny)
 *   - own notes GET/POST/PATCH work (200/201)
 *   - own visit PATCH/DELETE work (200 / { deleted: true })
 *   - error bodies (400/404/500) are byte-identical to the pre-cutover output.
 *
 * Self-seeding (like complaints.test.ts): visit rows are created via the service
 * client (RLS-bypass) and removed in afterAll. The admin list returns ALL reps'
 * visits, so assertions locate the suite's own rows by id, never by length.
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

// detail/visit GET key SET + ORDER (camelCase) — see lib/api/visits/dto.ts.
const DETAIL_KEYS = [
  "id",
  "createdAt",
  "visitType",
  "outcome",
  "commitmentMade",
  "commitmentDetail",
  "notes",
  "customer",
  "prospectName",
  "prospectPostcode",
  "loggedBy",
  "pipelineStatus",
];

// admin/visits row key SET + ORDER (camelCase).
const ADMIN_ROW_KEYS = [
  "id",
  "customer",
  "rep",
  "visitType",
  "outcome",
  "notes",
  "pipelineStatus",
  "createdAt",
];

// screen3/visit/notes row key SET + ORDER (snake_case).
const NOTE_KEYS = [
  "id",
  "visit_id",
  "body",
  "created_at",
  "updated_at",
  "author_id",
  "author_name",
];

const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

describe("/api/.../visit* integration — F-RLS-04g authenticated cutover", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  const createdVisitIds = new Set<string>();

  // Seed a visit row directly (RLS-bypass via the service client) so the read
  // routes have a known row to find. customer_id set + prospect_name NULL to
  // satisfy visits_customer_check.
  async function seedVisit(opts: {
    ownerId: string;
    visitType?: string;
    outcome?: string;
    notes?: string | null;
    pipelineStatus?: string;
  }): Promise<string> {
    const supa = getServiceClient();
    const { data, error } = await supa
      .from("visits")
      .insert({
        user_id: opts.ownerId,
        customer_id: customer.id,
        visit_type: opts.visitType ?? "routine",
        outcome: opts.outcome ?? "positive",
        notes: opts.notes ?? "seed visit note text",
        pipeline_status: opts.pipelineStatus ?? "Logged",
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
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    if (createdVisitIds.size) {
      // visit_notes cascade off visit_id (ON DELETE CASCADE).
      await supa.from("visits").delete().in("id", [...createdVisitIds]);
    }
    createdVisitIds.clear();
  }, 30_000);

  // ── 401 unauthenticated path on every flipped route ──────────

  it("every flipped route redirects (307) without a session (middleware gate)", async () => {
    const paths: Array<[string, "GET" | "POST" | "PATCH" | "DELETE"]> = [
      ["/api/admin/visits", "GET"],
      ["/api/detail/visit?id=x", "GET"],
      ["/api/screen3/visit/notes?visit_id=x", "GET"],
      ["/api/screen3/visit/notes", "POST"],
      ["/api/screen3/visit/notes", "PATCH"],
      ["/api/screen3/visit", "PATCH"],
      ["/api/screen3/visit?id=x", "DELETE"],
    ];
    for (const [path, method] of paths) {
      const res = await api(path, { method });
      expect(res.status, `${method} ${path}`).toBe(307);
    }
  });

  // ── sales SEES OWN ───────────────────────────────────────────

  it("sales sees OWN visit via /api/detail/visit (200, key SET + ORDER, prettified enums)", async () => {
    const id = await seedVisit({
      ownerId: users.sales.id,
      visitType: "new_pitch",
      outcome: "at_risk",
    });
    const res = await api(`/api/detail/visit?id=${id}`, {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(DETAIL_KEYS);
    expect(body.visitType).toBe("new pitch"); // prettified at the edge
    expect(body.outcome).toBe("at risk"); // prettified at the edge
    expect(body.customer).toBe(customer.name); // customers embed under the badge
    expect(body.loggedBy).toBe(users.sales.name); // users embed under the badge
  });

  // ── sales BLOCKED on another rep's visit (OWNER-ONLY proof) ──

  it("sales is BLOCKED on another rep's visit → 404 (RLS hides the row → null → 404)", async () => {
    // Seed a visit owned by ADMIN; read it as SALES (a different non-admin rep).
    // The visits owner-only RLS policy hides it → service returns null → 404.
    const id = await seedVisit({ ownerId: users.admin.id });
    const res = await api(`/api/detail/visit?id=${id}`, {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Not found");
  });

  // ── admin SEES ALL ───────────────────────────────────────────

  it("admin sees ALL reps via /api/admin/visits (200, both reps' rows present, key SET + ORDER)", async () => {
    const salesId = await seedVisit({ ownerId: users.sales.id });
    const adminId = await seedVisit({ ownerId: users.admin.id });

    // Wide window so both seeded rows fall inside the default from/to.
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const res = await api(`/api/admin/visits?from=${from}&to=${to}`, {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Record<string, unknown>[] }).rows;
    expect(Array.isArray(rows)).toBe(true);
    const salesRow = rows.find((r) => r.id === salesId);
    const adminRow = rows.find((r) => r.id === adminId);
    expect(salesRow, "admin sees the sales rep's visit").toBeDefined();
    expect(adminRow, "admin sees its own visit").toBeDefined();
    expect(Object.keys(salesRow as Record<string, unknown>)).toEqual(
      ADMIN_ROW_KEYS,
    );
  });

  // ── office SEES NOTHING (spec-LOCKED intended behaviour, plan §9) ──

  it("office is BLOCKED from /api/admin/visits by the admin-prefix middleware (307)", async () => {
    // /api/admin/* is admin-gated: a non-admin caller (office) is redirected
    // (307) BEFORE the handler runs — office never reaches the all-reps list.
    const res = await api("/api/admin/visits", {
      role: "office",
      userId: users.office.id,
      name: users.office.name,
    });
    expect(res.status).toBe(307);
  });

  it("office sees NOTHING via the visit read path it CAN reach — RLS hides every visit it does not own (plan §9)", async () => {
    // Office owns no visits and is NOT is_admin(); on the per-visit read route
    // office can reach, the owner-only RLS policy hides another rep's visit →
    // null → 404. Office therefore sees nothing — the board goes empty BY DESIGN.
    const salesId = await seedVisit({ ownerId: users.sales.id });
    const res = await api(`/api/detail/visit?id=${salesId}`, {
      role: "office",
      userId: users.office.id,
      name: users.office.name,
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Not found");
  });

  it("office POSTing a note gets a clean 404, not a 500 (W1: office is NOT a manager → falls through verifyVisitOwnership)", async () => {
    // F-RLS-04g W1: office is not a manager on the notes route. It owns no
    // visits, so verifyVisitOwnership fails → clean 404 refusal — never the
    // RLS-INSERT-deny 500 it used to hit when treated as a manager.
    const visitId = await seedVisit({ ownerId: users.sales.id });
    const res = await api("/api/screen3/visit/notes", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      name: users.office.name,
      body: { visit_id: visitId, body: "office trying to note a visit" },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe(
      "Visit not found or not authorised",
    );
  });

  // ── own notes GET / POST / PATCH work ────────────────────────

  it("sales GET/POST/PATCH notes on OWN visit work (200/201, key SET + ORDER)", async () => {
    const visitId = await seedVisit({ ownerId: users.sales.id });

    // POST a note authored by sales on their own visit
    const post = await api("/api/screen3/visit/notes", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { visit_id: visitId, body: "called the customer back" },
    });
    expect(post.status).toBe(201);
    const note = (post.body as { note: Record<string, unknown> }).note;
    expect(Object.keys(note)).toEqual(NOTE_KEYS);
    expect(note.body).toBe("called the customer back");
    expect(note.author_id).toBe(users.sales.id);
    expect(note.author_name).toBe(users.sales.name);

    // GET the notes for the visit — the new note is present
    const get = await api(`/api/screen3/visit/notes?visit_id=${visitId}`, {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(get.status).toBe(200);
    const notes = (get.body as { notes: Record<string, unknown>[] }).notes;
    const found = notes.find((n) => n.id === note.id);
    expect(found).toBeDefined();
    expect(Object.keys(found as Record<string, unknown>)).toEqual(NOTE_KEYS);

    // PATCH (edit) the note as its author
    const patch = await api("/api/screen3/visit/notes", {
      method: "PATCH",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { id: note.id, body: "updated: left a voicemail" },
    });
    expect(patch.status).toBe(200);
    const updated = (patch.body as { note: Record<string, unknown> }).note;
    expect(Object.keys(updated)).toEqual(["id", "body", "updated_at"]);
    expect(updated.body).toBe("updated: left a voicemail");
  });

  // ── cross-rep NOTES isolation → 404 ──────────────────────────

  it("sales is BLOCKED on another rep's visit notes → 404 (route ownership + RLS both deny)", async () => {
    const visitId = await seedVisit({ ownerId: users.admin.id });
    const res = await api(`/api/screen3/visit/notes?visit_id=${visitId}`, {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe(
      "Visit not found or not authorised",
    );
  });

  it("sales cannot POST a note on another rep's visit → 404", async () => {
    const visitId = await seedVisit({ ownerId: users.admin.id });
    const res = await api("/api/screen3/visit/notes", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { visit_id: visitId, body: "trying to note someone else's visit" },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe(
      "Visit not found or not authorised",
    );
  });

  // ── own visit PATCH / DELETE work ────────────────────────────

  it("sales can PATCH pipeline_status on OWN visit → 200 { id, pipeline_status }", async () => {
    const id = await seedVisit({ ownerId: users.sales.id });
    const res = await api("/api/screen3/visit", {
      method: "PATCH",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { id, pipeline_status: "Won" },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["id", "pipeline_status"]);
    expect(body.id).toBe(id);
    expect(body.pipeline_status).toBe("Won");
  });

  it("sales PATCH on another rep's visit → 404 (RLS hides → service null → 404)", async () => {
    const id = await seedVisit({ ownerId: users.admin.id });
    const res = await api("/api/screen3/visit", {
      method: "PATCH",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { id, pipeline_status: "Won" },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe(
      "Visit not found or not authorised",
    );
  });

  it("sales can DELETE OWN visit → 200 { deleted: true }", async () => {
    const id = await seedVisit({ ownerId: users.sales.id });
    const res = await api(`/api/screen3/visit?id=${id}`, {
      method: "DELETE",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(200);
    expect((res.body as { deleted: boolean }).deleted).toBe(true);

    // verify it is gone (service-role read bypasses RLS)
    const supa = getServiceClient();
    const { data } = await supa
      .from("visits")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    expect(data).toBeNull();
    createdVisitIds.delete(id); // already deleted — keep afterAll clean
  });

  // ── error bodies byte-identical (R-LOGIC-2) ──────────────────

  it("error bodies unchanged: detail/visit 400 'id required'; 404 'Not found'", async () => {
    const noId = await api("/api/detail/visit", {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(noId.status).toBe(400);
    expect((noId.body as { error: string }).error).toBe("id required");

    const unknown = await api(`/api/detail/visit?id=${UNKNOWN_ID}`, {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(unknown.status).toBe(404);
    expect((unknown.body as { error: string }).error).toBe("Not found");
  });

  it("error bodies unchanged: screen3/visit/notes GET 400 'visit_id required'", async () => {
    const res = await api("/api/screen3/visit/notes", {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("visit_id required");
  });
});
