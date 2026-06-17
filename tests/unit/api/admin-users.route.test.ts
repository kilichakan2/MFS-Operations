/**
 * tests/unit/api/admin-users.route.test.ts
 *
 * F-RLS-04b (W3) — independently exercises the route-level admin guard on
 * GET /api/admin/users by invoking the handler DIRECTLY, bypassing middleware.
 *
 * Why this exists: the integration suite reaches GET through middleware, which
 * 307-redirects a non-admin BEFORE the handler runs — so the route's own
 * requireRole(req, ['admin']) 403 branch is never exercised there. This test
 * calls GET(req) with non-admin x-mfs-user-* headers and asserts the handler
 * itself returns 403. It FAILS if someone deletes the requireRole call from GET
 * (without the guard the handler proceeds to usersServiceForCaller → 200).
 *
 * The wiring singleton is mocked so the route never touches the DB. In the
 * non-admin case requireRole throws ForbiddenError before the service is awaited,
 * so the mock is not even reached; in the admin case the mock returns a stub
 * service to prove the guard lets an admin through to the handler body (200).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// Stand in for the wired usersServiceForCaller — never hits the DB.
const listAllUsers = vi.fn();

vi.mock("@/lib/wiring/users", () => ({
  usersServiceForCaller: vi.fn(async () => ({
    listAllUsers: (...args: unknown[]) => listAllUsers(...args),
  })),
}));

import { GET } from "@/app/api/admin/users/route";

function makeReq(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/admin/users", {
    method: "GET",
    headers,
  });
}

describe("GET /api/admin/users — route-level admin guard (F-RLS-04b W3)", () => {
  it("returns 403 for a NON-admin caller (requireRole guard, no middleware)", async () => {
    // Non-admin identity headers reach the handler directly (middleware would
    // normally 307 first, but this calls the handler itself). requireRole must
    // throw ForbiddenError → the route maps it to 403 'Admin only'.
    const res = await GET(
      makeReq({
        "x-mfs-user-id": "warehouse-user-1",
        "x-mfs-user-role": "warehouse",
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    // The non-admin must NEVER reach the user-listing service call.
    expect(listAllUsers).not.toHaveBeenCalled();
  });

  it("returns 401 when no identity headers are present", async () => {
    // No x-mfs-user-id → requireRole throws UnauthorizedError → 401.
    const res = await GET(makeReq({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
    expect(listAllUsers).not.toHaveBeenCalled();
  });

  it("lets an admin caller through the guard to the handler body (200)", async () => {
    // Proves the guard is a gate, not a wall: an admin passes requireRole and
    // the handler returns the (mocked) user list. If requireRole were deleted,
    // the non-admin test above would also reach this 200 path and fail.
    listAllUsers.mockResolvedValueOnce([]);
    const res = await GET(
      makeReq({
        "x-mfs-user-id": "admin-user-1",
        "x-mfs-user-role": "admin",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(listAllUsers).toHaveBeenCalledTimes(1);
  });
});
