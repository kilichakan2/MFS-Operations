/**
 * tests/unit/api/admin-context-route-guards.route.test.ts
 *
 * F-RLS-04i — route-level guard tests for the admin-context routes that gained
 * `requireRole(req, ['admin'])` standardization but had NO existing per-route
 * guard unit test: admin/runs GET (#15), admin/runs/[id] PATCH+DELETE (#13), and
 * admin/visits GET (#14). (The customers/products/import/insights/map/geocode
 * routes are guard-tested in their own existing spec files, updated in this same
 * unit.)
 *
 * Mirrors `haccp-route-guards.route.test.ts`: invoke each handler DIRECTLY
 * (bypassing middleware), mock the wiring `…ForCaller` factory, and assert:
 *   (1) absent x-mfs-user-id → 401 (no identity), factory NOT called;
 *   (2) non-admin role header → 403 'Admin only', factory NOT called;
 *   (3) admin header → handler reaches the mocked service AND the `…ForCaller`
 *       mock was awaited with the HEADER userId;
 *   (4) R-SEC forged-header: an admin COOKIE paired with a non-admin HEADER is
 *       REFUSED (the guard reads headers, not cookies), exercising the
 *       secondary-role 'ghost admin' filter where relevant.
 *
 * The wiring modules are mocked so no route touches Supabase.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocked services + their ForCaller factories ─────────────────
const listWeekRuns = vi.fn();
const setRouteStatus = vi.fn();
const deleteRoute = vi.fn();
const routesServiceForCaller = vi.fn(async (_id: string) => ({
  listWeekRuns: (...a: unknown[]) => listWeekRuns(...a),
  setRouteStatus: (...a: unknown[]) => setRouteStatus(...a),
  deleteRoute: (...a: unknown[]) => deleteRoute(...a),
}));

const listAllWithFilters = vi.fn();
const visitsServiceForCaller = vi.fn(async (_id: string) => ({
  listAllWithFilters: (...a: unknown[]) => listAllWithFilters(...a),
}));

vi.mock("@/lib/wiring/routes", () => ({
  routesService: {},
  routesServiceForCaller: (id: string) => routesServiceForCaller(id),
}));
vi.mock("@/lib/wiring/visits", () => ({
  visitsService: {},
  visitsServiceForCaller: (id: string) => visitsServiceForCaller(id),
}));

import { GET as runsGET } from "@/app/api/admin/runs/route";
import { PATCH as runPATCH, DELETE as runDELETE } from "@/app/api/admin/runs/[id]/route";
import { GET as adminVisitsGET } from "@/app/api/admin/visits/route";

const ADMIN = { "x-mfs-user-id": "admin-1", "x-mfs-user-role": "admin" };
const SALES = { "x-mfs-user-id": "s1", "x-mfs-user-role": "sales" };
const params = Promise.resolve({ id: "r1" });

function req(path: string, headers: Record<string, string>, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── #15 admin/runs GET ──────────────────────────────────────────
describe("GET /api/admin/runs — requireRole(['admin'])", () => {
  it("401 'Unauthenticated' when identity absent; factory NOT called", async () => {
    const res = await runsGET(req("/api/admin/runs", { "x-mfs-user-role": "admin" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(routesServiceForCaller).not.toHaveBeenCalled();
  });

  it("403 'Admin only' for a non-admin; factory NOT called", async () => {
    const res = await runsGET(req("/api/admin/runs", SALES));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(routesServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → 200 and factory minted with the HEADER userId", async () => {
    listWeekRuns.mockResolvedValueOnce({ runs: [], from: "a", to: "b" });
    const res = await runsGET(req("/api/admin/runs", ADMIN));
    expect(res.status).toBe(200);
    expect(routesServiceForCaller).toHaveBeenCalledWith("admin-1");
  });

  it("R-SEC: admin COOKIE + non-admin HEADER is refused (header is the trust source)", async () => {
    const r = new NextRequest("http://localhost/api/admin/runs", {
      method: "GET",
      headers: { ...SALES, cookie: "mfs_role=admin; mfs_user_id=admin-1" },
    });
    const res = await runsGET(r);
    expect(res.status).toBe(403);
    expect(routesServiceForCaller).not.toHaveBeenCalled();
  });
});

// ── #13 admin/runs/[id] PATCH + DELETE ──────────────────────────
describe("PATCH /api/admin/runs/[id] — requireRole(['admin'])", () => {
  it("401 when identity absent; factory NOT called", async () => {
    const res = await runPATCH(
      req("/api/admin/runs/r1", { "x-mfs-user-role": "admin" }, "PATCH", { status: "active" }),
      { params },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(routesServiceForCaller).not.toHaveBeenCalled();
  });

  it("403 for a non-admin; factory NOT called", async () => {
    const res = await runPATCH(
      req("/api/admin/runs/r1", SALES, "PATCH", { status: "active" }),
      { params },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(routesServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → factory minted with HEADER userId; setRouteStatus reached", async () => {
    setRouteStatus.mockResolvedValueOnce({
      id: "r1", name: "Run", plannedDate: "2026-06-20", status: "active",
    });
    const res = await runPATCH(
      req("/api/admin/runs/r1", ADMIN, "PATCH", { status: "active" }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(routesServiceForCaller).toHaveBeenCalledWith("admin-1");
  });
});

describe("DELETE /api/admin/runs/[id] — requireRole(['admin'])", () => {
  it("401 when identity absent; factory NOT called", async () => {
    const res = await runDELETE(
      req("/api/admin/runs/r1", { "x-mfs-user-role": "admin" }, "DELETE"),
      { params },
    );
    expect(res.status).toBe(401);
    expect(routesServiceForCaller).not.toHaveBeenCalled();
  });

  it("403 for a non-admin; factory NOT called", async () => {
    const res = await runDELETE(req("/api/admin/runs/r1", SALES, "DELETE"), { params });
    expect(res.status).toBe(403);
    expect(routesServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → 204 and factory minted with HEADER userId", async () => {
    deleteRoute.mockResolvedValueOnce(undefined);
    const res = await runDELETE(req("/api/admin/runs/r1", ADMIN, "DELETE"), { params });
    expect(res.status).toBe(204);
    expect(routesServiceForCaller).toHaveBeenCalledWith("admin-1");
  });
});

// ── #14 admin/visits GET ────────────────────────────────────────
describe("GET /api/admin/visits — requireRole(['admin'])", () => {
  it("401 when identity absent; factory NOT called", async () => {
    const res = await adminVisitsGET(req("/api/admin/visits", { "x-mfs-user-role": "admin" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(visitsServiceForCaller).not.toHaveBeenCalled();
  });

  it("403 for a non-admin; factory NOT called", async () => {
    const res = await adminVisitsGET(req("/api/admin/visits", SALES));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(visitsServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → 200 and factory minted with the HEADER userId (cross-rep via is_admin())", async () => {
    listAllWithFilters.mockResolvedValueOnce([]);
    const res = await adminVisitsGET(req("/api/admin/visits", ADMIN));
    expect(res.status).toBe(200);
    expect(visitsServiceForCaller).toHaveBeenCalledWith("admin-1");
  });

  it("R-SEC: admin COOKIE + non-admin HEADER is refused", async () => {
    const r = new NextRequest("http://localhost/api/admin/visits", {
      method: "GET",
      headers: { ...SALES, cookie: "mfs_role=admin; mfs_user_id=admin-1" },
    });
    const res = await adminVisitsGET(r);
    expect(res.status).toBe(403);
    expect(visitsServiceForCaller).not.toHaveBeenCalled();
  });

  it("R-SEC ghost-admin: a SECONDARY 'admin' role is filtered out (still 403)", async () => {
    const res = await adminVisitsGET(
      req("/api/admin/visits", {
        "x-mfs-user-id": "s1",
        "x-mfs-user-role": "sales",
        "x-mfs-secondary-roles": "admin",
      }),
    );
    expect(res.status).toBe(403);
    expect(visitsServiceForCaller).not.toHaveBeenCalled();
  });
});
