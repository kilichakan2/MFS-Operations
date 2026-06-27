/**
 * lib/wiring/mapData.ts — composition root for the Map View data domain (F-20 PR3)
 *
 * The ONE business-layer file where the MapDataService's two ports
 * (CustomersRepository + VisitsRepository) are bolted to their concrete Supabase
 * adapters — same F-TD-11 rule as every other wiring file (only composition
 * roots import from `@/lib/adapters/*`, pinned by
 * tests/unit/lint/no-adapter-imports.test.ts).
 *
 * Security posture: the SERVICE-ROLE singletons (master key, RLS bypassed) STAY
 * as the one-line rollback parachute. F-RLS-04i ADDS the per-request
 * authenticated `mapDataServiceForCaller(userId)` factory. MapDataService
 * composes TWO DB ports (customers + visits); the factory mints the DB token
 * ONCE, builds the authenticated client ONCE, and binds BOTH per-caller repos to
 * THAT same client (no double mint — mirrors `submitHaccpDailyCheckForCaller`),
 * so the customers + visits RLS policies fire under the one caller. LIVE as of
 * F-RLS-04i: the map/data route calls it (caller id from the tamper-proof
 * `x-mfs-user-id` header). Per-request — NEVER memoize (a memoized client would
 * leak one caller's identity to another).
 *
 * Rip-out contract: swapping the DB vendor for the Map View = one new adapter
 * folder + this file's two wiring lines. MapDataService, the route and
 * lib/domain are untouched.
 */
import { createMapDataService, type MapDataService } from "@/lib/services";
import {
  supabaseCustomersRepository, // keep — service-role parachute singleton
  supabaseVisitsRepository, // keep — service-role parachute singleton
  createSupabaseCustomersRepository, // NEW — per-caller table repo
  createSupabaseVisitsRepository, // NEW — per-caller table repo
  authenticatedClientForCaller, // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const mapDataService: MapDataService = createMapDataService({
  customers: supabaseCustomersRepository,
  visits: supabaseVisitsRepository,
});

/** Build a MapDataService whose TWO ports (customers + visits) run as ONE caller
 *  (Postgres `authenticated` role, so the customers + visits RLS policies fire).
 *  Mint+build the client ONCE and bind BOTH per-caller repos to THAT same client
 *  — NO second mint (mirrors `submitHaccpDailyCheckForCaller`). Per-request —
 *  NEVER memoize (a memoized client would leak one caller's identity to another).
 *  The `mapDataService` singleton above STAYS as the rollback parachute. */
export async function mapDataServiceForCaller(
  callerUserId: string,
): Promise<MapDataService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createMapDataService({
    customers: createSupabaseCustomersRepository(client),
    visits: createSupabaseVisitsRepository(client),
  });
}
