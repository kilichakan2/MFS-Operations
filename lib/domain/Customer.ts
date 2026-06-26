/**
 * lib/domain/Customer.ts
 *
 * Minimal Customer shape the Orders bounded context needs today.
 *
 * Why minimal: ADR-0002 line 25 (depth rule) and APOSD § "design it
 * twice" (principle 12). Two shapes were sketched:
 *   (A) The full Customer aggregate (~14 fields: address lines, phone,
 *       VAT number, payment terms, hub assignment, geocoded lat/lon,
 *       etc.) — the shape that F-20 Admin will eventually own.
 *   (B) The 4 fields Orders' methods need today: id, name, postcode,
 *       active.
 * Chosen (B). Rationale: F-05's job is to define the *Orders* port
 * surface. The customer fields that the 5 Orders routes actually
 * read are `id`, `name`, `postcode` (rendered on picking lists,
 * embedded in list/detail views — `app/api/orders/route.ts:55` and
 * its siblings) and `active` (the verify-customer check at
 * `app/api/orders/route.ts:113-115`). Adding the other 10 fields now
 * would be speculative generality (APOSD § "general-purpose by
 * accident" — section 6); F-20 Admin can extend this shape when it
 * needs to. The forward path is:
 *   - F-05 defines `Customer` with 4 fields here.
 *   - F-13 may add 1-2 fields if Users + Auth needs customer-side
 *     identity surface area (unlikely; flagged for F-13 planner).
 *   - F-20 Admin extends to the full ~14-field shape when the admin
 *     CRUD over Customers gets rewritten.
 * Until F-20, callers who need the bigger shape go through the
 * service layer that owns the full record — they do not pull more
 * fields onto Customer here. This file is the *Orders-view* of a
 * Customer.
 */

/**
 * A customer as the Orders domain sees it.
 *
 * `active` is the on/off flag that POST /api/orders checks at
 * `app/api/orders/route.ts:113-115` ("Customer is inactive" → 400).
 * The check is a service-layer concern, not a port-layer concern; the
 * port just returns the field.
 *
 * `postcode` is nullable because the existing `customers` table has
 * nullable postcode (verified by the route at
 * `app/api/orders/route.ts:55` declaring `customer:customer_id ( id,
 * name, postcode )` as nullable in the embedded projection). The
 * picking list renders "—" when missing
 * (`pickingList.ts:106-107`).
 */
export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly postcode: string | null;
  readonly active: boolean;
}

/**
 * The richer ADMIN view of a Customer (F-20 PR1).
 *
 * Why a SECOND named type rather than bloating `Customer`: the slim `Customer`
 * above is the *Orders-view* and its JSDoc forbids growing it (APOSD §
 * "general-purpose by accident"). The admin routes (`customers` GET,
 * `customers/[id]` PATCH, `geocode-all`) read/write a wider field set:
 * coordinates, the geocode timestamp, the approximate-location flag and the
 * creation date. Keeping the two as distinct labelled domain types preserves
 * both contracts — Orders keeps its slim card, Admin gets the full card.
 *
 * The `customers` list/update routes return a SIX-field projection
 * (`id, name, postcode, lat, lng, active, created_at`) in snake_case; that exact
 * shape is reproduced by hand in each route (the toAppUser projection pattern)
 * so nothing on screen shifts. The geocode-WRITE fields (`geocoded_at`,
 * `is_approximate_location`) are owned by this shape but are not returned by the
 * list route — they are optional here because not every read populates them.
 */
export interface CustomerAdminView {
  readonly id: string;
  readonly name: string;
  readonly postcode: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly active: boolean;
  readonly created_at: string;
  readonly geocoded_at?: string | null;
  readonly is_approximate_location?: boolean;
}
