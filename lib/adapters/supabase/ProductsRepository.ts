/**
 * lib/adapters/supabase/ProductsRepository.ts
 *
 * Supabase implementation of `ProductsRepository`
 * (lib/ports/ProductsRepository.ts). One of the three Orders-bounded
 * adapter files allowed to import `@supabase/supabase-js`
 * (allow-listed at `.eslintrc.json:18`).
 *
 * Boundary discipline (ADR-0002 line 27):
 *   PostgREST row shape is touched only inside the method body. The
 *   return value is `readonly Product[]` from `@/lib/domain`.
 *
 * Empty-input short-circuit:
 *   When `ids` is empty, the method returns `[]` WITHOUT a round-trip.
 *   Matches today's route at `app/api/orders/route.ts:121`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { Product } from "@/lib/domain";
import type { ProductsRepository } from "@/lib/ports";

export function createSupabaseProductsRepository(
  client: SupabaseClient,
): ProductsRepository {
  return {
    async findProductsByIds(
      ids: readonly string[],
    ): Promise<readonly Product[]> {
      if (ids.length === 0) return [];
      const { data, error } = await client
        .from("products")
        .select("id, code, name, box_size")
        .in("id", ids as string[]);
      if (error) {
        log.error("ProductsRepository.findProductsByIds DB error", {
          idCount: ids.length,
          error: error.message,
        });
        throw new ServiceError("Product lookup failed", { cause: error });
      }
      return (data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        boxSize: r.box_size,
      }));
    },
  };
}

export const supabaseProductsRepository: ProductsRepository =
  createSupabaseProductsRepository(supabaseService);
