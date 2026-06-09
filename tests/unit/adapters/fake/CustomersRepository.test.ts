/**
 * tests/unit/adapters/fake/CustomersRepository.test.ts
 *
 * F-06 — runs the shared CustomersRepository contract against the Fake
 * in-memory adapter. No DB. No network. No Supabase stack required.
 */
import { customersRepositoryContract } from "@/lib/ports/__contracts__/CustomersRepository.contract";
import { createFakeCustomersRepository } from "@/lib/adapters/fake";

// Stable test UUID — the fake doesn't enforce anything, but the
// contract suite's id parameters need to be plausible strings.
const KNOWN_ID = "00000000-0000-0000-0000-000000000c01";

customersRepositoryContract(async () => {
  const repo = createFakeCustomersRepository([
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
    // Fresh repo per case via beforeEach — nothing per-case to clean up.
    cleanup: async () => {},
  };
});
