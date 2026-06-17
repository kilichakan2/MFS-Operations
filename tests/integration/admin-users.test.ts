/**
 * tests/integration/admin-users.test.ts
 *
 * Integration tests for the re-pointed admin/auth user routes (F-13 PR2).
 * These pin the three must-fix risks from the plan:
 *   - R-MF-2: read routes must return snake_case keys, never camelCase
 *     (GET /api/admin/users carries the heaviest map-back; /auth/haccp-team
 *     carries secondary_roles and is grouped role-then-name).
 *   - R-MF-1: PATCH /api/admin/users/<missing-id> must still return 500
 *     (today's .single() behaviour preserved — NOT 404, NOT 200).
 *
 * F-13 PR2: routes went through usersService (service-role posture).
 *
 * F-RLS-04b: the 4 ADMIN routes (GET/POST/PATCH/DELETE) now reach the DB as
 * the `authenticated` role via usersServiceForCaller(caller.userId), so the
 * users_insert/update/delete RLS policies (admin-only) are EVALUATED. The
 * second describe block below pins the full admin lifecycle under that keycard
 * client (create incl. duplicate→409, list, update incl. missing-id→500,
 * delete incl. idempotent re-delete) PLUS the new admin guard on GET (a
 * non-admin who reaches GET now gets 403, not 200 — security-positive change
 * folded in at Gate 2).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  setupTestUsers,
  TEST_PREFIX,
  type TestUserSet,
} from "./_setup";

describe("admin/auth user routes (F-13 PR2 re-point)", () => {
  let users: TestUserSet;

  beforeAll(async () => {
    users = await setupTestUsers();
  }, 30_000);

  // ── GET /api/admin/users — casing pin (R-MF-2) ───────────────

  it("GET /api/admin/users returns snake_case keys, no camelCase leak", async () => {
    const res = await api("/api/admin/users", {
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);

    const rows = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    const row = rows[0];
    // snake_case keys MUST be present
    expect(row).toHaveProperty("secondary_roles");
    expect(row).toHaveProperty("last_login_at");
    expect(row).toHaveProperty("created_at");
    expect(row).toHaveProperty("email");
    // camelCase keys MUST NOT leak
    expect(row).not.toHaveProperty("secondaryRoles");
    expect(row).not.toHaveProperty("lastLoginAt");
    expect(row).not.toHaveProperty("createdAt");
  });

  // ── GET /api/auth/haccp-team — casing + grouping pin (R-MF-2) ─

  it("GET /api/auth/haccp-team rows carry secondary_roles, grouped contiguously by role", async () => {
    const res = await api("/api/auth/haccp-team");
    expect(res.status).toBe(200);

    const rows = res.body as Array<{
      id: string;
      name: string;
      role: string;
      secondary_roles?: string[];
    }>;
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row).toHaveProperty("secondary_roles");
      expect(row).not.toHaveProperty("secondaryRoles");
      expect(["butcher", "warehouse"]).toContain(row.role);
    }

    // role-first ordering: roles must appear in non-decreasing order, so once
    // a 'warehouse' row appears no later row may be a 'butcher'. (Name order
    // within a role is the DB's collation — not re-asserted here to avoid a
    // JS-vs-SQL collation mismatch; the route delegates ordering to the
    // adapter via orderBy: ['role','name'].)
    // Rows are grouped by role (orderBy: ['role','name']): each role's rows are
    // contiguous — a role never reappears after a different role has started.
    // (The exact role order is the DB's — `role` is a Postgres enum, so it
    // sorts by enum-declaration order, not alphabetically; we assert the
    // grouping is preserved, which is the behaviour the route guarantees.)
    const roleSeq = rows.map((r) => r.role);
    const seenRoles: string[] = [];
    for (let i = 0; i < roleSeq.length; i++) {
      if (i === 0 || roleSeq[i] !== roleSeq[i - 1]) {
        // entering a (possibly) new role block — it must not have appeared before
        expect(seenRoles.includes(roleSeq[i])).toBe(false);
        seenRoles.push(roleSeq[i]);
      }
    }
  });

  // ── PATCH /api/admin/users/<missing-id> → 500 (R-MF-1) ───────

  it("PATCH /api/admin/users/<missing-id> returns 500 (not 404, not 200)", async () => {
    const missingId = "00000000-0000-0000-0000-000000000000";
    const res = await api(`/api/admin/users/${missingId}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { active: false },
    });
    // Today's .single() on a zero-row UPDATE errors → the route's catch
    // emits 500. PR2 maps the service's null to the same 500 (R-MF-1), so a
    // missing id must NOT become 404 or a silent 200.
    expect(res.status).toBe(500);
  });

  // ── POST /api/admin/users duplicate name → 409 (F-TD-22) ─────

  it("POST /api/admin/users with a duplicate name returns 409", async () => {
    // users.butcher.name (ANVIL-TEST-butcher) is already seeded. Re-creating
    // it must hit the new UNIQUE lower(name) index → 23505 → ConflictError →
    // HTTP 409 with the friendly message (never a raw 500 / Postgres code).
    // A rejected create persists nothing, so no cleanup is needed.
    const res = await api("/api/admin/users", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: {
        name: users.butcher.name,
        role: "warehouse",
        credential: "1234",
      },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error?: string }).error).toBe(
      "A user with that name already exists.",
    );
  });
});

// ── F-RLS-04b: the 4 admin routes under the authenticated keycard client ──
//
// These run as the Postgres `authenticated` role (the session cookie →
// middleware sets x-mfs-user-id → usersServiceForCaller mints a token →
// keycard client). The users_insert/update/delete policies (admin-only) must
// let a real admin through, and the new GET admin guard must 403 a non-admin.

describe("admin users routes under RLS keycard (F-RLS-04b)", () => {
  let users: TestUserSet;
  const created: string[] = [];

  beforeAll(async () => {
    users = await setupTestUsers();
  }, 30_000);

  afterAll(async () => {
    // Remove any users this suite created (admin DELETE is itself the
    // teardown for the happy-path delete; this mops up create/patch rows).
    if (created.length === 0) return;
    const { getServiceClient } = await import("./_setup");
    const supa = getServiceClient();
    for (const id of created) {
      await supa.from("users").delete().eq("id", id);
    }
  });

  // ── GET admin guard (Gate 2 ruling) ──────────────────────────

  it("GET /api/admin/users as admin lists all users (200)", async () => {
    const res = await api("/api/admin/users", {
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/admin/users as a NON-admin is denied (middleware 307 before the route's 403 guard)", async () => {
    // Defence in depth, TWO layers:
    //   1. middleware.ts gates /api/admin/* at the PATH level — only the
    //      admin role's ROLE_PERMISSIONS includes /api/admin. A warehouse
    //      session is not permitted, so middleware 307-redirects it to the
    //      warehouse role-home BEFORE the route handler ever runs.
    //   2. the route's own requireRole(req,['admin']) would return 403 if a
    //      non-admin request ever reached it (it cannot in production — see
    //      layer 1 — but the guard is genuine belt-and-braces).
    // The observable, real-world outcome for a non-admin is therefore the
    // middleware redirect (307), and crucially the user list is NEVER served.
    const res = await api("/api/admin/users", {
      role: "warehouse",
      userId: users.warehouse.id,
    });
    expect(res.status).toBe(307);
    // The non-admin must NOT receive the user list — the redirect body is a
    // Next.js redirect stub, never the JSON array the admin path returns.
    expect(Array.isArray(res.body)).toBe(false);
  });

  // ── POST create under keycard, incl. read-back + snake_case ──

  it("POST /api/admin/users as admin creates (201) under the keycard and reads back snake_case", async () => {
    const name = `${TEST_PREFIX}rls04b-create-${Date.now()}`;
    const res = await api("/api/admin/users", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { name, role: "warehouse", credential: "1234" },
    });
    expect(res.status).toBe(201);
    const row = res.body as Record<string, unknown>;
    expect(row).toHaveProperty("id");
    if (typeof row.id === "string") created.push(row.id);
    // R-MF-2 snake_case projection survives the keycard path.
    expect(row).toHaveProperty("secondary_roles");
    expect(row).toHaveProperty("last_login_at");
    expect(row).not.toHaveProperty("secondaryRoles");
    expect(row.name).toBe(name);
    expect(row.role).toBe("warehouse");
  });

  it("POST /api/admin/users duplicate name under the keycard still maps 23505→409", async () => {
    // ConflictError fires from the lower(name) unique index regardless of which
    // client issued the INSERT — pin that it survives the authenticated path.
    const res = await api("/api/admin/users", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { name: users.butcher.name, role: "warehouse", credential: "1234" },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error?: string }).error).toBe(
      "A user with that name already exists.",
    );
  });

  // ── PATCH under keycard, incl. R-MF-1 missing-id→500 ─────────

  it("PATCH /api/admin/users/<id> as admin updates (200) under the keycard", async () => {
    const name = `${TEST_PREFIX}rls04b-patch-${Date.now()}`;
    const createRes = await api("/api/admin/users", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { name, role: "warehouse", credential: "1234" },
    });
    expect(createRes.status).toBe(201);
    const id = (createRes.body as { id: string }).id;
    created.push(id);

    const res = await api(`/api/admin/users/${id}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { active: false },
    });
    expect(res.status).toBe(200);
    expect((res.body as { active?: boolean }).active).toBe(false);
  });

  it("PATCH /api/admin/users/<missing-id> as admin still returns 500 under the keycard (R-MF-1)", async () => {
    const missingId = "00000000-0000-0000-0000-000000000000";
    const res = await api(`/api/admin/users/${missingId}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { active: false },
    });
    expect(res.status).toBe(500);
  });

  // ── DELETE under keycard, incl. idempotent re-delete ─────────

  it("DELETE /api/admin/users/<id> as admin deletes (200) and re-delete is idempotent", async () => {
    const name = `${TEST_PREFIX}rls04b-delete-${Date.now()}`;
    const createRes = await api("/api/admin/users", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { name, role: "warehouse", credential: "1234" },
    });
    expect(createRes.status).toBe(201);
    const id = (createRes.body as { id: string }).id;

    const del1 = await api(`/api/admin/users/${id}`, {
      method: "DELETE",
      role: "admin",
      userId: users.admin.id,
    });
    expect(del1.status).toBe(200);

    // Re-deleting an already-absent row is a silent no-op (idempotent).
    const del2 = await api(`/api/admin/users/${id}`, {
      method: "DELETE",
      role: "admin",
      userId: users.admin.id,
    });
    expect(del2.status).toBe(200);
  });
});
