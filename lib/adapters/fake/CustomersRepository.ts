/**
 * lib/adapters/fake/CustomersRepository.ts
 *
 * In-memory implementation of `CustomersRepository`
 * (lib/ports/CustomersRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage. Used by F-07's service-layer unit tests to
 * exercise customer-lookup logic without a database.
 *
 * Boundary discipline (ADR-0002 line 27):
 *   This file imports zero vendor SDKs. The internal store is a
 *   `Map<string, Customer>` of DOMAIN types — there is no row shape
 *   anywhere. The Fake therefore cannot leak vendor-shaped data even
 *   if it tried.
 *
 * Construction:
 *   - `createFakeCustomersRepository(seed?)` factory — tests pass an
 *     optional array of pre-seeded customers.
 *   - `fakeCustomersRepository` singleton — starts empty. App code
 *     never imports this; the singleton exists only for symmetry with
 *     the Supabase adapter's barrel.
 */

import type { Customer } from "@/lib/domain";
import type { CustomersRepository } from "@/lib/ports";

export function createFakeCustomersRepository(
  seed?: readonly Customer[],
): CustomersRepository {
  const store = new Map<string, Customer>();
  for (const c of seed ?? []) store.set(c.id, c);
  return {
    async findCustomerById(id: string): Promise<Customer | null> {
      return store.get(id) ?? null;
    },
  };
}

export const fakeCustomersRepository: CustomersRepository =
  createFakeCustomersRepository();
