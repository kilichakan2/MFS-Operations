/**
 * lib/wiring/pricing.ts — composition root for the Pricing domain (F-15 PR1)
 *
 * The ONE file where the Pricing domain's abstract port is bolted to its
 * concrete vendor adapter. Like `lib/wiring/routes.ts` / `lib/wiring/orders.ts`,
 * this is one of the only business-layer files allowed to import from
 * `@/lib/adapters/*` — everything in `lib/services/**` and `lib/usecases/**`
 * depends on ports alone (ADR-0002), enforced by the `no-restricted-imports`
 * override in `.eslintrc.json` and pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database
 * vendor for Pricing = one new adapter folder (`lib/adapters/<vendor>/`)
 * + edits to THIS file. `PricingService` and `lib/domain` are untouched.
 *
 * This file is a parts list, not logic: no decisions, no I/O at module
 * load beyond what the adapter singleton already does. It composes BOTH:
 *   - the SERVICE-ROLE `pricingService` singleton (master key — bypasses RLS),
 *     which STAYS as the one-line rollback parachute and as the engine for the
 *     activation-email use-case (a server-side back-office read); and
 *   - the per-request `pricingServiceForCaller(userId)` factory (F-RLS-04d),
 *     which builds a fresh Pricing graph bound to ONE caller, reaching the DB
 *     as the Postgres `authenticated` role so the GUC-based RLS policies fire.
 *
 * CONSUMED by the 6 Pricing route files (11 handlers) since F-RLS-04d (the
 * cutover that also added the price_agreements / price_agreement_lines
 * authenticated RLS policy set — migration 20260619120000). The
 * activation-email recipient/full-agreement reads STAY on the service-role
 * singleton (E1: server-side, not a user-facing screen — same posture Routes
 * kept for its non-cutover back-office paths).
 *
 * Per-request — NEVER memoize: the minted token is per-caller, and a memoized
 * client would leak one caller's identity to another. Each call mints a fresh
 * token and builds a fresh client. Mirrors `routesServiceForCaller` /
 * `usersServiceForCaller` exactly.
 *
 * Hexagonal (ADR-0002): the vendor `SupabaseClient` is constructed and
 * consumed entirely inside this wiring file; the route never sees it — it
 * receives a ready PricingService built from ports.
 */
import { createPricingService, type PricingService } from "@/lib/services";
import {
  createPricingActivationEmail,
  type PricingActivationEmail,
} from "@/lib/usecases/pricingActivationEmail";
import {
  supabasePricingRepository,
  supabaseUsersRepository,
  createSupabasePricingRepository,
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const pricingService: PricingService = createPricingService({
  pricing: supabasePricingRepository,
});

/**
 * Activation-email assembly use-case (F-15 PR2): composes the pricing service
 * with the Users port to resolve the agreement body + recipient list when a
 * PATCH activates an agreement. Service-role singletons — same posture as the
 * five pricing endpoints (RLS cutover is F-RLS-04d; do NOT add a
 * `pricingServiceForCaller` here).
 */
export const pricingActivationEmail: PricingActivationEmail =
  createPricingActivationEmail({
    pricing: pricingService,
    users: supabaseUsersRepository,
  });

// ─── Per-request authenticated composition (F-RLS-04d) ──────────────
//
// The pre-wired `pricingService` singleton above uses the SERVICE-ROLE client
// (master key — bypasses RLS) and STAYS: it is the one-line rollback parachute
// and the engine for the activation-email use-case. The factory below builds a
// fresh Pricing graph bound to ONE caller, reaching the DB as the Postgres
// `authenticated` role so the GUC-based RLS policies fire. Per-request — NEVER
// memoize (a memoized client would leak one caller's identity to another).

/** Build a PricingService bound to ONE caller, reaching the DB as the Postgres
 *  `authenticated` role so RLS fires. Per-request — never memoize. Mirrors
 *  routesServiceForCaller. Consumed by the pricing routes since F-RLS-04d. */
export async function pricingServiceForCaller(
  callerUserId: string,
): Promise<PricingService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createPricingService({
    pricing: createSupabasePricingRepository(client),
  });
}
