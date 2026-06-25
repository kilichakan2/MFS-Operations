/**
 * lib/domain/HaccpSuppliers.ts
 *
 * Domain types for the F-19 PR9a Cluster F "suppliers" hexagon — the supplier
 * book (haccp_suppliers) plus its directly-attached recall config
 * (haccp_recall_config). Backs three surfaces: supplier-code (label lookup),
 * recall (SALSA 3.4 contact list + config read/write + per-supplier contact
 * edit), and admin/suppliers (full supplier list/create/update).
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * Boundary discipline (ADR-0002): every row type carries the RAW columns each
 * route `.select()`s today (snake_case) so the wire output stays byte-identical
 * after the PR9b re-point. The `…Input` types are the app's own write vocabulary;
 * the `…Response` types pin the EXACT route response objects (incl. key order).
 *
 * ⚠ R-F-B6 — the recall config GET carries the `updater:updated_by(name)` JOIN.
 * The route returns it un-mapped, so to stay byte-identical the domain
 * `RecallConfig` mirrors the raw shape including the nested `updater: { name }`.
 * (The POST returns `.select()` of all columns — there `updater` is absent; the
 * field is therefore optional/nullable so both branches type-check.)
 *
 * ⚠ R-F-D2 — admin/suppliers has NO DELETE handler in the current route file, so
 * there is NO delete input/method modelled here (byte-identity = model what the
 * route actually does).
 */

// ─── supplier-code surface ───────────────────────────────────────────────────

/**
 * The EXACT GET /api/haccp/supplier-code response shape
 * (supplier-code/route.ts:31). The service applies the slice(0,4) fallback.
 */
export interface LabelCodeResponse {
  readonly label_code: string;
}

// ─── recall surface (reads) ──────────────────────────────────────────────────

/**
 * A supplier's contact row for the recall GET — verbatim `.select` columns
 * (recall/route.ts:34): 'id, name, categories, contact_name, contact_phone,
 * contact_email, active'.
 */
export interface SupplierContact {
  readonly id: string;
  readonly name: string;
  readonly categories: unknown;
  readonly contact_name: string | null;
  readonly contact_phone: string | null;
  readonly contact_email: string | null;
  readonly active: boolean;
}

/** Module-local nested shape of the recall config's `updater:updated_by(name)`. */
export interface RecallConfigUpdater {
  readonly name: string;
}

/**
 * The recall config row — verbatim `.select` columns (recall/route.ts:28):
 * 'id, internal_team, regulatory, other_contacts, updated_at,
 *  updater:updated_by(name)'. The GET carries the `updater` join; the POST
 * `.select()` (all columns) does not, so `updater` is optional.
 */
export interface RecallConfig {
  readonly id: string;
  readonly internal_team: unknown;
  readonly regulatory: unknown;
  readonly other_contacts: unknown;
  readonly updated_at: string;
  readonly updater?: RecallConfigUpdater | null;
  // POST `.select()` returns all columns, incl. these the GET projection drops:
  readonly updated_by?: string;
  readonly created_at?: string;
}

/**
 * The EXACT GET /api/haccp/recall response shape (recall/route.ts:46-49).
 * Key order: config, suppliers.
 */
export interface RecallGetResponse {
  readonly config: RecallConfig | null;
  readonly suppliers: readonly SupplierContact[];
}

// ─── recall surface (writes) ─────────────────────────────────────────────────

/**
 * Recall POST body (recall/route.ts:67). `id` present → update, absent → insert.
 * The three contact arrays are validated `Array.isArray` at the route edge.
 */
export interface SaveRecallConfigInput {
  readonly id?: string;
  readonly internal_team: unknown[];
  readonly regulatory: unknown[];
  readonly other_contacts: unknown[];
}

/**
 * The derived recall-config persist payload (recall/route.ts:78-84). The service
 * assembles it from the input + the injected userId + the route-edge ISO stamp.
 */
export interface SaveRecallConfigPersist {
  readonly internal_team: unknown[];
  readonly regulatory: unknown[];
  readonly other_contacts: unknown[];
  readonly updated_by: string;
  readonly updated_at: string;
}

/**
 * The EXACT recall POST response shape (recall/route.ts:106). Key: config.
 */
export interface RecallSaveResponse {
  readonly config: RecallConfig;
}

/** Recall PATCH body (recall/route.ts:123). */
export interface UpdateSupplierContactsInput {
  readonly id: string;
  readonly contact_name: string;
  readonly contact_phone: string;
  readonly contact_email: string;
}

