/**
 * tests/unit/adapters/fake/UsersRepository.test.ts
 *
 * F-08 — runs the shared UsersRepository contract against the Fake
 * in-memory adapter. No DB. No network. No Supabase stack required.
 */
import { usersRepositoryContract } from "@/lib/ports/__contracts__/UsersRepository.contract";
import { createFakeUsersRepository } from "@/lib/adapters/fake";

// Stable test UUID — the fake doesn't enforce anything, but the
// contract suite's id parameters need to be plausible strings.
const KNOWN_ID = "00000000-0000-0000-0000-000000000a01";

usersRepositoryContract(async () => {
  const repo = createFakeUsersRepository([
    {
      id: KNOWN_ID,
      name: "Fake Butcher",
      role: "butcher",
      active: true,
    },
  ]);
  return {
    repo,
    knownUserId: KNOWN_ID,
    // Fresh repo per case via beforeEach — nothing per-case to clean up.
    cleanup: async () => {},
  };
});
