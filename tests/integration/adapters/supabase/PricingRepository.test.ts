/**
 * tests/integration/adapters/supabase/PricingRepository.test.ts
 *
 * Runs the shared PricingRepository contract suite against the Supabase
 * adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (the F-06 direct-adapter
 * pattern; sister to RoutesRepository.test.ts).
 *
 * Fixtures: `setupTestUsers()` plants one user per role (agreed_by FK
 * target); `setupTestCustomer()` plants the customer FK target;
 * `getTestProduct()` supplies the line product FK target. Each contract
 * case creates its OWN agreements via `repo.createAgreement(...)`;
 * `cleanup()` deletes ONLY the rows the run created (lines cascade) — the
 * shared fixtures are never touched.
 */
import { pricingRepositoryContract } from "@/lib/ports/__contracts__/PricingRepository.contract";
import { createSupabasePricingRepository } from "@/lib/adapters/supabase";
import {
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
} from "../../_setup";

pricingRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabasePricingRepository(client);
  const users = await setupTestUsers();
  const customer = await setupTestCustomer();
  const product = await getTestProduct();

  // The contract case creates agreements but cleanup needs their ids: wrap
  // createAgreement so we record every id created in this run.
  const createdIds = new Set<string>();
  const wrapped = {
    ...repo,
    async createAgreement(
      input: Parameters<typeof repo.createAgreement>[0],
    ) {
      const created = await repo.createAgreement(input);
      createdIds.add(created.id);
      return created;
    },
  };

  return {
    repo: wrapped,
    agreedBy: users.sales.id,
    customerId: customer.id,
    productId: product.id,
    productName: product.name,
    cleanup: async () => {
      if (createdIds.size === 0) return;
      // price_agreement_lines has ON DELETE CASCADE — deleting the
      // agreement clears its lines.
      await client
        .from("price_agreements")
        .delete()
        .in("id", [...createdIds]);
      createdIds.clear();
    },
  };
});
