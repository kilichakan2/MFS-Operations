/**
 * tests/integration/adapters/supabase/CustomersRepository.test.ts
 *
 * F-06 + F-20 PR1 — runs the shared CustomersRepository contract suite (the
 * original findCustomerById cases PLUS the new admin-surface cases:
 * listAllCustomers, listUngeocoded, setActive, setPostcodeAndCoords, setCoords)
 * against the Supabase adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly, bypassing
 * the Next.js routes entirely (the F-06 direct-adapter pattern).
 *
 * The admin cases MUTATE a customer (active flag, postcode, coords). So this
 * wrapper provisions a DEDICATED ungeocoded customer and RESETS it to a known
 * ungeocoded+active state at the start of every case (beforeEach → setup), so
 * the listUngeocoded / setActive / setPostcode cases never interfere.
 */
import { customersRepositoryContract } from "@/lib/ports/__contracts__/CustomersRepository.contract";
import { createSupabaseCustomersRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestCustomer, TEST_PREFIX } from "../../_setup";

const UNGEOCODED_NAME = `${TEST_PREFIX}ungeocoded-customer`;

/** Create-or-reset a customer to a known ungeocoded + active state. */
async function setupUngeocodedCustomer(): Promise<string> {
  const supa = getServiceClient();
  const { data: existing } = await supa
    .from("customers")
    .select("id")
    .eq("name", UNGEOCODED_NAME)
    .maybeSingle();

  if (existing) {
    await supa
      .from("customers")
      .update({
        postcode: "XX9 9XX",
        lat: null,
        lng: null,
        geocoded_at: null,
        is_approximate_location: false,
        active: true,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supa
    .from("customers")
    .insert({
      name: UNGEOCODED_NAME,
      active: true,
      postcode: "XX9 9XX",
      lat: null,
      lng: null,
    })
    .select("id")
    .single();
  if (error)
    throw new Error(`Failed to create ungeocoded test customer: ${error.message}`);
  return data.id;
}

customersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseCustomersRepository(client);
  const cust = await setupTestCustomer();
  const ungeocodedId = await setupUngeocodedCustomer();
  return {
    repo,
    knownCustomerId: cust.id,
    ungeocodedCustomerId: ungeocodedId,
    cleanup: async () => {},
  };
});
