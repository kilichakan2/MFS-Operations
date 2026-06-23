/**
 * tests/unit/services/HaccpTrainingService.test.ts
 *
 * F-19 PR4 — the Cluster C "training" service against the Fake repo.
 *
 * Pins:
 *   - `getTraining` returns { staff, allergen } from seeded reads (key order);
 *   - `validateStaffTraining` all 6 strings IN ORDER (each shown by omitting the
 *     prior field);
 *   - `validateAllergenTraining` all 5 strings — incl. the ⚠ R5 quirk: missing
 *     certification_date → 'Completion date required' (NOT 'Certification date
 *     required');
 *   - `buildStaffTrainingPersist` (trims, training_type verbatim,
 *     supervisor_signed_at = INJECTED now, confirmation_items ?? {});
 *   - `buildAllergenTrainingPersist` (training_completed: 'allergen_awareness'
 *     hardcoded, NO supervisor_signed_at key, confirmation_items ?? {});
 *   - insert delegation recorded on the Fake;
 *   - determinism via a FIXED now (the service never calls new Date()).
 */
import { describe, it, expect } from "vitest";
import { createHaccpTrainingService } from "@/lib/services";
import { createFakeHaccpTrainingRepository } from "@/lib/adapters/fake";
import type {
  StaffTrainingRow,
  AllergenTrainingRow,
  CreateStaffTrainingInput,
} from "@/lib/domain";

const NOW = new Date("2026-06-23T10:00:00.000Z");

const VALID_STAFF: CreateStaffTrainingInput = {
  training_type: "butchery_process_room",
  staff_name: "  Ada  ",
  job_role: "  Butcher  ",
  document_version: "  V1.0  ",
  completion_date: "2026-06-01",
  refresh_date: "2027-06-01",
  supervisor: "  Boss  ",
  confirmation_items: { a: true },
};

