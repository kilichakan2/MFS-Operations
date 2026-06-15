/**
 * lib/ports/__contracts__/UsersRepository.contract.ts
 *
 * Shared behavioural contract for UsersRepository. Both adapters — the
 * Supabase real implementation and the Fake in-memory implementation —
 * pass the SAME suite (F-06 template). The Fake can never quietly drift
 * from the real database's behaviour because they sit the same exam.
 *
 * Adapter-agnostic by construction: imports the PORT type
 * (`UsersRepository`), domain types, and Vitest primitives — nothing else.
 *
 * Setup contract (each adapter's test file supplies this):
 *   - `repo`            — the adapter under test.
 *   - `knownUserId`     — a butcher row the adapter returns on findUserById.
 *   - `knownUserName`   — that butcher's exact name (for findUserByName / ilike).
 *   - `pinUserNames`    — names of the active PIN users (warehouse/office/
 *                         sales/driver) seeded for the listUsersByRoles cases.
 *   - `kdsRoleNames`    — names of active butcher+warehouse users (kds-pin).
 *   - `freshName()`     — returns a unique ANVIL-TEST- name for write cases,
 *                         so create/update/delete never touch shared fixtures.
 *   - `cleanup()`       — deletes any rows the case created via freshName().
 *
 * The hashes-never-leak cases (Risk R2) live here so BOTH adapters prove
 * it: every `UserSummary`-returning method must return objects with NO
 * `passwordHash` / `pinHash` key (runtime), and only the two
 * `*Credential*` methods expose a hash.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { UsersRepository } from "@/lib/ports";

export interface UsersContractSetup {
  repo: UsersRepository;
  /** A butcher id the adapter returns on findUserById. */
  knownUserId: string;
  /** That butcher's exact name (case-insensitive lookup target). */
  knownUserName: string;
  /** Names of active PIN users (warehouse/office/sales/driver). */
  pinUserNames: readonly string[];
  /** Names of active butcher+warehouse users (kds-pin set). */
  kdsRoleNames: readonly string[];
  /** A fresh, unique ANVIL-TEST- name for a write case. */
  freshName: () => string;
  cleanup: () => Promise<void>;
}

// The two credential-bearing return types carry a hash; every other read
// MUST NOT. Asserted at runtime on each summary object.
function assertNoHashFields(obj: Record<string, unknown>): void {
  const keys = Object.keys(obj);
  expect(keys).not.toContain("passwordHash");
  expect(keys).not.toContain("pinHash");
}

