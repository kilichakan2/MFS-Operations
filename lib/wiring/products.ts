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
 * Security posture (PR2): SERVICE-ROLE singleton (master key, RLS bypassed) —
 * the same posture the two admin routes use today, and the one-line rollback
 * parachute. Per-user RLS for these routes is deliberately deferred to F-RLS-04i
 * (the admin-context RLS unit), so there is intentionally NO `…ForCaller`
 * variant here yet.
 *
 * This file is a parts list, not logic.
 */
import { createProductsService, type ProductsService } from "@/lib/services";
import { supabaseProductsRepository } from "@/lib/adapters/supabase";

export const productsService: ProductsService = createProductsService({
  products: supabaseProductsRepository,
});
