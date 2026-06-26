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
import type { CustomersRepository, InsertOneResult } from "@/lib/ports";
import type { MapCustomer } from "@/lib/services/mapScene";

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

let fakeCustomerIdCounter = 0;
function nextCustomerId(): string {
  fakeCustomerIdCounter += 1;
  const suffix = String(fakeCustomerIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-c${suffix.slice(1)}`;
}

export function createFakeCustomersRepository(
  seed?: readonly SeedCustomer[],
): CustomersRepository {
  const store = new Map<string, CustomerAdminView>();
  for (const c of seed ?? []) store.set(c.id, toStored(c));

  /** Names present in the store — drives the insertOne 23505 duplicate path. */
  function nameExists(name: string): boolean {
    for (const c of store.values()) if (c.name === name) return true;
    return false;
  }

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

    // ── Import surface (F-20 PR3) ─────────────────────────────────────────────

    async insertMany(
      rows: readonly {
        name: string;
        postcode: string | null;
        created_by: string;
      }[],
    ): Promise<readonly { id: string; postcode: string | null }[]> {
      const created: { id: string; postcode: string | null }[] = [];
      for (const r of rows) {
        const id = nextCustomerId();
        store.set(id, {
          id,
          name: r.name,
          postcode: r.postcode,
          lat: null,
          lng: null,
          active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          geocoded_at: null,
          is_approximate_location: false,
        });
        created.push({ id, postcode: r.postcode });
      }
      return created;
    },

    async insertOne(row: {
      name: string;
      created_by: string;
    }): Promise<InsertOneResult> {
      // Mirror the Supabase 23505 path: a duplicate name → duplicate, no throw.
      if (nameExists(row.name)) return { outcome: "duplicate" };
      const id = nextCustomerId();
      store.set(id, {
        id,
        name: row.name,
        postcode: null,
        lat: null,
        lng: null,
        active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        geocoded_at: null,
        is_approximate_location: false,
      });
      return { outcome: "inserted" };
    },

    async listGeocodedForMap(): Promise<readonly MapCustomer[]> {
      return [...store.values()]
        .filter((c) => c.lat !== null && c.lng !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          postcode: c.postcode ?? "",
          // The fake store doesn't carry external_system_id; the real adapter's
          // code = external_system_id mapping is proven by the integration test.
          code: null,
          active: c.active,
          lat: c.lat as number,
          lng: c.lng as number,
          is_approximate: c.is_approximate_location ?? false,
        }));
    },
  };
}

export const fakeCustomersRepository: CustomersRepository =
  createFakeCustomersRepository();
