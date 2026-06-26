/**
 * lib/domain/Geocode.ts
 *
 * The owned result type for "turn a UK postcode into coordinates" (F-20 PR1).
 *
 * Pure TypeScript — no vendor import. postcodes.io's raw JSON shape never
 * appears here; the postcodes adapter maps its response INTO this shape so the
 * rest of the app only ever sees `GeocodeResult`.
 *
 * `approximate` is part of the OWNED contract (not a vendor detail): the domain
 * cares about it because it is persisted as the `customers.is_approximate_location`
 * column and drives whether the map shows a rough pin or an exact one. HOW it is
 * computed (an outcode retry inside the adapter) is a vendor-coping detail that
 * never leaks past the plug — see lib/ports/Geocoder.ts and the fallback decision
 * in docs/plans/2026-06-26-f20-pr1-geocoder-customers.md.
 */

/** The coordinates the app owns. `approximate:true` = matched on outcode only. */
export interface GeocodeResult {
  readonly lat: number;
  readonly lng: number;
  readonly approximate: boolean;
}
