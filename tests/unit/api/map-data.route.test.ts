/**
 * tests/unit/api/map-data.route.test.ts
 *
 * F-20 PR3 — proves the re-pointed GET /api/map/data route is a thin doorman over
 * MapDataService: the x-mfs-user-id guard is byte-identical (401), the
 * layer/from/to params thread through to mapDataService.load, a thrown
 * ServiceError → 500 'Server error' (the Locked-item-1 accepted deviation from
 * today's silent-empty-at-200), and a success returns { customers, visits } at
 * 200. The MapCustomer/MapVisit re-export still resolves (type-level import).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ServiceError } from "@/lib/errors";
// Proves the route's re-export line still resolves these names (Locked invariant).
import type { MapCustomer, MapVisit } from "@/app/api/map/data/route";

const load = vi.fn();

vi.mock("@/lib/wiring/mapData", () => ({
  mapDataService: { load: (...a: unknown[]) => load(...a) },
}));

import { GET } from "@/app/api/map/data/route";

function makeReq(
  url: string,
  headers: Record<string, string> = { "x-mfs-user-id": "u-1" },
): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "GET", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  load.mockResolvedValue({ customers: [], visits: [] });
});

describe("GET /api/map/data — guard (byte-identical)", () => {
  it("returns 401 when x-mfs-user-id is absent", async () => {
    const res = await GET(makeReq("/api/map/data", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(load).not.toHaveBeenCalled();
  });
});

describe("GET /api/map/data — param threading + response shape", () => {
  it("threads layer/from/to to mapDataService.load and returns { customers, visits } 200", async () => {
    const customer: MapCustomer = {
      id: "c1",
      name: "Geo Co",
      postcode: "S1 2AB",
      code: null,
      active: true,
      lat: 53.38,
      lng: -1.47,
      is_approximate: false,
    };
    const visit: MapVisit = {
      id: "v1",
      lat: 51.5,
      lng: -0.12,
      visit_type: "routine",
      outcome: "positive",
      rep: "Hakan",
      customer_name: "Acme",
      created_at: "2026-06-20T10:00:00.000Z",
      is_prospect: false,
      is_approximate: false,
    };
    load.mockResolvedValue({ customers: [customer], visits: [visit] });

    const res = await GET(
      makeReq("/api/map/data?layer=customers&from=2026-06-01&to=2026-06-30"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["customers", "visits"]);
    expect(body).toEqual({ customers: [customer], visits: [visit] });
    expect(load).toHaveBeenCalledWith({
      layer: "customers",
      window: { from: "2026-06-01", to: "2026-06-30" },
    });
  });

  it("defaults layer to 'all' and from/to to null when absent", async () => {
    await GET(makeReq("/api/map/data"));
    expect(load).toHaveBeenCalledWith({
      layer: "all",
      window: { from: null, to: null },
    });
  });
});

describe("GET /api/map/data — read failure (Locked-item-1 deviation)", () => {
  it("a ServiceError from load → 500 'Server error' (not silent-empty-at-200)", async () => {
    load.mockRejectedValue(new ServiceError("Map customers read failed"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(makeReq("/api/map/data"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
    errSpy.mockRestore();
  });
});
