/**
 * tests/unit/auth/session.test.ts
 *
 * F-03 — proves `requireRole(req, allowedRoles)` behaviour with the
 * eight locked cases from the Gate 1 spec. Pure logic, no DB.
 *
 * Each case constructs a NextRequest with the headers under test and
 * either expects a typed-error throw or asserts the returned Caller
 * shape.
 *
 * Style mirrors tests/unit/observability/withRequestContext.test.ts
 * (the 2-line in-file `makeRequest` helper).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import type { Role } from "@/lib/domain";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/test", { headers });
}

describe("requireRole", () => {
  // ── (a) ───────────────────────────────────────────────────────
  it("throws UnauthorizedError (401) when x-mfs-user-id header is absent", () => {
    const req = makeRequest({ "x-mfs-user-role": "admin" });
    expect(() => requireRole(req, ["admin"])).toThrow(UnauthorizedError);
    try {
      requireRole(req, ["admin"]);
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).httpStatus).toBe(401);
      expect((err as UnauthorizedError).code).toBe("UNAUTHORIZED");
    }
  });

  // ── (b) ───────────────────────────────────────────────────────
  it("throws UnauthorizedError (401) when x-mfs-user-role header is absent", () => {
    const req = makeRequest({ "x-mfs-user-id": "u-1" });
    expect(() => requireRole(req, ["admin"])).toThrow(UnauthorizedError);
  });

  // ── (c) ───────────────────────────────────────────────────────
  it("throws UnauthorizedError (401) when x-mfs-user-role is an unknown role string", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-1",
      "x-mfs-user-role": "ghost",
    });
    expect(() => requireRole(req, ["admin"])).toThrow(UnauthorizedError);
  });

  // ── (d) ───────────────────────────────────────────────────────
  it("throws ForbiddenError (403) when primary role is not in allowedRoles and no secondary matches", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-1",
      "x-mfs-user-role": "driver",
      "x-mfs-secondary-roles": "",
    });
    expect(() => requireRole(req, ["admin", "office"])).toThrow(ForbiddenError);
    try {
      requireRole(req, ["admin", "office"]);
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).httpStatus).toBe(403);
      expect((err as ForbiddenError).code).toBe("FORBIDDEN");
    }
  });

  // ── (e) ───────────────────────────────────────────────────────
  it("returns a Caller when primary role is in allowedRoles", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-42",
      "x-mfs-user-role": "admin",
    });
    const caller = requireRole(req, ["admin", "office"]);
    expect(caller.userId).toBe("u-42");
    expect(caller.role).toBe("admin");
    expect(typeof caller.correlationId).toBe("string");
    expect(caller.correlationId.length).toBeGreaterThan(0);
    // Structural assertion: exactly the three documented keys, no more.
    expect(Object.keys(caller).sort()).toEqual([
      "correlationId",
      "role",
      "userId",
    ]);
  });

  // ── (f) ───────────────────────────────────────────────────────
  it("returns a Caller when primary is not allowed but a secondary role IS in allowedRoles (multi-role grant)", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-2",
      "x-mfs-user-role": "sales",
      "x-mfs-secondary-roles": "office,warehouse",
    });
    const caller = requireRole(req, ["office"]);
    expect(caller.role).toBe("sales"); // primary is kept on the returned Caller
    expect(caller.userId).toBe("u-2");
  });

  // ── (g) ───────────────────────────────────────────────────────
  it("throws ForbiddenError (403) when primary is office and secondary contains admin and allowedRoles is admin only (secondary-admin filter)", () => {
    // This is the load-bearing "ghost admin" safety rule mirrored
    // from middleware.ts:128. A user whose secondaryRoles contains
    // 'admin' must NOT be silently elevated. requireRole filters
    // 'admin' OUT of the secondary list before the union, so the
    // only role left to match is the primary 'office' — which is
    // not in ['admin'], hence 403.
    const req = makeRequest({
      "x-mfs-user-id": "u-3",
      "x-mfs-user-role": "office",
      "x-mfs-secondary-roles": "admin",
    });
    expect(() => requireRole(req, ["admin"])).toThrow(ForbiddenError);
  });

  // ── (h) ───────────────────────────────────────────────────────
  it("returned Caller is structurally typed correctly (userId: string, role: Role union)", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-9",
      "x-mfs-user-role": "butcher",
    });
    const caller = requireRole(req, ["butcher"]);
    // Compile-time + runtime assertions on the documented shape.
    const userIdTyped: string = caller.userId as string; // F-FND-03 Caller.userId is string | null; on success it is string.
    expect(typeof userIdTyped).toBe("string");
    const roleTyped: Role = caller.role as Role; // On success it is non-null.
    expect([
      "warehouse",
      "office",
      "sales",
      "admin",
      "driver",
      "butcher",
    ]).toContain(roleTyped);
  });
});
