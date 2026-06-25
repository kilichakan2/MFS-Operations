/**
 * lib/adapters/fake/HaccpLookupsRepository.ts
 *
 * In-memory implementation of `HaccpLookupsRepository`
 * (lib/ports/HaccpLookupsRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter.
 *
 * The seeded `users` are returned in DB order (name-ascending, as the real
 * adapter `.order('name')`s) — the SERVICE applies the admins-first re-sort, so
 * the test seeds name-ordered rows and asserts the service's reshuffle (R-F-B4).
 *
 * Construction:
 *   - `createFakeHaccpLookupsRepository(seed?)` factory.
 *   - `fakeHaccpLookupsRepository` singleton — empty; barrel symmetry.
 */

import type { HaccpUserOption, HaccpCustomerOption } from "@/lib/domain";
import type { HaccpLookupsRepository } from "@/lib/ports";

export interface FakeHaccpLookupsSeed {
  readonly users?: readonly HaccpUserOption[];
  readonly customers?: readonly HaccpCustomerOption[];
}

export function createFakeHaccpLookupsRepository(
  seed?: FakeHaccpLookupsSeed,
): HaccpLookupsRepository {
  return {
    async listSelectableUsers(): Promise<readonly HaccpUserOption[]> {
      return seed?.users ?? [];
    },
    async listActiveCustomers(): Promise<readonly HaccpCustomerOption[]> {
      return seed?.customers ?? [];
    },
  };
}

export const fakeHaccpLookupsRepository: HaccpLookupsRepository =
  createFakeHaccpLookupsRepository();