/**
 * The derived per-supplier contact update payload (recall/route.ts:136-140):
 * each field `?.trim() || null`.
 */
export interface UpdateSupplierContactsPersist {
  readonly contact_name: string | null;
  readonly contact_phone: string | null;
  readonly contact_email: string | null;
}

/**
 * The narrow contact reply the recall PATCH `.select()` returns
 * (recall/route.ts:142): 'id, name, contact_name, contact_phone, contact_email'.
 */
export interface SupplierContactReply {
  readonly id: string;
  readonly name: string;
  readonly contact_name: string | null;
  readonly contact_phone: string | null;
  readonly contact_email: string | null;
}

/**
 * The EXACT recall PATCH response shape (recall/route.ts:149). Key: supplier.
 */
export interface RecallContactUpdateResponse {
  readonly supplier: SupplierContactReply;
}

// ─── admin/suppliers surface ─────────────────────────────────────────────────

/**
 * The full supplier row — verbatim `.select` columns (admin/suppliers GET,
 * route.ts:28): 'id, name, active, position, address, contact_name,
 * contact_phone, contact_email, fsa_approval_no, fsa_activities, cert_type,
 * cert_expiry, products_supplied, date_approved, notes, categories, label_code,
 * created_at'. POST/PATCH use `.select()` (all columns) — the same shape.
 */
export interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly position: number;
  readonly address: string | null;
  readonly contact_name: string | null;
  readonly contact_phone: string | null;
  readonly contact_email: string | null;
  readonly fsa_approval_no: string | null;
  readonly fsa_activities: unknown;
  readonly cert_type: string | null;
  readonly cert_expiry: string | null;
  readonly products_supplied: unknown;
  readonly date_approved: string | null;
  readonly notes: string | null;
  readonly categories: unknown;
  readonly label_code: string | null;
  readonly created_at: string;
}

/**
 * The EXACT admin/suppliers GET response shape (route.ts:32). Key: suppliers.
 */
export interface SuppliersListResponse {
  readonly suppliers: readonly Supplier[];
}

/**
 * admin/suppliers POST body — the raw JSON the create route reads
 * (route.ts:45-72). All optional except `name`; the service applies defaults.
 */
export interface CreateSupplierInput {
  readonly name?: unknown;
  readonly active?: unknown;
  readonly address?: unknown;
  readonly contact_name?: unknown;
  readonly contact_phone?: unknown;
  readonly contact_email?: unknown;
  readonly fsa_approval_no?: unknown;
  readonly fsa_activities?: unknown;
  readonly cert_type?: unknown;
  readonly cert_expiry?: unknown;
  readonly products_supplied?: unknown;
  readonly date_approved?: unknown;
  readonly label_code?: string;
  readonly notes?: unknown;
}

/**
 * The derived insert payload (admin/suppliers POST, route.ts:56-72). The service
 * builds it: `position` from countSuppliers()+1, `label_code` normalised, every
 * optional `?? null`, `active ?? true`. Byte-exact (R-F-B2).
 */
export interface CreateSupplierPersist {
  readonly name: string;
  readonly active: unknown;
  readonly position: number;
  readonly address: unknown;
  readonly contact_name: unknown;
  readonly contact_phone: unknown;
  readonly contact_email: unknown;
  readonly fsa_approval_no: unknown;
  readonly fsa_activities: unknown;
  readonly cert_type: unknown;
  readonly cert_expiry: unknown;
  readonly products_supplied: unknown;
  readonly date_approved: unknown;
  readonly label_code: string | null;
  readonly notes: unknown;
}

/**
 * admin/suppliers PATCH body (route.ts:90-91): `{ id, ...fields }`. The service
 * whitelists fields into `UpdateSupplierFields`.
 */
export interface UpdateSupplierInput {
  readonly id?: string;
  readonly [key: string]: unknown;
}

/**
 * The whitelisted update set (admin/suppliers PATCH, route.ts:95-99) — the 16
 * keys allowed through. Only keys PRESENT in the body appear; the service drops
 * everything else.
 */
export type UpdateSupplierFields = Record<string, unknown>;

/**
 * The EXACT admin/suppliers POST/PATCH response shape (route.ts:77, 117).
 * Key: supplier.
 */
export interface SupplierWriteResponse {
  readonly supplier: Supplier;
}
