/**
 * lib/wiring/routes.ts — composition root for the Routes domain (F-14 PR1)
 *
 * The ONE file where the Routes domain's abstract port is bolted to its
 * concrete vendor adapter. Like `lib/wiring/orders.ts` / `lib/wiring/users.ts`,
 * this is one of the only business-layer files allowed to import from
 * `@/lib/adapters/*` — everything in `lib/services/**` and `lib/usecases/**`
 * depends on ports alone (ADR-0002), enforced by the `no-restricted-imports`
 * override in `.eslintrc.json` and pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database
 * vendor for Routes = one new adapter folder (`lib/adapters/<vendor>/`)
 * + edits to THIS file. `RoutesService` and `lib/domain` are untouched.
 *
 * This file is a parts list, not logic: no decisions, no I/O at module
 * load beyond what the adapter singleton already does. It composes the
 * SERVICE-ROLE singleton — the same security posture the five route
 * endpoints use today (service-role key, RLS bypassed). PR1 is
 * introduce-only: nothing imports `routesService` in production yet
 * (PR2 re-points the five routes).
 */
import { createRoutesService, type RoutesService } from "@/lib/services";
import {
  supabaseRoutesRepository,
  createSupabaseRoutesRepository,
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const routesService: RoutesService = createRoutesService({
  routes: supabaseRoutesRepository,
});

// ─── Per-request authenticated composition (F-RLS-04c) ──────────────
//
// The pre-wired `routesService` singleton above uses the SERVICE-ROLE client
// (master key — bypasses RLS) and STAYS: it is the one-line rollback
// parachute and the engine for the five route endpoints today.
//
// The factory below builds a fresh Routes graph bound to ONE caller, reaching
// the DB as the Postgres `authenticated` role so the (future) GUC-based RLS
// policies fire. It mirrors `ordersServiceForCaller` / `usersServiceForCaller`
// exactly. It is wired here for F-RLS-04c Routes RLS cutover — READY BUT
// UNUSED this pass: the `routes` / `route_stops` tables have RLS enabled with
// NO policies yet, so routing through the authenticated role would block every
// call. No PR2 route imports it; the routes use `routesService` (service-role).
//
// Per-request — NEVER memoize: the minted token is per-caller, and a memoized
// client would leak one caller's identity to another. Each call mints a fresh
// token and builds a fresh client.
//
// Hexagonal (ADR-0002): the vendor `SupabaseClient` is constructed and
// consumed entirely inside this wiring file; the route never sees it — it
// receives a ready RoutesService built from ports.

/** Build a RoutesService bound to ONE caller, reaching the DB as the Postgres
 *  `authenticated` role so RLS fires. Per-request — never memoize.
 *  Wired here for F-RLS-04c Routes RLS cutover — ready but UNUSED in F-14. */
export async function routesServiceForCaller(
  callerUserId: string,
): Promise<RoutesService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createRoutesService({
    routes: createSupabaseRoutesRepository(client),
  });
}
