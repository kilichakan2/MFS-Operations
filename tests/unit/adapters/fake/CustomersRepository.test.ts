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
// F-20 PR3 — a GEOCODED row (lat/lng set) for listGeocodedForMap. Name "ZZZ…"
// keeps the listAllCustomers name-ordering trivially true.
const GEOCODED_ID = "00000000-0000-0000-0000-000000000c03";

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
    {
      id: GEOCODED_ID,
      name: "ZZZ Geocoded Customer",
      postcode: "S1 2AB",
      active: true,
      lat: 53.38,
      lng: -1.47,
      is_approximate_location: false,
    },
  ]);
  return {
    repo,
    knownCustomerId: KNOWN_ID,
    ungeocodedCustomerId: UNGEOCODED_ID,
    geocodedCustomerId: GEOCODED_ID,
    insertNamePrefix: "FAKE-INS-",
    createdBy: "u-1",
    cleanup: async () => {},
  };
});
