/**
 * lib/services/MapDataService.ts
 *
 * The Map View data service (F-20 PR3) — the single layer the `map/data` route
 * calls so that `app/**` depends on `lib/services` + `lib/wiring`, never on an
 * adapter.
 *
 * Posture: a THIN composition over TWO ports (Customers + Visits). Services may
 * depend on multiple ports (the rule it must NOT break is "services do not
 * import OTHER services" and "no adapter imports"). The only logic is the
 * presentation-shaped `layer` switch (all|customers|visits) — un-selected
 * sections come back as empty arrays. No business decision, no cross-service
 * call, no transaction → a service (mirroring ProductsService / CustomersService,
 * the PR1/PR2 precedent), NOT a usecase.
 *
 * Construction (factory + composition root — ADR-0002, F-TD-11):
 *   - `createMapDataService({ customers, visits })` factory — tests pass Fakes.
 *   - Production wiring lives in `lib/wiring/mapData.ts` (service-role
 *     singletons) — NEVER a pre-wired singleton here. Service files import ports
 *     only, never the adapters folder (lint-enforced).
 */

// MapCustomer/MapVisit are re-exported from the ports barrel (they physically
// live in lib/services/mapScene.ts). A service may NOT import another service
// file directly (F-TD-05); depending on the PORT for these types is exactly what
// that rule instructs, and keeps the locked route re-export line intact.
import type {
  CustomersRepository,
  VisitsRepository,
  MapCustomer,
  MapVisit,
} from "@/lib/ports";

export interface MapDataServiceDeps {
  readonly customers: CustomersRepository;
  readonly visits: VisitsRepository;
}

export interface MapDataService {
  /** Compose the Map View payload: geocoded customers + visits in the date
   *  window. `layer` selects which sections to populate (the route's
   *  all|customers|visits switch). Empty arrays for un-selected sections. */
  load(opts: {
    layer: string;
    window: { from: string | null; to: string | null };
  }): Promise<{ customers: readonly MapCustomer[]; visits: readonly MapVisit[] }>;
}

export function createMapDataService(
  deps: MapDataServiceDeps,
): MapDataService {
  const { customers, visits } = deps;
  return {
    async load({ layer, window }) {
      const wantCustomers = layer === "all" || layer === "customers";
      const wantVisits = layer === "all" || layer === "visits";
      return {
        customers: wantCustomers ? await customers.listGeocodedForMap() : [],
        visits: wantVisits ? await visits.listForMap(window) : [],
      };
    },
  };
}
