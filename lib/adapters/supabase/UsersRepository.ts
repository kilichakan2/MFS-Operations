/**
 * lib/adapters/supabase/UsersRepository.ts
 *
 * Supabase implementation of `UsersRepository`
 * (lib/ports/UsersRepository.ts). One of the Orders-bounded adapter
 * files allowed to import `@supabase/supabase-js` (allow-listed for
 * the `lib/adapters/supabase` directory tree at `.eslintrc.json`).
 *
 * Boundary discipline (ADR-0002 line 27):
 *   PostgREST row shape is touched only inside the method body. The
 *   return value is the domain `UserSummary` from `@/lib/domain`.
 *   Credential columns (pin_hash, password_hash) are never selected.
 *
 * Construction (hybrid factory + singleton — F-06 template):
 *   - `createSupabaseUsersRepository(client)` factory — tests pass
 *     `getServiceClient()`.
 *   - `supabaseUsersRepository` singleton — pre-wired against
 *     `supabaseService` from `@/lib/adapters/supabase/client`.
 *
 * Error contract (per the UsersRepository port JSDoc):
 *   findUserById → ServiceError on DB failure; returns null on miss.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { UserSummary } from "@/lib/domain";
import type { UsersRepository } from "@/lib/ports";

export function createSupabaseUsersRepository(
  client: SupabaseClient,
): UsersRepository {
  return {
    async findUserById(id: string): Promise<UserSummary | null> {
      const { data, error } = await client
        .from("users")
        .select("id, name, role, active")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("UsersRepository.findUserById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("User lookup failed", { cause: error });
      }
      if (data === null) return null;
      return {
        id: data.id,
        name: data.name,
        role: data.role,
        active: data.active,
      };
    },
  };
}

export const supabaseUsersRepository: UsersRepository =
  createSupabaseUsersRepository(supabaseService);
