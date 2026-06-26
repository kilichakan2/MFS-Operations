/**
 * lib/wiring/geocoder.ts — composition root for the Geocoder port (F-20 PR1)
 *
 * The ONE business-layer file where the Geocoder port is bolted to its concrete
 * postcodes.io adapter (same F-TD-11 rule as the other wiring files: only
 * composition roots import from `@/lib/adapters/*`).
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the geocoding vendor =
 * one new adapter folder (`lib/adapters/<vendor>/`) + one edit to THIS file. The
 * routes, the port, the GeocodeResult domain type, the Customers service and
 * every test using the Fake never change.
 *
 * Not user-scoped: geocoding is a stateless postcode→coords lookup with no
 * caller identity, so there is a single shared singleton and no `…ForCaller`
 * variant (unlike the RLS-scoped repositories).
 *
 * Lazy: the adapter reads no env and makes no network call at import — importing
 * this module triggers nothing. The first `geocode()`/`geocodeMany()` call is
 * what hits postcodes.io.
 */
import { postcodesGeocoder } from "@/lib/adapters/postcodes";
import type { Geocoder } from "@/lib/ports";

export const geocoder: Geocoder = postcodesGeocoder;
