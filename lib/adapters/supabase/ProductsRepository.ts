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
import type { Product, ProductAdminView } from "@/lib/domain";
import type { ProductsRepository, InsertOneResult } from "@/lib/ports";

// The verbatim admin column lists, copied from the two products routes the
// F-20 PR2 re-point replaces so the wire output stays byte-identical:
//   - LIST_COLS (the GET): 7 columns (id, name, category, code, box_size,
//     active, created_at).
//   - PATCH_COLS (the [id] PATCH): a 5-column SUBSET — NO code, NO box_size.
// The asymmetry is deliberate: setActive's ProductAdminView carries
// `code: null, boxSize: null` for the unselected columns, which is harmless
// because the PATCH route projects only {id, name, category, active,
// created_at} and never reads code/boxSize.
const LIST_COLS = "id, name, category, code, box_size, active, created_at";
const PATCH_COLS = "id, name, category, active, created_at";

/** Map one PostgREST row to the owned ProductAdminView. Vendor shape stops
 *  here. Columns the read did not select (code/box_size on the PATCH read)
 *  arrive undefined and are coerced to null. */
function toAdminView(row: {
  id: string;
  name: string;
  category?: string | null;
  code?: string | null;
  box_size?: string | null;
  active: boolean;
  created_at: string;
}): ProductAdminView {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? null,
    code: row.code ?? null,
    boxSize: row.box_size ?? null,
    active: row.active,
    created_at: row.created_at,
  };
}

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

    async listAll(): Promise<readonly ProductAdminView[]> {
      const { data, error } = await client
        .from("products")
        .select(LIST_COLS)
        .order("name", { ascending: true });
      if (error) {
        log.error("ProductsRepository.listAll DB error", {
          error: error.message,
        });
        throw new ServiceError("Product list failed", { cause: error });
      }
      return (
        (data ?? []) as unknown as Parameters<typeof toAdminView>[0][]
      ).map(toAdminView);
    },

    async setActive(
      id: string,
      active: boolean,
    ): Promise<ProductAdminView | null> {
      // W1/R4: maybeSingle (NOT single) so a no-match returns null → 404 in the
      // route, never a throw/500. The error branch fires BEFORE the null check,
      // so a genuine DB error is never silently treated as not-found.
      const { data, error } = await client
        .from("products")
        .update({ active })
        .eq("id", id)
        .select(PATCH_COLS)
        .maybeSingle();
      if (error) {
        log.error("ProductsRepository.setActive DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Product update failed", { cause: error });
      }
      return data === null
        ? null
        : toAdminView(data as unknown as Parameters<typeof toAdminView>[0]);
    },

    // ── Import surface (F-20 PR3) ─────────────────────────────────────────────

    async insertMany(
      rows: readonly {
        name: string;
        category: string | null;
        code: string | null;
        box_size: string | null;
        created_by: string;
      }[],
    ): Promise<readonly { id: string }[]> {
      const payload = rows.map((r) => ({
        name: r.name,
        category: r.category,
        code: r.code,
        box_size: r.box_size,
        active: true,
        created_by: r.created_by,
      }));
      const { data, error } = await client
        .from("products")
        .insert(payload)
        .select("id");
      if (error) {
        log.error("ProductsRepository.insertMany DB error", {
          error: error.message,
        });
        throw new ServiceError("Product bulk insert failed", { cause: error });
      }
      return (data ?? []).map((r) => ({ id: r.id }));
    },

    async insertOne(row: {
      name: string;
      code: string | null;
      category: string | null;
      box_size: string | null;
      created_by: string;
    }): Promise<InsertOneResult> {
      const { error } = await client.from("products").insert({
        name: row.name,
        code: row.code,
        category: row.category,
        box_size: row.box_size,
        active: true,
        created_by: row.created_by,
      });
      if (error) {
        // 23505 = unique_violation — a duplicate. NOT an error: define it out of
        // existence so one bad row never aborts the import batch.
        if (error.code === "23505") return { outcome: "duplicate" };
        log.error("ProductsRepository.insertOne DB error", {
          error: error.message,
        });
        return { outcome: "error", message: error.message };
      }
      return { outcome: "inserted" };
    },
  };
}

export const supabaseProductsRepository: ProductsRepository =
  createSupabaseProductsRepository(supabaseService);
