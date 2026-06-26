/**
 * lib/adapters/fake/CustomersRepository.ts
 *
 * In-memory implementation of `CustomersRepository`
 * (lib/ports/CustomersRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage. Used by service-layer + route unit tests to exercise
 * customer logic without a database.
 *
 * Boundary discipline (ADR-0002 line 27):
 *   This file imports zero vendor SDKs. The internal store is a
 *   `Map<string, CustomerAdminView>` of DOMAIN types — there is no row shape
 *   anywhere, so the Fake cannot leak vendor-shaped data even if it tried.
 *
 * Construction:
 *   - `createFakeCustomersRepository(seed?)` factory — tests pass an optional
 *     array of pre-seeded customers. The seed accepts the SLIM `Customer` shape
 *     (back-compat with F-06/F-07 tests) OR the richer `CustomerAdminView`;
 *     missing admin fields default to a sensible ungeocoded value.
 *   - `fakeCustomersRepository` singleton — starts empty. App code never imports
 *     this; the singleton exists only for symmetry with the Supabase barrel.
 *
 * F-20 PR1 adds the admin surface (listAllCustomers, listUngeocoded, setActive,
 * setPostcodeAndCoords, setCoords) so the new contract cases pass in-memory.
 */

import type {
  Customer,
  CustomerAdminView,
} from "@/lib/domain";
import type { CustomersRepository } from "@/lib/ports";

/** Either shape may be seeded; the slim Customer is widened to the admin view. */
type SeedCustomer = Customer | CustomerAdminView;

function toStored(c: SeedCustomer): CustomerAdminView {
  const admin = c as Partial<CustomerAdminView> & Customer;
  return {
    id: admin.id,
    name: admin.name,
    postcode: admin.postcode,
    lat: admin.lat ?? null,
    lng: admin.lng ?? null,
    active: admin.active,
    created_at: admin.created_at ?? "2026-01-01T00:00:00.000Z",
    geocoded_at: admin.geocoded_at ?? null,
    is_approximate_location: admin.is_approximate_location ?? false,
  };
}

export function createFakeCustomersRepository(
  seed?: readonly SeedCustomer[],
): CustomersRepository {
  const store = new Map<string, CustomerAdminView>();
  for (const c of seed ?? []) store.set(c.id, toStored(c));

  return {
    async findCustomerById(id: string): Promise<Customer | null> {
      const c = store.get(id);
      if (c === undefined) return null;
      // Project the stored admin view back down to the slim Orders-view.
      return {
        id: c.id,
        name: c.name,
        postcode: c.postcode,
        active: c.active,
      };
    },

    // ── Admin surface (F-20 PR1) ──────────────────────────────────────────────

    async listAllCustomers(): Promise<readonly CustomerAdminView[]> {
      return [...store.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async listUngeocoded(
      limit: number,
    ): Promise<readonly CustomerAdminView[]> {
      return [...store.values()]
        .filter((c) => c.postcode !== null && c.lat === null)
        .slice(0, limit);
    },

    async setActive(
      id: string,
      active: boolean,
    ): Promise<CustomerAdminView | null> {
      const c = store.get(id);
      if (c === undefined) return null;
      const updated = { ...c, active };
      store.set(id, updated);
      return updated;
    },

    async setPostcodeAndCoords(
      id: string,
      fields: {
        postcode: string;
        lat: number | null;
        lng: number | null;
        geocoded_at: string | null;
        is_approximate_location: boolean;
      },
    ): Promise<CustomerAdminView | null> {
      const c = store.get(id);
      if (c === undefined) return null;
      const updated: CustomerAdminView = {
        ...c,
        postcode: fields.postcode,
        lat: fields.lat,
        lng: fields.lng,
        geocoded_at: fields.geocoded_at,
        is_approximate_location: fields.is_approximate_location,
      };
      store.set(id, updated);
      return updated;
    },

    async setCoords(
      id: string,
      fields: {
        lat: number;
        lng: number;
        geocoded_at: string;
        is_approximate_location: boolean;
      },
    ): Promise<void> {
      const c = store.get(id);
      if (c === undefined) return;
      store.set(id, {
        ...c,
        lat: fields.lat,
        lng: fields.lng,
        geocoded_at: fields.geocoded_at,
        is_approximate_location: fields.is_approximate_location,
      });
    },
  };
}

export const fakeCustomersRepository: CustomersRepository =
  createFakeCustomersRepository();
