/**
 * lib/adapters/supabase/CustomersRepository.ts
 *
 * Supabase implementation of `CustomersRepository`
 * (lib/ports/CustomersRepository.ts). One of three files in the
 * Orders bounded context allowed to import `@supabase/supabase-js`
 * (the others: OrdersRepository.ts, ProductsRepository.ts in this
 * directory). The ESLint allow-list at `.eslintrc.json:18` permits
 * the `lib/adapters/supabase` directory tree.
 *
 * Boundary discipline (ADR-0002 line 27 — mandatory):
 *   Vendor shapes stay INSIDE this file. The method body uses
 *   PostgREST row results; the return value is the domain `Customer`
 *   shape from `@/lib/domain`.
 *
 * Construction (hybrid factory + singleton — F-06 template):
 *   - `createSupabaseCustomersRepository(client)` factory — tests
 *     pass `getServiceClient()`.
 *   - `supabaseCustomersRepository` singleton — pre-wired against
 *     `supabaseService` from `@/lib/adapters/supabase/client`.
 *
 * Error contract (per F-05 CustomersRepository JSDoc):
 *   findCustomerById → ServiceError on DB failure; returns null on miss.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { Customer } from "@/lib/domain";
import type { CustomersRepository } from "@/lib/ports";

export function createSupabaseCustomersRepository(
  client: SupabaseClient,
): CustomersRepository {
  return {
    async findCustomerById(id: string): Promise<Customer | null> {
      const { data, error } = await client
        .from("customers")
        .select("id, name, postcode, active")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("CustomersRepository.findCustomerById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Customer lookup failed", { cause: error });
      }
      if (data === null) return null;
      return {
        id: data.id,
        name: data.name,
        postcode: data.postcode,
        active: data.active,
      };
    },
  };
}

export const supabaseCustomersRepository: CustomersRepository =
  createSupabaseCustomersRepository(supabaseService);
