/**
 * lib/wiring/mapData.ts — composition root for the Map View data domain (F-20 PR3)
 *
 * The ONE business-layer file where the MapDataService's two ports
 * (CustomersRepository + VisitsRepository) are bolted to their concrete Supabase
 * adapters — same F-TD-11 rule as every other wiring file (only composition
 * roots import from `@/lib/adapters/*`, pinned by
 * tests/unit/lint/no-adapter-imports.test.ts).
 *
 * Security posture (PR3): SERVICE-ROLE singletons (master key, RLS bypassed) —
 * the same posture the map/data route uses today (it hand-rolled PostgREST
 * fetches with the service-role key). Per-user RLS deferred to F-RLS-04i.
 *
 * Rip-out contract: swapping the DB vendor for the Map View = one new adapter
 * folder + this file's two wiring lines. MapDataService, the route and
 * lib/domain are untouched.
 */
import { createMapDataService, type MapDataService } from "@/lib/services";
import {
  supabaseCustomersRepository,
  supabaseVisitsRepository,
} from "@/lib/adapters/supabase";

export const mapDataService: MapDataService = createMapDataService({
  customers: supabaseCustomersRepository,
  visits: supabaseVisitsRepository,
});
