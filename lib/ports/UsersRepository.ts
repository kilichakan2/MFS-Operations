/**
 * lib/ports/UsersRepository.ts
 *
 * The Users port — the staff-management interface the app owns.
 *
 * **F-13 (Users + Auth) has arrived.** This port grew from a single
 * lookup-by-id into the full surface the seven user-touching routes
 * need. The old header warned that adding methods would be "speculative
 * generality (APOSD § 'general-purpose by accident')" — that warning is
 * now DISCHARGED, not ignored: every method below maps 1:1 to a named
 * route that consumes it in a committed PR of this same unit (see the
 * F-13 PR1 plan §4.3). None is "might be handy later"; if a method ever
 * ends up with no consumer, delete it.
 *
 *   findUserById         → KDS line-done + picking-list (already live)
 *   findUserByName       → /auth/type            (PR2)
 *   listUsersByRoles     → /auth/team, /auth/haccp-team (PR2)
 *   listAllUsers         → GET /api/admin/users  (PR2)
 *   findCredentialByName → /auth/login           (PR3)
 *   listCredentialsByRoles → /auth/kds-pin       (PR2)
 *   createUser           → POST /api/admin/users (PR2)
 *   updateUser           → PATCH /api/admin/users/[id] (PR2)
 *   deleteUser           → DELETE /api/admin/users/[id] (PR2)
 *   recordLogin          → /auth/login last_login_at (PR3)
 *
 * ── The credential-hash quarantine (the most important design call) ──
 *   Two distinct return TYPES, not one method with an "includeHash" flag:
 *     - hash-free reads return `UserSummary`, which has NO hash field —
 *       so a hash leak through a list/profile read is a COMPILE error.
 *     - `findCredentialByName` / `listCredentialsByRoles` return
 *       `UserCredential` — the only shape with hash fields — and exist
 *       solely so login / kds-pin can compare a typed credential.
 *   A boolean flag would let any list method optionally return hashes; a
 *   future careless caller could flip it. Two types make the leak
 *   impossible by construction (F-13 PR1, Risk R2). A runtime contract
 *   test backs the type guarantee on both adapters.
 *
 * Boundary discipline (ADR-0002 line 27): vendor column names
 * (secondary_roles, last_login_at, created_at, pin_hash, password_hash)
 * are mapped to camelCase domain fields inside the adapter; callers see
 * only `@/lib/domain` types. Reads define errors out of existence
 * (null/empty on miss, never NotFoundError); only the DB-failure path
 * throws ServiceError.
 */

import type {
  UserSummary,
  UserCredential,
  CreateUserPersist,
  UpdateUserPersist,
} from "@/lib/domain";
import type { Role } from "@/lib/domain";

/** Options for `listUsersByRoles`. */
export interface ListUsersByRolesOptions {
  /** When true, only `active = true` rows are returned. */
  readonly activeOnly: boolean;
  /**
   * Order keys applied in sequence (e.g. ['role','name'] = order by role
   * then name, both ascending). Empty = adapter default (by name).
   */
  readonly orderBy: readonly ("role" | "name")[];
}

/** Options for `listCredentialsByRoles`. */
export interface ListCredentialsByRolesOptions {
  /** When true, only `active = true` rows are returned. */
  readonly activeOnly: boolean;
}

export interface UsersRepository {
  // ─── Hash-free reads (return UserSummary — NEVER a hash) ─────────

  /**
   * Read a user by id. Returns the full `UserSummary` (no hash).
   * @returns the user, or `null` on miss (APOSD §11 — never throws
   *   NotFoundError). @throws ServiceError on DB failure.
   */
  findUserById(id: string): Promise<UserSummary | null>;

  /**
   * Read a user by name (case-insensitive, `ilike`). Returns the safe
   * `UserSummary` (no hash) — consumed by /auth/type, which only needs
   * role + active to decide PIN-vs-password.
   * @returns the user, or `null` on miss. @throws ServiceError on DB failure.
   */
  findUserByName(name: string): Promise<UserSummary | null>;

  /**
   * List users whose PRIMARY role is in `roles`, as `UserSummary` (no
   * hash). Consumed by /auth/team and /auth/haccp-team. `opts.activeOnly`
   * filters inactive rows; `opts.orderBy` sets the sort sequence.
   * @throws ServiceError on DB failure.
   */
  listUsersByRoles(
    roles: readonly Role[],
    opts: ListUsersByRolesOptions,
  ): Promise<readonly UserSummary[]>;

  /**
   * List every user as `UserSummary` (no hash), ordered by `createdAt`
   * ascending. Consumed by the admin user list (GET /api/admin/users).
   * @throws ServiceError on DB failure.
   */
  listAllUsers(): Promise<readonly UserSummary[]>;

  // ─── The NARROW credential-read seam (hashes legitimately needed) ──

  /**
   * Read a user's credential by name (case-insensitive, `ilike`),
   * INCLUDING the hash columns. The ONLY single-user read that exposes a
   * hash — consumed solely by /auth/login (PR3) to compare a typed
   * credential. @returns the credential, or `null` on miss.
   * @throws ServiceError on DB failure.
   */
  findCredentialByName(name: string): Promise<UserCredential | null>;

  /**
   * List credentials (INCLUDING hash columns) for users whose primary
   * role is in `roles`. The ONLY list read that exposes hashes —
   * consumed solely by /auth/kds-pin (PR2), which must compare a typed
   * PIN against every active butcher/warehouse user.
   * @throws ServiceError on DB failure.
   */
  listCredentialsByRoles(
    roles: readonly Role[],
    opts: ListCredentialsByRolesOptions,
  ): Promise<readonly UserCredential[]>;

  // ─── Writes ──────────────────────────────────────────────────────

  /**
   * Create a user. The hash is ALREADY computed by the service (the
   * adapter never sees plaintext); `input.hashColumn` says whether it
   * lands in `password_hash` or `pin_hash`. Returns the created
   * `UserSummary` (no hash). @throws ServiceError on DB failure.
   */
  createUser(input: CreateUserPersist): Promise<UserSummary>;

  /**
   * Partially update a user. When `patch.credential` is present the
   * adapter writes its `hashColumn` and CLEARS the other hash column (no
   * stale credential). Returns the updated `UserSummary`, or `null` if no
   * row matched `id` (define errors out of existence).
   * @throws ServiceError on DB failure.
   */
  updateUser(
    id: string,
    patch: UpdateUserPersist,
  ): Promise<UserSummary | null>;

  /**
   * Permanently delete a user by id. Idempotent — deleting a missing id
   * is not an error. @throws ServiceError on DB failure.
   */
  deleteUser(id: string): Promise<void>;

  /**
   * Record a successful login by stamping `last_login_at = when`.
   * Fire-and-forget at the call site (login, PR3); the port still
   * surfaces DB failure. @throws ServiceError on DB failure.
   */
  recordLogin(id: string, when: Date): Promise<void>;
}
