/**
 * tests/integration/adapters/supabase/CustomersRepository.test.ts
 *
 * F-06 — runs the shared CustomersRepository contract suite against
 * the Supabase adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (the F-06 direct-adapter
 * pattern; sister to road-times.test.ts).
 */
import { customersRepositoryContract } from "@/lib/ports/__contracts__/CustomersRepository.contract";
import { createSupabaseCustomersRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestCustomer } from "../../_setup";

customersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseCustomersRepository(client);
  const cust = await setupTestCustomer();
  return {
    repo,
    knownCustomerId: cust.id,
    // setupTestCustomer is idempotent; no per-case row to clean up.
    cleanup: async () => {},
  };
});
