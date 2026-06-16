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
 * All routes go through usersService (service-role posture) — same as today.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  api,
  setupTestUsers,
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