export function usersRepositoryContract(
  setup: () => Promise<UsersContractSetup>,
): void {
  describe("UsersRepository contract", () => {
    let ctx: UsersContractSetup;

    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });

    // ─── findUserById ──────────────────────────────────────────────

    it("findUserById returns the safe UserSummary shape", async () => {
      const user = await ctx.repo.findUserById(ctx.knownUserId);
      expect(user).not.toBeNull();
      if (user === null) throw new Error("user was null after expect");
      expect(user.id).toBe(ctx.knownUserId);
      expect(typeof user.name).toBe("string");
      expect(user.name.length).toBeGreaterThan(0);
      expect(typeof user.role).toBe("string");
      expect(user.role.length).toBeGreaterThan(0);
      expect(typeof user.active).toBe("boolean");
      expect(Array.isArray(user.secondaryRoles)).toBe(true);
      // email | null, lastLoginAt | null, createdAt string
      expect(
        user.email === null || typeof user.email === "string",
      ).toBe(true);
      expect(
        user.lastLoginAt === null || typeof user.lastLoginAt === "string",
      ).toBe(true);
      expect(typeof user.createdAt).toBe("string");
    });

    it("findUserById returns null on miss (does NOT throw NotFoundError)", async () => {
      const missingId = "00000000-0000-0000-0000-0000000000fe";
      const user = await ctx.repo.findUserById(missingId);
      expect(user).toBeNull();
    });

    it("findUserById returns the active flag verbatim (no pre-filter)", async () => {
      const user = await ctx.repo.findUserById(ctx.knownUserId);
      expect(user).not.toBeNull();
      if (user === null) throw new Error("user was null after expect");
      expect(typeof user.active).toBe("boolean");
    });

    it("findUserById NEVER leaks a hash (R2)", async () => {
      const user = await ctx.repo.findUserById(ctx.knownUserId);
      expect(user).not.toBeNull();
      if (user === null) throw new Error("user was null after expect");
      assertNoHashFields(user as unknown as Record<string, unknown>);
    });

    // ─── findUserByName ────────────────────────────────────────────

    it("findUserByName resolves case-insensitively and returns UserSummary", async () => {
      const user = await ctx.repo.findUserByName(
        ctx.knownUserName.toUpperCase(),
      );
      expect(user).not.toBeNull();
      if (user === null) throw new Error("user was null after expect");
      expect(user.id).toBe(ctx.knownUserId);
    });

    it("findUserByName returns null on miss", async () => {
      const user = await ctx.repo.findUserByName(
        "no-such-user-xyzzy-0001",
      );
      expect(user).toBeNull();
    });

    it("findUserByName NEVER leaks a hash (R2)", async () => {
      const user = await ctx.repo.findUserByName(ctx.knownUserName);
      expect(user).not.toBeNull();
      if (user === null) throw new Error("user was null after expect");
      assertNoHashFields(user as unknown as Record<string, unknown>);
    });

    // ─── listUsersByRoles ──────────────────────────────────────────

    it("listUsersByRoles returns active PIN users ordered by name (no hash, R2)", async () => {
      const users = await ctx.repo.listUsersByRoles(
        ["warehouse", "office", "sales", "driver"],
        { activeOnly: true, orderBy: ["name"] },
      );
      // every seeded PIN user is present
      const names = users.map((u) => u.name);
      for (const n of ctx.pinUserNames) {
        expect(names).toContain(n);
      }
      // active-only honoured
      for (const u of users) expect(u.active).toBe(true);
      // ordered by name ascending (within the seeded subset we control)
      const seeded = users.filter((u) => ctx.pinUserNames.includes(u.name));
      const seededNames = seeded.map((u) => u.name);
      expect(seededNames).toEqual([...seededNames].sort());
      // no hash leaks
      for (const u of users)
        assertNoHashFields(u as unknown as Record<string, unknown>);
    });

    it("listUsersByRoles orders by role then name when asked", async () => {
      const users = await ctx.repo.listUsersByRoles(
        ["butcher", "warehouse"],
        { activeOnly: true, orderBy: ["role", "name"] },
      );
      // Rows are GROUPED by role (each role contiguous) — the exact role
      // sequence is collation-specific (Postgres orders the `role` enum
      // by declaration order, not alphabetically; the Fake mirrors that),
      // so we assert grouping, not a literal alphabetical order.
      const roles = users.map((u) => u.role);
      const firstIndex = new Map<string, number>();
      roles.forEach((r, i) => {
        if (!firstIndex.has(r)) firstIndex.set(r, i);
      });
      // No role re-appears after a different role started (i.e. contiguous).
      const seen = new Set<string>();
      let prev: string | null = null;
      for (const r of roles) {
        if (r !== prev) {
          expect(seen.has(r)).toBe(false); // not seen before this group
          seen.add(r);
          prev = r;
        }
      }
      // Within each role group, names are ascending.
      const byRole = new Map<string, string[]>();
      for (const u of users) {
        const list = byRole.get(u.role) ?? [];
        list.push(u.name);
        byRole.set(u.role, list);
      }
      for (const names of byRole.values()) {
        expect(names).toEqual([...names].sort());
      }
    });

    // ─── listAllUsers ──────────────────────────────────────────────

    it("listAllUsers returns every user ordered by createdAt asc (no hash, R2)", async () => {
      const users = await ctx.repo.listAllUsers();
      expect(users.length).toBeGreaterThan(0);
      // ordered by createdAt ascending
      const created = users.map((u) => u.createdAt);
      expect(created).toEqual([...created].sort());
      // includes our known butcher
      expect(users.some((u) => u.id === ctx.knownUserId)).toBe(true);
      // no hash leaks
      for (const u of users)
        assertNoHashFields(u as unknown as Record<string, unknown>);
    });

    // ─── findCredentialByName (the ONE single-read door for a hash) ──

    it("findCredentialByName returns a UserCredential carrying the hash", async () => {
      const cred = await ctx.repo.findCredentialByName(ctx.knownUserName);
      expect(cred).not.toBeNull();
      if (cred === null) throw new Error("cred was null after expect");
      expect(cred.id).toBe(ctx.knownUserId);
      // it's the credential shape — a hash field is PRESENT (this is the
      // only place that's allowed). The butcher carries a pin hash.
      const keys = Object.keys(cred);
      expect(keys).toContain("passwordHash");
      expect(keys).toContain("pinHash");
      expect(cred.pinHash).not.toBeNull();
    });

    it("findCredentialByName returns null on miss", async () => {
      const cred = await ctx.repo.findCredentialByName(
        "no-such-user-xyzzy-0002",
      );
      expect(cred).toBeNull();
    });

    // ─── listCredentialsByRoles (the ONE list door for a hash) ──────

    it("listCredentialsByRoles returns active butcher+warehouse creds with hashes", async () => {
      const creds = await ctx.repo.listCredentialsByRoles(
        ["butcher", "warehouse"],
        { activeOnly: true },
      );
      expect(creds.length).toBeGreaterThan(0);
      for (const c of creds) {
        expect(c.active).toBe(true);
        const keys = Object.keys(c);
        expect(keys).toContain("pinHash");
      }
      // every seeded kds-role name is present
      const names = creds.map((c) => c.name);
      for (const n of ctx.kdsRoleNames) {
        expect(names).toContain(n);
      }
    });

    // ─── createUser (write — uses freshName + cleanup) ─────────────

    it("createUser persists and reads back (round-trip), no hash leak", async () => {
      const name = ctx.freshName();
      const created = await ctx.repo.createUser({
        name,
        role: "warehouse",
        secondaryRoles: [],
        email: "rt@example.test",
        passwordHash: "$2a$10$ROUNDTRIPPLACEHOLDERHASHXXXXXXXXXXXXXXXXXXXXXXX",
        hashColumn: "pin_hash",
      });
      expect(created.name).toBe(name);
      expect(created.role).toBe("warehouse");
      expect(created.email).toBe("rt@example.test");
      assertNoHashFields(created as unknown as Record<string, unknown>);

      // round-trip read-back through findUserById (ARCH-FU-04)
      const persisted = await ctx.repo.findUserById(created.id);
      expect(persisted).not.toBeNull();
      expect(persisted?.name).toBe(name);

      // the hash landed in pin_hash (verified via the credential door)
      const cred = await ctx.repo.findCredentialByName(name);
      expect(cred?.pinHash).not.toBeNull();
      expect(cred?.passwordHash).toBeNull();
    });

    it("createUser puts an admin password in password_hash, pin_hash null", async () => {
      const name = ctx.freshName();
      const created = await ctx.repo.createUser({
        name,
        role: "admin",
        secondaryRoles: [],
        email: null,
        passwordHash: "$2a$10$ADMINROUNDTRIPHASHXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        hashColumn: "password_hash",
      });
      const cred = await ctx.repo.findCredentialByName(created.name);
      expect(cred?.passwordHash).not.toBeNull();
      expect(cred?.pinHash).toBeNull();
    });

    // ─── updateUser (write) ────────────────────────────────────────

    it("updateUser applies a partial patch and reads back", async () => {
      const name = ctx.freshName();
      const created = await ctx.repo.createUser({
        name,
        role: "warehouse",
        secondaryRoles: [],
        email: null,
        passwordHash: "$2a$10$UPDATEBASEHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        hashColumn: "pin_hash",
      });
      const updated = await ctx.repo.updateUser(created.id, {
        active: false,
        email: "changed@example.test",
      });
      expect(updated).not.toBeNull();
      expect(updated?.active).toBe(false);
      expect(updated?.email).toBe("changed@example.test");
      assertNoHashFields(updated as unknown as Record<string, unknown>);

      const persisted = await ctx.repo.findUserById(created.id);
      expect(persisted?.active).toBe(false);
      expect(persisted?.email).toBe("changed@example.test");
    });

    it("updateUser re-hash sets the role's column and clears the other (R5)", async () => {
      // The DB CHECK constraint `users_auth_check` ties the credential
      // column to the role: a non-admin MUST keep pin_hash, an admin MUST
      // keep password_hash. So a valid re-hash writes the ROLE-matching
      // column and clears the other. Here a PIN user re-sets their PIN:
      // pin_hash is updated, password_hash is (and stays) null — proving
      // the adapter writes the named column and clears the other, with no
      // stale credential ever left behind.
      const name = ctx.freshName();
      const created = await ctx.repo.createUser({
        name,
        role: "warehouse",
        secondaryRoles: [],
        email: null,
        passwordHash: "$2a$10$STARTPINHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        hashColumn: "pin_hash",
      });
      const NEW_PIN_HASH =
        "$2a$10$RESETPINHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      await ctx.repo.updateUser(created.id, {
        credential: {
          passwordHash: NEW_PIN_HASH,
          hashColumn: "pin_hash",
        },
      });
      const cred = await ctx.repo.findCredentialByName(name);
      expect(cred?.pinHash).toBe(NEW_PIN_HASH); // role's column updated
      expect(cred?.passwordHash).toBeNull(); // the other column cleared/absent
    });

    it("updateUser re-hash works for an admin password too (R5)", async () => {
      // The admin direction of the same rule: an admin re-sets their
      // password — password_hash updated, pin_hash stays null.
      const name = ctx.freshName();
      const created = await ctx.repo.createUser({
        name,
        role: "admin",
        secondaryRoles: [],
        email: null,
        passwordHash: "$2a$10$STARTADMINPWHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        hashColumn: "password_hash",
      });
      const NEW_PW_HASH =
        "$2a$10$RESETADMINPWHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      await ctx.repo.updateUser(created.id, {
        credential: {
          passwordHash: NEW_PW_HASH,
          hashColumn: "password_hash",
        },
      });
      const cred = await ctx.repo.findCredentialByName(name);
      expect(cred?.passwordHash).toBe(NEW_PW_HASH);
      expect(cred?.pinHash).toBeNull();
    });

    it("updateUser returns null when no row matches the id", async () => {
      const missingId = "00000000-0000-0000-0000-0000000000fd";
      const updated = await ctx.repo.updateUser(missingId, { active: true });
      expect(updated).toBeNull();
    });

    // ─── deleteUser (write) ────────────────────────────────────────

    it("deleteUser removes the row; a re-read returns null", async () => {
      const name = ctx.freshName();
      const created = await ctx.repo.createUser({
        name,
        role: "warehouse",
        secondaryRoles: [],
        email: null,
        passwordHash: "$2a$10$DELETEMEHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        hashColumn: "pin_hash",
      });
      await ctx.repo.deleteUser(created.id);
      const gone = await ctx.repo.findUserById(created.id);
      expect(gone).toBeNull();
    });

    it("deleteUser on a missing id is not an error (idempotent)", async () => {
      const missingId = "00000000-0000-0000-0000-0000000000fc";
      await expect(ctx.repo.deleteUser(missingId)).resolves.toBeUndefined();
    });

    // ─── recordLogin (write) ───────────────────────────────────────

    it("recordLogin stamps last_login_at, readable via findUserById", async () => {
      const name = ctx.freshName();
      const created = await ctx.repo.createUser({
        name,
        role: "warehouse",
        secondaryRoles: [],
        email: null,
        passwordHash: "$2a$10$LOGINHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        hashColumn: "pin_hash",
      });
      const when = new Date("2026-06-15T09:00:00.000Z");
      await ctx.repo.recordLogin(created.id, when);
      const persisted = await ctx.repo.findUserById(created.id);
      expect(persisted?.lastLoginAt).not.toBeNull();
      // Compare as instants, not string format: Postgres serialises the
      // timestamptz as `+00:00`, the Fake as `.000Z` — same moment, both
      // valid. The domain field is "an ISO timestamp", not a byte-exact form.
      expect(new Date(persisted!.lastLoginAt as string).getTime()).toBe(
        when.getTime(),
      );
    });
  });
}
