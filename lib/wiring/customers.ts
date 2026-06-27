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
 * Security posture: the SERVICE-ROLE singleton (master key, RLS bypassed) STAYS
 * as the one-line rollback parachute. F-RLS-04i ADDS the per-request
 * authenticated `customersServiceForCaller(userId)` factory (mirrors
 * `visitsServiceForCaller`): it mints a short-lived DB token, builds a per-caller
 * authenticated client (Postgres `authenticated` role → the customers RLS
 * policies fire), and binds the CustomersRepository adapter to it. LIVE as of
 * F-RLS-04i: the admin customers + import + geocode-all routes call it (caller id
 * from the tamper-proof `x-mfs-user-id` header). Per-request — NEVER memoize (a
 * memoized client would leak one caller's identity to another).
 *
 * This file is a parts list, not logic.
 */
import { createCustomersService, type CustomersService } from "@/lib/services";
import {
  supabaseCustomersRepository, // keep — service-role parachute singleton
  createSupabaseCustomersRepository, // NEW — per-caller table repo
  authenticatedClientForCaller, // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const customersService: CustomersService = createCustomersService({
  customers: supabaseCustomersRepository,
});

/** Build a CustomersService whose reads/writes run as ONE caller (Postgres
 *  `authenticated` role, so the customers RLS policies fire). Per-request —
 *  NEVER memoize (a memoized client would leak one caller's identity to
 *  another). The `customersService` singleton above STAYS as the rollback
 *  parachute. Mirrors `visitsServiceForCaller`. */
export async function customersServiceForCaller(
  callerUserId: string,
): Promise<CustomersService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createCustomersService({
    customers: createSupabaseCustomersRepository(client),
  });
}
