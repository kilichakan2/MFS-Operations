/**
 * lib/wiring/customers.ts — composition root for the Customers admin domain
 * (F-20 PR1)
 *
 * The ONE business-layer file where the CustomersRepository port is bolted to
 * its concrete Supabase adapter — same F-TD-11 rule as every other wiring file
 * (only composition roots import from `@/lib/adapters/*`), pinned by
 * tests/unit/lint/no-adapter-imports.test.ts.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor for
 * the Customers admin surface = one new adapter folder (`lib/adapters/<vendor>/`)
 * + one edit to THIS file. `CustomersService`, the routes and `lib/domain` are
 * untouched.
 *
 * Security posture (PR1): SERVICE-ROLE singleton (master key, RLS bypassed) —
 * the same posture the three admin routes use today, and the one-line rollback
 * parachute. Per-user RLS for these routes is deliberately deferred to F-RLS-04i
 * (see the plan's OUT OF SCOPE), so there is intentionally NO `…ForCaller`
 * variant here yet.
 *
 * This file is a parts list, not logic.
 */
import { createCustomersService, type CustomersService } from "@/lib/services";
import { supabaseCustomersRepository } from "@/lib/adapters/supabase";

export const customersService: CustomersService = createCustomersService({
  customers: supabaseCustomersRepository,
});
