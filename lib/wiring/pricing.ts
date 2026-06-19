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
 * load beyond what the adapter singleton already does. It composes the
 * SERVICE-ROLE singleton — the same security posture the five pricing
 * endpoints use today (service-role key, RLS bypassed). PR1 is
 * introduce-only: nothing imports `pricingService` in production yet
 * (PR2 re-points the five routes).
 *
 * DO NOT add a `pricingServiceForCaller` per-request authenticated variant
 * here — that belongs with RLS (F-RLS-04d), exactly as Routes added
 * `routesServiceForCaller` only at its RLS cutover (F-RLS-04c).
 */
import { createPricingService, type PricingService } from "@/lib/services";
import {
  createPricingActivationEmail,
  type PricingActivationEmail,
} from "@/lib/usecases/pricingActivationEmail";
import {
  supabasePricingRepository,
  supabaseUsersRepository,
} from "@/lib/adapters/supabase";

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
