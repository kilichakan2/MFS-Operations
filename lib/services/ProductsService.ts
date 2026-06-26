/**
 * lib/services/ProductsService.ts
 *
 * The Products admin service (F-20 PR2) — the single layer the two admin
 * Products routes (`products` GET, `products/[id]` PATCH) call so that
 * `app/**` depends on `lib/services` + `lib/wiring`, never on an adapter.
 *
 * Posture (mirrors CustomersService): a THIN pass-through over the
 * ProductsRepository port. There is no business decision here — the routes keep
 * their guard + their hand-projection; the service exists for the dependency
 * boundary, not for logic.
 *
 * Construction (factory + composition root — ADR-0002, F-TD-11):
 *   - `createProductsService({ products })` factory — tests pass a Fake repo.
 *   - Production wiring lives in `lib/wiring/products.ts` (service-role
 *     singleton) — NEVER a pre-wired singleton here. Service files import ports
 *     only, never the adapters folder (lint-enforced).
 *
 * Methods take primitives, never `Caller` / `request`: the route layer does
 * auth + schema validation; this service orchestrates over the port.
 */

import type { Product, ProductAdminView } from "@/lib/domain";
import type { ProductsRepository, InsertOneResult } from "@/lib/ports";

/**
 * Ports accepted by `createProductsService`, passed as a named object so the
 * call site is unambiguous: createProductsService({ products }).
 */
export interface ProductsServiceDeps {
  readonly products: ProductsRepository;
}

export interface ProductsService {
  /** Bulk-fetch products by id (the existing Orders-view pass-through). Kept on
   *  the service surface so a future Orders re-point can also go through it. */
  findProductsByIds(ids: readonly string[]): Promise<readonly Product[]>;

  /** Every product, ordered by name asc. The `products` GET list. */
  listAll(): Promise<readonly ProductAdminView[]>;

  /** Flip a product's active flag. Null if no row matched (the 404 branch). */
  setActive(id: string, active: boolean): Promise<ProductAdminView | null>;

  // ── Import surface (F-20 PR3) ──────────────────────────────────────────────

  /** Bulk insert products (import/confirm, all-or-nothing). */
  insertMany(
    rows: readonly {
      name: string;
      category: string | null;
      code: string | null;
      box_size: string | null;
      created_by: string;
    }[],
  ): Promise<readonly { id: string }[]>;

  /** Insert ONE product (import/manual per-row). Typed result, never throws on
   *  23505. */
  insertOne(row: {
    name: string;
    code: string | null;
    category: string | null;
    box_size: string | null;
    created_by: string;
  }): Promise<InsertOneResult>;
}

export function createProductsService(
  deps: ProductsServiceDeps,
): ProductsService {
  const { products } = deps;
  return {
    findProductsByIds(ids: readonly string[]) {
      return products.findProductsByIds(ids);
    },
    listAll() {
      return products.listAll();
    },
    setActive(id: string, active: boolean) {
      return products.setActive(id, active);
    },
    insertMany(rows) {
      return products.insertMany(rows);
    },
    insertOne(row) {
      return products.insertOne(row);
    },
  };
}
