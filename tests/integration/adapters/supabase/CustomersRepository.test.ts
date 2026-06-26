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
import {
  getServiceClient,
  setupTestCustomer,
  setupTestUsers,
  TEST_PREFIX,
} from "../../_setup";

const UNGEOCODED_NAME = `${TEST_PREFIX}ungeocoded-customer`;
const GEOCODED_NAME = `${TEST_PREFIX}geocoded-customer`;
// F-20 PR3 — a prefix unique to the import cases so insertMany/insertOne create
// fresh rows; cleanup removes them by this prefix so names never collide on
// re-run (the insertOne 23505 case relies on a clean first insert).
const INSERT_PREFIX = `${TEST_PREFIX}import-`;

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

/** Create-or-reset a customer to a known GEOCODED + active state (lat/lng set). */
async function setupGeocodedCustomer(): Promise<string> {
  const supa = getServiceClient();
  const { data: existing } = await supa
    .from("customers")
    .select("id")
    .eq("name", GEOCODED_NAME)
    .maybeSingle();

  const fields = {
    postcode: "S1 2AB",
    lat: 53.38,
    lng: -1.47,
    geocoded_at: "2026-06-26T00:00:00.000Z",
    is_approximate_location: false,
    active: true,
  };
  if (existing) {
    await supa.from("customers").update(fields).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await supa
    .from("customers")
    .insert({ name: GEOCODED_NAME, ...fields })
    .select("id")
    .single();
  if (error)
    throw new Error(`Failed to create geocoded test customer: ${error.message}`);
  return data.id;
}

customersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseCustomersRepository(client);
  const cust = await setupTestCustomer();
  const ungeocodedId = await setupUngeocodedCustomer();
  const geocodedId = await setupGeocodedCustomer();
  const users = await setupTestUsers();
  // Clear any leftover import rows from a previous case/run so the insertOne
  // duplicate case starts from a clean first insert.
  await getServiceClient()
    .from("customers")
    .delete()
    .like("name", `${INSERT_PREFIX}%`);
  return {
    repo,
    knownCustomerId: cust.id,
    ungeocodedCustomerId: ungeocodedId,
    geocodedCustomerId: geocodedId,
    insertNamePrefix: INSERT_PREFIX,
    createdBy: users.admin.id,
    cleanup: async () => {
      await getServiceClient()
        .from("customers")
        .delete()
        .like("name", `${INSERT_PREFIX}%`);
    },
  };
});
