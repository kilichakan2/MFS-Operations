/**
 * tests/integration/adapters/supabase/OrdersRepository.test.ts
 *
 * F-06 — runs the shared OrdersRepository contract against the
 * Supabase adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (the F-06 direct-adapter
 * pattern; sister to road-times.test.ts). This is the load-bearing
 * pattern F-08's planner will inherit for the route rewrites.
 *
 * Capability flags:
 *   supportsAuditLog     = true  — DB triggers fire on every mutation
 *   supportsFkValidation = true  — DB FKs enforce on createOrder
 *   supportsConcurrency  = true  — DB-level optimistic locking
 */
import { ordersRepositoryContract } from "@/lib/ports/__contracts__/OrdersRepository.contract";
import { createSupabaseOrdersRepository } from "@/lib/adapters/supabase";
import {
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  cleanupTestData,
} from "../../_setup";

ordersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseOrdersRepository(client);
  // Idempotent fixtures: setupTestUsers / setupTestCustomer /
  // getTestProduct look up existing rows first and only insert when
  // missing. Cheap to re-call in every beforeEach.
  const users = await setupTestUsers();
  const cust = await setupTestCustomer();
  const prod = await getTestProduct();
  return {
    repo,
    customerId: cust.id,
    userId: users.admin.id,
    butcherId: users.butcher.id,
    productId: prod.id,
    supportsAuditLog: true,
    supportsFkValidation: true,
    supportsConcurrency: true,
    cleanup: async () => {
      await cleanupTestData();
    },
  };
});
