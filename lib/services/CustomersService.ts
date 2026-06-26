/**
 * lib/services/CustomersService.ts
 *
 * The Customers admin service (F-20 PR1) — the single layer the three admin
 * routes (`customers` GET, `customers/[id]` PATCH, `geocode-all`) call so that
 * `app/**` depends on `lib/services` + `lib/wiring`, never on an adapter.
 *
 * Posture (mirrors UsersService): a THIN pass-through over the
 * CustomersRepository port. There is no business decision here beyond what the
 * routes already do — postcode-format validation and the geocode call stay in
 * the route + the Geocoder port (the route validates, calls
 * `geocoder.geocode()`, then hands the resolved fields to the service). The
 * service exists for the dependency boundary, not for logic.
 *
 * Construction (factory + composition root — ADR-0002, F-TD-11):
 *   - `createCustomersService({ customers })` factory — tests pass a Fake repo.
 *   - Production wiring lives in `lib/wiring/customers.ts` (service-role
 *     singleton) — NEVER a pre-wired singleton here. Service files import ports
 *     only, never the adapters folder (lint-enforced).
 *
 * Methods take primitives, never `Caller` / `request`: the route layer does
 * auth + schema validation; this service orchestrates over the port.
 */

import type { CustomerAdminView } from "@/lib/domain";
import type { CustomersRepository, InsertOneResult } from "@/lib/ports";

/**
 * Ports accepted by `createCustomersService`, passed as a named object so the
 * call site is unambiguous: createCustomersService({ customers }).
 */
export interface CustomersServiceDeps {
  readonly customers: CustomersRepository;
}

export interface CustomersService {
  /** Every customer, ordered by name asc. The `customers` GET list. */
  listAll(): Promise<readonly CustomerAdminView[]>;

  /** Up to `limit` ungeocoded customers (postcode set, no coords). geocode-all. */
  listUngeocoded(limit: number): Promise<readonly CustomerAdminView[]>;

  /** Flip a customer's active flag. Null if no row matched. */
  setActive(id: string, active: boolean): Promise<CustomerAdminView | null>;

  /**
   * Persist a validated postcode + its resolved coordinates together. The route
   * has already validated/normalised the postcode and resolved coords via the
   * Geocoder port before calling. Null if no row matched.
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

  /** Stamp coordinates onto one customer (geocode-all per-row write). */
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

  /** Bulk insert customers (import/confirm, all-or-nothing). */
  insertMany(
    rows: readonly {
      name: string;
      postcode: string | null;
      created_by: string;
    }[],
  ): Promise<readonly { id: string; postcode: string | null }[]>;

  /** Insert ONE customer (import/manual per-row). Typed result, never throws on
   *  23505. NOTE: do NOT add listGeocodedForMap here — the map route goes through
   *  MapDataService, keeping this service's surface minimal. */
  insertOne(row: {
    name: string;
    created_by: string;
  }): Promise<InsertOneResult>;
}

export function createCustomersService(
  deps: CustomersServiceDeps,
): CustomersService {
  const { customers } = deps;
  return {
    listAll() {
      return customers.listAllCustomers();
    },
    listUngeocoded(limit: number) {
      return customers.listUngeocoded(limit);
    },
    setActive(id: string, active: boolean) {
      return customers.setActive(id, active);
    },
    setPostcodeAndCoords(id, fields) {
      return customers.setPostcodeAndCoords(id, fields);
    },
    setCoords(id, fields) {
      return customers.setCoords(id, fields);
    },
    insertMany(rows) {
      return customers.insertMany(rows);
    },
    insertOne(row) {
      return customers.insertOne(row);
    },
  };
}
