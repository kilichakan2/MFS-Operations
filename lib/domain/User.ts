/**
 * lib/domain/User.ts
 *
 * The Users-domain model the app owns. Two read shapes by design:
 *
 *   - `UserSummary` — the SAFE read shape. It PHYSICALLY CANNOT carry a
 *     credential fingerprint: there is no passwordHash/pinHash field on
 *     it, so a list/profile read can never leak one. Returned by every
 *     hash-free read method.
 *   - `UserCredential` — the ONLY shape that carries a hash. Returned by
 *     exactly two narrowly-named methods (`findCredentialByName`,
 *     `listCredentialsByRoles`) that exist solely so login / kds-pin can
 *     compare a typed credential against the stored hash. Quarantined.
 *
 * That two-types split makes "a hash leaked out of a list read" a COMPILE
 * error, not a code-review catch (F-13 PR1, Risk R2). A runtime contract
 * test backs it up on both adapters.
 *
 * F-13 has arrived (the minimalism this file once carried is superseded):
 * every type below is consumed by a committed route re-point in PR2 or PR3
 * of this same unit (see the plan's §4.3 per-route mapping). None is
 * "might be handy later"; if a type ends up with no consumer it must be
 * deleted.
 *
 * `role` is the `Role` union (ARCH-FU-01 moved that vocabulary into the
 * domain layer at `lib/domain/Role.ts`).
 *
 * Vendor column names (`secondary_roles`, `last_login_at`, `created_at`,
 * `pin_hash`, `password_hash`) NEVER appear here — the Supabase adapter
 * maps them to these camelCase domain fields, so nothing past the adapter
 * boundary sees the database's spelling (ADR-0002 line 27).
 */

import type { Role } from "./Role";

/**
 * A user as the app reads it for display / listing. The SAFE shape —
 * NEVER carries a credential hash (no such field exists on it).
 *
 * Consumers (PR2/PR3): /auth/type, /auth/team, /auth/haccp-team, the
 * admin user list, and the KDS line-done validation (via findUserById).
 */
export interface UserSummary {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly active: boolean;
  readonly secondaryRoles: readonly Role[];
  readonly email: string | null;
  /** ISO-8601 timestamp of the last successful login; null if never. */
  readonly lastLoginAt: string | null;
  /** ISO-8601 timestamp the row was created; used for admin-list ordering. */
  readonly createdAt: string;
}

/**
 * Which credential input a user authenticates with. Admins use a
 * password; everyone else a PIN. Consumed by /auth/type (PR2).
 */
export type AuthType = "password" | "pin";

/**
 * The ONLY shape carrying a credential hash. Returned exclusively by
 * `findCredentialByName` (login, PR3) and `listCredentialsByRoles`
 * (kds-pin, PR2) — the two narrow doors a hash may travel through.
 *
 * `passwordHash` is set for admins; `pinHash` for everyone else. Both
 * may be null on a misconfigured account (login treats a null hash as a
 * "not configured" 403, mirroring today's route).
 */
export interface UserCredential {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly active: boolean;
  readonly secondaryRoles: readonly Role[];
  readonly passwordHash: string | null;
  readonly pinHash: string | null;
}

/**
 * Admin "create a user" input (POST /api/admin/users, PR2). `credential`
 * is the PLAINTEXT PIN/password the user typed; the UsersService hashes
 * it via the PasswordHasher port BEFORE it reaches any adapter — the
 * adapter never sees plaintext.
 */
export interface CreateUserInput {
  readonly name: string;
  readonly role: Role;
  readonly credential: string;
  readonly secondaryRoles: readonly Role[];
  readonly email: string | null;
}

/**
 * Admin "update a user" input (PATCH /api/admin/users/[id], PR2). All
 * fields optional — a partial update. `credential` (when present) is the
 * plaintext to re-hash; the service hashes it, the adapter writes the
 * correct column and clears the other.
 */
export interface UpdateUserInput {
  readonly active?: boolean;
  readonly email?: string | null;
  readonly secondaryRoles?: readonly Role[];
  readonly credential?: { readonly plaintext: string; readonly role: Role };
}

/**
 * The CreateUserInput as it reaches the ADAPTER: the service has already
 * hashed the plaintext, so the adapter receives a pre-computed hash plus
 * which column it belongs in. The adapter never imports bcrypt and never
 * sees plaintext.
 */
export interface CreateUserPersist {
  readonly name: string;
  readonly role: Role;
  readonly secondaryRoles: readonly Role[];
  readonly email: string | null;
  readonly passwordHash: string;
  /** Which column the hash lands in. 'password_hash' for admins, else 'pin_hash'. */
  readonly hashColumn: "password_hash" | "pin_hash";
}

/**
 * The UpdateUserInput as it reaches the ADAPTER. The optional credential
 * has been hashed by the service into `passwordHash` + `hashColumn`; the
 * adapter writes that column and CLEARS the other (no stale credential).
 */
export interface UpdateUserPersist {
  readonly active?: boolean;
  readonly email?: string | null;
  readonly secondaryRoles?: readonly Role[];
  readonly credential?: {
    readonly passwordHash: string;
    readonly hashColumn: "password_hash" | "pin_hash";
  };
}
