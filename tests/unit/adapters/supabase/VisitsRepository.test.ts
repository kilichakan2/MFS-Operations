/**
 * tests/unit/adapters/supabase/VisitsRepository.test.ts
 *
 * F-18 PR1 — focused unit coverage for the Supabase Visits adapter WITHOUT a
 * DB. A tiny hand-rolled PostgREST query-builder stub records the chained
 * calls and returns a canned `{ data, error }` (mirroring the F-TD-09
 * purgeIdempotencyKeys unit test). The REAL adapter factory runs against it,
 * so this proves:
 *   - the verbatim `.select()` column string per method (the byte-identity
 *     anchor — these must match the routes character-for-character),
 *   - row→domain mapping per method (snake_case → camelCase, join coercion),
 *   - 23505 → {duplicate:true} on createVisit (NOT an error),
 *   - null-on-miss for findDetailById / updatePipelineStatus / updateNote,
 *   - W1: updateNote uses maybeSingle so a no-match returns null, never throws.
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseVisitsRepository } from "@/lib/adapters/supabase";
import { ServiceError } from "@/lib/errors";

// Silence the adapter's structured error/warn log on the error-path cases.
vi.mock("@/lib/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type CannedResult = { data: unknown; error: { code?: string; message: string } | null };

interface Recorded {
  method: string;
  args: unknown[];
}

/**
 * Minimal awaitable PostgREST builder. Each chained method records its name +
 * args and returns `this`; awaiting the builder resolves to the canned result.
 * `.single()` / `.maybeSingle()` are terminal — they resolve immediately.
 */
function makeClient(result: CannedResult) {
  const calls: Recorded[] = [];
  let table: string | null = null;

  const builder: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  for (const m of [
    "select",
    "insert",
    "upsert",
    "update",
    "delete",
    "eq",
    "gte",
    "lte",
    "order",
    "limit",
  ]) {
    builder[m] = record(m);
  }
  const terminal =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };
  builder.single = terminal("single");
  builder.maybeSingle = terminal("maybeSingle");
  // Awaiting the builder directly (queries that end on .order()/.limit()/.eq()).
  builder.then = (resolve: (v: CannedResult) => unknown) =>
    Promise.resolve(result).then(resolve);

  const client = {
    from(t: string) {
      table = t;
      return builder;
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    table: () => table,
    selectArg: () =>
      (calls.find((c) => c.method === "select")?.args[0] as string) ?? null,
  };
}

// ── createVisit ────────────────────────────────────────────────

