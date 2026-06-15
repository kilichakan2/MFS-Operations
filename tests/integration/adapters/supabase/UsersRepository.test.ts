/**
 * tests/integration/adapters/supabase/UsersRepository.test.ts
 *
 * Runs the shared UsersRepository contract suite against the Supabase
 * adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (the F-06 direct-adapter
 * pattern; sister to CustomersRepository.test.ts).
 *
 * Fixtures: `setupTestUsers()` plants one user per role with a known
 * `ANVIL-TEST-<role>` name and a placeholder hash (admin → password_hash,
 * everyone else → pin_hash). The write contract cases (create/update/
 * delete) create their OWN uniquely-named rows via `freshName()` and the
 * `cleanup()` deletes only those — the shared per-role fixtures are never
 * touched (Risk R6).
 */
import { usersRepositoryContract } from "@/lib/ports/__contracts__/UsersRepository.contract";
import { createSupabaseUsersRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestUsers, TEST_PREFIX } from "../../_setup";

usersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseUsersRepository(client);
  const users = await setupTestUsers();

  // Track names this case fabricates so cleanup deletes exactly those.
  const createdNames: string[] = [];
  let n = 0;

  return {
    repo,
    knownUserId: users.butcher.id,
    knownUserName: users.butcher.name, // `${TEST_PREFIX}butcher`
    pinUserNames: [
      users.warehouse.name,
      users.office.name,
      users.sales.name,
      users.driver.name,
    ],
    kdsRoleNames: [users.butcher.name, users.warehouse.name],
    freshName: () => {
      const name = `${TEST_PREFIX}write-${Date.now()}-${n++}`;
      createdNames.push(name);
      return name;
    },
    cleanup: async () => {
      if (createdNames.length === 0) return;
      // Delete ONLY the rows this case created — never the shared fixtures.
      await client.from("users").delete().in("name", createdNames);
      createdNames.length = 0;
    },
  };
});
