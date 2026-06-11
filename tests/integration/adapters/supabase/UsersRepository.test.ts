/**
 * tests/integration/adapters/supabase/UsersRepository.test.ts
 *
 * F-08 — runs the shared UsersRepository contract suite against the
 * Supabase adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (the F-06 direct-adapter
 * pattern; sister to CustomersRepository.test.ts).
 */
import { usersRepositoryContract } from "@/lib/ports/__contracts__/UsersRepository.contract";
import { createSupabaseUsersRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestUsers } from "../../_setup";

usersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseUsersRepository(client);
  const users = await setupTestUsers();
  return {
    repo,
    knownUserId: users.butcher.id,
    // setupTestUsers is idempotent; no per-case row to clean up.
    cleanup: async () => {},
  };
});
