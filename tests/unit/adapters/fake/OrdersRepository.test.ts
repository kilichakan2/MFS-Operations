/**
 * tests/unit/adapters/fake/OrdersRepository.test.ts
 *
 * F-06 — runs the shared OrdersRepository contract against the Fake
 * in-memory adapter. No DB. No network. No Supabase stack required.
 *
 * The Fake passes a STRICT SUBSET of the contract:
 *   - supportsAuditLog=false      — listKdsQueue recent-flashes case
 *                                   short-circuits to `return` (no
 *                                   audit model on the Fake).
 *   - supportsFkValidation=false  — createOrder FK-rollback case
 *                                   short-circuits (Fake has no FK).
 *   - supportsConcurrency=false   — no concurrency case currently
 *                                   wired in the suite (see plan §5).
 *
 * Each test gets a fresh adapter via createFakeOrdersRepository() so
 * cases are independent. cleanup is a no-op.
 *
 * Acts as the unit-test substrate F-07 OrdersService uses for its
 * own service-layer unit tests.
 */
import { ordersRepositoryContract } from "@/lib/ports/__contracts__/OrdersRepository.contract";
import { createFakeOrdersRepository } from "@/lib/adapters/fake";

const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const USER_ID = "00000000-0000-0000-0000-000000000a01";
const BUTCHER_ID = "00000000-0000-0000-0000-000000000b01";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000d01";

ordersRepositoryContract(async () => {
  const repo = createFakeOrdersRepository();
  return {
    repo,
    customerId: CUSTOMER_ID,
    userId: USER_ID,
    butcherId: BUTCHER_ID,
    productId: PRODUCT_ID,
    supportsAuditLog: false,
    supportsFkValidation: false,
    supportsConcurrency: false,
    cleanup: async () => {},
  };
});