function staffRow(overrides: Partial<StaffTrainingRow>): StaffTrainingRow {
  return {
    id: "s1",
    staff_name: "Ada",
    job_role: "Butcher",
    training_type: "butchery_process_room",
    document_version: "V1.0",
    completion_date: "2026-06-01",
    refresh_date: "2027-06-01",
    supervisor_name: "Boss",
    confirmation_items: {},
    submitted_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function allergenRow(
  overrides: Partial<AllergenTrainingRow>,
): AllergenTrainingRow {
  return {
    id: "a1",
    staff_name: "Ada",
    job_role: "Butcher",
    training_completed: "allergen_awareness",
    certification_date: "2026-06-01",
    refresh_date: "2027-06-01",
    reviewed_by: null,
    confirmation_items: {},
    supervisor_name: "Boss",
    document_version: null,
    submitted_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("HaccpTrainingService — getTraining", () => {
  it("returns { staff, allergen } from the two seeded reads", async () => {
    const staff = [staffRow({ id: "s1" }), staffRow({ id: "s2" })];
    const allergen = [allergenRow({ id: "a1" })];
    const repo = createFakeHaccpTrainingRepository({
      staffTraining: staff,
      allergenTraining: allergen,
    });
    const svc = createHaccpTrainingService({ training: repo });
    const res = await svc.getTraining();
    expect(Object.keys(res)).toEqual(["staff", "allergen"]);
    expect(res.staff).toEqual(staff);
    expect(res.allergen).toEqual(allergen);
  });

  it("returns empty arrays when nothing is seeded", async () => {
    const svc = createHaccpTrainingService({
      training: createFakeHaccpTrainingRepository(),
    });
    const res = await svc.getTraining();
    expect(res).toEqual({ staff: [], allergen: [] });
  });
});

describe("HaccpTrainingService — validateStaffTraining (6 strings in order)", () => {
  const svc = createHaccpTrainingService({
    training: createFakeHaccpTrainingRepository(),
  });

  it("Staff name required", () => {
    expect(svc.validateStaffTraining({ ...VALID_STAFF, staff_name: "  " })).toEqual({
      ok: false,
      status: 400,
      message: "Staff name required",
    });
  });
  it("Job role required", () => {
    expect(svc.validateStaffTraining({ ...VALID_STAFF, job_role: "" })).toEqual({
      ok: false,
      status: 400,
      message: "Job role required",
    });
  });
  it("Document version required", () => {
    expect(
      svc.validateStaffTraining({ ...VALID_STAFF, document_version: "" }),
    ).toEqual({ ok: false, status: 400, message: "Document version required" });
  });
  it("Completion date required", () => {
    expect(
      svc.validateStaffTraining({ ...VALID_STAFF, completion_date: "" }),
    ).toEqual({ ok: false, status: 400, message: "Completion date required" });
  });
  it("Refresh date required", () => {
    expect(svc.validateStaffTraining({ ...VALID_STAFF, refresh_date: "" })).toEqual(
      { ok: false, status: 400, message: "Refresh date required" },
    );
  });
  it("Supervisor name required", () => {
    expect(svc.validateStaffTraining({ ...VALID_STAFF, supervisor: " " })).toEqual({
      ok: false,
      status: 400,
      message: "Supervisor name required",
    });
  });
  it("passes when all present", () => {
    expect(svc.validateStaffTraining(VALID_STAFF)).toEqual({ ok: true });
  });
});

describe("HaccpTrainingService — validateAllergenTraining (5 strings, R5 quirk)", () => {
  const svc = createHaccpTrainingService({
    training: createFakeHaccpTrainingRepository(),
  });
  const VALID_ALLERGEN = {
    staff_name: "Ada",
    job_role: "Butcher",
    certification_date: "2026-06-01",
    refresh_date: "2027-06-01",
    supervisor: "Boss",
  };

  it("Staff name required", () => {
    expect(
      svc.validateAllergenTraining({ ...VALID_ALLERGEN, staff_name: "" }),
    ).toEqual({ ok: false, status: 400, message: "Staff name required" });
  });
  it("Job role required", () => {
    expect(
      svc.validateAllergenTraining({ ...VALID_ALLERGEN, job_role: " " }),
    ).toEqual({ ok: false, status: 400, message: "Job role required" });
  });
  it("⚠ R5: missing certification_date → 'Completion date required' (NOT 'Certification date required')", () => {
    expect(
      svc.validateAllergenTraining({ ...VALID_ALLERGEN, certification_date: "" }),
    ).toEqual({ ok: false, status: 400, message: "Completion date required" });
  });
  it("Refresh date required", () => {
    expect(
      svc.validateAllergenTraining({ ...VALID_ALLERGEN, refresh_date: "" }),
    ).toEqual({ ok: false, status: 400, message: "Refresh date required" });
  });
  it("Supervisor name required", () => {
    expect(
      svc.validateAllergenTraining({ ...VALID_ALLERGEN, supervisor: "  " }),
    ).toEqual({ ok: false, status: 400, message: "Supervisor name required" });
  });
  it("passes when all present", () => {
    expect(svc.validateAllergenTraining(VALID_ALLERGEN)).toEqual({ ok: true });
  });
});

describe("HaccpTrainingService — buildStaffTrainingPersist", () => {
  it("trims, keeps training_type verbatim, supervisor_signed_at = injected now, confirmation_items ?? {}", () => {
    const svc = createHaccpTrainingService({
      training: createFakeHaccpTrainingRepository(),
    });
    const persist = svc.buildStaffTrainingPersist({
      input: VALID_STAFF,
      userId: "u1",
      now: NOW,
    });
    expect(persist).toEqual({
      logged_by: "u1",
      staff_name: "Ada",
      job_role: "Butcher",
      training_type: "butchery_process_room",
      document_version: "V1.0",
      completion_date: "2026-06-01",
      refresh_date: "2027-06-01",
      supervisor_name: "Boss",
      supervisor_signed_at: NOW.toISOString(),
      confirmation_items: { a: true },
    });
  });

  it("confirmation_items defaults to {} when omitted; training_type is the warehouse variant verbatim", () => {
    const svc = createHaccpTrainingService({
      training: createFakeHaccpTrainingRepository(),
    });
    const persist = svc.buildStaffTrainingPersist({
      input: {
        ...VALID_STAFF,
        training_type: "warehouse_operative",
        confirmation_items: undefined,
      },
      userId: "u1",
      now: NOW,
    });
    expect(persist.confirmation_items).toEqual({});
    expect(persist.training_type).toBe("warehouse_operative");
  });
});

describe("HaccpTrainingService — buildAllergenTrainingPersist", () => {
  it("training_completed hardcoded; NO supervisor_signed_at key; confirmation_items ?? {}", () => {
    const svc = createHaccpTrainingService({
      training: createFakeHaccpTrainingRepository(),
    });
    const persist = svc.buildAllergenTrainingPersist({
      input: {
        staff_name: "  Ada  ",
        job_role: "  Butcher  ",
        certification_date: "2026-06-01",
        refresh_date: "2027-06-01",
        supervisor: "  Boss  ",
      },
      userId: "u1",
    });
    expect(persist).toEqual({
      logged_by: "u1",
      staff_name: "Ada",
      job_role: "Butcher",
      training_completed: "allergen_awareness",
      certification_date: "2026-06-01",
      refresh_date: "2027-06-01",
      supervisor_name: "Boss",
      confirmation_items: {},
    });
    expect(Object.keys(persist)).not.toContain("supervisor_signed_at");
  });
});

describe("HaccpTrainingService — insert delegation", () => {
  it("records the staff + allergen persist payloads on the Fake", async () => {
    const repo = createFakeHaccpTrainingRepository();
    const svc = createHaccpTrainingService({ training: repo });

    const staffPersist = svc.buildStaffTrainingPersist({
      input: VALID_STAFF,
      userId: "u1",
      now: NOW,
    });
    await svc.insertStaffTraining(staffPersist);
    expect(repo.insertedStaffTraining).toEqual([staffPersist]);

    const allergenPersist = svc.buildAllergenTrainingPersist({
      input: {
        staff_name: "Ada",
        job_role: "Butcher",
        certification_date: "2026-06-01",
        refresh_date: "2027-06-01",
        supervisor: "Boss",
      },
      userId: "u1",
    });
    await svc.insertAllergenTraining(allergenPersist);
    expect(repo.insertedAllergenTraining).toEqual([allergenPersist]);
  });
});
