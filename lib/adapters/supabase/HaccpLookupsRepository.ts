/**
 * lib/adapters/supabase/HaccpLookupsRepository.ts
 *
 * Supabase implementation of `HaccpLookupsRepository`
 * (lib/ports/HaccpLookupsRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js`. The ONLY file that imports the vendor SDK for
 * the Cluster F form selectors (users, customers).
 *
 * Boundary discipline (ADR-0002): every `.select(…)`/`.in(...)`/`.eq(...)`/
 * `.order(...)` chain is copied VERBATIM from the two route files (users,
 * customers) so the PR9b re-point's wire output stays byte-identical. The
 * admins-first re-sort is NOT here — it is a presentation rule the SERVICE owns,
 * so this adapter is a faithful name-ordered DB read (R-F-B4).
 *
 * Construction: factory + `supabaseService`-wired singleton (service-role).
 * Error contract: every DB failure throws ServiceError (the routes 500).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { HaccpUserOption, HaccpCustomerOption } from "@/lib/domain";
import type { HaccpLookupsRepository } from "@/lib/ports";

export function createSupabaseHaccpLookupsRepository(
  client: SupabaseClient,
): HaccpLookupsRepository {
  return {
    async listSelectableUsers(): Promise<readonly HaccpUserOption[]> {
      // users/route.ts:21-26 — in(role,[3]), active=true, order(name asc).
      const { data, error } = await client
        .from("users")
        .select("id, name, role")
        .in("role", ["admin", "warehouse", "butcher"])
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) {
        log.error("HaccpLookupsRepository.listSelectableUsers DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load users", { cause: error });
      }
      return (data ?? []) as unknown as HaccpUserOption[];
    },

    async listActiveCustomers(): Promise<readonly HaccpCustomerOption[]> {
      // customers/route.ts:19-23 — id+name, active=true, order(name asc).
      const { data, error } = await client
        .from("customers")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) {
        log.error("HaccpLookupsRepository.listActiveCustomers DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load customers", { cause: error });
      }
      return (data ?? []) as unknown as HaccpCustomerOption[];
    },
  };
}

export const supabaseHaccpLookupsRepository: HaccpLookupsRepository =
  createSupabaseHaccpLookupsRepository(supabaseService);
