/**
 * tests/unit/adapters/fake/RoutesRepository.test.ts
 *
 * Runs the shared RoutesRepository contract against the Fake in-memory
 * adapter. No DB. No network. No Supabase stack required.
 *
 * The Fake is seeded with a person directory (so assignee/creator joins
 * resolve) and a customer directory (so stop.customer joins resolve),
 * mirroring the FK rows the integration setup plants in the real DB —
 * both adapters then answer the identical exam.
 */
import { routesRepositoryContract } from "@/lib/ports/__contracts__/RoutesRepository.contract";
import { createFakeRoutesRepository } from "@/lib/adapters/fake";

const ASSIGNED_TO = "00000000-0000-0000-0000-0000000000a1";
const OTHER_USER = "00000000-0000-0000-0000-0000000000a2";
const CUSTOMER_ID = "00000000-0000-0000-0000-0000000000c1";

routesRepositoryContract(async () => {
  const repo = createFakeRoutesRepository({
    people: {
      [ASSIGNED_TO]: {
        id: ASSIGNED_TO,
        name: "ANVIL-FAKE-driver",
        role: "driver",
      },
      [OTHER_USER]: {
        id: OTHER_USER,
        name: "ANVIL-FAKE-driver-2",
        role: "driver",
      },
    },
    customers: {
      [CUSTOMER_ID]: {
        id: CUSTOMER_ID,
        name: "ANVIL-FAKE-customer",
        postcode: "XX1 1XX",
        lat: 53.38,
        lng: -1.47,
      },
    },
  });
  return {
    repo,
    assignedTo: ASSIGNED_TO,
    otherUserId: OTHER_USER,
    customerId: CUSTOMER_ID,
    // Fresh repo per case via the contract's closure; nothing persists
    // across cases, so cleanup is a no-op.
    cleanup: async () => {},
  };
});
