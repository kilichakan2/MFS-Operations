/**
 * tests/integration/cash.test.ts
 *
 * Integration tests for the 8 Cash API endpoints after the F-16 PR2 re-point
 * through `cashService`. Hits the running Next.js dev server with cookie-based
 * auth (the `api()` helper → x-mfs-* headers via the middleware). These assert
 * the wire shapes are byte-identical to the pre-PR2 output: the snake_case key
 * SETS + ORDER, exact JSON value/type (R-WIRE-1), the CSV byte streams +
 * headers, and the carry-forward branches (first-month 400, every null→404,
 * the D2 missing-id 404s, the 409 duplicate).
 *
 * The suite owns a far-future year space (2099) so it never collides with a
 * developer's ambient cash data, and removes every row it creates in afterAll.
 * The first-month-400 test additionally clears cash_months globally for the
 * duration of that one test (a local test DB has no cash seed) to make
 * probeMonth().isFirst deterministic, then restores nothing (it cleans its own
 * rows) — documented inline.
 *
 * Prereqs: npm run db:up (once) + the dev server the runner auto-boots.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  signSessionCookie,
  type TestUserSet,
} from "./_setup";
import { INTEGRATION_BASE_URL } from "./_config";

const Y = 2099; // owned far-future year space

const MONTH_KEYS = [
  "id",
  "year",
  "month",
  "opening_balance",
  "is_locked",
  "created_by",
  "created_at",
];

const SUMMARY_KEYS = ["opening", "total_income", "total_expense", "closing"];

const ENTRY_LIST_KEYS = [
  "id",
  "month_id",
  "entry_date",
  "type",
  "category",
  "amount",
  "description",
  "reference",
  "attachment_path",
  "attachment_name",
  "created_at",
  "edited_at",
  "customer_id",
  "signed_url",
  "created_by_name",
  "edited_by_name",
  "customer_name",
];

const ENTRY_CREATE_KEYS = [
  "id",
  "month_id",
  "entry_date",
  "type",
  "category",
  "amount",
  "description",
  "reference",
  "attachment_path",
  "attachment_name",
  "created_at",
  "customer_id",
  "created_by_name",
  "customer_name",
  "signed_url",
];

const CHEQUE_KEYS = [
  "id",
  "date",
  "amount",
  "cheque_number",
  "notes",
  "created_at",
  "banked",
  "banked_at",
  "customer",
  "customer_name",
  "driver",
  "logged_by_name",
  "banked_by_name",
];

const CHEQUE_EDIT_KEYS = [
  "id",
  "date",
  "customer_id",
  "amount",
  "cheque_number",
  "notes",
  "created_at",
  "banked",
  "banked_at",
  "customer_name",
];

describe("/api/cash integration (F-16 PR2 re-point)", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  const createdMonthIds = new Set<string>();
  const createdChequeIds = new Set<string>();

  // Seed a cash_months row directly (bypassing the route) so probeMonth() sees
  // a prior month and create-month tests run the auto-opening path.
  async function seedMonth(
    month: number,
    openingBalance: number,
  ): Promise<{ id: string }> {
    const supa = getServiceClient();
    const { data, error } = await supa
      .from("cash_months")
      .insert({
        year: Y,
        month,
        opening_balance: openingBalance,
        created_by: users.admin.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`seedMonth failed: ${error.message}`);
    createdMonthIds.add(data.id);
    return data;
  }

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    if (createdChequeIds.size) {
      await supa.from("cheque_records").delete().in("id", [...createdChequeIds]);
    }
    if (createdMonthIds.size) {
      // entries cascade off month_id; delete them explicitly first to be safe.
      await supa
        .from("cash_entries")
        .delete()
        .in("month_id", [...createdMonthIds]);
      await supa.from("cash_months").delete().in("id", [...createdMonthIds]);
    }
    createdMonthIds.clear();
    createdChequeIds.clear();
  }, 30_000);

  // ── month GET ───────────────────────────────────────────────

  it("GET /api/cash/month redirects (307) without a session (middleware gate)", async () => {
    // No cookie → the auth middleware 307s to /login before the route's own
    // x-mfs-user-id 401 can run (same as every other authed route).
    const res = await api(`/api/cash/month?year=${Y}&month=1`);
    expect(res.status).toBe(307);
  });

  it("GET /api/cash/month exists=true with month/summary key SET + ORDER + R-WIRE-1 value/type", async () => {
    const m = await seedMonth(2, 100.5);
    const res = await api(`/api/cash/month?year=${Y}&month=2`, {
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.exists).toBe(true);
    const month = body.month as Record<string, unknown>;
    expect(Object.keys(month)).toEqual(MONTH_KEYS); // exact order (R-WIRE-1)
    expect(month.id).toBe(m.id);
    expect(month.year).toBe(Y);
    expect(month.month).toBe(2);
    // R-WIRE-1: opening_balance is a JSON number, not a numeric-string.
    expect(typeof month.opening_balance).toBe("number");
    expect(month.opening_balance).toBe(100.5);
    expect(month.is_locked).toBe(false);

    const summary = body.summary as Record<string, unknown>;
    expect(Object.keys(summary)).toEqual(SUMMARY_KEYS);
    expect(summary.opening).toBe(100.5);
    expect(summary.total_income).toBe(0);
    expect(summary.total_expense).toBe(0);
    expect(summary.closing).toBe(100.5);
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("GET /api/cash/month miss → { exists:false, isFirst, suggestedOpening } (probe)", async () => {
    // month 11 not created — a prior month (month 2) exists so isFirst=false.
    const res = await api(`/api/cash/month?year=${Y}&month=11`, {
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["exists", "isFirst", "suggestedOpening"]);
    expect(body.exists).toBe(false);
    expect(body.isFirst).toBe(false);
    expect(typeof body.suggestedOpening).toBe("number");
  });

  // ── month POST ──────────────────────────────────────────────

  it("POST /api/cash/month 403s for a non-admin", async () => {
    const res = await api("/api/cash/month", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: { year: Y, month: 3 },
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/cash/month subsequent month → 201 auto-opening (prior exists)", async () => {
    const res = await api("/api/cash/month", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { year: Y, month: 3 },
    });
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    const month = body.month as Record<string, unknown>;
    expect(Object.keys(month)).toEqual(MONTH_KEYS);
    createdMonthIds.add(month.id as string);
    const summary = body.summary as Record<string, unknown>;
    expect(Object.keys(summary)).toEqual(SUMMARY_KEYS);
    expect(typeof month.opening_balance).toBe("number");
  });

  it("POST /api/cash/month duplicate → 409 'Month already exists'", async () => {
    await seedMonth(4, 0);
    const res = await api("/api/cash/month", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { year: Y, month: 4 },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("Month already exists");
  });

  it("POST /api/cash/month first-ever month without opening_balance → 400", async () => {
    // Make this deterministic: clear cash_months globally so probeMonth() is
    // first-ever. Local test DB has no cash seed. We recreate nothing; our own
    // rows are re-tracked below.
    const supa = getServiceClient();
    await supa.from("cash_entries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supa.from("cash_months").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    createdMonthIds.clear();

    const res = await api("/api/cash/month", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { year: Y, month: 5 }, // no opening_balance
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "opening_balance required for first month",
    );

    // And WITH opening_balance → 201, opening = the supplied value.
    const ok = await api("/api/cash/month", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { year: Y, month: 5, opening_balance: 42.5 },
    });
    expect(ok.status).toBe(201);
    const okBody = ok.body as Record<string, unknown>;
    const month = okBody.month as Record<string, unknown>;
    createdMonthIds.add(month.id as string);
    expect(month.opening_balance).toBe(42.5);
  });

  // ── entry POST + PATCH + DELETE ─────────────────────────────

  it("entry POST → 201 { entry } with create-echo key SET + ORDER; PATCH then DELETE", async () => {
    const m = await seedMonth(6, 0);
    const create = await api("/api/cash/entry", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: {
        month_id: m.id,
        entry_date: `${Y}-06-15`,
        type: "expense",
        category: "Fuel",
        amount: 25,
        description: "Diesel",
        reference: "REF-1",
      },
    });
    expect(create.status).toBe(201);
    const entry = (create.body as { entry: Record<string, unknown> }).entry;
    expect(Object.keys(entry)).toEqual(ENTRY_CREATE_KEYS);
    expect(entry.signed_url).toBe(null);
    expect(typeof entry.amount).toBe("number");
    expect(entry.amount).toBe(25);
    const entryId = entry.id as string;

    // PATCH (admin edit) → bare-row edit echo
    const patch = await api(`/api/cash/entry/${entryId}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { amount: 30, description: "Diesel v2" },
    });
    expect(patch.status).toBe(200);
    const edited = (patch.body as { entry: Record<string, unknown> }).entry;
    expect(Object.keys(edited)).toEqual([
      "id",
      "month_id",
      "entry_date",
      "type",
      "category",
      "amount",
      "description",
      "reference",
      "attachment_path",
      "attachment_name",
      "created_at",
      "edited_at",
      "customer_id",
    ]);
    expect(edited.amount).toBe(30);
    expect(edited.edited_at).not.toBe(null);

    // DELETE → { ok: true }
    const del = await api(`/api/cash/entry/${entryId}`, {
      method: "DELETE",
      role: "admin",
      userId: users.admin.id,
    });
    expect(del.status).toBe(200);
    expect((del.body as { ok: boolean }).ok).toBe(true);
  });

  it("entry POST 404 when month_id is unknown ('Month not found')", async () => {
    const res = await api("/api/cash/entry", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: {
        month_id: "00000000-0000-0000-0000-000000000000",
        entry_date: `${Y}-06-15`,
        type: "income",
        amount: 10,
        description: "x",
      },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Month not found");
  });

  it("entry POST 400 on amount <= 0 (required-fields gate, parity)", async () => {
    const m = await seedMonth(7, 0);
    const res = await api("/api/cash/entry", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: {
        month_id: m.id,
        entry_date: `${Y}-07-01`,
        type: "income",
        amount: 0,
        description: "x",
      },
    });
    expect(res.status).toBe(400);
  });

  it("entry PATCH 404 on a missing id (D2: 404 not 500)", async () => {
    const res = await api(
      "/api/cash/entry/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        role: "admin",
        userId: users.admin.id,
        body: { amount: 5 },
      },
    );
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Entry not found");
  });

  // ── cheques GET / POST / bank / edit / delete ───────────────

  it("cheques GET returns a bare ARRAY; POST → 201 with shaped key SET + ORDER", async () => {
    const post = await api("/api/cash/cheques", {
      method: "POST",
      role: "office",
      userId: users.office.id,
      body: {
        date: `${Y}-08-01`,
        customer_id: customer.id,
        amount: 250,
        driver_id: users.driver.id,
        cheque_number: "CHQ-1",
        notes: "n",
      },
    });
    expect(post.status).toBe(201);
    const cheque = post.body as Record<string, unknown>;
    expect(Object.keys(cheque)).toEqual(CHEQUE_KEYS);
    expect(cheque.banked).toBe(false);
    expect(cheque.banked_at).toBe(null);
    expect(cheque.banked_by_name).toBe(null);
    expect(typeof cheque.amount).toBe("number");
    const chequeId = cheque.id as string;
    createdChequeIds.add(chequeId);

    const list = await api(`/api/cash/cheques?from=${Y}-01-01&to=${Y}-12-31`, {
      role: "office",
      userId: users.office.id,
    });
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const found = (list.body as Record<string, unknown>[]).find(
      (r) => r.id === chequeId,
    );
    expect(found).toBeDefined();
    expect(Object.keys(found as Record<string, unknown>)).toEqual(CHEQUE_KEYS);

    // bank → { ok, banked_at }
    const bank = await api(`/api/cash/cheques/${chequeId}`, {
      method: "PATCH",
      role: "office",
      userId: users.office.id,
      body: { action: "bank" },
    });
    expect(bank.status).toBe(200);
    const banked = bank.body as Record<string, unknown>;
    expect(banked.ok).toBe(true);
    expect(typeof banked.banked_at).toBe("string");

    // bank again → 404 'Already banked or not found'
    const again = await api(`/api/cash/cheques/${chequeId}`, {
      method: "PATCH",
      role: "office",
      userId: users.office.id,
      body: { action: "bank" },
    });
    expect(again.status).toBe(404);
    expect((again.body as { error: string }).error).toBe(
      "Already banked or not found",
    );
  });

  it("cheque edit (admin) → { ok, record } with bare-row key SET + ORDER", async () => {
    const post = await api("/api/cash/cheques", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: {
        date: `${Y}-09-01`,
        customer_id: customer.id,
        amount: 100,
        driver_id: users.driver.id,
      },
    });
    expect(post.status).toBe(201);
    const id = (post.body as { id: string }).id;
    createdChequeIds.add(id);

    const edit = await api(`/api/cash/cheques/${id}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { action: "edit", amount: 150, notes: "edited" },
    });
    expect(edit.status).toBe(200);
    const body = edit.body as { ok: boolean; record: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(Object.keys(body.record)).toEqual(CHEQUE_EDIT_KEYS);
    expect(body.record.amount).toBe(150);
  });

  it("cheque edit 404 on a missing id (D2: 404 not 500)", async () => {
    const res = await api(
      "/api/cash/cheques/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        role: "admin",
        userId: users.admin.id,
        body: { action: "edit", amount: 5 },
      },
    );
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Cheque not found");
  });

  // ── export CSV ──────────────────────────────────────────────

  it("export cash → CSV bytes + headers; 404 on a missing month", async () => {
    const m = await seedMonth(10, 100);
    // one income entry so the statement has a row
    await api("/api/cash/entry", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: {
        month_id: m.id,
        entry_date: `${Y}-10-05`,
        type: "income",
        amount: 50,
        description: "Sale",
      },
    });

    const res = await fetchCsv(
      `/api/cash/export?type=cash&year=${Y}&month=10`,
      users.admin.id,
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("text/csv; charset=utf-8");
    expect(res.disposition).toBe(
      `attachment; filename="MFS-CashBook-${Y}-10.csv"`,
    );
    expect(res.text.includes("\r\n")).toBe(true);
    expect(res.text.startsWith("MFS GLOBAL LTD")).toBe(true);
    expect(res.text).toContain("Opening Balance");
    expect(res.text).toContain("£100.00");
    expect(res.text).toContain("Sale");

    const miss = await fetchCsv(
      `/api/cash/export?type=cash&year=${Y}&month=12`,
      users.admin.id,
    );
    expect(miss.status).toBe(404);
  });

  it("export cheques → CSV bytes + headers", async () => {
    const res = await fetchCsv(
      `/api/cash/export?type=cheques&from=${Y}-01-01&to=${Y}-12-31`,
      users.admin.id,
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("text/csv; charset=utf-8");
    expect(res.disposition).toBe(
      `attachment; filename="MFS-ChequeRegister-${Y}-01-01-to-${Y}-12-31.csv"`,
    );
    expect(res.text.startsWith("MFS GLOBAL LTD")).toBe(true);
    expect(res.text).toContain("CHEQUE REGISTER");
  });

  // ── upload ──────────────────────────────────────────────────

  it("upload 400 on a disallowed mime type", async () => {
    const res = await uploadFile(
      "evil.txt",
      "text/plain",
      new Uint8Array([1, 2, 3]),
      users.admin.id,
    );
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "File type not allowed: text/plain",
    );
  });

  it("upload 400 on a file over 10MB", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const res = await uploadFile(
      "big.png",
      "image/png",
      big,
      users.admin.id,
    );
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("File too large (max 10MB)");
  });
});

// ── raw fetch helpers (CSV + multipart) ───────────────────────

async function authCookie(userId: string, role = "admin"): Promise<string> {
  const token = await signSessionCookie({
    userId,
    name: `ANVIL-TEST-${role}`,
    role,
  });
  return `mfs_role=${role}; mfs_user_id=${userId}; mfs_session=${token}`;
}

async function fetchCsv(
  path: string,
  userId: string,
): Promise<{
  status: number;
  text: string;
  contentType: string | null;
  disposition: string | null;
}> {
  const res = await fetch(`${INTEGRATION_BASE_URL}${path}`, {
    headers: { Cookie: await authCookie(userId) },
    redirect: "manual",
  });
  return {
    status: res.status,
    text: await res.text(),
    contentType: res.headers.get("content-type"),
    disposition: res.headers.get("content-disposition"),
  };
}

async function uploadFile(
  name: string,
  type: string,
  bytes: Uint8Array,
  userId: string,
): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  form.append("file", new Blob([bytes as unknown as BlobPart], { type }), name);
  const res = await fetch(`${INTEGRATION_BASE_URL}/api/cash/upload`, {
    method: "POST",
    headers: { Cookie: await authCookie(userId) },
    body: form,
    redirect: "manual",
  });
  let body: unknown;
  const raw = await res.text();
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
  return { status: res.status, body };
}
