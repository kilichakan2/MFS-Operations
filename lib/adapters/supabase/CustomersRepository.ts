/**
 * lib/adapters/supabase/CustomersRepository.ts
 *
 * Supabase implementation of `CustomersRepository`
 * (lib/ports/CustomersRepository.ts). One of three files in the
 * Orders bounded context allowed to import `@supabase/supabase-js`
 * (the others: OrdersRepository.ts, ProductsRepository.ts in this
 * directory). The ESLint allow-list at `.eslintrc.json:18` permits
 * the `lib/adapters/supabase` directory tree.
 *
 * Boundary discipline (ADR-0002 line 27 — mandatory):
 *   Vendor shapes stay INSIDE this file. The method body uses
 *   PostgREST row results; the return value is the domain `Customer`
 *   shape from `@/lib/domain`.
 *
 * Construction (hybrid factory + singleton — F-06 template):
 *   - `createSupabaseCustomersRepository(client)` factory — tests
 *     pass `getServiceClient()`.
 *   - `supabaseCustomersRepository` singleton — pre-wired against
 *     `supabaseService` from `@/lib/adapters/supabase/client`.
 *
 * Error contract (per F-05 CustomersRepository JSDoc):
 *   findCustomerById → ServiceError on DB failure; returns null on miss.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { Customer, CustomerAdminView } from "@/lib/domain";
import type { CustomersRepository, InsertOneResult } from "@/lib/ports";
import type { MapCustomer } from "@/lib/services/mapScene";

// The verbatim SELECT for the Map View read, copied from app/api/map/data
// (the customers query) so the wire output stays byte-identical.
const MAP_COLS =
  "id, name, postcode, external_system_id, active, lat, lng, is_approximate_location";

/**
 * The exact column projection the admin routes read/return. Kept here (inside
 * the adapter) so the SELECT/`.select(...)` string is defined once. The
 * `customers` GET + `[id]` PATCH return the SIX presentation fields; the two
 * geocode-write fields are carried so setPostcodeAndCoords/setCoords callers can
 * read them back if they need to.
 */
const ADMIN_COLS =
  "id, name, postcode, lat, lng, active, created_at, geocoded_at, is_approximate_location";

/** Map one PostgREST row to the owned CustomerAdminView. Vendor shape stops here. */
function toAdminView(row: {
  id: string;
  name: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
  created_at: string;
  geocoded_at?: string | null;
  is_approximate_location?: boolean | null;
}): CustomerAdminView {
  return {
    id: row.id,
    name: row.name,
    postcode: row.postcode,
    lat: row.lat,
    lng: row.lng,
    active: row.active,
    created_at: row.created_at,
    geocoded_at: row.geocoded_at ?? null,
    is_approximate_location: row.is_approximate_location ?? false,
  };
}

