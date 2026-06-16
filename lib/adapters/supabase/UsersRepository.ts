/**
 * lib/adapters/supabase/UsersRepository.ts
 *
 * Supabase implementation of `UsersRepository`
 * (lib/ports/UsersRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the
 * `lib/adapters/supabase` directory tree at `.eslintrc.json`).
 *
 * Boundary discipline (ADR-0002 line 27):
 *   PostgREST row shapes are touched only inside the method bodies.
 *   Vendor column names (secondary_roles, last_login_at, created_at,
 *   pin_hash, password_hash) are mapped to camelCase domain fields, so
 *   the rest of the app never sees the database's spelling.
 *
 * Hash quarantine (Risk R2):
 *   The hash-free reads (findUserById / findUserByName / listUsersByRoles
 *   / listAllUsers) project a FIXED safe column list — they never select
 *   pin_hash / password_hash, and return `UserSummary`, which has no hash
 *   field. Only `findCredentialByName` / `listCredentialsByRoles` project
 *   the hash columns and return `UserCredential`. A hash cannot ride out
 *   of a list read by construction.
 *
 * Construction (hybrid factory + singleton — F-06 template):
 *   - `createSupabaseUsersRepository(client)` factory — tests pass
 *     `getServiceClient()`.
 *   - `supabaseUsersRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return null/empty on miss;
 * every DB failure throws ServiceError.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ConflictError, ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  UserSummary,
  UserCredential,
  CreateUserPersist,
  UpdateUserPersist,
  Role,
} from "@/lib/domain";
import type {
  UsersRepository,
  ListUsersByRolesOptions,
  ListCredentialsByRolesOptions,
} from "@/lib/ports";

// Fixed safe projection — the hash columns are deliberately absent.
const SUMMARY_COLS =
  "id, name, role, active, secondary_roles, email, last_login_at, created_at";
// The credential projection — adds the two hash columns. Used ONLY by
// the two *Credential* methods.
const CREDENTIAL_COLS =
  "id, name, role, active, secondary_roles, pin_hash, password_hash";

/** Vendor row → domain UserSummary. */
function rowToSummary(data: {
  id: string;
  name: string;
  role: string;
  active: boolean;
  secondary_roles: string[] | null;
  email: string | null;
  last_login_at: string | null;
  created_at: string;
}): UserSummary {
  return {
    id: data.id,
    name: data.name,
    role: data.role as Role,
    active: data.active,
    secondaryRoles: (data.secondary_roles ?? []) as Role[],
    email: data.email,
    lastLoginAt: data.last_login_at,
    createdAt: data.created_at,
  };
}

/** Vendor row → domain UserCredential (the one hash-bearing shape). */
function rowToCredential(data: {
  id: string;
  name: string;
  role: string;
  active: boolean;
  secondary_roles: string[] | null;
  pin_hash: string | null;
  password_hash: string | null;
}): UserCredential {
  return {
    id: data.id,
    name: data.name,
    role: data.role as Role,
    active: data.active,
    secondaryRoles: (data.secondary_roles ?? []) as Role[],
    passwordHash: data.password_hash,
    pinHash: data.pin_hash,
  };
}

