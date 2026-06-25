/**
 * tests/unit/services/HaccpSuppliersService.test.ts
 *
 * F-19 PR9a — the Cluster F "suppliers" service against the inspectable Fake repo.
 *
 * Pins (byte-identity is a SALSA compliance requirement — R-F-B2):
 *   - getLabelCode: match → DB label_code; no match → name.slice(0,4).toUpperCase()
 *     fallback; short-name edge.
 *   - getRecallContactList: { config, suppliers } (key order); config-null branch.
 *   - saveRecallConfig: insert (no id) vs update (id) path, EXACT recorded payload
 *     incl. injected updated_by + updated_at.
 *   - updateRecallSupplierContact: trim-or-null per field; narrow reply shape.
 *   - createSupplier: position = count+1; label_code = trim.upper.slice(0,6) || null;
 *     every ?? null default; active ?? true; EXACT recorded insert payload.
 *   - updateSupplier: 16-key whitelist (non-whitelisted dropped); empty → 400-eq.
 */
import { describe, it, expect } from "vitest";
import { createHaccpSuppliersService } from "@/lib/services";
import { createFakeHaccpSuppliersRepository } from "@/lib/adapters/fake";
import type { SupplierContact, RecallConfig, Supplier } from "@/lib/domain";

function supplierContact(o: Partial<SupplierContact>): SupplierContact {
  return {
    id: "s1",
    name: "Euro Quality Lambs",
    categories: [],
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    active: true,
    ...o,
  };
}

function supplier(o: Partial<Supplier>): Supplier {
  return {
    id: "s1",
    name: "Euro Quality Lambs",
    active: true,
    position: 1,
    address: null,
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    fsa_approval_no: null,
    fsa_activities: null,
    cert_type: null,
    cert_expiry: null,
    products_supplied: null,
    date_approved: null,
    notes: null,
    categories: null,
    label_code: null,
    created_at: "2026-06-01T00:00:00.000Z",
    ...o,
  };
}

const config: RecallConfig = {
  id: "c1",
  internal_team: [],
  regulatory: [],
  other_contacts: [],
  updated_at: "2026-06-01T00:00:00.000Z",
  updater: { name: "Hakan" },
};

// ─── supplier-code ───────────────────────────────────────────────────────────

describe("HaccpSuppliersService — getLabelCode", () => {
  it("DB match → returns the DB label_code", async () => {
    const repo = createFakeHaccpSuppliersRepository({ labelCode: "EQL" });
    const svc = createHaccpSuppliersService({ suppliers: repo });
    expect(await svc.getLabelCode("Euro Quality Lambs")).toEqual({
      label_code: "EQL",
    });
  });

  it("no match → name.slice(0,4).toUpperCase() fallback", async () => {
    const repo = createFakeHaccpSuppliersRepository({ labelCode: null });
    const svc = createHaccpSuppliersService({ suppliers: repo });
    expect(await svc.getLabelCode("Euro Quality Lambs")).toEqual({
      label_code: "EURO",
    });
  });

  it("no match + short name → whole name upper-cased", async () => {
    const repo = createFakeHaccpSuppliersRepository({ labelCode: null });
    const svc = createHaccpSuppliersService({ suppliers: repo });
    expect(await svc.getLabelCode("ab")).toEqual({ label_code: "AB" });
  });
});

// ─── recall reads ────────────────────────────────────────────────────────────

describe("HaccpSuppliersService — getRecallContactList", () => {
  it("{ config, suppliers } in that key order", async () => {
    const suppliers = [supplierContact({ id: "s1" })];
    const repo = createFakeHaccpSuppliersRepository({
      recallConfig: config,
      activeSupplierContacts: suppliers,
    });
    const svc = createHaccpSuppliersService({ suppliers: repo });

    const res = await svc.getRecallContactList();
    expect(Object.keys(res)).toEqual(["config", "suppliers"]);
    expect(res.config).toEqual(config);
    expect(res.suppliers).toEqual(suppliers);
  });

  it("no config row → config:null; no suppliers → []", async () => {
    const repo = createFakeHaccpSuppliersRepository({ recallConfig: null });
    const svc = createHaccpSuppliersService({ suppliers: repo });
    const res = await svc.getRecallContactList();
    expect(res.config).toBeNull();
    expect(res.suppliers).toEqual([]);
  });
});

// ─── recall writes ───────────────────────────────────────────────────────────

describe("HaccpSuppliersService — saveRecallConfig", () => {
  it("no id → insert path; records exact payload incl. injected updated_by/at", async () => {
    const repo = createFakeHaccpSuppliersRepository({ recallSaveResult: config });
    const svc = createHaccpSuppliersService({ suppliers: repo });

    const res = await svc.saveRecallConfig(
      { internal_team: [{ a: 1 }], regulatory: [], other_contacts: [{ b: 2 }] },
      "user-42",
      "2026-06-25T10:00:00.000Z",
    );
    expect(res).toEqual({ config });
    expect(repo.savedRecallConfigs).toHaveLength(1);
    expect(repo.savedRecallConfigs[0]).toEqual({
      id: undefined,
      payload: {
        internal_team: [{ a: 1 }],
        regulatory: [],
        other_contacts: [{ b: 2 }],
        updated_by: "user-42",
        updated_at: "2026-06-25T10:00:00.000Z",
      },
    });
  });

  it("id present → update path; records the id alongside the payload", async () => {
    const repo = createFakeHaccpSuppliersRepository({ recallSaveResult: config });
    const svc = createHaccpSuppliersService({ suppliers: repo });

    await svc.saveRecallConfig(
      { id: "c1", internal_team: [], regulatory: [], other_contacts: [] },
      "user-42",
      "2026-06-25T10:00:00.000Z",
    );
    expect(repo.savedRecallConfigs[0].id).toBe("c1");
    expect(repo.savedRecallConfigs[0].payload.updated_by).toBe("user-42");
  });
});

