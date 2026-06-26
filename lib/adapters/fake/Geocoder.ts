/**
 * lib/adapters/fake/Geocoder.ts
 *
 * In-memory implementation of the `Geocoder` port (lib/ports/Geocoder.ts). No
 * vendor SDK, no network — pure Map lookups. Used by consumer unit tests
 * (CustomersService, routes) and by the shared Geocoder contract.
 *
 * Boundary discipline (ADR-0002): this file imports zero vendors. The seed is a
 * plain `{ postcode → {lat,lng} }` map of DOMAIN-shaped data, so the Fake cannot
 * leak vendor-shaped JSON even if it tried.
 *
 * It mirrors the real adapter's behaviour exactly: normalise the postcode
 * (trim + upper-case), try the exact map, then fall back to the OUTCODE map
 * (the first space-delimited segment) flagging `approximate:true`, else null.
 */

import type { GeocodeResult } from "@/lib/domain";
import type { Geocoder } from "@/lib/ports";

export interface FakeGeocoderSeed {
  /** Exact-postcode hits, keyed by the postcode (will be normalised on read). */
  exact?: Record<string, { lat: number; lng: number }>;
  /** Outcode hits, keyed by the outcode (e.g. "S70"). */
  outcodes?: Record<string, { lat: number; lng: number }>;
}

/** Normalise exactly the way the real adapter does. */
function normalise(postcode: string): string {
  return postcode.trim().toUpperCase();
}

/** Outcode = the first space-delimited segment, normalised. */
function outcodeOf(postcode: string): string {
  return normalise(postcode).split(" ")[0];
}

export function createFakeGeocoder(seed?: FakeGeocoderSeed): Geocoder {
  const exact = new Map<string, { lat: number; lng: number }>();
  for (const [k, v] of Object.entries(seed?.exact ?? {})) {
    exact.set(normalise(k), v);
  }
  const outcodes = new Map<string, { lat: number; lng: number }>();
  for (const [k, v] of Object.entries(seed?.outcodes ?? {})) {
    outcodes.set(k.trim().toUpperCase(), v);
  }

  function lookup(postcode: string): GeocodeResult | null {
    const exactHit = exact.get(normalise(postcode));
    if (exactHit) {
      return { lat: exactHit.lat, lng: exactHit.lng, approximate: false };
    }
    const outcodeHit = outcodes.get(outcodeOf(postcode));
    if (outcodeHit) {
      return { lat: outcodeHit.lat, lng: outcodeHit.lng, approximate: true };
    }
    return null;
  }

  return {
    async geocode(postcode: string): Promise<GeocodeResult | null> {
      return lookup(postcode);
    },

    async geocodeMany(
      postcodes: readonly string[],
    ): Promise<Map<string, GeocodeResult | null>> {
      const result = new Map<string, GeocodeResult | null>();
      for (const pc of postcodes) {
        result.set(normalise(pc), lookup(pc));
      }
      return result;
    },
  };
}

export const fakeGeocoder: Geocoder = createFakeGeocoder();
