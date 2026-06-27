/**
 * tests/unit/api/admin-geocode-all.route.test.ts
 *
 * F-20 PR1 — pins the geocode-all guard SWAP and the preserved summary shape.
 *
 * This is the ONE deliberate behaviour change in PR1: the old
 * `?secret=geocode2024` URL guard is replaced by requireRole(req, ['admin']).
 * Middleware already stamps x-mfs-user-id + x-mfs-user-role on
 * /api/admin/geocode-all (SHARED_API_PATHS), so an authenticated admin reaches
 * the handler with the identity headers requireRole needs.
 *
 * The handler is called DIRECTLY (bypassing middleware), with the
 * customersService + geocoder wiring singletons mocked so no DB / network is
 * touched. We assert:
 *   - old ?secret=geocode2024 (non-admin identity) now returns 403, NOT 200
 *   - a non-admin returns 403
 *   - missing identity returns 401
 *   - an admin returns 200 with the byte-identical summary shape
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listUngeocoded = vi.fn();
const setCoords = vi.fn();
const geocodeMany = vi.fn();

const customersServiceForCaller = vi.fn(async (_id: string) => ({
  listUngeocoded: (...a: unknown[]) => listUngeocoded(...a),
  setCoords: (...a: unknown[]) => setCoords(...a),
}));

vi.mock("@/lib/wiring/customers", () => ({
  customersService: {
    listUngeocoded: (...a: unknown[]) => listUngeocoded(...a),
    setCoords: (...a: unknown[]) => setCoords(...a),
  },
  customersServiceForCaller: (id: string) => customersServiceForCaller(id),
}));
vi.mock("@/lib/wiring/geocoder", () => ({
  geocoder: { geocodeMany: (...a: unknown[]) => geocodeMany(...a) },
}));

import { GET } from "@/app/api/admin/geocode-all/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function req(url: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(url, { method: "GET", headers });
}
const ADMIN = { "x-mfs-user-id": "admin-1", "x-mfs-user-role": "admin" };

describe("GET /api/admin/geocode-all — guard SWAP (?secret → requireRole)", () => {
  it("the OLD ?secret=geocode2024 (no admin identity) now returns 403, not 200", async () => {
    const res = await GET(
      req("http://localhost/api/admin/geocode-all?secret=geocode2024", {
        "x-mfs-user-id": "w1",
        "x-mfs-user-role": "warehouse",
      }),
    );
    expect(res.status).toBe(403);
    expect(listUngeocoded).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin caller", async () => {
    const res = await GET(
      req("http://localhost/api/admin/geocode-all", {
        "x-mfs-user-id": "w1",
        "x-mfs-user-role": "warehouse",
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
  });

  it("returns 401 when no identity headers are present", async () => {
    const res = await GET(
      req("http://localhost/api/admin/geocode-all", {}),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });

  it("admin with nothing to geocode returns the 'Nothing to geocode' summary", async () => {
    listUngeocoded.mockResolvedValueOnce([]);
    const res = await GET(
      req("http://localhost/api/admin/geocode-all", ADMIN),
    );
    expect(res.status).toBe(200);
    expect(customersServiceForCaller).toHaveBeenCalledWith("admin-1");
    expect(await res.json()).toEqual({
      message: "Nothing to geocode.",
      geocoded: 0,
      approximate: 0,
      failed: 0,
      failed_list: [],
    });
  });

  it("admin: returns the byte-identical completion summary shape", async () => {
    listUngeocoded.mockResolvedValueOnce([
      { id: "c1", name: "Exact Co", postcode: "S3 8DG" },
      { id: "c2", name: "Approx Co", postcode: "S70 1KW" },
      { id: "c3", name: "Missing Co", postcode: "ZZ9 9ZZ" },
    ]);
    const map = new Map<string, { lat: number; lng: number; approximate: boolean } | null>([
      ["S3 8DG", { lat: 53.38, lng: -1.47, approximate: false }],
      ["S70 1KW", { lat: 53.55, lng: -1.48, approximate: true }],
      ["ZZ9 9ZZ", null],
    ]);
    geocodeMany.mockResolvedValueOnce(map);
    setCoords.mockResolvedValue(undefined);

    const res = await GET(
      req("http://localhost/api/admin/geocode-all", ADMIN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["approximate", "failed", "failed_list", "geocoded", "message", "total_input"].sort(),
    );
    expect(body.message).toBe("Geocoding complete.");
    expect(body.total_input).toBe(3);
    expect(body.geocoded).toBe(1);
    expect(body.approximate).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.failed_list).toEqual([
      "Missing Co (ZZ9 9ZZ) — outcode ZZ9 also not found",
    ]);
    // exact + approximate rows were persisted; the miss was not.
    expect(setCoords).toHaveBeenCalledTimes(2);
    expect(setCoords).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ lat: 53.38, lng: -1.47, is_approximate_location: false }),
    );
    expect(setCoords).toHaveBeenCalledWith(
      "c2",
      expect.objectContaining({ lat: 53.55, lng: -1.48, is_approximate_location: true }),
    );
  });
});
