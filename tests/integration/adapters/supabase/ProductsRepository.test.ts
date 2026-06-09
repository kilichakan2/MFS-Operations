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
import { getServiceClient, getTestProduct } from "../../_setup";

productsRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseProductsRepository(client);
  const prod = await getTestProduct();
  return {
    repo,
    knownProductId: prod.id,
    // getTestProduct is idempotent; nothing per-case to clean up.
    cleanup: async () => {},
  };
});
