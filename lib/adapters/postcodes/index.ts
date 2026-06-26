/**
 * lib/adapters/postcodes/index.ts
 *
 * Barrel re-export for the postcodes.io adapter package. Import surface:
 *   import { createPostcodesGeocoder } from '@/lib/adapters/postcodes'
 *
 * Factory + a pre-wired singleton are exported. Production wiring imports the
 * singleton via lib/wiring/geocoder.ts (F-TD-11 rule: composition roots own the
 * singleton); tests use the factory.
 */

export { createPostcodesGeocoder, postcodesGeocoder } from "./Geocoder";
