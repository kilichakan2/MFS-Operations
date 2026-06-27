/**
 * lib/wiring/products.ts — composition root for the Products admin domain
 * (F-20 PR2)
 *
 * The ONE business-layer file where the ProductsRepository port is bolted to
 * its concrete Supabase adapter — same F-TD-11 rule as every other wiring file
 * (only composition roots import from `@/lib/adapters/*`), pinned by
 * tests/unit/lint/no-adapter-imports.test.ts.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor for
 * the Products admin surface = one new adapter folder (`lib/adapters/<vendor>/`)
 * + one edit to THIS file. `ProductsService`, the routes and `lib/domain` are
 * untouched.
 *
 * Security posture: the SERVICE-ROLE singleton (master key, RLS bypassed) STAYS
 * as the one-line rollback parachute. F-RLS-04i ADDS the per-request
 * authenticated `productsServiceForCaller(userId)` factory (mirrors
 * `visitsServiceForCaller`): it mints a short-lived DB token, builds a per-caller
 * authenticated client (Postgres `authenticated` role → the products RLS policies
 * fire), and binds the ProductsRepository adapter to it. LIVE as of F-RLS-04i:
 * the admin products + import routes call it (caller id from the tamper-proof
 * `x-mfs-user-id` header). Per-request — NEVER memoize (a memoized client would
 * leak one caller's identity to another).
 *
 * This file is a parts list, not logic.
 */
import { createProductsService, type ProductsService } from "@/lib/services";
import {
  supabaseProductsRepository, // keep — service-role parachute singleton
  createSupabaseProductsRepository, // NEW — per-caller table repo
  authenticatedClientForCaller, // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const productsService: ProductsService = createProductsService({
  products: supabaseProductsRepository,
});

/** Build a ProductsService whose reads/writes run as ONE caller (Postgres
 *  `authenticated` role, so the products RLS policies fire). Per-request —
 *  NEVER memoize (a memoized client would leak one caller's identity to
 *  another). The `productsService` singleton above STAYS as the rollback
 *  parachute. Mirrors `visitsServiceForCaller`. */
export async function productsServiceForCaller(
  callerUserId: string,
): Promise<ProductsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createProductsService({
    products: createSupabaseProductsRepository(client),
  });
}
