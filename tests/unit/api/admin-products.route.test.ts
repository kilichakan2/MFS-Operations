/**
 * tests/unit/api/admin-products.route.test.ts
 *
 * F-20 PR2 — route-level tests for the two re-pointed products routes:
 *   GET   /api/admin/products        (list — bare array)
 *   PATCH /api/admin/products/[id]   (active toggle — single row)
 *
 * These call the handlers DIRECTLY (bypassing middleware), mocking the wiring
 * singleton (productsService) so no DB / network is touched. They pin the
 * things the PR must NOT change:
 *   - the x-mfs-user-role admin guard is PRESERVED byte-identical (403 'Admin only')
 *   - the JSON response shapes are BYTE-IDENTICAL to today:
 *       · GET   = a BARE array of the SEVEN keys
 *         (id, name, category, code, box_size, active, created_at)
 *       · PATCH = a single row of the FIVE-key SUBSET
 *         (id, name, category, active, created_at) — NO code, NO box_size
 *   - the ONE sanctioned behaviour change: PATCH on a missing id → 404
 *     { error: 'Product not found' } (today's .single() yields a 500).
 *
 * Precedent: tests/unit/api/admin-customers.route.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocked wiring singleton ─────────────────────────────────────────────────
const listAll = vi.fn();
const setActive = vi.fn();

vi.mock("@/lib/wiring/products", () => ({
  productsService: {
    listAll: (...a: unknown[]) => listAll(...a),
    setActive: (...a: unknown[]) => setActive(...a),
  },
}));

import { GET } from "@/app/api/admin/products/route";
import { PATCH } from "@/app/api/admin/products/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function listReq(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/admin/products", {
    method: "GET",
    headers,
  });
}
function patchReq(
  headers: Record<string, string>,
  body: unknown,
): NextRequest {
  return new NextRequest("http://localhost/api/admin/products/p1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const ADMIN = { "x-mfs-user-id": "admin-1", "x-mfs-user-role": "admin" };
const params = Promise.resolve({ id: "p1" });

// A full ProductAdminView the GET read would return (7 fields populated).
const FULL_VIEW = {
  id: "p1",
  name: "Lamb leg",
  category: "Lamb",
  code: "LMB-LEG",
  boxSize: "10 kg",
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

// The PATCH read selects only 5 columns, so code/boxSize come back null.
const PATCH_VIEW = {
  id: "p1",
  name: "Lamb leg",
  category: "Lamb",
  code: null,
  boxSize: null,
  active: false,
  created_at: "2026-01-01T00:00:00.000Z",
};

// ── GET /api/admin/products ─────────────────────────────────────────────────
describe("GET /api/admin/products — guard + response shape", () => {
  it("returns 403 'Admin only' for a non-admin (guard byte-identical)", async () => {
    const res = await GET(
      listReq({ "x-mfs-user-id": "w1", "x-mfs-user-role": "warehouse" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(listAll).not.toHaveBeenCalled();
  });

  it("returns the exact 7-key BARE array for an admin", async () => {
    listAll.mockResolvedValueOnce([FULL_VIEW]);
    const res = await GET(listReq(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(Object.keys(body[0]).sort()).toEqual(
      [
        "active",
        "box_size",
        "category",
        "code",
        "created_at",
        "id",
        "name",
      ].sort(),
    );
    expect(body[0]).toEqual({
      id: "p1",
      name: "Lamb leg",
      category: "Lamb",
      code: "LMB-LEG",
      box_size: "10 kg",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    });
  });
});

// ── PATCH /api/admin/products/[id] ──────────────────────────────────────────
describe("PATCH /api/admin/products/[id] — guard + shape + 404", () => {
  it("returns 403 'Admin only' for a non-admin (guard byte-identical)", async () => {
    const res = await PATCH(
      patchReq({ "x-mfs-user-role": "office" }, { active: false }),
      { params },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(setActive).not.toHaveBeenCalled();
  });

  it("returns the exact 5-key SUBSET row (no code, no box_size)", async () => {
    setActive.mockResolvedValueOnce(PATCH_VIEW);
    const res = await PATCH(patchReq(ADMIN, { active: false }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["active", "category", "created_at", "id", "name"].sort(),
    );
    expect(body).toEqual({
      id: "p1",
      name: "Lamb leg",
      category: "Lamb",
      active: false,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(setActive).toHaveBeenCalledWith("p1", false);
  });

  it("returns 404 { error: 'Product not found' } on a missing id (the sanctioned change)", async () => {
    setActive.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq(ADMIN, { active: true }), { params });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Product not found" });
  });
});
