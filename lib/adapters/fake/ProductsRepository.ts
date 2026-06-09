/**
 * lib/adapters/fake/ProductsRepository.ts
 *
 * In-memory implementation of `ProductsRepository`
 * (lib/ports/ProductsRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage.
 *
 * Boundary discipline (ADR-0002 line 27):
 *   Same as the Fake Customers adapter. The store is
 *   `Map<string, Product>` of DOMAIN types — no row shape, no vendor
 *   imports.
 *
 * Construction:
 *   - `createFakeProductsRepository(seed?)` factory — tests pass an
 *     optional array of pre-seeded products.
 *   - `fakeProductsRepository` singleton — starts empty.
 */

import type { Product } from "@/lib/domain";
import type { ProductsRepository } from "@/lib/ports";

export function createFakeProductsRepository(
  seed?: readonly Product[],
): ProductsRepository {
  const store = new Map<string, Product>();
  for (const p of seed ?? []) store.set(p.id, p);
  return {
    async findProductsByIds(
      ids: readonly string[],
    ): Promise<readonly Product[]> {
      const out: Product[] = [];
      for (const id of ids) {
        const p = store.get(id);
        if (p) out.push(p);
      }
      return out;
    },
  };
}

export const fakeProductsRepository: ProductsRepository =
  createFakeProductsRepository();