describe("Supabase VisitsRepository.createVisit", () => {
  it("inserts and returns {id, duplicate:false}", async () => {
    const h = makeClient({ data: { id: "v-1" }, error: null });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.createVisit({
      userId: "u1",
      customerId: "c1",
      prospectName: null,
      prospectPostcode: null,
      visitType: "routine",
      outcome: "positive",
      commitmentMade: false,
      commitmentDetail: "ignored",
      notes: null,
    });
    expect(out).toEqual({ id: "v-1", duplicate: false });
    expect(h.table()).toBe("visits");
    expect(h.calls.some((c) => c.method === "insert")).toBe(true);
    // commitment_detail forced null when commitment_made is false.
    const payload = h.calls.find((c) => c.method === "insert")
      ?.args[0] as Record<string, unknown>;
    expect(payload.commitment_detail).toBeNull();
    expect(payload.visit_type).toBe("routine");
  });

  it("uses upsert(onConflict:id) when input.upsert is true", async () => {
    const h = makeClient({ data: { id: "v-2" }, error: null });
    const repo = createSupabaseVisitsRepository(h.client);
    await repo.createVisit({
      id: "v-2",
      upsert: true,
      userId: "u1",
      customerId: "c1",
      prospectName: null,
      prospectPostcode: null,
      visitType: "routine",
      outcome: "positive",
      commitmentMade: false,
      commitmentDetail: null,
      notes: null,
    });
    const upsertCall = h.calls.find((c) => c.method === "upsert");
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.args[1]).toEqual({ onConflict: "id" });
  });

  it("maps 23505 → {duplicate:true} (NOT an error)", async () => {
    const h = makeClient({ data: null, error: { code: "23505", message: "dup" } });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.createVisit({
      id: "v-dup",
      userId: "u1",
      customerId: "c1",
      prospectName: null,
      prospectPostcode: null,
      visitType: "routine",
      outcome: "positive",
      commitmentMade: false,
      commitmentDetail: null,
      notes: null,
    });
    expect(out).toEqual({ id: "v-dup", duplicate: true });
  });

  it("throws ServiceError on a non-23505 insert error", async () => {
    const h = makeClient({ data: null, error: { code: "500", message: "boom" } });
    const repo = createSupabaseVisitsRepository(h.client);
    await expect(
      repo.createVisit({
        userId: "u1",
        customerId: "c1",
        prospectName: null,
        prospectPostcode: null,
        visitType: "routine",
        outcome: "positive",
        commitmentMade: false,
        commitmentDetail: null,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

// ── listForCaller ──────────────────────────────────────────────

describe("Supabase VisitsRepository.listForCaller", () => {
  const VERBATIM_TODAY =
    "id,created_at,visit_type,outcome,pipeline_status,commitment_made,commitment_detail,notes,customer_id,prospect_name,prospect_postcode,customers!visits_customer_id_fkey(name),rep:users!visits_user_id_fkey(id,name)";

  it("uses the verbatim today select string and maps rows", async () => {
    const h = makeClient({
      data: [
        {
          id: "v1",
          created_at: "2026-06-20T10:00:00.000Z",
          visit_type: "new_pitch",
          outcome: "at_risk",
          pipeline_status: "In Talks",
          commitment_made: true,
          commitment_detail: "samples",
          notes: "good chat",
          customer_id: "c1",
          prospect_name: null,
          prospect_postcode: null,
          customers: { name: "Acme Ltd" },
          rep: { id: "u1", name: "Hakan" },
        },
      ],
      error: null,
    });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.listForCaller({ userId: "u1", isManager: true });
    expect(h.selectArg()).toBe(VERBATIM_TODAY);
    expect(out[0]).toEqual({
      id: "v1",
      createdAt: "2026-06-20T10:00:00.000Z",
      userId: null,
      loggedById: "u1",
      loggedByName: "Hakan",
      customerId: "c1",
      customerName: "Acme Ltd",
      visitType: "new_pitch",
      outcome: "at_risk",
      pipelineStatus: "In Talks",
      commitmentMade: true,
      commitmentDetail: "samples",
      notes: "good chat",
      prospectName: null,
      prospectPostcode: null,
    });
  });

  it("adds the owner eq filter for non-managers, omits it for managers", async () => {
    const sales = makeClient({ data: [], error: null });
    await createSupabaseVisitsRepository(sales.client).listForCaller({
      userId: "u1",
      isManager: false,
    });
    expect(
      sales.calls.some(
        (c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === "u1",
      ),
    ).toBe(true);

    const mgr = makeClient({ data: [], error: null });
    await createSupabaseVisitsRepository(mgr.client).listForCaller({
      userId: "u1",
      isManager: true,
    });
    expect(mgr.calls.some((c) => c.method === "eq" && c.args[0] === "user_id")).toBe(
      false,
    );
  });

  it("throws ServiceError on a DB error", async () => {
    const h = makeClient({ data: null, error: { message: "boom" } });
    await expect(
      createSupabaseVisitsRepository(h.client).listForCaller({
        userId: "u1",
        isManager: true,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

// ── findDetailById ─────────────────────────────────────────────

describe("Supabase VisitsRepository.findDetailById", () => {
  const VERBATIM_DETAIL =
    "id,created_at,visit_type,outcome,pipeline_status,commitment_made,commitment_detail,notes,prospect_name,prospect_postcode,customers(id,name),users!visits_user_id_fkey(name)";

  it("uses the verbatim detail select and maps the customer id+name pair", async () => {
    const h = makeClient({
      data: {
        id: "v1",
        created_at: "2026-06-20T10:00:00.000Z",
        visit_type: "routine",
        outcome: "positive",
        pipeline_status: "Logged",
        commitment_made: false,
        commitment_detail: null,
        notes: null,
        prospect_name: null,
        prospect_postcode: null,
        customers: { id: "c1", name: "Acme Ltd" },
        users: { name: "Hakan" },
      },
      error: null,
    });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.findDetailById("v1");
    expect(h.selectArg()).toBe(VERBATIM_DETAIL);
    expect(out?.customerId).toBe("c1");
    expect(out?.customerName).toBe("Acme Ltd");
    expect(out?.loggedByName).toBe("Hakan");
    expect(out?.visitType).toBe("routine"); // RAW enum, no replace
  });

  it("returns null on miss (maybeSingle → null)", async () => {
    const h = makeClient({ data: null, error: null });
    const out = await createSupabaseVisitsRepository(h.client).findDetailById("x");
    expect(out).toBeNull();
    expect(h.calls.some((c) => c.method === "maybeSingle")).toBe(true);
  });
});

// ── listAllWithFilters (admin) ─────────────────────────────────

describe("Supabase VisitsRepository.listAllWithFilters", () => {
  const VERBATIM_ADMIN =
    "id, created_at, outcome, visit_type, notes, pipeline_status, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)";

  it("uses the verbatim admin select, range, order, limit and maps rows", async () => {
    const h = makeClient({
      data: [
        {
          id: "v1",
          created_at: "2026-06-20T10:00:00.000Z",
          outcome: "lost",
          visit_type: "delivery_issue",
          notes: "note",
          pipeline_status: "Not Won",
          customer_id: null,
          prospect_name: "New Cafe",
          user_id: "u2",
          customers: null,
          users: { name: "Mert" },
        },
      ],
      error: null,
    });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.listAllWithFilters({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T00:00:00.000Z",
    });
    expect(h.selectArg()).toBe(VERBATIM_ADMIN);
    expect(h.calls.some((c) => c.method === "gte" && c.args[0] === "created_at")).toBe(
      true,
    );
    expect(h.calls.some((c) => c.method === "lte" && c.args[0] === "created_at")).toBe(
      true,
    );
    expect(h.calls.some((c) => c.method === "limit" && c.args[0] === 200)).toBe(true);
    expect(out[0]).toMatchObject({
      id: "v1",
      outcome: "lost",
      visitType: "delivery_issue",
      prospectName: "New Cafe",
      customerName: null,
      loggedByName: "Mert",
    });
  });

  it("applies rep/type/outcome eq filters only when present", async () => {
    const h = makeClient({ data: [], error: null });
    await createSupabaseVisitsRepository(h.client).listAllWithFilters({
      from: "a",
      to: "b",
      repId: "u1",
      type: "routine",
      outcome: "positive",
    });
    expect(
      h.calls.some((c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === "u1"),
    ).toBe(true);
    expect(
      h.calls.some((c) => c.method === "eq" && c.args[0] === "visit_type"),
    ).toBe(true);
    expect(
      h.calls.some((c) => c.method === "eq" && c.args[0] === "outcome"),
    ).toBe(true);
  });
});

// ── notes: listNotes / createNote / updateNote ─────────────────

describe("Supabase VisitsRepository notes", () => {
  const VERBATIM_NOTE_COLS = `
      id, visit_id, body, created_at, updated_at,
      author:users!visit_notes_user_id_fkey(id, name)
    `;

  it("listNotes uses the verbatim note select and maps author", async () => {
    const h = makeClient({
      data: [
        {
          id: "n1",
          visit_id: "v1",
          body: "hello",
          created_at: "2026-06-20T10:00:00.000Z",
          updated_at: null,
          author: { id: "u1", name: "Hakan" },
        },
      ],
      error: null,
    });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.listNotes("v1");
    expect(h.selectArg()).toBe(VERBATIM_NOTE_COLS);
    expect(out[0]).toEqual({
      id: "n1",
      visitId: "v1",
      body: "hello",
      authorId: "u1",
      authorName: "Hakan",
      createdAt: "2026-06-20T10:00:00.000Z",
      updatedAt: null,
    });
  });

  it("createNote uses the verbatim note select and returns the mapped note", async () => {
    const h = makeClient({
      data: {
        id: "n2",
        visit_id: "v1",
        body: "added",
        created_at: "2026-06-20T11:00:00.000Z",
        updated_at: null,
        author: { id: "u1", name: "Hakan" },
      },
      error: null,
    });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.createNote({
      visitId: "v1",
      body: "  added  ",
      userId: "u1",
    });
    expect(h.selectArg()).toBe(VERBATIM_NOTE_COLS);
    // body trimmed on write
    const insertArg = h.calls.find((c) => c.method === "insert")
      ?.args[0] as Record<string, unknown>;
    expect(insertArg.body).toBe("added");
    expect(out.authorName).toBe("Hakan");
  });

  it("updateNote uses the verbatim PATCH select and maybeSingle (W1)", async () => {
    const h = makeClient({
      data: { id: "n1", body: "edited", updated_at: "2026-06-20T12:00:00.000Z" },
      error: null,
    });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.updateNote({
      id: "n1",
      body: "edited",
      userId: "u1",
      isManager: true,
    });
    expect(h.selectArg()).toBe("id, body, updated_at");
    expect(h.calls.some((c) => c.method === "maybeSingle")).toBe(true);
    expect(out).toEqual({
      id: "n1",
      visitId: "",
      body: "edited",
      authorId: null,
      authorName: "Unknown",
      createdAt: "",
      updatedAt: "2026-06-20T12:00:00.000Z",
    });
  });

  it("updateNote returns null (NOT a throw) on a no-match — W1", async () => {
    const h = makeClient({ data: null, error: null });
    const repo = createSupabaseVisitsRepository(h.client);
    const out = await repo.updateNote({
      id: "ghost",
      body: "edited",
      userId: "u1",
      isManager: false,
    });
    expect(out).toBeNull();
  });

  it("updateNote adds the owner eq filter for sales, omits it for managers", async () => {
    const sales = makeClient({ data: null, error: null });
    await createSupabaseVisitsRepository(sales.client).updateNote({
      id: "n1",
      body: "x",
      userId: "u1",
      isManager: false,
    });
    expect(
      sales.calls.some((c) => c.method === "eq" && c.args[0] === "user_id"),
    ).toBe(true);

    const mgr = makeClient({ data: null, error: null });
    await createSupabaseVisitsRepository(mgr.client).updateNote({
      id: "n1",
      body: "x",
      userId: "u1",
      isManager: true,
    });
    expect(mgr.calls.some((c) => c.method === "eq" && c.args[0] === "user_id")).toBe(
      false,
    );
  });
});

// ── verifyVisitOwnership ───────────────────────────────────────

describe("Supabase VisitsRepository.verifyVisitOwnership", () => {
  it("true when a row matches id+user_id", async () => {
    const h = makeClient({ data: { id: "v1" }, error: null });
    const out = await createSupabaseVisitsRepository(h.client).verifyVisitOwnership(
      "v1",
      "u1",
    );
    expect(out).toBe(true);
    expect(h.selectArg()).toBe("id");
  });

  it("false when no row matches (maybeSingle → null)", async () => {
    const h = makeClient({ data: null, error: null });
    const out = await createSupabaseVisitsRepository(h.client).verifyVisitOwnership(
      "v1",
      "u1",
    );
    expect(out).toBe(false);
  });

  it("false on a DB error (route treats vErr as not-authorised)", async () => {
    const h = makeClient({ data: null, error: { message: "boom" } });
    const out = await createSupabaseVisitsRepository(h.client).verifyVisitOwnership(
      "v1",
      "u1",
    );
    expect(out).toBe(false);
  });
});

// ── updatePipelineStatus ───────────────────────────────────────

describe("Supabase VisitsRepository.updatePipelineStatus", () => {
  it("returns {id} when a row matched", async () => {
    const h = makeClient({ data: [{ id: "v1" }], error: null });
    const out = await createSupabaseVisitsRepository(h.client).updatePipelineStatus({
      id: "v1",
      status: "Won",
      userId: "u1",
      isManager: true,
    });
    expect(out).toEqual({ id: "v1" });
    expect(h.selectArg()).toBe("id");
  });

  it("returns null when no row matched the owner filter (404 branch)", async () => {
    const h = makeClient({ data: [], error: null });
    const out = await createSupabaseVisitsRepository(h.client).updatePipelineStatus({
      id: "v1",
      status: "Won",
      userId: "u2",
      isManager: false,
    });
    expect(out).toBeNull();
  });

  it("adds the owner eq filter for sales", async () => {
    const h = makeClient({ data: [], error: null });
    await createSupabaseVisitsRepository(h.client).updatePipelineStatus({
      id: "v1",
      status: "Won",
      userId: "u1",
      isManager: false,
    });
    expect(
      h.calls.some((c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === "u1"),
    ).toBe(true);
  });
});

// ── deleteOwnVisit ─────────────────────────────────────────────

describe("Supabase VisitsRepository.deleteOwnVisit", () => {
  it("filters by id AND user_id", async () => {
    const h = makeClient({ data: null, error: null });
    await createSupabaseVisitsRepository(h.client).deleteOwnVisit("v1", "u1");
    expect(h.calls.some((c) => c.method === "delete")).toBe(true);
    expect(h.calls.some((c) => c.method === "eq" && c.args[0] === "id")).toBe(true);
    expect(
      h.calls.some((c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === "u1"),
    ).toBe(true);
  });

  it("throws ServiceError on a DB error", async () => {
    const h = makeClient({ data: null, error: { message: "boom" } });
    await expect(
      createSupabaseVisitsRepository(h.client).deleteOwnVisit("v1", "u1"),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

// ── updateProspectLocation (best-effort) ───────────────────────

describe("Supabase VisitsRepository.updateProspectLocation", () => {
  it("writes lat/lng/approximate and never throws on a DB error", async () => {
    const h = makeClient({ data: null, error: { message: "boom" } });
    const repo = createSupabaseVisitsRepository(h.client);
    await expect(
      repo.updateProspectLocation({
        visitId: "v1",
        lat: 51.5,
        lng: -0.1,
        approximate: true,
      }),
    ).resolves.toBeUndefined();
    const updateArg = h.calls.find((c) => c.method === "update")
      ?.args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({
      prospect_lat: 51.5,
      prospect_lng: -0.1,
      is_approximate_location: true,
    });
  });
});