describe("HaccpSuppliersService — updateRecallSupplierContact", () => {
  it("trims each field, blanks → null, returns narrow reply", async () => {
    const reply = {
      id: "s1",
      name: "Euro",
      contact_name: "Bob",
      contact_phone: null,
      contact_email: "x@y.z",
    };
    const repo = createFakeHaccpSuppliersRepository({ contactReply: reply });
    const svc = createHaccpSuppliersService({ suppliers: repo });

    const res = await svc.updateRecallSupplierContact({
      id: "s1",
      contact_name: " Bob ",
      contact_phone: "   ",
      contact_email: "x@y.z",
    });
    expect(res).toEqual({ supplier: reply });
    expect(repo.updatedContacts).toHaveLength(1);
    expect(repo.updatedContacts[0]).toEqual({
      id: "s1",
      payload: {
        contact_name: "Bob",
        contact_phone: null,
        contact_email: "x@y.z",
      },
    });
  });
});

// ─── admin/suppliers ─────────────────────────────────────────────────────────

describe("HaccpSuppliersService — listSuppliers", () => {
  it("{ suppliers } from the seeded list", async () => {
    const all = [supplier({ id: "s1" }), supplier({ id: "s2" })];
    const repo = createFakeHaccpSuppliersRepository({ allSuppliers: all });
    const svc = createHaccpSuppliersService({ suppliers: repo });
    expect(await svc.listSuppliers()).toEqual({ suppliers: all });
  });
});

describe("HaccpSuppliersService — createSupplier", () => {
  it("position = count+1; label_code normalised; every default; exact insert", async () => {
    const created = supplier({ id: "new", position: 3, label_code: "ABCDEF" });
    const repo = createFakeHaccpSuppliersRepository({
      supplierCount: 2,
      createResult: created,
    });
    const svc = createHaccpSuppliersService({ suppliers: repo });

    const res = await svc.createSupplier({
      name: "  Acme Meats  ",
      label_code: "  abcdefgh ",
    });
    expect(res).toEqual({ supplier: created });
    expect(repo.createdSuppliers).toHaveLength(1);
    expect(repo.createdSuppliers[0]).toEqual({
      name: "Acme Meats",
      active: true,
      position: 3,
      address: null,
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      fsa_approval_no: null,
      fsa_activities: null,
      cert_type: null,
      cert_expiry: null,
      products_supplied: null,
      date_approved: null,
      label_code: "ABCDEF",
      notes: null,
    });
  });

  it("blank/absent name → 400-equivalent reject; no insert", async () => {
    const repo = createFakeHaccpSuppliersRepository({ supplierCount: 0 });
    const svc = createHaccpSuppliersService({ suppliers: repo });
    const res = await svc.createSupplier({ name: "   " });
    expect(res).toEqual({ ok: false, status: 400, message: "Name is required" });
    expect(repo.createdSuppliers).toHaveLength(0);
  });

  it("empty/absent label_code → null; active honoured when explicitly false", async () => {
    const created = supplier({ id: "new", position: 1 });
    const repo = createFakeHaccpSuppliersRepository({
      supplierCount: 0,
      createResult: created,
    });
    const svc = createHaccpSuppliersService({ suppliers: repo });
    await svc.createSupplier({ name: "X", active: false });
    expect(repo.createdSuppliers[0].label_code).toBeNull();
    expect(repo.createdSuppliers[0].active).toBe(false);
  });
});

describe("HaccpSuppliersService — updateSupplier", () => {
  it("only whitelisted keys pass through; non-whitelisted dropped", async () => {
    const updated = supplier({ id: "s1", name: "Renamed" });
    const repo = createFakeHaccpSuppliersRepository({ updateResult: updated });
    const svc = createHaccpSuppliersService({ suppliers: repo });

    const res = await svc.updateSupplier({
      id: "s1",
      name: "Renamed",
      active: false,
      not_allowed: "DROP ME",
      created_at: "hax",
    });
    expect(res).toEqual({ supplier: updated });
    expect(repo.updatedSuppliers).toHaveLength(1);
    expect(repo.updatedSuppliers[0]).toEqual({
      id: "s1",
      fields: { name: "Renamed", active: false },
    });
  });

  it("no id → 400-equivalent reject; no update", async () => {
    const repo = createFakeHaccpSuppliersRepository({});
    const svc = createHaccpSuppliersService({ suppliers: repo });
    const res = await svc.updateSupplier({ name: "X" });
    expect(res).toEqual({ ok: false, status: 400, message: "id required" });
    expect(repo.updatedSuppliers).toHaveLength(0);
  });

  it("only non-whitelisted keys → 'No valid fields to update' 400-equivalent", async () => {
    const repo = createFakeHaccpSuppliersRepository({});
    const svc = createHaccpSuppliersService({ suppliers: repo });
    const res = await svc.updateSupplier({ id: "s1", junk: 1 });
    expect(res).toEqual({
      ok: false,
      status: 400,
      message: "No valid fields to update",
    });
    expect(repo.updatedSuppliers).toHaveLength(0);
  });
});
