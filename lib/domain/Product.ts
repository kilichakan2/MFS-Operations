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
