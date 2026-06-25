/**
 * lib/adapters/supabase/HaccpSuppliersRepository.ts
 *
 * Supabase implementation of `HaccpSuppliersRepository`
 * (lib/ports/HaccpSuppliersRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js`. The ONLY file that imports the vendor SDK for
 * the Cluster F supplier book (haccp_suppliers + haccp_recall_config).
 *
 * Boundary discipline (ADR-0002): every `.select(…)` column list, every
 * `.insert()`/`.update()`, the `.ilike`/`.maybeSingle`/`.single`/`count:exact`
 * chains, and the PGRST116 handling are copied VERBATIM from the three route
 * files (supplier-code, recall, admin/suppliers) so the PR9b re-point's wire
 * output stays byte-identical. The byte-exact written rows are a SALSA
 * compliance requirement (R-F-B2).
 *
 * Error contract (mirrors the routes):
 *   - findLabelCodeByName — IGNORES errors (supplier-code/route.ts:23-30 reads
 *     only `data`), returns null on no-row/error; the service applies the
 *     name-slice fallback. NO throw (byte-identity).
 *   - getRecallConfig — PGRST116 (no row) → null; any OTHER error → ServiceError
 *     (recall/route.ts:39-41, R-F-B5). Maps the `updater:updated_by(name)` join.
 *   - every other read/write — throws ServiceError on a DB error (the routes 500).
 *
 * Construction: factory + `supabaseService`-wired singleton (service-role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  SupplierContact,
  RecallConfig,
  SaveRecallConfigPersist,
  UpdateSupplierContactsPersist,
  SupplierContactReply,
  Supplier,
  CreateSupplierPersist,
  UpdateSupplierFields,
} from "@/lib/domain";
import type { HaccpSuppliersRepository } from "@/lib/ports";

// ─── verbatim select strings (the byte-identity anchor) ──────────────────────

const RECALL_CONFIG_COLS =
  "id, internal_team, regulatory, other_contacts, updated_at, updater:updated_by(name)";
const RECALL_SUPPLIER_COLS =
  "id, name, categories, contact_name, contact_phone, contact_email, active";
const CONTACT_REPLY_COLS =
  "id, name, contact_name, contact_phone, contact_email";
const SUPPLIER_ADMIN_COLS =
  "id, name, active, position, address, contact_name, contact_phone, contact_email, fsa_approval_no, fsa_activities, cert_type, cert_expiry, products_supplied, date_approved, notes, categories, label_code, created_at";

export function createSupabaseHaccpSuppliersRepository(
  client: SupabaseClient,
): HaccpSuppliersRepository {
  return {
    // ── supplier-code ──
    async findLabelCodeByName(name: string): Promise<string | null> {
      // supplier-code/route.ts:23-30 — reads `data` ONLY (ignores error), so the
      // service's slice(0,4) fallback fires on no-row OR DB error. No throw.
      const { data } = await client
        .from("haccp_suppliers")
        .select("label_code")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      return (data as { label_code: string | null } | null)?.label_code ?? null;
    },

    // ── recall reads ──
    async listActiveSupplierContacts(): Promise<readonly SupplierContact[]> {
      // recall/route.ts:32-36.
      const { data, error } = await client
        .from("haccp_suppliers")
        .select(RECALL_SUPPLIER_COLS)
        .eq("active", true)
        .order("name");
      if (error) {
        log.error("HaccpSuppliersRepository.listActiveSupplierContacts DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load suppliers", { cause: error });
      }
      return (data ?? []) as unknown as SupplierContact[];
    },

    async getRecallConfig(): Promise<RecallConfig | null> {
      // recall/route.ts:26-41 — PGRST116 (no row) → null; other error → 500.
      const { data, error } = await client
        .from("haccp_recall_config")
        .select(RECALL_CONFIG_COLS)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error) {
        if (error.code === "PGRST116") return null;
        log.error("HaccpSuppliersRepository.getRecallConfig DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load recall config", { cause: error });
      }
      return (data ?? null) as unknown as RecallConfig | null;
    },

    // ── recall writes ──
    async saveRecallConfig(
      payload: SaveRecallConfigPersist,
      id: string | undefined,
    ): Promise<RecallConfig> {
      // recall/route.ts:86-104 — id present → update, absent → insert; .select().single().
      const result = id
        ? await client
            .from("haccp_recall_config")
            .update(payload as unknown as Record<string, unknown>)
            .eq("id", id)
            .select()
            .single()
        : await client
            .from("haccp_recall_config")
            .insert(payload as unknown as Record<string, unknown>)
            .select()
            .single();
      if (result.error || !result.data) {
        log.error("HaccpSuppliersRepository.saveRecallConfig DB error", {
          error: result.error?.message,
        });
        throw new ServiceError("Failed to save recall config", {
          cause: result.error ?? undefined,
        });
      }
      return result.data as unknown as RecallConfig;
    },

    async updateSupplierContacts(
      id: string,
      payload: UpdateSupplierContactsPersist,
    ): Promise<SupplierContactReply> {
      // recall/route.ts:134-143.
      const { data, error } = await client
        .from("haccp_suppliers")
        .update(payload as unknown as Record<string, unknown>)
        .eq("id", id)
        .select(CONTACT_REPLY_COLS)
        .single();
      if (error || !data) {
        log.error("HaccpSuppliersRepository.updateSupplierContacts DB error", {
          error: error?.message,
        });
        throw new ServiceError("Failed to update supplier contact", {
          cause: error ?? undefined,
        });
      }
      return data as unknown as SupplierContactReply;
    },

    // ── admin/suppliers ──
    async listAllSuppliers(): Promise<readonly Supplier[]> {
      // admin/suppliers/route.ts:26-31.
      const { data, error } = await client
        .from("haccp_suppliers")
        .select(SUPPLIER_ADMIN_COLS)
        .order("name", { ascending: true });
      if (error) {
        log.error("HaccpSuppliersRepository.listAllSuppliers DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load suppliers", { cause: error });
      }
      return (data ?? []) as unknown as Supplier[];
    },

    async countSuppliers(): Promise<number> {
      // admin/suppliers/route.ts:50-52 — count: 'exact', head: true.
      const { count, error } = await client
        .from("haccp_suppliers")
        .select("*", { count: "exact", head: true });
      if (error) {
        log.error("HaccpSuppliersRepository.countSuppliers DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to count suppliers", { cause: error });
      }
      return count ?? 0;
    },

    async createSupplier(payload: CreateSupplierPersist): Promise<Supplier> {
      // admin/suppliers/route.ts:54-74 — insert the service-built payload.
      const { data, error } = await client
        .from("haccp_suppliers")
        .insert(payload as unknown as Record<string, unknown>)
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpSuppliersRepository.createSupplier DB error", {
          error: error?.message,
        });
        throw new ServiceError("Failed to create supplier", {
          cause: error ?? undefined,
        });
      }
      return data as unknown as Supplier;
    },

    async updateSupplier(
      id: string,
      fields: UpdateSupplierFields,
    ): Promise<Supplier> {
      // admin/suppliers/route.ts:109-114.
      const { data, error } = await client
        .from("haccp_suppliers")
        .update(fields as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpSuppliersRepository.updateSupplier DB error", {
          error: error?.message,
        });
        throw new ServiceError("Failed to update supplier", {
          cause: error ?? undefined,
        });
      }
      return data as unknown as Supplier;
    },
  };
}

export const supabaseHaccpSuppliersRepository: HaccpSuppliersRepository =
  createSupabaseHaccpSuppliersRepository(supabaseService);