export function createSupabaseUsersRepository(
  client: SupabaseClient,
): UsersRepository {
  return {
    async findUserById(id: string): Promise<UserSummary | null> {
      const { data, error } = await client
        .from("users")
        .select(SUMMARY_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("UsersRepository.findUserById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("User lookup failed", { cause: error });
      }
      return data === null ? null : rowToSummary(data);
    },

    async findUserByName(name: string): Promise<UserSummary | null> {
      const { data, error } = await client
        .from("users")
        .select(SUMMARY_COLS)
        .ilike("name", name.trim())
        .maybeSingle();
      if (error) {
        log.error("UsersRepository.findUserByName DB error", {
          error: error.message,
        });
        throw new ServiceError("User lookup failed", { cause: error });
      }
      return data === null ? null : rowToSummary(data);
    },

    async listUsersByRoles(
      roles: readonly Role[],
      opts: ListUsersByRolesOptions,
    ): Promise<readonly UserSummary[]> {
      let query = client
        .from("users")
        .select(SUMMARY_COLS)
        .in("role", roles as string[]);
      if (opts.activeOnly) query = query.eq("active", true);
      const keys = opts.orderBy.length > 0 ? opts.orderBy : (["name"] as const);
      for (const k of keys) {
        const col = k === "role" ? "role" : "name";
        query = query.order(col, { ascending: true });
      }
      const { data, error } = await query;
      if (error) {
        log.error("UsersRepository.listUsersByRoles DB error", {
          error: error.message,
        });
        throw new ServiceError("User list failed", { cause: error });
      }
      return (data ?? []).map(rowToSummary);
    },

    async listAllUsers(): Promise<readonly UserSummary[]> {
      const { data, error } = await client
        .from("users")
        .select(SUMMARY_COLS)
        .order("created_at", { ascending: true });
      if (error) {
        log.error("UsersRepository.listAllUsers DB error", {
          error: error.message,
        });
        throw new ServiceError("User list failed", { cause: error });
      }
      return (data ?? []).map(rowToSummary);
    },

    async findCredentialByName(
      name: string,
    ): Promise<UserCredential | null> {
      const { data, error } = await client
        .from("users")
        .select(CREDENTIAL_COLS)
        .ilike("name", name.trim())
        .maybeSingle();
      if (error) {
        log.error("UsersRepository.findCredentialByName DB error", {
          error: error.message,
        });
        throw new ServiceError("Credential lookup failed", { cause: error });
      }
      return data === null ? null : rowToCredential(data);
    },

    async listCredentialsByRoles(
      roles: readonly Role[],
      opts: ListCredentialsByRolesOptions,
    ): Promise<readonly UserCredential[]> {
      let query = client
        .from("users")
        .select(CREDENTIAL_COLS)
        .in("role", roles as string[]);
      if (opts.activeOnly) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) {
        log.error("UsersRepository.listCredentialsByRoles DB error", {
          error: error.message,
        });
        throw new ServiceError("Credential list failed", { cause: error });
      }
      return (data ?? []).map(rowToCredential);
    },

    async createUser(input: CreateUserPersist): Promise<UserSummary> {
      const { data, error } = await client
        .from("users")
        .insert({
          name: input.name.trim(),
          role: input.role,
          secondary_roles: input.secondaryRoles,
          active: true,
          email: input.email,
          [input.hashColumn]: input.passwordHash,
        })
        .select(SUMMARY_COLS)
        .single();
      if (error) {
        // Postgres 23505 = unique-constraint violation (the lower(name)
        // index). Map it to the app's ConflictError INSIDE the adapter so
        // the raw code never crosses the port boundary (ADR-0002 line 27).
        // Every OTHER failure stays a generic ServiceError (500).
        if ((error as { code?: string }).code === "23505") {
          throw new ConflictError("A user with that name already exists", {
            cause: error,
          });
        }
        log.error("UsersRepository.createUser DB error", {
          error: error.message,
        });
        throw new ServiceError("User create failed", { cause: error });
      }
      return rowToSummary(data);
    },

    async updateUser(
      id: string,
      patch: UpdateUserPersist,
    ): Promise<UserSummary | null> {
      const updates: Record<string, unknown> = {};
      if (patch.active !== undefined) updates.active = patch.active;
      if (patch.email !== undefined) updates.email = patch.email;
      if (patch.secondaryRoles !== undefined)
        updates.secondary_roles = patch.secondaryRoles;
      if (patch.credential) {
        // Set the named hash column and CLEAR the other (R5 — no stale
        // credential left behind).
        if (patch.credential.hashColumn === "password_hash") {
          updates.password_hash = patch.credential.passwordHash;
          updates.pin_hash = null;
        } else {
          updates.pin_hash = patch.credential.passwordHash;
          updates.password_hash = null;
        }
      }

      const { data, error } = await client
        .from("users")
        .update(updates)
        .eq("id", id)
        .select(SUMMARY_COLS)
        .maybeSingle();
      if (error) {
        log.error("UsersRepository.updateUser DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("User update failed", { cause: error });
      }
      return data === null ? null : rowToSummary(data);
    },

    async deleteUser(id: string): Promise<void> {
      const { error } = await client.from("users").delete().eq("id", id);
      if (error) {
        log.error("UsersRepository.deleteUser DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("User delete failed", { cause: error });
      }
    },

    async recordLogin(id: string, when: Date): Promise<void> {
      const { error } = await client
        .from("users")
        .update({ last_login_at: when.toISOString() })
        .eq("id", id);
      if (error) {
        log.error("UsersRepository.recordLogin DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Record login failed", { cause: error });
      }
    },
  };
}

export const supabaseUsersRepository: UsersRepository =
  createSupabaseUsersRepository(supabaseService);
