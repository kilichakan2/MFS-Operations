/**
 * tests/unit/adapters/fake/ProductsRepository.test.ts
 *
 * F-06 — runs the shared ProductsRepository contract against the Fake
 * in-memory adapter. No DB. No network.
 */
import { productsRepositoryContract } from "@/lib/ports/__contracts__/ProductsRepository.contract";
import { createFakeProductsRepository } from "@/lib/adapters/fake";

const KNOWN_ID = "00000000-0000-0000-0000-000000000p01";

productsRepositoryContract(async () => {
  const repo = createFakeProductsRepository([
    {
      id: KNOWN_ID,
      code: "BC-001",
      name: "Fake Product",
      boxSize: "10 kg",
    },
  ]);
  return {
    repo,
    knownProductId: KNOWN_ID,
    cleanup: async () => {},
  };
});
