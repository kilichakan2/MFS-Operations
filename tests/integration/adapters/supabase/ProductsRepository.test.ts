/**
 * tests/integration/adapters/supabase/ProductsRepository.test.ts
 *
 * F-06 — runs the shared ProductsRepository contract suite against
 * the Supabase adapter wired to the local Supabase stack.
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 */
import { productsRepositoryContract } from "@/lib/ports/__contracts__/ProductsRepository.contract";
import { createSupabaseProductsRepository } from "@/lib/adapters/supabase";
import { getServiceClient, getTestProduct, setupTestUsers, TEST_PREFIX } from "../../_setup";

// F-20 PR3 — a prefix unique to the import cases so insertMany/insertOne create
// fresh rows; cleanup removes them by this prefix so names never collide on
// re-run (the insertOne 23505 case relies on a clean first insert).
const INSERT_PREFIX = `${TEST_PREFIX}pimport-`;

productsRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseProductsRepository(client);
  const prod = await getTestProduct();
  const users = await setupTestUsers();
  // Clear any leftover import rows from a previous case/run so the insertOne
  // duplicate case starts from a clean first insert.
  await getServiceClient()
    .from("products")
    .delete()
    .like("name", `${INSERT_PREFIX}%`);
  return {
    repo,
    knownProductId: prod.id,
    insertNamePrefix: INSERT_PREFIX,
    createdBy: users.admin.id,
    cleanup: async () => {
      await getServiceClient()
        .from("products")
        .delete()
        .like("name", `${INSERT_PREFIX}%`);
    },
  };
});
