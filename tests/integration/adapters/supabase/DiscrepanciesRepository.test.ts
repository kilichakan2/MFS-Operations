/**
 * tests/integration/adapters/supabase/DiscrepanciesRepository.test.ts
 *
 * F-21 — runs the shared DiscrepanciesRepository contract against the Supabase
 * adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run db:reset                                       (fresh seed)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly, bypassing
 * the Next.js routes entirely (the F-06 direct-adapter pattern).
 *
 * The seed does NOT ship a discrepancies row, so this wrapper provisions a
 * DEDICATED discrepancy (with a customer / product / user join) inside the test
 * window, and cleans it up afterwards.
 */
import { createSupabaseDiscrepanciesRepository } from "@/lib/adapters/supabase";
import { discrepanciesRepositoryContract } from "@/lib/ports/__contracts__/DiscrepanciesRepository.contract";
import {
  getServiceClient,
  setupTestCustomer,
  setupTestUsers,
  getTestProduct,
} from "../../_setup";

// A window that bounds the seeded row's created_at.
const FROM = "2026-04-01T00:00:00.000Z";
const TO = "2026-04-30T23:59:59.999Z";
const CREATED_AT = "2026-04-08T12:00:00.000Z";
const RAW_REASON = "out_of_stock";
const MISSING_ID = "00000000-0000-0000-0000-0000000000ff";

/** Create a fresh discrepancy row inside [FROM,TO] with joins resolvable.
 *  Returns its id. */
async function setupTestDiscrepancy(
  customerId: string,
  productId: string,
  userId: string,
): Promise<string> {
  const supa = getServiceClient();
  // Clear any leftover rows from a previous case/run for this customer.
  await supa.from("discrepancies").delete().eq("customer_id", customerId);
  const { data, error } = await supa
    .from("discrepancies")
    .insert({
      created_at: CREATED_AT,
      user_id: userId,
      customer_id: customerId,
      product_id: productId,
      ordered_qty: 10,
      sent_qty: 7,
      unit: "kg",
      status: "short",
      reason: RAW_REASON,
      note: "integration seed",
    })
    .select("id")
    .single();
  if (error)
    throw new Error(`Failed to create test discrepancy: ${error.message}`);
  return data.id as string;
}

discrepanciesRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseDiscrepanciesRepository(client);
  const cust = await setupTestCustomer();
  const prod = await getTestProduct();
  const users = await setupTestUsers();
  const id = await setupTestDiscrepancy(cust.id, prod.id, users.admin.id);
  return {
    repo,
    todayWindow: { from: FROM, to: TO },
    weekWindow: { from: FROM, to: TO },
    knownTodayId: id,
    knownDetailId: id,
    missingId: MISSING_ID,
    knownRawReason: RAW_REASON,
    cleanup: async () => {
      await getServiceClient()
        .from("discrepancies")
        .delete()
        .eq("customer_id", cust.id);
    },
  };
});
