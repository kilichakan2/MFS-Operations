/**
 * lib/ports/ProductsRepository.ts
 *
 * The Products port — minimal, Orders-scoped. F-15 Pricing will
 * extend; F-20 Admin will own the full Products CRUD when the admin
 * domain gets rewritten.
 *
 * Why only one method:
 *   Orders' use of Products is read-only and bulk-lookup-by-ids only.
 *   The verify-products step (`app/api/orders/route.ts:117-134` and
 *   `app/api/orders/[id]/route.ts:133-148`) does the same bulk
 *   `IN`-lookup; the picking-list renderer
 *   (`app/api/orders/[id]/picking-list/route.ts:89-101`) does the
 *   same. One method covers all three call sites.
 *
 * ADR-0002 contract honoured: same as OrdersRepository.
 */

import type { Product, ProductAdminView } from "@/lib/domain";

export interface ProductsRepository {
  /**
   * Bulk-fetch products by id. Returns only the rows that matched.
   *
   * What this hides:
   *   - The `.in('id', ids)` bulk query — callers pass an array,
   *     adapter does the SQL.
   *   - The empty-input short-circuit: if `ids` is empty, the
   *     adapter returns `[]` immediately without a round-trip
   *     (matches today's behaviour at
   *     `app/api/orders/route.ts:121`).
   *   - The column projection (id, code, name, box_size).
   *
   * Caller responsibility:
   *   The caller computes the "missing" set with a one-line filter:
   *
   *     const found = new Set(products.map(p => p.id))
   *     const missing = requested.filter(id => !found.has(id))
   *
   *   (Same shape as `app/api/orders/route.ts:129-132`.)
   *
   * Design-it-twice:
   *   (A) Returns `Product[]` of matched rows only (this).
   *   (B) Returns `{ found: Map<string, Product>; missing: string[] }`.
   *   Chosen (A) per the pre-grilled pick. (B) is APOSD-deeper but
   *   forces a Map allocation + a missing-list computation for
   *   callers who only want the matches (e.g. the picking-list
   *   renderer doesn't care about missing; it just renders "(unknown
   *   product)" inline). (A) is simpler and the missing-list filter
   *   is one line at the call sites that need it.
   *
   * @returns The matched products. Empty array if `ids` is empty or
   *   no rows match. Never throws on miss.
   * @throws  ServiceError on DB failure.
   */
  findProductsByIds(ids: readonly string[]): Promise<readonly Product[]>;

  /**
   * Every product, ordered by name asc. The admin `products` GET list
   * (F-20 PR2). Returns the full ProductAdminView (the seven-field catalogue
   * shape: id, name, category, code, boxSize, active, created_at).
   *
   * @returns All products, name ASC. Empty array if the table is empty.
   * @throws  ServiceError on DB failure.
   */
  listAll(): Promise<readonly ProductAdminView[]>;

  /**
   * Flip a product's active flag (F-20 PR2). Returns the updated row, or null
   * if no row matched the id — the 404 branch. Uses `maybeSingle`, so a
   * no-match returns null rather than throwing (the PR1 typed-null→404
   * convention; the route maps null → 404). The returned view carries only the
   * five PATCH-projection fields (id, name, category, active, created_at);
   * `code`/`boxSize` are null because the PATCH read does not select them (the
   * route never reads them).
   *
   * @returns The updated row, or null on no-match.
   * @throws  ServiceError on a genuine DB error (the error branch fires BEFORE
   *   the null check, so a real failure is never silently treated as not-found).
   */
  setActive(id: string, active: boolean): Promise<ProductAdminView | null>;
}
