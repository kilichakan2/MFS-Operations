/**
 * tests/unit/adapters/postcodes/Geocoder.test.ts
 *
 * F-20 PR1 — unit tests for the postcodes.io Geocoder adapter, the ONLY file in
 * the codebase allowed to make a postcodes.io `fetch`. Global `fetch` is mocked,
 * so no network is touched.
 *
 * Coverage (the plan's adapter matrix):
 *   - exact hit (approximate:false)
 *   - exact-miss → outcode hit (approximate:true)
 *   - double-miss → null
 *   - transport error → GeocoderError
 *   - bulk keying with mixed-case inputs (preserves .toUpperCase()/.trim())
 *   - bulk exact-then-outcode fallback
 *   - no vendor-shape leak (return is a clean GeocodeResult, no `query`/`status`)
 *
 * Plus the shared Geocoder contract run against the real adapter with a fetch
 * stub that mimics postcodes.io's single + bulk endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPostcodesGeocoder } from "@/lib/adapters/postcodes";
import { GeocoderError } from "@/lib/ports";
import { geocoderContract } from "@/lib/ports/__contracts__/Geocoder.contract";

/** A single-endpoint response (GET /postcodes/{pc} or /outcodes/{oc}). */
function singleHit(lat: number, lng: number) {
  return {
    ok: true,
    json: async () => ({ status: 200, result: { latitude: lat, longitude: lng } }),
  };
}
function singleMiss() {
  return {
    ok: true,
    json: async () => ({ status: 404, result: null }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("postcodes.io Geocoder adapter — single geocode()", () => {
  it("resolves an exact postcode with approximate:false (one round-trip)", async () => {
    const fetchMock = vi.fn(
      async (_url: string) => singleHit(53.38, -1.47) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    const res = await geo.geocode("S3 8DG");

    expect(res).toEqual({ lat: 53.38, lng: -1.47, approximate: false });
    // exactly one call — the exact endpoint — no outcode fallback needed
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/postcodes/");
  });

  it("falls back to the outcode (approximate:true) when the exact misses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(singleMiss() as unknown as Response)
      .mockResolvedValueOnce(singleHit(53.55, -1.48) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    const res = await geo.geocode("S70 1KW");

    expect(res).toEqual({ lat: 53.55, lng: -1.48, approximate: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/outcodes/S70");
  });

  it("returns null when both the exact postcode and its outcode miss", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(singleMiss() as unknown as Response)
      .mockResolvedValueOnce(singleMiss() as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    const res = await geo.geocode("ZZ9 9ZZ");
    expect(res).toBeNull();
  });

  it("never leaks the vendor shape — the return has only lat/lng/approximate", async () => {
    const fetchMock = vi.fn(async () => singleHit(1, 2) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    const res = await geo.geocode("S3 8DG");
    expect(res).not.toBeNull();
    if (res === null) throw new Error("expected a result");
    expect(Object.keys(res).sort()).toEqual(["approximate", "lat", "lng"]);
  });

  it("throws GeocoderError on a transport failure (both round-trips reject)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    await expect(geo.geocode("S3 8DG")).rejects.toBeInstanceOf(GeocoderError);
  });
});

describe("postcodes.io Geocoder adapter — bulk geocodeMany()", () => {
  /**
   * Mimic the bulk endpoints:
   *   POST /postcodes → { status:200, result: [{ query, result }] }
   *   POST /outcodes  → { status:200, result: [{ outcode, latitude, longitude }] }
   */
  function bulkFetch() {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (u.endsWith("/postcodes")) {
        const result = (body.postcodes as string[]).map((q) => {
          if (q.trim().toUpperCase() === "S3 8DG") {
            return { query: q, result: { latitude: 53.38, longitude: -1.47 } };
          }
          return { query: q, result: null };
        });
        return { ok: true, json: async () => ({ status: 200, result }) } as unknown as Response;
      }
      if (u.endsWith("/outcodes")) {
        const result = (body.outcodes as string[])
          .filter((oc) => oc.toUpperCase() === "S70")
          .map((oc) => ({ outcode: oc, latitude: 53.55, longitude: -1.48 }));
        return { ok: true, json: async () => ({ status: 200, result }) } as unknown as Response;
      }
      throw new Error(`unexpected url ${u}`);
    });
  }

  it("keys results by the trimmed/upper-cased postcode, mixed-case inputs unified", async () => {
    const fetchMock = bulkFetch();
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    // mixed case + surrounding whitespace — must normalise to the same keys
    const map = await geo.geocodeMany([" s3 8dg ", "S70 1kw", "zz9 9zz"]);

    expect(map.get("S3 8DG")).toEqual({ lat: 53.38, lng: -1.47, approximate: false });
    expect(map.get("S70 1KW")).toEqual({ lat: 53.55, lng: -1.48, approximate: true });
    expect(map.get("ZZ9 9ZZ")).toBeNull();
  });

  it("makes the outcode round-trip only for the exact misses", async () => {
    const fetchMock = bulkFetch();
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    await geo.geocodeMany([" s3 8dg ", "S70 1kw", "zz9 9zz"]);

    // POST /postcodes once, POST /outcodes once (for the two misses)
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.endsWith("/postcodes"))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith("/outcodes"))).toHaveLength(1);
  });

  it("throws GeocoderError when the bulk exact endpoint transport-fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const geo = createPostcodesGeocoder();
    await expect(geo.geocodeMany(["S3 8DG"])).rejects.toBeInstanceOf(GeocoderError);
  });
});

// ── Shared contract against the REAL adapter (fetch stub for single endpoints) ──
geoContractAgainstAdapter();

function geoContractAgainstAdapter() {
  geocoderContract(async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      // Bulk endpoints (geocodeMany) — must come first: "/postcodes" is a
      // suffix of "/postcodes/{pc}" only by prefix, so test the exact suffix.
      if (u.endsWith("/postcodes")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const result = (body.postcodes as string[]).map((q) =>
          q.trim().toUpperCase() === "S3 8DG"
            ? { query: q, result: { latitude: 53.38, longitude: -1.47 } }
            : { query: q, result: null },
        );
        return { ok: true, json: async () => ({ status: 200, result }) } as unknown as Response;
      }
      if (u.endsWith("/outcodes")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const result = (body.outcodes as string[])
          .filter((oc) => oc.toUpperCase() === "S70")
          .map((oc) => ({ outcode: oc, latitude: 53.55, longitude: -1.48 }));
        return { ok: true, json: async () => ({ status: 200, result }) } as unknown as Response;
      }
      // Single endpoints (geocode)
      if (u.includes("/postcodes/")) {
        if (u.includes("S3")) return singleHit(53.38, -1.47) as unknown as Response;
        return singleMiss() as unknown as Response;
      }
      if (u.includes("/outcodes/")) {
        if (u.includes("S70")) return singleHit(53.55, -1.48) as unknown as Response;
        return singleMiss() as unknown as Response;
      }
      throw new Error(`unexpected url ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    return {
      geocoder: createPostcodesGeocoder(),
      exactHitPostcode: "S3 8DG",
      outcodeOnlyPostcode: "S70 1KW",
      doubleMissPostcode: "ZZ9 9ZZ",
      cleanup: async () => {
        vi.restoreAllMocks();
      },
    };
  });
}
