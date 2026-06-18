/**
 * tests/unit/adapters/fake/PricingRepository.test.ts
 *
 * Runs the shared PricingRepository contract against the Fake in-memory
 * adapter. No DB. No network. No Supabase stack required.
 *
 * The Fake is seeded with a person directory (so the rep / agreed_by join
 * resolves), a customer directory (so the customer join resolves), and a
 * product directory (so the line product join resolves), mirroring the FK
 * rows the integration setup plants in the real DB — both adapters then
 * answer the identical exam.
 */
import { pricingRepositoryContract } from "@/lib/ports/__contracts__/PricingRepository.contract";
import { createFakePricingRepository } from "@/lib/adapters/fake";

const AGREED_BY = "00000000-0000-0000-0000-0000000000a1";
const CUSTOMER_ID = "00000000-0000-0000-0000-0000000000c1";
const PRODUCT_ID = "00000000-0000-0000-0000-0000000000d1";
const PRODUCT_NAME = "ANVIL-FAKE-product";

pricingRepositoryContract(async () => {
  const repo = createFakePricingRepository({
    people: {
      [AGREED_BY]: { id: AGREED_BY, name: "ANVIL-FAKE-rep" },
    },
    customers: {
      [CUSTOMER_ID]: { id: CUSTOMER_ID, name: "ANVIL-FAKE-customer" },
    },
    products: {
      [PRODUCT_ID]: {
        id: PRODUCT_ID,
        name: PRODUCT_NAME,
        boxSize: "10kg",
        code: "ANVIL-FAKE-CODE",
      },
    },
  });
  return {
    repo,
    agreedBy: AGREED_BY,
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    productName: PRODUCT_NAME,
    // Fresh repo per case via the contract's closure; nothing persists
    // across cases, so cleanup is a no-op.
    cleanup: async () => {},
  };
});
