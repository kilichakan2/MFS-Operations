/**
 * lib/domain/Product.ts
 *
 * Minimal Product shape the Orders bounded context needs today.
 *
 * Same minimalism rationale as `Customer.ts`. The 4 fields here are
 * exactly what `app/api/orders/[id]/picking-list/route.ts:97-101` and
 * the line-verification at `app/api/orders/route.ts:122-134` actually
 * use. F-15 Pricing extends this shape when the pricing domain gets
 * its own port; F-20 Admin extends further for the full product
 * catalogue CRUD.
 */

/**
 * A product as the Orders domain sees it.
 *
 * `code` is the catalogue code (e.g. "BC-001"); `box_size` is the
 * pack-size label (e.g. "10 kg") rendered as the "Pack" column on the
 * picking list (`pickingList.ts:151`). Both are nullable because the
 * existing products table allows nulls (the picking-list renderer
 * defaults to empty string at `pickingList.ts:119`).
 *
 * `name` is the canonical display name; the picking list falls back
 * to it when a line has no `adHocDescription` and the line's
 * `productId` resolves to this row (`pickingList.ts:120`).
 */
export interface Product {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly boxSize: string | null;
}

/**
 * The richer ADMIN view of a Product (F-20 PR2).
 *
 * Why a SECOND named type rather than bloating `Product`: the slim `Product`
 * above is the *Orders-view* and its JSDoc forbids growing it (APOSD §
 * "general-purpose by accident"). The admin Products screen reads/writes a
 * wider field set: the catalogue category, the active flag and the creation
 * date. Keeping the two as distinct labelled domain types preserves both
 * contracts — Orders keeps its slim card, Admin gets the full card. This is the
 * exact move PR1 made for customers (`CustomerAdminView`).
 *
 * Naming mix (copied verbatim from `CustomerAdminView`): most fields are
 * camelCase domain fields, but `created_at` stays snake_case because that is
 * the exact wire key the routes emit and PR1 set this precedent. The route's
 * hand-projection maps `boxSize → box_size` for the GET wire shape.
 *
 * The `products` GET list returns the SEVEN-field projection
 * (`id, name, category, code, box_size, active, created_at`); the
 * `products/[id]` PATCH returns a five-field SUBSET (no `code`, no `box_size`).
 * `code`/`boxSize` are therefore populated only by the GET read — the PATCH
 * read leaves them null, which is harmless because the PATCH route never reads
 * them. Each route reproduces its exact shape by hand (the toListRow / toRow
 * projection pattern).
 */
export interface ProductAdminView {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly code: string | null;
  readonly boxSize: string | null; // maps DB box_size
  readonly active: boolean;
  readonly created_at: string; // snake_case kept (matches CustomerAdminView.created_at)
}
