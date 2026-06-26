/**
 * tests/unit/adapters/fake/CustomersRepository.test.ts
 *
 * F-06 — runs the shared CustomersRepository contract against the Fake
 * in-memory adapter. No DB. No network. No Supabase stack required.
 */
import { customersRepositoryContract } from "@/lib/ports/__contracts__/CustomersRepository.contract";
import { createFakeCustomersRepository } from "@/lib/adapters/fake";

// Stable test UUIDs — the fake doesn't enforce anything, but the
// contract suite's id parameters need to be plausible strings.
const KNOWN_ID = "00000000-0000-0000-0000-000000000c01";
// A SECOND, ungeocoded row (postcode present, no coords) for the F-20 admin
// cases (listUngeocoded / setActive / setPostcode / setCoords). Name "AAA…"
// keeps it first so the listAllCustomers name-ordering case stays trivially true.
const UNGEOCODED_ID = "00000000-0000-0000-0000-000000000c02";

customersRepositoryContract(async () => {
  // Fresh repo per case (beforeEach) — mutations never bleed across cases.
  const repo = createFakeCustomersRepository([
    {
      id: UNGEOCODED_ID,
      name: "AAA Ungeocoded Customer",
      postcode: "XX1 1XX",
      active: true,
    },
    {
      id: KNOWN_ID,
      name: "Fake Customer",
      postcode: "XX1 1XX",
      active: true,
    },
  ]);
  return {
    repo,
    knownCustomerId: KNOWN_ID,
    ungeocodedCustomerId: UNGEOCODED_ID,
    cleanup: async () => {},
  };
});
