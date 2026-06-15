/**
 * lib/adapters/fake/UsersRepository.ts
 *
 * In-memory implementation of `UsersRepository`
 * (lib/ports/UsersRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage of DOMAIN types. The faithful twin of the
 * Supabase adapter: it passes the SAME shared contract suite.
 *
 * Hash quarantine (mirrors the real adapter's column discipline):
 *   The store keeps each user's hash columns in a SEPARATE record from
 *   the `UserSummary` projection. The hash-free read methods build
 *   `UserSummary` objects that have no hash key at all, so — exactly
 *   like the real adapter's `select(...)` projection — a hash leak is
 *   structurally impossible, not just "avoided".
 *
 * Construction:
 *   - `createFakeUsersRepository(seed?)` factory — tests pass optional
 *     seed rows (FakeUserRow: a UserSummary plus its hash columns).
 *   - `fakeUsersRepository` singleton — starts empty; exists only for
 *     symmetry with the Supabase barrel.
 */

import type {
  UserSummary,
  UserCredential,
  CreateUserPersist,
  UpdateUserPersist,
  Role,
} from "@/lib/domain";
import { KNOWN_ROLES } from "@/lib/domain";
import type {
  UsersRepository,
  ListUsersByRolesOptions,
  ListCredentialsByRolesOptions,
} from "@/lib/ports";

// Mirror Postgres enum ordering: the `role` column is a Postgres enum,
// which sorts by DECLARATION order, not alphabetically. KNOWN_ROLES is
// that declaration order, so the Fake groups roles exactly as the real
// DB does (keeps both adapters answering the shared contract identically).
const ROLE_RANK = new Map<Role, number>(KNOWN_ROLES.map((r, i) => [r, i]));

/**
 * A storage row for the Fake: the full user including its hash columns.
 * Internal to the Fake — never returned as-is; reads project to
 * `UserSummary` (hash-free) or `UserCredential` (hash-bearing).
 */
export interface FakeUserRow {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly active: boolean;
  readonly secondaryRoles: readonly Role[];
  readonly email: string | null;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly passwordHash: string | null;
  readonly pinHash: string | null;
}

/**
 * Seed shape: the four core fields are required; the richer F-13 fields
 * are optional and default sensibly. This keeps pre-F-13 callers (the
 * Orders use-case tests, which only seed id/name/role/active) compiling
 * unchanged, while F-13 contract tests supply full rows.
 */
export type FakeUserSeed = Pick<
  FakeUserRow,
  "id" | "name" | "role" | "active"
> &
  Partial<Omit<FakeUserRow, "id" | "name" | "role" | "active">>;

function normaliseSeed(seed: FakeUserSeed): FakeUserRow {
  return {
    id: seed.id,
    name: seed.name,
    role: seed.role,
    active: seed.active,
    secondaryRoles: seed.secondaryRoles ?? [],
    email: seed.email ?? null,
    lastLoginAt: seed.lastLoginAt ?? null,
    createdAt: seed.createdAt ?? new Date(0).toISOString(),
    passwordHash: seed.passwordHash ?? null,
    pinHash: seed.pinHash ?? null,
  };
}

function toSummary(row: FakeUserRow): UserSummary {
  // Build a fresh object with ONLY the safe fields — no hash key exists
  // on the returned object (structural guarantee, like a SELECT column list).
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active,
    secondaryRoles: row.secondaryRoles,
    email: row.email,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

function toCredential(row: FakeUserRow): UserCredential {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active,
    secondaryRoles: row.secondaryRoles,
    passwordHash: row.passwordHash,
    pinHash: row.pinHash,
  };
}

