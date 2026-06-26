/**
 * lib/adapters/fake/ProductsRepository.ts
 *
 * In-memory implementation of `ProductsRepository`
 * (lib/ports/ProductsRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage.
 *
 * Boundary discipline (ADR-0002 line 27):
 *   Same as the Fake Customers adapter. The store is
 *   `Map<string, ProductAdminView>` of DOMAIN types — no row shape, no vendor
 *   imports. F-20 PR2 widened the store from the slim `Product` to the richer
 *   `ProductAdminView` so the admin reads (`listAll` / `setActive`) have the
 *   catalogue fields; `findProductsByIds` still returns the slim `Product`
 *   (it projects the four Orders-view fields back out).
 *
 * Construction:
 *   - `createFakeProductsRepository(seed?)` factory — tests pass an
 *     optional array of pre-seeded products.
 *   - `fakeProductsRepository` singleton — starts empty.
 */

import type { Product, ProductAdminView } from "@/lib/domain";
import type { ProductsRepository } from "@/lib/ports";

/**
 * The fake accepts a seed of either the slim Orders-view `Product` (the shape
 * the existing Orders/KDS/picking-list unit tests already pass) OR the richer
 * `ProductAdminView`. A slim seed is normalised up to the admin view with
 * sensible defaults (`category: null`, `active: true`, a fixed `created_at`),
 * so existing callers compile unchanged and the admin reads still have every
 * field.
 */
export type FakeProductSeed = Product | ProductAdminView;

function toAdminView(p: FakeProductSeed): ProductAdminView {
  return {
    id: p.id,
    name: p.name,
    category: "category" in p ? p.category : null,
    code: p.code,
    boxSize: p.boxSize,
    active: "active" in p ? p.active : true,
    created_at: "created_at" in p ? p.created_at : "2026-01-01T00:00:00.000Z",
  };
}

export function createFakeProductsRepository(
  seed?: readonly FakeProductSeed[],
): ProductsRepository {
  const store = new Map<string, ProductAdminView>();
  for (const p of seed ?? []) store.set(p.id, toAdminView(p));
  return {
    async findProductsByIds(
      ids: readonly string[],
    ): Promise<readonly Product[]> {
      const out: Product[] = [];
      for (const id of ids) {
        const p = store.get(id);
        // Project the admin view back down to the slim Orders-view shape.
        if (p) out.push({ id: p.id, code: p.code, name: p.name, boxSize: p.boxSize });
      }
      return out;
    },

    async listAll(): Promise<readonly ProductAdminView[]> {
      // name ASC — mirrors the Supabase adapter's `.order('name', asc)`.
      return [...store.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async setActive(
      id: string,
      active: boolean,
    ): Promise<ProductAdminView | null> {
      const p = store.get(id);
      if (!p) return null; // no-match → null (the 404 branch)
      const updated: ProductAdminView = { ...p, active };
      store.set(id, updated);
      return updated;
    },
  };
}

export const fakeProductsRepository: ProductsRepository =
  createFakeProductsRepository();
