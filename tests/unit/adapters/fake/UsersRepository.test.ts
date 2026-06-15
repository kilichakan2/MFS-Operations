/**
 * tests/unit/adapters/fake/UsersRepository.test.ts
 *
 * Runs the shared UsersRepository contract against the Fake in-memory
 * adapter. No DB. No network. No Supabase stack required.
 *
 * The Fake is seeded with the same role spread the integration setup
 * plants in the real DB, so both adapters answer the identical exam.
 */
import { describe, it, expect } from "vitest";
import { usersRepositoryContract } from "@/lib/ports/__contracts__/UsersRepository.contract";
import {
  createFakeUsersRepository,
  type FakeUserRow,
} from "@/lib/adapters/fake";

const PIN_HASH = "$2a$10$FAKEPINHASHPLACEHOLDERXXXXXXXXXXXXXXXXXXXXXXX";
const PW_HASH = "$2a$10$FAKEPWHASHPLACEHOLDERXXXXXXXXXXXXXXXXXXXXXXXXX";

const KNOWN_BUTCHER_ID = "00000000-0000-0000-0000-0000000000b1";

// Stable, ordered createdAt values so listAllUsers ordering is testable.
function seedRows(): FakeUserRow[] {
  return [
    {
      id: KNOWN_BUTCHER_ID,
      name: "ANVIL-FAKE-butcher",
      role: "butcher",
      active: true,
      secondaryRoles: [],
      email: null,
      lastLoginAt: null,
      createdAt: "2026-01-01T00:00:01.000Z",
      passwordHash: null,
      pinHash: PIN_HASH,
    },
    {
      id: "00000000-0000-0000-0000-0000000000b2",
      name: "ANVIL-FAKE-warehouse",
      role: "warehouse",
      active: true,
      secondaryRoles: [],
      email: null,
      lastLoginAt: null,
      createdAt: "2026-01-01T00:00:02.000Z",
      passwordHash: null,
      pinHash: PIN_HASH,
    },
    {
      id: "00000000-0000-0000-0000-0000000000b3",
      name: "ANVIL-FAKE-office",
      role: "office",
      active: true,
      secondaryRoles: [],
      email: null,
      lastLoginAt: null,
      createdAt: "2026-01-01T00:00:03.000Z",
      passwordHash: null,
      pinHash: PIN_HASH,
    },
    {
      id: "00000000-0000-0000-0000-0000000000b4",
      name: "ANVIL-FAKE-sales",
      role: "sales",
      active: true,
      secondaryRoles: [],
      email: null,
      lastLoginAt: null,
      createdAt: "2026-01-01T00:00:04.000Z",
      passwordHash: null,
      pinHash: PIN_HASH,
    },
    {
      id: "00000000-0000-0000-0000-0000000000b5",
      name: "ANVIL-FAKE-driver",
      role: "driver",
      active: true,
      secondaryRoles: [],
      email: null,
      lastLoginAt: null,
      createdAt: "2026-01-01T00:00:05.000Z",
      passwordHash: null,
      pinHash: PIN_HASH,
    },
    {
      id: "00000000-0000-0000-0000-0000000000b6",
      name: "ANVIL-FAKE-admin",
      role: "admin",
      active: true,
      secondaryRoles: [],
      email: null,
      lastLoginAt: null,
      createdAt: "2026-01-01T00:00:06.000Z",
      passwordHash: PW_HASH,
      pinHash: null,
    },
  ];
}

let counter = 0;

usersRepositoryContract(async () => {
  const repo = createFakeUsersRepository(seedRows());
  return {
    repo,
    knownUserId: KNOWN_BUTCHER_ID,
    knownUserName: "ANVIL-FAKE-butcher",
    pinUserNames: [
      "ANVIL-FAKE-warehouse",
      "ANVIL-FAKE-office",
      "ANVIL-FAKE-sales",
      "ANVIL-FAKE-driver",
    ],
    kdsRoleNames: ["ANVIL-FAKE-butcher", "ANVIL-FAKE-warehouse"],
    // Fresh repo per case via the contract's beforeEach — write cases use
    // a unique name; nothing persists across cases, so cleanup is a no-op.
    freshName: () => `ANVIL-FAKE-write-${counter++}`,
    cleanup: async () => {},
  };
});

// A focused belt-and-braces unit case on top of the shared contract:
// the Fake's hash-free reads MUST physically omit the hash keys.
describe("Fake UsersRepository hash quarantine", () => {
  it("toSummary projections carry no hash keys", async () => {
    const repo = createFakeUsersRepository(seedRows());
    const all = await repo.listAllUsers();
    for (const u of all) {
      expect(Object.keys(u)).not.toContain("passwordHash");
      expect(Object.keys(u)).not.toContain("pinHash");
    }
  });
});
