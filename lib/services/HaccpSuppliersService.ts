/**
 * lib/services/HaccpSuppliersService.ts
 *
 * The F-19 PR9a Cluster F "suppliers" service — business orchestration for the
 * supplier book (supplier-code lookup, recall SALSA 3.4 read/write, admin
 * list/create/update). Factory here, wiring in `lib/wiring/haccp.ts`; depends on
 * the `suppliers` port alone (lint-enforced, ADR-0002 / F-TD-11).
 *
 * The pure logic the 3 routes do today is LIFTED here VERBATIM so it is unit-
 * tested now (the inspectable-fake write tests pin the byte-exact written rows —
 * R-F-B2, a SALSA compliance requirement) and the PR9b re-point is thin:
 *   - getLabelCode: the `data?.label_code ?? name.slice(0,4).toUpperCase()`
 *     fallback (supplier-code/route.ts:30).
 *   - getRecallContactList: the Promise.all { config, suppliers } assembly
 *     (recall/route.ts:46-49).
 *   - saveRecallConfig: builds { ...input, updated_by, updated_at } and routes to
 *     the insert/update branch on id presence (recall/route.ts:78-100). `userId`
 *     and `nowIso` are computed at the route edge and injected (determinism).
 *   - updateRecallSupplierContact: each field `?.trim() || null`
 *     (recall/route.ts:136-140).
 *   - createSupplier: name-required 400, position=count+1, label_code
 *     `trim().toUpperCase().slice(0,6) || null`, every `?? null` default,
 *     `active ?? true` (admin/suppliers/route.ts:46-72).
 *   - updateSupplier: id-required 400, the 16-key whitelist, "No valid fields"
 *     400 (admin/suppliers/route.ts:90-107).
 *
 * Determinism: the service NEVER calls `new Date()` — the recall POST's ISO stamp
 * is computed at the route edge and passed IN as `nowIso`.
 */

import type {
  RecallConfig,
  RecallGetResponse,
  SaveRecallConfigInput,
  SaveRecallConfigPersist,
  RecallSaveResponse,
  UpdateSupplierContactsInput,
  UpdateSupplierContactsPersist,
  RecallContactUpdateResponse,
  LabelCodeResponse,
  Supplier,
  SuppliersListResponse,
  CreateSupplierInput,
  CreateSupplierPersist,
  UpdateSupplierInput,
  UpdateSupplierFields,
  SupplierWriteResponse,
} from "@/lib/domain";
import type { HaccpSuppliersRepository } from "@/lib/ports";

/** A 400-equivalent reject the route turns into an HTTP 400 in PR9b. */
export type SuppliersReject = {
  readonly ok: false;
  readonly status: number;
  readonly message: string;
};

/** The 16 keys admin/suppliers PATCH whitelists (route.ts:95-99), in order. */
const UPDATE_WHITELIST = [
  "name",
  "active",
  "position",
  "address",
  "contact_name",
  "contact_phone",
  "contact_email",
  "fsa_approval_no",
  "fsa_activities",
  "cert_type",
  "cert_expiry",
  "products_supplied",
  "date_approved",
  "notes",
  "categories",
  "label_code",
] as const;

export interface HaccpSuppliersServiceDeps {
  readonly suppliers: HaccpSuppliersRepository;
}

export interface HaccpSuppliersService {
  /** supplier-code: DB label_code, else name.slice(0,4).toUpperCase() fallback. */
  getLabelCode(name: string): Promise<LabelCodeResponse>;

  /** recall GET: { config, suppliers }. */
  getRecallContactList(): Promise<RecallGetResponse>;

  /**
   * recall POST: build persist payload from input + injected userId + ISO stamp,
   * insert (no id) / update (id), return { config }.
   */
  saveRecallConfig(
    input: SaveRecallConfigInput,
    userId: string,
    nowIso: string,
  ): Promise<RecallSaveResponse>;

  /** recall PATCH: trim-or-null each contact field, return { supplier }. */
  updateRecallSupplierContact(
    input: UpdateSupplierContactsInput,
  ): Promise<RecallContactUpdateResponse>;

  /** admin/suppliers GET: { suppliers }. */
  listSuppliers(): Promise<SuppliersListResponse>;