function orderRows(
  rows: FakeUserRow[],
  orderBy: readonly ("role" | "name")[],
): FakeUserRow[] {
  const keys = orderBy.length > 0 ? orderBy : (["name"] as const);
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const cmp =
        k === "role"
          ? (ROLE_RANK.get(a.role) ?? 0) - (ROLE_RANK.get(b.role) ?? 0)
          : a.name.localeCompare(b.name);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  // Deterministic, UUID-shaped id for the fake.
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

export function createFakeUsersRepository(
  seed?: readonly FakeUserSeed[],
): UsersRepository {
  const store = new Map<string, FakeUserRow>();
  for (const r of seed ?? []) store.set(r.id, normaliseSeed(r));

  return {
    async findUserById(id: string): Promise<UserSummary | null> {
      const row = store.get(id);
      return row ? toSummary(row) : null;
    },

    async findUserByName(name: string): Promise<UserSummary | null> {
      const target = name.trim().toLowerCase();
      for (const row of store.values()) {
        if (row.name.toLowerCase() === target) return toSummary(row);
      }
      return null;
    },

    async listUsersByRoles(
      roles: readonly Role[],
      opts: ListUsersByRolesOptions,
    ): Promise<readonly UserSummary[]> {
      const roleSet = new Set<Role>(roles);
      let rows = [...store.values()].filter((r) => roleSet.has(r.role));
      if (opts.activeOnly) rows = rows.filter((r) => r.active);
      return orderRows(rows, opts.orderBy).map(toSummary);
    },

    async listAllUsers(): Promise<readonly UserSummary[]> {
      const rows = [...store.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      return rows.map(toSummary);
    },

    async findCredentialByName(
      name: string,
    ): Promise<UserCredential | null> {
      const target = name.trim().toLowerCase();
      for (const row of store.values()) {
        if (row.name.toLowerCase() === target) return toCredential(row);
      }
      return null;
    },

    async listCredentialsByRoles(
      roles: readonly Role[],
      opts: ListCredentialsByRolesOptions,
    ): Promise<readonly UserCredential[]> {
      const roleSet = new Set<Role>(roles);
      let rows = [...store.values()].filter((r) => roleSet.has(r.role));
      if (opts.activeOnly) rows = rows.filter((r) => r.active);
      return rows.map(toCredential);
    },

    async createUser(input: CreateUserPersist): Promise<UserSummary> {
      const id = nextId();
      const row: FakeUserRow = {
        id,
        name: input.name,
        role: input.role,
        active: true,
        secondaryRoles: input.secondaryRoles,
        email: input.email,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        passwordHash:
          input.hashColumn === "password_hash" ? input.passwordHash : null,
        pinHash: input.hashColumn === "pin_hash" ? input.passwordHash : null,
      };
      store.set(id, row);
      return toSummary(row);
    },

    async updateUser(
      id: string,
      patch: UpdateUserPersist,
    ): Promise<UserSummary | null> {
      const existing = store.get(id);
      if (!existing) return null;

      let passwordHash = existing.passwordHash;
      let pinHash = existing.pinHash;
      if (patch.credential) {
        // Set the named column, CLEAR the other (R5 — no stale credential).
        if (patch.credential.hashColumn === "password_hash") {
          passwordHash = patch.credential.passwordHash;
          pinHash = null;
        } else {
          pinHash = patch.credential.passwordHash;
          passwordHash = null;
        }
      }

      const updated: FakeUserRow = {
        ...existing,
        active: patch.active ?? existing.active,
        email: patch.email !== undefined ? patch.email : existing.email,
        secondaryRoles:
          patch.secondaryRoles !== undefined
            ? patch.secondaryRoles
            : existing.secondaryRoles,
        passwordHash,
        pinHash,
      };
      store.set(id, updated);
      return toSummary(updated);
    },

    async deleteUser(id: string): Promise<void> {
      store.delete(id);
    },

    async recordLogin(id: string, when: Date): Promise<void> {
      const existing = store.get(id);
      if (!existing) return;
      store.set(id, { ...existing, lastLoginAt: when.toISOString() });
    },
  };
}

export const fakeUsersRepository: UsersRepository = createFakeUsersRepository();
