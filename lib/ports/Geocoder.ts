/**
 * lib/ports/Geocoder.ts
 *
 * The Geocoder port — the app's own socket for "turn a UK postcode into map
 * coordinates" (F-20 PR1). The lookup vendor (currently postcodes.io) plugs in
 * behind it via an adapter; the admin routes that need coordinates never see the
 * vendor.
 *
 * Pure TypeScript: no vendor import, no framework import. postcodes.io's raw JSON
 * never appears here — the adapter maps it into the lib/domain `GeocodeResult`.
 *
 * Fallback posture (DECISION — see the plan): the exact→outcode retry lives
 * INSIDE the adapter, not in a service. The port contract is "give me a postcode,
 * get a result possibly flagged `approximate`." The caller never knows a second
 * outcode round-trip happened — that is vendor coping, not business logic. The
 * `approximate` flag IS owned (it persists as is_approximate_location) and rides
 * on `GeocodeResult`; how it is computed is the adapter's secret.
 *
 * Not-found vs failure (APOSD § 11 — define errors out of existence on reads):
 *   - A postcode that resolves to nothing is `null`, never a throw.
 *   - Only a transport/vendor failure (network down, 5xx) throws GeocoderError.
 */

import type { GeocodeResult } from "@/lib/domain";

export interface Geocoder {
  /**
   * Resolve a single UK postcode to coordinates.
   * Tries the exact postcode first; on miss, retries the OUTCODE (first half),
   * returning approximate:true. Returns null only when both miss.
   * Never throws on a not-found — null is the "not found" answer (APOSD § 11).
   * @throws GeocoderError only on a transport/vendor failure (network, 5xx).
   */
  geocode(postcode: string): Promise<GeocodeResult | null>;

  /**
   * Bulk variant for the backfill + import paths. Resolves many postcodes in
   * one or two vendor round-trips (exact bulk, then outcode bulk for misses).
   * Returns a result PER input postcode, keyed by the original postcode
   * normalised the same way the single path normalises (trimmed, upper-cased);
   * value is null when both exact and outcode miss.
   * @throws GeocoderError only on a transport/vendor failure (network, 5xx).
   */
  geocodeMany(
    postcodes: readonly string[],
  ): Promise<Map<string, GeocodeResult | null>>;
}

/**
 * Typed domain error — thrown by an adapter ONLY on a transport/vendor failure
 * (network error, non-2xx from the lookup vendor), never on a not-found. Part of
 * the port contract (carries no vendor shape): a caller catches this one label.
 */
export class GeocoderError extends Error {
  constructor(message = "Geocoding lookup failed") {
    super(message);
    this.name = "GeocoderError";
  }
}