  /** admin/suppliers POST: name-required 400, defaults + position + label_code. */
  createSupplier(
    body: CreateSupplierInput,
  ): Promise<SupplierWriteResponse | SuppliersReject>;

  /** admin/suppliers PATCH: id-required 400, 16-key whitelist, "no valid fields" 400. */
  updateSupplier(
    body: UpdateSupplierInput,
  ): Promise<SupplierWriteResponse | SuppliersReject>;
}

export function createHaccpSuppliersService(
  deps: HaccpSuppliersServiceDeps,
): HaccpSuppliersService {
  const { suppliers } = deps;

  return {
    async getLabelCode(name): Promise<LabelCodeResponse> {
      // supplier-code/route.ts:23-31.
      const labelCode = await suppliers.findLabelCodeByName(name);
      return { label_code: labelCode ?? name.slice(0, 4).toUpperCase() };
    },

    async getRecallContactList(): Promise<RecallGetResponse> {
      // recall/route.ts:25-49 — Promise.all, key order config, suppliers.
      const [config, contacts] = await Promise.all([
        suppliers.getRecallConfig(),
        suppliers.listActiveSupplierContacts(),
      ]);
      return { config: config ?? null, suppliers: contacts };
    },

    async saveRecallConfig(input, userId, nowIso): Promise<RecallSaveResponse> {
      // recall/route.ts:78-100 — payload assembly, id present → update else insert.
      const payload: SaveRecallConfigPersist = {
        internal_team: input.internal_team,
        regulatory: input.regulatory,
        other_contacts: input.other_contacts,
        updated_by: userId,
        updated_at: nowIso,
      };
      const config: RecallConfig = await suppliers.saveRecallConfig(
        payload,
        input.id,
      );
      return { config };
    },

    async updateRecallSupplierContact(
      input,
    ): Promise<RecallContactUpdateResponse> {
      // recall/route.ts:136-140 — each field `?.trim() || null`.
      const payload: UpdateSupplierContactsPersist = {
        contact_name: input.contact_name?.trim() || null,
        contact_phone: input.contact_phone?.trim() || null,
        contact_email: input.contact_email?.trim() || null,
      };
      const supplier = await suppliers.updateSupplierContacts(input.id, payload);
      return { supplier };
    },

    async listSuppliers(): Promise<SuppliersListResponse> {
      // admin/suppliers/route.ts:26-32.
      const all = await suppliers.listAllSuppliers();
      return { suppliers: all };
    },

    async createSupplier(
      body,
    ): Promise<SupplierWriteResponse | SuppliersReject> {
      // admin/suppliers/route.ts:45-77.
      const name = String((body.name ?? "") as string).trim();
      if (!name) {
        return { ok: false, status: 400, message: "Name is required" };
      }
      const count = await suppliers.countSuppliers();
      const nextPosition = count + 1;
      const payload: CreateSupplierPersist = {
        name,
        active: body.active ?? true,
        position: nextPosition,
        address: body.address ?? null,
        contact_name: body.contact_name ?? null,
        contact_phone: body.contact_phone ?? null,
        contact_email: body.contact_email ?? null,
        fsa_approval_no: body.fsa_approval_no ?? null,
        fsa_activities: body.fsa_activities ?? null,
        cert_type: body.cert_type ?? null,
        cert_expiry: body.cert_expiry ?? null,
        products_supplied: body.products_supplied ?? null,
        date_approved: body.date_approved ?? null,
        label_code: body.label_code?.trim().toUpperCase().slice(0, 6) || null,
        notes: body.notes ?? null,
      };
      const supplier: Supplier = await suppliers.createSupplier(payload);
      return { supplier };
    },

    async updateSupplier(
      body,
    ): Promise<SupplierWriteResponse | SuppliersReject> {
      // admin/suppliers/route.ts:90-117 — id-required, 16-key whitelist, empty 400.
      const { id, ...fields } = body;
      if (!id) {
        return { ok: false, status: 400, message: "id required" };
      }
      const update: UpdateSupplierFields = {};
      for (const key of UPDATE_WHITELIST) {
        if (key in fields) update[key] = (fields as Record<string, unknown>)[key];
      }
      if (Object.keys(update).length === 0) {
        return { ok: false, status: 400, message: "No valid fields to update" };
      }
      const supplier: Supplier = await suppliers.updateSupplier(id, update);
      return { supplier };
    },
  };
}
