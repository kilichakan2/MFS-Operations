/**
 * tests/unit/api/admin-customers.route.test.ts
 *
 * F-20 PR1 — route-level tests for the two re-pointed customer routes:
 *   GET  /api/admin/customers        (list)
 *   PATCH /api/admin/customers/[id]  (active toggle + postcode/geocode)
 *
 * These call the handlers DIRECTLY (bypassing middleware), mocking the wiring
 * singletons (customersService, geocoder) so no DB / network is touched. They
 * pin TWO things the PR must NOT change:
 *   - the x-mfs-user-role admin guard is PRESERVED byte-identical (403 'Admin only')
 *   - the JSON response shapes are BYTE-IDENTICAL to today (exact snake_case keys)
 *
 * Precedent: tests/unit/api/admin-users.route.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocked wiring singletons ────────────────────────────────────────────────
const listAll = vi.fn();
const setActive = vi.fn();
const setPostcodeAndCoords = vi.fn();
const geocode = vi.fn();

const customersServiceForCaller = vi.fn(async (_id: string) => ({
  listAll: (...a: unknown[]) => listAll(...a),
  setActive: (...a: unknown[]) => setActive(...a),
  setPostcodeAndCoords: (...a: unknown[]) => setPostcodeAndCoords(...a),
}));

vi.mock("@/lib/wiring/customers", () => ({
  customersService: {
    listAll: (...a: unknown[]) => listAll(...a),
    setActive: (...a: unknown[]) => setActive(...a),
    setPostcodeAndCoords: (...a: unknown[]) => setPostcodeAndCoords(...a),
  },
  customersServiceForCaller: (id: string) => customersServiceForCaller(id),
}));
vi.mock("@/lib/wiring/geocoder", () => ({
  geocoder: { geocode: (...a: unknown[]) => geocode(...a) },
}));

import { GET } from "@/app/api/admin/customers/route";
import { PATCH } from "@/app/api/admin/customers/[id]/route";
import { GeocoderError } from "@/lib/ports";

beforeEach(() => {
  vi.clearAllMocks();
  // The PATCH route fires a road-time trigger via global fetch — stub it so the
  // fire-and-forget never hits the network.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as unknown as Response));
});

function listReq(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/admin/customers", {
    method: "GET",
    headers,
  });
}
function patchReq(
  headers: Record<string, string>,
  body: unknown,
): NextRequest {
  return new NextRequest("http://localhost/api/admin/customers/c1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const ADMIN = { "x-mfs-user-id": "admin-1", "x-mfs-user-role": "admin" };
const params = Promise.resolve({ id: "c1" });

// ── GET /api/admin/customers ────────────────────────────────────────────────
describe("GET /api/admin/customers — guard + response shape", () => {
  it("returns 401 'Unauthenticated' when identity is absent", async () => {
    const res = await GET(listReq({ "x-mfs-user-role": "admin" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(customersServiceForCaller).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });

  it("returns 403 'Admin only' for a non-admin", async () => {
    const res = await GET(
      listReq({ "x-mfs-user-id": "w1", "x-mfs-user-role": "warehouse" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(customersServiceForCaller).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });

  it("an admin COOKIE with a non-admin HEADER is refused (header is the trust source)", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/admin/customers", {
        method: "GET",
        headers: {
          "x-mfs-user-id": "w1",
          "x-mfs-user-role": "warehouse",
          cookie: "mfs_role=admin; mfs_user_id=admin-1",
        },
      }),
    );
    expect(res.status).toBe(403);
    expect(customersServiceForCaller).not.toHaveBeenCalled();
  });

  it("returns the exact 7-key snake_case array for an admin (factory minted with header id)", async () => {
    listAll.mockResolvedValueOnce([
      {
        id: "c1",
        name: "Alpha",
        postcode: "S3 8DG",
        lat: 53.38,
        lng: -1.47,
        active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        // extra owned fields the route must NOT leak:
        geocoded_at: "2026-01-01T00:00:00.000Z",
        is_approximate_location: false,
      },
    ]);
    const res = await GET(listReq(ADMIN));
    expect(res.status).toBe(200);
    expect(customersServiceForCaller).toHaveBeenCalledWith("admin-1");
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(Object.keys(body[0]).sort()).toEqual(
      ["active", "created_at", "id", "lat", "lng", "name", "postcode"].sort(),
    );
    expect(body[0]).toEqual({
      id: "c1",
      name: "Alpha",
      postcode: "S3 8DG",
      lat: 53.38,
      lng: -1.47,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    });
  });
});

// ── PATCH /api/admin/customers/[id] ─────────────────────────────────────────
describe("PATCH /api/admin/customers/[id] — guard + branches + shape", () => {
  it("returns 401 'Unauthenticated' when identity is absent", async () => {
    const res = await PATCH(
      patchReq({ "x-mfs-user-role": "admin" }, { active: false }),
      { params },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(customersServiceForCaller).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("returns 403 'Admin only' for a non-admin", async () => {
    const res = await PATCH(
      patchReq({ "x-mfs-user-id": "o1", "x-mfs-user-role": "office" }, { active: false }),
      { params },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(customersServiceForCaller).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("active branch: returns the 7-key snake_case row", async () => {
    setActive.mockResolvedValueOnce({
      id: "c1",
      name: "Alpha",
      postcode: "S3 8DG",
      lat: 53.38,
      lng: -1.47,
      active: false,
      created_at: "2026-01-01T00:00:00.000Z",
      geocoded_at: null,
      is_approximate_location: false,
    });
    const res = await PATCH(patchReq(ADMIN, { active: false }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["active", "created_at", "id", "lat", "lng", "name", "postcode"].sort(),
    );
    expect(body.active).toBe(false);
    expect(setActive).toHaveBeenCalledWith("c1", false);
  });

  it("postcode branch (geocoded): returns row + _geocoded/_approximate, no _warning", async () => {
    geocode.mockResolvedValueOnce({ lat: 53.38, lng: -1.47, approximate: false });
    setPostcodeAndCoords.mockResolvedValueOnce({
      id: "c1",
      name: "Alpha",
      postcode: "S3 8DG",
      lat: 53.38,
      lng: -1.47,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await PATCH(patchReq(ADMIN, { postcode: "s3 8dg" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._geocoded).toBe(true);
    expect(body._approximate).toBe(false);
    // _warning is undefined → omitted from the JSON
    expect("_warning" in body).toBe(false);
    expect(body.id).toBe("c1");
    // service was handed the normalised postcode + resolved coords
    expect(setPostcodeAndCoords).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        postcode: "S3 8DG",
        lat: 53.38,
        lng: -1.47,
        is_approximate_location: false,
      }),
    );
  });

  it("postcode branch (geocode failed): returns _geocoded:false + _warning, coords null", async () => {
    geocode.mockResolvedValueOnce(null);
    setPostcodeAndCoords.mockResolvedValueOnce({
      id: "c1",
      name: "Alpha",
      postcode: "S3 8DG",
      lat: null,
      lng: null,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await PATCH(patchReq(ADMIN, { postcode: "S3 8DG" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._geocoded).toBe(false);
    expect(body._approximate).toBe(false);
    expect(body._warning).toBe(
      "Postcode saved but could not be geocoded — will retry on next sync",
    );
    expect(setPostcodeAndCoords).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        postcode: "S3 8DG",
        lat: null,
        lng: null,
        geocoded_at: null,
        is_approximate_location: false,
      }),
    );
  });

  it("postcode branch (geocoder OUTAGE — GeocoderError): saves postcode with null coords, 200 + _warning", async () => {
    // A postcodes.io transport failure must NOT lose the admin's edit: the route
    // treats a thrown GeocoderError the same as a clean not-found (coords = null),
    // so the save-with-null-coords + 200 + _warning path runs unchanged.
    geocode.mockRejectedValueOnce(new GeocoderError("postcodes.io request failed"));
    setPostcodeAndCoords.mockResolvedValueOnce({
      id: "c1",
      name: "Alpha",
      postcode: "S3 8DG",
      lat: null,
      lng: null,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await PATCH(patchReq(ADMIN, { postcode: "S3 8DG" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._geocoded).toBe(false);
    expect(body._approximate).toBe(false);
    expect(body._warning).toBe(
      "Postcode saved but could not be geocoded — will retry on next sync",
    );
    // the postcode IS saved, with null coords + null geocoded_at
    expect(setPostcodeAndCoords).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        postcode: "S3 8DG",
        lat: null,
        lng: null,
        geocoded_at: null,
        is_approximate_location: false,
      }),
    );
  });

  it("postcode branch: a NON-GeocoderError keeps bubbling to the generic 500 (real bugs not swallowed)", async () => {
    geocode.mockRejectedValueOnce(new TypeError("boom — unexpected bug"));
    const res = await PATCH(patchReq(ADMIN, { postcode: "S3 8DG" }), { params });
    expect(res.status).toBe(500);
    // the postcode is NOT saved when an unexpected error escapes
    expect(setPostcodeAndCoords).not.toHaveBeenCalled();
  });

  it("postcode branch: 400 when postcode is empty", async () => {
    const res = await PATCH(patchReq(ADMIN, { postcode: "   " }), { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "postcode is required" });
    expect(geocode).not.toHaveBeenCalled();
  });

  it("postcode branch: 400 on an invalid UK postcode", async () => {
    const res = await PATCH(patchReq(ADMIN, { postcode: "NOTAPOSTCODE" }), {
      params,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("doesn't look like a valid UK postcode");
    expect(geocode).not.toHaveBeenCalled();
  });

  it("returns 400 when no valid field to update", async () => {
    const res = await PATCH(patchReq(ADMIN, {}), { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No valid field to update" });
  });
});
