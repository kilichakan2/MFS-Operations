/**
 * lib/services/UsersService.ts
 *
 * The Users service — business orchestration for staff accounts and
 * authentication reads/writes. The second service in the codebase; it
 * copies OrdersService's posture exactly (factory here, wiring in
 * `lib/wiring/users.ts`; primitives not Caller; ports not services).
 *
 * What this file is.
 *   - The single layer the seven user-touching routes will call (the
 *     re-point lands in PR2/PR3 — PR1 ships this introduce-only, with no
 *     production caller yet, exactly how F-RLS-03 shipped its bridge).
 *   - The home of the one business decision that spans more than a bare
 *     port call: the credential HASHING boundary (below).
 *
 * Port composition (ADR-0002 line 23 — allowed).
 *   This service composes TWO PORTS:
 *     UsersRepository (staff persistence)
 *     PasswordHasher  (credential scrambling)
 *   It imports no *Service file. Depending on two ports is port
 *   composition, not service composition — the same shape use-cases use.
 *   The dependency direction stays inward-pointing and acyclic.
 *
 * The hashing boundary (the one real decision here).
 *   Routes today call `passwordHasher.hash(credential)` then write the
 *   role-appropriate column. That logic moves here:
 *     - the SERVICE turns plaintext → hash via the PasswordHasher port;
 *     - it picks the column by role (admin → password_hash, else
 *       pin_hash) and hands the repo an ALREADY-hashed value + which
 *       column. The repo NEVER sees plaintext and never imports bcrypt.
 *   This keeps bcrypt locked inside its one adapter folder (lint-enforced)
 *   while the column-by-role rule lives in business logic.
 *
 * Construction (factory + composition root — ADR-0002, F-TD-11).
 *   - `createUsersService({ users, passwordHasher })` factory — tests
 *     pass a Fake repo + a fake hasher.
 *   - Production wiring lives in `lib/wiring/users.ts` (service-role
 *     singleton) — NEVER a pre-wired singleton here. Service files import
 *     ports only, never the adapters folder (lint-enforced).
 *
 * Auth posture (mirrors OrdersService).
 *   Methods take primitives, never `Caller` / `request`. The route layer
 *   does auth + schema validation; this service does business
 *   orchestration over the ports.
 */

import type {
  UserSummary,
  UserCredential,
  AuthType,
  CreateUserInput,
  UpdateUserInput,
  Role,
} from "@/lib/domain";
import type {
  UsersRepository,
  PasswordHasher,
  ListUsersByRolesOptions,
  ListCredentialsByRolesOptions,
} from "@/lib/ports";

/** Which hash column a role's credential lives in. */
function hashColumnForRole(role: Role): "password_hash" | "pin_hash" {
  return role === "admin" ? "password_hash" : "pin_hash";
}

// ─── Repository bundle ──────────────────────────────────────

/**
 * Ports accepted by `createUsersService`, passed as a named object so the
 * call site is unambiguous: createUsersService({ users, passwordHasher }).
 */
export interface UsersServiceDeps {
  readonly users: UsersRepository;
  readonly passwordHasher: PasswordHasher;
}

// ─── The UsersService interface ─────────────────────────────

export interface UsersService {
  // ─── Hash-free reads ───────────────────────────────────────

  /** Read a user by id (no hash). Null on miss. */
  findUserById(id: string): Promise<UserSummary | null>;

  /** Read a user by name, case-insensitive (no hash). Null on miss. */
  findUserByName(name: string): Promise<UserSummary | null>;

  /**
   * Which input the named user authenticates with: 'password' for an
   * ACTIVE admin, 'pin' otherwise. Returns 'pin' for an unknown or
   * inactive name so the answer never reveals whether a name exists or
   * is active (mirrors /auth/type's non-enumeration posture).
   */
  authTypeForName(name: string): Promise<AuthType>;

  /** List active/all users for the given primary roles (no hash). */
  listTeam(
    roles: readonly Role[],
    opts: ListUsersByRolesOptions,
  ): Promise<readonly UserSummary[]>;

  /** Every user, ordered by createdAt asc (no hash). Admin list. */
  listAllUsers(): Promise<readonly UserSummary[]>;

  // ─── The narrow credential doors (login / kds-pin) ─────────

  /** Read a credential (WITH hash) by name. Login only. Null on miss. */
  findCredentialByName(name: string): Promise<UserCredential | null>;

  /** List credentials (WITH hash) for roles. kds-pin only. */
  listCredentialsByRoles(
    roles: readonly Role[],
    opts: ListCredentialsByRolesOptions,
  ): Promise<readonly UserCredential[]>;

  // ─── Writes ────────────────────────────────────────────────

  /**
   * Create a user. The SERVICE hashes `input.credential` via the
   * PasswordHasher port and selects the column by role; the repo
   * receives only the hash. Returns the created UserSummary (no hash).
   */
  createUser(input: CreateUserInput): Promise<UserSummary>;

  /**
   * Partially update a user. When `patch.credential` is present the
   * service hashes it and the repo writes the role-matching column,
   * clearing the other. Returns the updated UserSummary, or null on no
   * matching id.
   */
  updateUser(
    id: string,
    patch: UpdateUserInput,
  ): Promise<UserSummary | null>;

  /** Permanently delete a user. Idempotent. */
  deleteUser(id: string): Promise<void>;

  /** Stamp last_login_at = when (login fire-and-forget). */
  recordLogin(id: string, when: Date): Promise<void>;
}

// ─── The factory ────────────────────────────────────────────

export function createUsersService(deps: UsersServiceDeps): UsersService {
  const { users, passwordHasher } = deps;

  return {
    findUserById: (id) => users.findUserById(id),
    findUserByName: (name) => users.findUserByName(name),

    async authTypeForName(name) {
      const user = await users.findUserByName(name);
      if (user === null || !user.active) return "pin";
      return user.role === "admin" ? "password" : "pin";
    },

    listTeam: (roles, opts) => users.listUsersByRoles(roles, opts),
    listAllUsers: () => users.listAllUsers(),

    findCredentialByName: (name) => users.findCredentialByName(name),
    listCredentialsByRoles: (roles, opts) =>
      users.listCredentialsByRoles(roles, opts),

    async createUser(input) {
      const passwordHash = await passwordHasher.hash(input.credential);
      return users.createUser({
        name: input.name,
        role: input.role,
        secondaryRoles: input.secondaryRoles,
        email: input.email,
        passwordHash,
        hashColumn: hashColumnForRole(input.role),
      });
    },

    async updateUser(id, patch) {
      const credential = patch.credential
        ? {
            passwordHash: await passwordHasher.hash(patch.credential.plaintext),
            hashColumn: hashColumnForRole(patch.credential.role),
          }
        : undefined;
      return users.updateUser(id, {
        active: patch.active,
        email: patch.email,
        secondaryRoles: patch.secondaryRoles,
        credential,
      });
    },

    deleteUser: (id) => users.deleteUser(id),
    recordLogin: (id, when) => users.recordLogin(id, when),
  };
}
