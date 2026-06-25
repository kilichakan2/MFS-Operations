/**
 * lib/ports/HaccpSuppliersRepository.ts
 *
 * The F-19 PR9a Cluster F "suppliers" persistence port — the interface the app
 * owns over the supplier book (haccp_suppliers) plus its directly-attached
 * recall config (haccp_recall_config). One deep socket backing three surfaces:
 * supplier-code (label lookup), recall (SALSA 3.4 contact list + config
 * read/write + per-supplier contact edit), and admin/suppliers (list/create/
 * update). Pure TypeScript: imports domain types only, never an adapter / SDK.
 *
 * Boundary discipline (ADR-0002): the adapter runs every `.select()`/`.insert()`/
 * `.update()` chain VERBATIM and maps snake_case rows → domain types. Reads that
 * the routes 500 on throw `ServiceError` inside the adapter; `getRecallConfig`
 * returns `null` on the no-row (PGRST116) branch — define-errors-out-of-existence
 * (APOSD §11) — and throws only on a real DB error (R-F-B5).
 *
 * ⚠ R-F-D2 — the admin/suppliers route has NO DELETE handler in the current
 * file, so this port adds NO delete method (byte-identity: model what exists).
 *
 * ⚠ The PERSIST shapes (CreateSupplierPersist / SaveRecallConfigPersist /
 * UpdateSupplierContactsPersist) are built by the SERVICE (defaults, trims,
 * label normalisation, next-position) and handed to the adapter as-is, so the
 * written row is byte-exact (R-F-B2). The port takes the already-built payload.
 */

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

export interface HaccpSuppliersRepository {
  // ── supplier-code surface ──
  /**
   * Case-insensitive name match (`ilike`), returns the matched supplier's
   * `label_code` or null. The service applies the `slice(0,4)` name fallback.
   */
  findLabelCodeByName(name: string): Promise<string | null>;

  // ── recall surface (reads) ──
  /** Active suppliers with contact fields, ordered by name (recall GET). */
  listActiveSupplierContacts(): Promise<readonly SupplierContact[]>;
  /**
   * Latest recall config (most-recent created_at) with the `updater` name
   * joined, or null when none exists (the route's PGRST116/null branch).
   */
  getRecallConfig(): Promise<RecallConfig | null>;

  // ── recall surface (writes) ──
  /**
   * Upsert recall config: insert when `id` absent, update when present. The
   * service builds the payload (updated_by/updated_at); returns the saved row.
   */
  saveRecallConfig(
    payload: SaveRecallConfigPersist,
    id: string | undefined,
  ): Promise<RecallConfig>;
  /**
   * Update one supplier's three contact fields; returns the narrow contact reply
   * the recall PATCH responds with. The service applies the trim-or-null.
   */
  updateSupplierContacts(
    id: string,
    payload: UpdateSupplierContactsPersist,
  ): Promise<SupplierContactReply>;

  // ── admin/suppliers surface ──
  /** All suppliers (active + inactive), the full admin column set, ordered by name. */
  listAllSuppliers(): Promise<readonly Supplier[]>;
  /** Count of all supplier rows — feeds the next-position assignment. */
  countSuppliers(): Promise<number>;
  /** Insert a new supplier from the service-built insert payload; returns the row. */
  createSupplier(payload: CreateSupplierPersist): Promise<Supplier>;
  /** Update a supplier from the service-whitelisted field set; returns the row. */
  updateSupplier(id: string, fields: UpdateSupplierFields): Promise<Supplier>;
}
