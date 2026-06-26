/**
 * lib/adapters/postcodes/Geocoder.ts
 *
 * postcodes.io implementation of the `Geocoder` port (lib/ports/Geocoder.ts).
 * This is the ONE AND ONLY file in the codebase allowed to make a postcodes.io
 * `fetch`. Every route that needs coordinates goes through the port; this plug is
 * the sole place the vendor URL, response shape, and two-step exact→outcode
 * fallback live.
 *
 * Boundary discipline (ADR-0002): postcodes.io's raw JSON (`{ status, result,
 * query, outcode, latitude, longitude }`) is mapped to the owned `GeocodeResult`
 * here and never escapes. Callers see only `{ lat, lng, approximate }`.
 *
 * Lazy posture (mirrors lib/adapters/anthropic): the factory reads no env and
 * makes no network call at import time — the first call is what hits the network.
 *
 * Error contract:
 *   - A postcode (or its outcode) that genuinely resolves to nothing → null.
 *   - A transport/vendor failure (fetch rejects, or a non-2xx HTTP response on a
 *     lookup that should have succeeded) → GeocoderError. The single path only
 *     throws when BOTH the exact and the outcode round-trips transport-fail; the
 *     bulk path throws when an endpoint round-trip transport-fails.
 *
 * Normalisation is preserved verbatim from the routes this PR replaces
 * (app/api/admin/customers/[id]/route.ts + app/api/admin/geocode-all/route.ts):
 *   key  = postcode.trim().toUpperCase()
 *   outcode = postcode.trim().toUpperCase().split(" ")[0]
 */

import type { GeocodeResult } from "@/lib/domain";
import { type Geocoder, GeocoderError } from "@/lib/ports";

const BASE = "https://api.postcodes.io";

/** Vendor single-lookup response shape — stays inside this file. */
interface VendorSingle {
  status: number;
  result?: { latitude: number; longitude: number } | null;
}
/** Vendor bulk /postcodes response row — stays inside this file. */
interface VendorBulkPostcodeRow {
  query: string;
  result: { latitude: number; longitude: number } | null;
}
/** Vendor bulk /outcodes response row — stays inside this file. */
interface VendorBulkOutcodeRow {
  outcode: string;
  latitude: number;
  longitude: number;
}

function normalise(postcode: string): string {
  return postcode.trim().toUpperCase();
}
function outcodeOf(postcode: string): string {
  return normalise(postcode).split(" ")[0];
}

export function createPostcodesGeocoder(): Geocoder {
  /**
   * One exact lookup. Returns coords on a 200 hit, null on a clean not-found,
   * and throws GeocoderError on a transport failure (so the caller can decide
   * whether the outcode fallback can still rescue it).
   */
  async function lookupSingle(
    path: string,
  ): Promise<{ lat: number; lng: number } | null> {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`);
    } catch (cause) {
      throw new GeocoderError("postcodes.io request failed");
    }
    const data = (await res.json().catch(() => null)) as VendorSingle | null;
    if (data === null) {
      throw new GeocoderError("postcodes.io returned a non-JSON response");
    }
    if (data.status === 200 && data.result) {
      return { lat: data.result.latitude, lng: data.result.longitude };
    }
    return null; // clean not-found
  }

  async function geocode(postcode: string): Promise<GeocodeResult | null> {
    const key = normalise(postcode);
    let exactFailed = false;

    // 1) exact
    try {
      const exact = await lookupSingle(
        `/postcodes/${encodeURIComponent(key)}`,
      );
      if (exact) return { lat: exact.lat, lng: exact.lng, approximate: false };
    } catch {
      exactFailed = true; // transport failure — let the outcode try to rescue
    }

    // 2) outcode fallback
    try {
      const oc = outcodeOf(postcode);
      const fallback = await lookupSingle(
        `/outcodes/${encodeURIComponent(oc)}`,
      );
      if (fallback) {
        return { lat: fallback.lat, lng: fallback.lng, approximate: true };
      }
      // outcode resolved cleanly to not-found. If the exact ALSO transport-failed
      // we never got a real answer either way → surface the failure.
      if (exactFailed) {
        throw new GeocoderError("postcodes.io request failed");
      }
      return null;
    } catch (err) {
      if (err instanceof GeocoderError) throw err;
      // outcode round-trip transport-failed.
      throw new GeocoderError("postcodes.io request failed");
    }
  }

  async function geocodeMany(
    postcodes: readonly string[],
  ): Promise<Map<string, GeocodeResult | null>> {
    const out = new Map<string, GeocodeResult | null>();
    if (postcodes.length === 0) return out;

    // Normalise + de-dupe the inputs we will key on.
    const keys = postcodes.map(normalise);

    // 1) bulk exact
    let exactRows: VendorBulkPostcodeRow[];
    try {
      const res = await fetch(`${BASE}/postcodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: keys }),
      });
      const data = (await res.json().catch(() => null)) as {
        status: number;
        result: VendorBulkPostcodeRow[];
      } | null;
      if (data === null || data.status !== 200) {
        throw new GeocoderError(
          `postcodes.io bulk error: ${data?.status ?? "no response"}`,
        );
      }
      exactRows = data.result;
    } catch (err) {
      if (err instanceof GeocoderError) throw err;
      throw new GeocoderError("postcodes.io bulk request failed");
    }

    const exactMap = new Map<string, { lat: number; lng: number }>();
    for (const r of exactRows) {
      if (r.result) {
        exactMap.set(r.query.toUpperCase(), {
          lat: r.result.latitude,
          lng: r.result.longitude,
        });
      }
    }

    // 2) first pass — record exact hits, collect the misses for the outcode pass
    const misses: string[] = [];
    for (const key of keys) {
      const hit = exactMap.get(key);
      if (hit) {
        out.set(key, { lat: hit.lat, lng: hit.lng, approximate: false });
      } else {
        misses.push(key);
      }
    }

    // 3) outcode fallback pass (only for the misses)
    if (misses.length > 0) {
      const outcodes = [...new Set(misses.map((m) => outcodeOf(m)))];
      let outcodeRows: VendorBulkOutcodeRow[] = [];
      try {
        const res = await fetch(`${BASE}/outcodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcodes }),
        });
        const data = (await res.json().catch(() => null)) as {
          status: number;
          result: VendorBulkOutcodeRow[] | null;
        } | null;
        if (data && data.status === 200 && data.result) {
          outcodeRows = data.result;
        }
        // A non-200 outcode pass is NOT fatal — it just means the misses stay
        // misses (preserves the original geocode-all behaviour, which only acted
        // on a 200 fallback and otherwise left rows ungeocoded).
      } catch (err) {
        if (err instanceof GeocoderError) throw err;
        throw new GeocoderError("postcodes.io outcode request failed");
      }

      const outcodeMap = new Map<string, { lat: number; lng: number }>();
      for (const r of outcodeRows) {
        outcodeMap.set(r.outcode.toUpperCase(), {
          lat: r.latitude,
          lng: r.longitude,
        });
      }

      for (const key of misses) {
        const hit = outcodeMap.get(outcodeOf(key));
        out.set(
          key,
          hit ? { lat: hit.lat, lng: hit.lng, approximate: true } : null,
        );
      }
    }

    return out;
  }

  return { geocode, geocodeMany };
}

export const postcodesGeocoder: Geocoder = createPostcodesGeocoder();
