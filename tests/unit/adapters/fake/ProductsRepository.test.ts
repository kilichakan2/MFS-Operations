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
      name: "Fake Product",
      category: "Burgers",
      code: "BC-001",
      boxSize: "10 kg",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
  return {
    repo,
    knownProductId: KNOWN_ID,
    insertNamePrefix: "FAKE-PINS-",
    createdBy: "u-1",
    cleanup: async () => {},
  };
});
