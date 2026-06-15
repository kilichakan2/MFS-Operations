/**
 * tests/unit/services/UsersService.test.ts
 *
 * Unit tests for UsersService composed against the Fake UsersRepository
 * and a deterministic fake PasswordHasher. No DB. No HTTP. No bcrypt.
 *
 * Follows the round-trip read-back template documented in
 * tests/unit/services/OrdersService.test.ts (ARCH-FU-04): a write's
 * happy path reads the row back through a finder and asserts it
 * persisted, not just that the method returned the right shape.
 *
 * UsersService composes TWO PORTS (UsersRepository + PasswordHasher) —
 * that is port composition, not service composition (allowed; mirrors
 * how use-cases compose ports). The architecture-pin case proves the
 * service imports no sibling *Service file and no adapter.
 *
 * The hashing-boundary contract is the key behaviour pinned here: the
 * SERVICE turns plaintext into a hash via the PasswordHasher port and
 * hands the repo an ALREADY-hashed value plus which column it lands in
 * (role → password_hash for admin, pin_hash otherwise). The repo never
 * sees plaintext.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createUsersService } from "@/lib/services";
import { createFakeUsersRepository } from "@/lib/adapters/fake";
import type { PasswordHasher } from "@/lib/ports";
import type { CreateUserInput } from "@/lib/domain";

// A deterministic fake hasher: hash(p) = `HASHED(${p})`. Lets us assert
// exactly what reached the repo without bcrypt's nondeterminism.
function fakeHasher(): PasswordHasher {
  return {
    async hash(plain: string): Promise<string> {
      return `HASHED(${plain})`;
    },
    async compare(plain: string, hash: string): Promise<boolean> {
      return hash === `HASHED(${plain})`;
    },
  };
}

function make() {
  const users = createFakeUsersRepository();
  const passwordHasher = fakeHasher();
  const service = createUsersService({ users, passwordHasher });
  return { service, users, passwordHasher };
}

const baseCreate: CreateUserInput = {
  name: "Wendy Warehouse",
  role: "warehouse",
  credential: "1234",
  secondaryRoles: [],
  email: null,
};

describe("UsersService.createUser", () => {
  it("hashes the credential and persists a non-admin into pin_hash (round-trip)", async () => {
    const { service } = make();
    const created = await service.createUser(baseCreate);
    expect(created.name).toBe("Wendy Warehouse");
    expect(created.role).toBe("warehouse");
    // returned shape carries no hash
    expect(Object.keys(created)).not.toContain("pinHash");
    expect(Object.keys(created)).not.toContain("passwordHash");

    // round-trip: read back and confirm it persisted
    const persisted = await service.findUserById(created.id);
    expect(persisted?.name).toBe("Wendy Warehouse");

    // the SERVICE hashed the plaintext; the pin column holds the hash,
    // never the raw "1234"
    const cred = await service.findCredentialByName("Wendy Warehouse");
    expect(cred?.pinHash).toBe("HASHED(1234)");
    expect(cred?.passwordHash).toBeNull();
  });

  it("persists an admin credential into password_hash", async () => {
    const { service } = make();
    const created = await service.createUser({
      ...baseCreate,
      name: "Adam Admin",
      role: "admin",
      credential: "supersecret",
    });
    const cred = await service.findCredentialByName(created.name);
    expect(cred?.passwordHash).toBe("HASHED(supersecret)");
    expect(cred?.pinHash).toBeNull();
  });

  it("never stores the raw plaintext credential anywhere", async () => {
    const { service } = make();
    await service.createUser(baseCreate);
    const cred = await service.findCredentialByName("Wendy Warehouse");
    expect(cred?.pinHash).not.toBe("1234");
  });
});

describe("UsersService.updateUser", () => {
  it("applies a non-credential partial patch (round-trip)", async () => {
    const { service } = make();
    const created = await service.createUser(baseCreate);
    const updated = await service.updateUser(created.id, {
      active: false,
      email: "wendy@example.test",
    });
    expect(updated?.active).toBe(false);
    expect(updated?.email).toBe("wendy@example.test");

    const persisted = await service.findUserById(created.id);
    expect(persisted?.active).toBe(false);
    expect(persisted?.email).toBe("wendy@example.test");
  });

  it("hashes a re-set credential and clears the other column", async () => {
    const { service } = make();
    const created = await service.createUser(baseCreate);
    await service.updateUser(created.id, {
      credential: { plaintext: "9999", role: "warehouse" },
    });
    const cred = await service.findCredentialByName("Wendy Warehouse");
    expect(cred?.pinHash).toBe("HASHED(9999)");
    expect(cred?.passwordHash).toBeNull();
  });

  it("returns null when the id does not exist", async () => {
    const { service } = make();
    const missing = "00000000-0000-0000-0000-0000000000ff";
    const updated = await service.updateUser(missing, { active: true });
    expect(updated).toBeNull();
  });
});

describe("UsersService.deleteUser", () => {
  it("removes the user; a re-read returns null", async () => {
    const { service } = make();
    const created = await service.createUser(baseCreate);
    await service.deleteUser(created.id);
    expect(await service.findUserById(created.id)).toBeNull();
  });
});

describe("UsersService reads", () => {
  it("authTypeForName returns 'password' for an active admin, 'pin' otherwise", async () => {
    const { service } = make();
    await service.createUser({
      ...baseCreate,
      name: "Adam Admin",
      role: "admin",
      credential: "secret1",
    });
    await service.createUser({ ...baseCreate, name: "Wendy Warehouse" });
    expect(await service.authTypeForName("Adam Admin")).toBe("password");
    expect(await service.authTypeForName("Wendy Warehouse")).toBe("pin");
  });

  it("authTypeForName returns 'pin' for an unknown name (no enumeration)", async () => {
    const { service } = make();
    expect(await service.authTypeForName("Ghost")).toBe("pin");
  });

  it("authTypeForName returns 'pin' for an inactive admin (don't reveal)", async () => {
    const { service, users } = make();
    const created = await service.createUser({
      ...baseCreate,
      name: "Adam Admin",
      role: "admin",
      credential: "secret1",
    });
    // deactivate directly through the repo
    await users.updateUser(created.id, { active: false });
    expect(await service.authTypeForName("Adam Admin")).toBe("pin");
  });

  it("listTeam returns active users for the given roles", async () => {
    const { service } = make();
    await service.createUser({ ...baseCreate, name: "Wendy Warehouse" });
    await service.createUser({
      ...baseCreate,
      name: "Oscar Office",
      role: "office",
    });
    const team = await service.listTeam(["warehouse", "office"], {
      activeOnly: true,
      orderBy: ["name"],
    });
    const names = team.map((u) => u.name);
    expect(names).toContain("Wendy Warehouse");
    expect(names).toContain("Oscar Office");
    for (const u of team)
      expect(Object.keys(u)).not.toContain("pinHash");
  });

  it("listAllUsers passes through to the port", async () => {
    const { service } = make();
    await service.createUser(baseCreate);
    const all = await service.listAllUsers();
    expect(all.length).toBe(1);
  });

  it("findCredentialByName / listCredentialsByRoles surface hashes (the login/kds doors)", async () => {
    const { service } = make();
    await service.createUser(baseCreate);
    const cred = await service.findCredentialByName("Wendy Warehouse");
    expect(cred?.pinHash).toBe("HASHED(1234)");
    const creds = await service.listCredentialsByRoles(["warehouse"], {
      activeOnly: true,
    });
    expect(creds.length).toBe(1);
    expect(creds[0].pinHash).toBe("HASHED(1234)");
  });
});

describe("UsersService.recordLogin", () => {
  it("stamps last_login_at via the port", async () => {
    const { service } = make();
    const created = await service.createUser(baseCreate);
    const when = new Date("2026-06-15T08:00:00.000Z");
    await service.recordLogin(created.id, when);
    const persisted = await service.findUserById(created.id);
    expect(persisted?.lastLoginAt).toBe(when.toISOString());
  });
});

describe("UsersService architecture pins", () => {
  it("composes two PORTS, not services; exposes the documented surface", () => {
    const { service } = make();
    expect(typeof service.createUser).toBe("function");
    expect(typeof service.updateUser).toBe("function");
    expect(typeof service.deleteUser).toBe("function");
    expect(typeof service.findUserById).toBe("function");
    expect(typeof service.findUserByName).toBe("function");
    expect(typeof service.authTypeForName).toBe("function");
    expect(typeof service.listTeam).toBe("function");
    expect(typeof service.listAllUsers).toBe("function");
    expect(typeof service.findCredentialByName).toBe("function");
    expect(typeof service.listCredentialsByRoles).toBe("function");
    expect(typeof service.recordLogin).toBe("function");
  });

  it("the service imports no sibling *Service file and no adapter", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../lib/services/UsersService.ts"),
      "utf8",
    );
    // No relative or absolute import of any other *Service module.
    expect(src).not.toMatch(/from ['"][^'"]*Service['"]/);
    // No adapter import (services depend on ports only).
    expect(src).not.toMatch(/from ['"][^'"]*\/adapters\//);
    // No runtime observability / auth / log coupling.
    expect(src).not.toMatch(/import \{ [^}]* \} from ['"]@\/lib\/observability/);
    expect(src).not.toMatch(/from ['"]@\/lib\/auth/);
  });
});