export function createSupabaseCustomersRepository(
  client: SupabaseClient,
): CustomersRepository {
  return {
    async findCustomerById(id: string): Promise<Customer | null> {
      const { data, error } = await client
        .from("customers")
        .select("id, name, postcode, active")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("CustomersRepository.findCustomerById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Customer lookup failed", { cause: error });
      }
      if (data === null) return null;
      return {
        id: data.id,
        name: data.name,
        postcode: data.postcode,
        active: data.active,
      };
    },

    // ── Admin surface (F-20 PR1) ──────────────────────────────────────────────

    async listAllCustomers(): Promise<readonly CustomerAdminView[]> {
      const { data, error } = await client
        .from("customers")
        .select(ADMIN_COLS)
        .order("name", { ascending: true });
      if (error) {
        log.error("CustomersRepository.listAllCustomers DB error", {
          error: error.message,
        });
        throw new ServiceError("Customer list failed", { cause: error });
      }
      return (data ?? []).map(toAdminView);
    },

    async listUngeocoded(
      limit: number,
    ): Promise<readonly CustomerAdminView[]> {
      const { data, error } = await client
        .from("customers")
        .select(ADMIN_COLS)
        .not("postcode", "is", null)
        .is("lat", null)
        .limit(limit);
      if (error) {
        log.error("CustomersRepository.listUngeocoded DB error", {
          error: error.message,
        });
        throw new ServiceError("Ungeocoded customer list failed", {
          cause: error,
        });
      }
      return (data ?? []).map(toAdminView);
    },

    async setActive(
      id: string,
      active: boolean,
    ): Promise<CustomerAdminView | null> {
      const { data, error } = await client
        .from("customers")
        .update({ active })
        .eq("id", id)
        .select(ADMIN_COLS)
        .maybeSingle();
      if (error) {
        log.error("CustomersRepository.setActive DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Customer update failed", { cause: error });
      }
      return data === null ? null : toAdminView(data);
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
      const { data, error } = await client
        .from("customers")
        .update({
          postcode: fields.postcode,
          lat: fields.lat,
          lng: fields.lng,
          geocoded_at: fields.geocoded_at,
          is_approximate_location: fields.is_approximate_location,
        })
        .eq("id", id)
        .select(ADMIN_COLS)
        .maybeSingle();
      if (error) {
        log.error("CustomersRepository.setPostcodeAndCoords DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Customer postcode update failed", {
          cause: error,
        });
      }
      return data === null ? null : toAdminView(data);
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
      const { error } = await client
        .from("customers")
        .update({
          lat: fields.lat,
          lng: fields.lng,
          geocoded_at: fields.geocoded_at,
          is_approximate_location: fields.is_approximate_location,
        })
        .eq("id", id);
      if (error) {
        log.error("CustomersRepository.setCoords DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Customer coords update failed", {
          cause: error,
        });
      }
    },

    // ── Import surface (F-20 PR3) ─────────────────────────────────────────────

    async insertMany(
      rows: readonly {
        name: string;
        postcode: string | null;
        created_by: string;
      }[],
    ): Promise<readonly { id: string; postcode: string | null }[]> {
      const payload = rows.map((r) => ({
        name: r.name,
        postcode: r.postcode,
        active: true,
        created_by: r.created_by,
      }));
      const { data, error } = await client
        .from("customers")
        .insert(payload)
        .select("id, postcode");
      if (error) {
        log.error("CustomersRepository.insertMany DB error", {
          error: error.message,
        });
        throw new ServiceError("Customer bulk insert failed", { cause: error });
      }
      return (data ?? []).map((r) => ({ id: r.id, postcode: r.postcode }));
    },

    async insertOne(row: {
      name: string;
      created_by: string;
    }): Promise<InsertOneResult> {
      const { error } = await client
        .from("customers")
        .insert({ name: row.name, active: true, created_by: row.created_by });
      if (error) {
        // 23505 = unique_violation — a duplicate name. NOT an error: define it
        // out of existence so one bad row never aborts the import batch.
        if (error.code === "23505") return { outcome: "duplicate" };
        log.error("CustomersRepository.insertOne DB error", {
          error: error.message,
        });
        return { outcome: "error", message: error.message };
      }
      return { outcome: "inserted" };
    },

    async listGeocodedForMap(): Promise<readonly MapCustomer[]> {
      const { data, error } = await client
        .from("customers")
        .select(MAP_COLS)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .order("name", { ascending: true });
      if (error) {
        log.error("CustomersRepository.listGeocodedForMap DB error", {
          error: error.message,
        });
        throw new ServiceError("Map customers read failed", { cause: error });
      }
      const rows = (data ?? []) as unknown as {
        id: string;
        name: string;
        postcode: string;
        external_system_id: string | null;
        active: boolean;
        lat: number;
        lng: number;
        is_approximate_location: boolean;
      }[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        postcode: r.postcode,
        code: r.external_system_id,
        active: r.active,
        lat: r.lat,
        lng: r.lng,
        is_approximate: r.is_approximate_location,
      }));
    },
  };
}

export const supabaseCustomersRepository: CustomersRepository =
  createSupabaseCustomersRepository(supabaseService);
