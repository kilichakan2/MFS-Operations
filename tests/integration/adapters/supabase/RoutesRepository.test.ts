/**
 * tests/integration/adapters/supabase/RoutesRepository.test.ts
 *
 * Runs the shared RoutesRepository contract suite against the Supabase
 * adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (the F-06 direct-adapter
 * pattern; sister to UsersRepository.test.ts).
 *
 * Fixtures: `setupTestUsers()` plants one user per role (assigned_to /
 * created_by FK targets); `setupTestCustomer()` plants the stop's
 * customer FK target. Each contract case creates its OWN routes via
 * `repo.createRoute(...)`; `cleanup()` deletes ONLY the rows the run
 * created (route_stops cascade) — the shared fixtures are never touched.
 */
import { routesRepositoryContract } from "@/lib/ports/__contracts__/RoutesRepository.contract";
import { createSupabaseRoutesRepository } from "@/lib/adapters/supabase";
import {
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
} from "../../_setup";

routesRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseRoutesRepository(client);
  const users = await setupTestUsers();
  const customer = await setupTestCustomer();

  // The contract case pushes ids into createdIds, but cleanup needs to
  // find them: wrap createRoute so we record every id created in this run.
  const createdIds = new Set<string>();
  const wrapped = {
    ...repo,
    async createRoute(input: Parameters<typeof repo.createRoute>[0]) {
      const created = await repo.createRoute(input);
      createdIds.add(created.id);
      return created;
    },
  };

  return {
    repo: wrapped,
    assignedTo: users.driver.id,
    otherUserId: users.sales.id,
    customerId: customer.id,
    cleanup: async () => {
      if (createdIds.size === 0) return;
      // route_stops has ON DELETE CASCADE — deleting the route clears stops.
      await client.from("routes").delete().in("id", [...createdIds]);
      createdIds.clear();
    },
  };
});
