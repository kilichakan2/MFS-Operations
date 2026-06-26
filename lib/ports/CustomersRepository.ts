/**
 * lib/ports/CustomersRepository.ts
 *
 * The Customers port — minimal, Orders-scoped. F-13 (Users + Auth)
 * may extend; F-20 Admin will own the full Customers CRUD when the
 * admin domain gets rewritten.
 *
 * Why only one method:
 *   Orders' use of Customers is read-only and lookup-by-id only. The
 *   route at `app/api/orders/route.ts:104-115` does exactly one
 *   thing: fetch a customer by id, then check `customer.active`.
 *   That is the entire port surface F-05 needs to define. Adding
 *   more methods now (e.g. `listCustomers`, `searchCustomers`) would
 *   be speculative generality (APOSD § "general-purpose by
 *   accident") — F-20 Admin will add them when the admin CRUD over
 *   Customers gets rewritten.
 *
 * ADR-0002 contract honoured: same as OrdersRepository (depth rule,
 * vendor-types-never-cross, define-errors-out-of-existence on reads).
 */

import type { Customer, CustomerAdminView } from "@/lib/domain";
import type { InsertOneResult } from "@/lib/ports/InsertOneResult";
// MapCustomer is a pure presentation type (no vendor/framework import) declared
// in lib/services/mapScene.ts; the map/data route RE-EXPORTS it (a locked
// invariant). A port type-importing from lib/services is unusual but is the
// lowest-churn choice — relocating the type would break the preserved re-export
// line and 3 import sites. Type-only import keeps the boundary clean.
import type { MapCustomer } from "@/lib/services/mapScene";

export interface CustomersRepository {
  /**
   * Read a customer by id.
   *
   * What this hides:
   *   - The column projection (id, name, postcode, active) — callers
   *     do not write a SELECT.
   *   - The `.single()` semantics — adapter returns domain `null` on
   *     no match.
   *
   * Caller responsibility:
   *   The caller (today: `app/api/orders/route.ts:113-115`; tomorrow:
   *   `OrdersService.createOrder`) checks `customer.active === false`
   *   and surfaces a `ValidationError` (or domain-specific
   *   `CustomerInactiveError` if F-17 / F-20 ever introduces one).
   *   The port does not pre-filter on `active` because the routes
   *   that *display* a customer (without creating an order) need to
   *   see inactive customers in the list.
   *
   * @returns The customer if found; `null` on no match. APOSD § 11.
   * @throws  ServiceError on DB failure.
   */
  findCustomerById(id: string): Promise<Customer | null>;

  // ── Admin surface (F-20 PR1) ───────────────────────────────────────────────
  // These power the three admin routes (customers GET, customers/[id] PATCH,
  // geocode-all). They return the richer CustomerAdminView. Vendor row shapes
  // stay inside the adapter; the column projection is hidden from callers.

  /**
   * List ALL customers, ordered by name ascending (the `customers` GET shape).
   * @returns the full list as CustomerAdminView rows. Empty array, never null.
   * @throws ServiceError on DB failure.
   */
  listAllCustomers(): Promise<readonly CustomerAdminView[]>;

  /**
   * List up to `limit` customers that have a postcode but no coordinates yet —
   * the geocode-all backfill candidates (postcode not null AND lat is null).
   * @throws ServiceError on DB failure.
   */
  listUngeocoded(limit: number): Promise<readonly CustomerAdminView[]>;

  /**
   * Flip a customer's `active` flag (the `customers/[id]` PATCH active branch).
   * @returns the updated CustomerAdminView; `null` if no row matched the id.
   * @throws ServiceError on DB failure.
   */
  setActive(id: string, active: boolean): Promise<CustomerAdminView | null>;

  /**
   * Write a customer's postcode and its geocode fields together (the
   * `customers/[id]` PATCH postcode branch). The caller has already validated +
   * normalised the postcode and resolved the coordinates (via the Geocoder
   * port) before calling — the repository just persists.
   * @returns the updated CustomerAdminView; `null` if no row matched the id.
   * @throws ServiceError on DB failure.
   */
  setPostcodeAndCoords(
    id: string,
    fields: {
      postcode: string;
      lat: number | null;
      lng: number | null;
      geocoded_at: string | null;
      is_approximate_location: boolean;
    },
  ): Promise<CustomerAdminView | null>;

  /**
   * Stamp coordinates onto ONE customer (the geocode-all bulk-write, applied
   * per-row in a loop exactly as the route does today). Fire-and-persist: no
   * return value — geocode-all tallies its own counts.
   * @throws ServiceError on DB failure.
   */
  setCoords(
    id: string,
    fields: {
      lat: number;
      lng: number;
      geocoded_at: string;
      is_approximate_location: boolean;
    },
  ): Promise<void>;

  // ── Import surface (F-20 PR3) ──────────────────────────────────────────────

  /**
   * Bulk insert customers (import/confirm, all-or-nothing). Returns the new
   * rows' id + postcode (the geocoding write-back path needs both). A batch
   * failure (incl. a duplicate-name 23505 anywhere in the batch) throws
   * ServiceError — preserves today's all-or-nothing 500.
   * @throws ServiceError on DB failure.
   */
  insertMany(
    rows: readonly {
      name: string;
      postcode: string | null;
      created_by: string;
    }[],
  ): Promise<readonly { id: string; postcode: string | null }[]>;

  /**
   * Insert ONE customer (import/manual, per-row so one bad row never aborts the
   * batch). Returns a typed InsertOneResult distinguishing inserted / duplicate
   * / error — NEVER throws on a 23505 (defines the duplicate error out of
   * existence). On any OTHER DB error it returns { outcome: 'error', message }
   * after logging, so the route reproduces today's `console.error + skip`
   * WITHOUT the vendor error object leaking past this boundary.
   *
   * Only `name` is mapped from the row; `active: true` is set inside the
   * adapter (matching today's `{ name, active: true, created_by }`).
   */
  insertOne(row: {
    name: string;
    created_by: string;
  }): Promise<InsertOneResult>;

  /**
   * Geocoded customers for the Map View (map/data). Only rows with non-null lat
   * AND lng, ordered by name asc, mapped to the flat MapCustomer shape
   * (external_system_id → code, is_approximate_location → is_approximate).
   * @throws ServiceError on DB failure.
   */
  listGeocodedForMap(): Promise<readonly MapCustomer[]>;
}
