/**
 * tests/unit/services/HaccpPeopleService.test.ts
 *
 * F-19 PR4 — the Cluster C "people / fitness-to-work" service against the Fake.
 *
 * Pins:
 *   - `getRecords` returns { records } from the seeded read;
 *   - the THREE validate cascades (exact 400 strings, in order);
 *   - `buildNewStaffDeclaration` — fit_for_work ?? true, exclusion_reason trim/null,
 *     start_date NOT persisted, manager_signed_at = INJECTED now, date = INJECTED
 *     today, and the EXACT column key set (R1);
 *   - `buildReturnToWork` — illness mapping (gi/other/serious + unmapped pass-through),
 *     return_date = today, fit_for_work: true hardcoded, EXACT key set;
 *   - `buildVisitorHealthRecord` with BOTH a real userId AND VISITOR_KIOSK_USER_ID
 *     (the shared builder is auth-agnostic — R7) and the EXACT visitor key set;
 *   - determinism via a FIXED now/today (the service never calls new Date()).
 */
import { describe, it, expect } from "vitest";
import { createHaccpPeopleService } from "@/lib/services";
import { createFakeHaccpPeopleRepository } from "@/lib/adapters/fake";
import type { HealthRecordRow } from "@/lib/domain";

const NOW = new Date("2026-06-23T10:00:00.000Z");
const TODAY = "2026-06-23";
const VISITOR_KIOSK_USER_ID = "190d6c79-6239-4be7-bdbd-0df474895ebc";

function recordRow(overrides: Partial<HealthRecordRow>): HealthRecordRow {
  return {
    id: "r1",
    record_type: "visitor",
    date: TODAY,
    staff_name: null,
    visitor_name: "Bob",
    visitor_company: "Acme",
    fit_for_work: true,
    health_questions: {},
    exclusion_reason: null,
    illness_type: null,
    absence_from: null,
    absence_to: null,
    manager_signed_name: "Boss",
    submitted_at: "2026-06-23T00:00:00.000Z",
    users: null,
    ...overrides,
  };
}

describe("HaccpPeopleService — getRecords", () => {
  it("returns { records } from the seeded read (incl. null users-ref rows)", async () => {
    const rows = [
      recordRow({ id: "r1", users: { name: "Hakan" } }),
      recordRow({ id: "r2", users: null }),
    ];
    const repo = createFakeHaccpPeopleRepository({ healthRecords: rows });
    const svc = createHaccpPeopleService({ people: repo });
    const res = await svc.getRecords();
    expect(Object.keys(res)).toEqual(["records"]);
    expect(res.records).toEqual(rows);
  });
});

describe("HaccpPeopleService — validate cascades (exact strings)", () => {
  const svc = createHaccpPeopleService({
    people: createFakeHaccpPeopleRepository(),
  });

  it("new_staff_declaration: staff name / start date / manager sign-off in order", () => {
    expect(
      svc.validateNewStaffDeclaration({ start_date: "2026-06-01", manager_signed_by: "B" }),
    ).toEqual({ ok: false, status: 400, message: "Staff name required" });
    expect(
      svc.validateNewStaffDeclaration({ staff_name: "Ada", manager_signed_by: "B" }),
    ).toEqual({ ok: false, status: 400, message: "Start date required" });
    expect(
      svc.validateNewStaffDeclaration({ staff_name: "Ada", start_date: "2026-06-01" }),
    ).toEqual({ ok: false, status: 400, message: "Manager sign-off required" });
    expect(
      svc.validateNewStaffDeclaration({
        staff_name: "Ada",
        start_date: "2026-06-01",
        manager_signed_by: "B",
      }),
    ).toEqual({ ok: true });
  });

  it("return_to_work: staff name / illness type / manager sign-off in order", () => {
    expect(
      svc.validateReturnToWork({ illness_type: "gi", manager_signed_by: "B" }),
    ).toEqual({ ok: false, status: 400, message: "Staff name required" });
    expect(
      svc.validateReturnToWork({ staff_name: "Ada", manager_signed_by: "B" }),
    ).toEqual({ ok: false, status: 400, message: "Illness type required" });
    expect(
      svc.validateReturnToWork({ staff_name: "Ada", illness_type: "gi" }),
    ).toEqual({ ok: false, status: 400, message: "Manager sign-off required" });
    expect(
      svc.validateReturnToWork({
        staff_name: "Ada",
        illness_type: "gi",
        manager_signed_by: "B",
      }),
    ).toEqual({ ok: true });
  });

  it("visitor: only the three shared visitor fields (R2/R4 — no manager check here)", () => {
    expect(svc.validateVisitor({ visitor_company: "Acme", visitor_reason: "Tour" })).toEqual({
      ok: false,
      status: 400,
      message: "Visitor name required",
    });
    expect(svc.validateVisitor({ visitor_name: "Bob", visitor_reason: "Tour" })).toEqual({
      ok: false,
      status: 400,
      message: "Company required",
    });
    expect(svc.validateVisitor({ visitor_name: "Bob", visitor_company: "Acme" })).toEqual({
      ok: false,
      status: 400,
      message: "Visit reason required",
    });
    expect(
      svc.validateVisitor({
        visitor_name: "Bob",
        visitor_company: "Acme",
        visitor_reason: "Tour",
      }),
    ).toEqual({ ok: true });
  });
});

describe("HaccpPeopleService — buildNewStaffDeclaration", () => {
  const svc = createHaccpPeopleService({
    people: createFakeHaccpPeopleRepository(),
  });

  it("EXACT key set, fit_for_work ?? true, exclusion trim/null, start_date NOT persisted, injected now/today", () => {
    const persist = svc.buildNewStaffDeclaration({
      input: {
        staff_name: "  Ada  ",
        start_date: "2026-06-01",
        health_questions: { q1: "yes" },
        exclusion_reason: "  flu  ",
        manager_signed_by: "  Boss  ",
      },
      userId: "u1",
      now: NOW,
      today: TODAY,
    });
    expect(persist).toEqual({
      submitted_by: "u1",
      record_type: "new_staff_declaration",
      date: TODAY,
      staff_name: "Ada",
      health_questions: { q1: "yes" },
      fit_for_work: true,
      exclusion_reason: "flu",
      manager_signed_name: "Boss",
      manager_signed_at: NOW.toISOString(),
    });
    expect(Object.keys(persist)).not.toContain("start_date");
  });

  it("fit_for_work honoured when false; exclusion_reason → null when blank", () => {
    const persist = svc.buildNewStaffDeclaration({
      input: {
        staff_name: "Ada",
        start_date: "2026-06-01",
        fit_for_work: false,
        exclusion_reason: "   ",
        manager_signed_by: "Boss",
      },
      userId: "u1",
      now: NOW,
      today: TODAY,
    });
    expect(persist.fit_for_work).toBe(false);
    expect(persist.exclusion_reason).toBeNull();
  });
});

describe("HaccpPeopleService — buildReturnToWork (illness mapping)", () => {
  const svc = createHaccpPeopleService({
    people: createFakeHaccpPeopleRepository(),
  });

  function build(illness_type: string) {
    return svc.buildReturnToWork({
      input: {
        staff_name: "  Ada  ",
        absence_from: "2026-06-01",
        absence_to: "2026-06-05",
        illness_type,
        health_questions: { q1: "no" },
        symptom_free_48h: true,
        medical_certificate_provided: false,
        manager_signed_by: "  Boss  ",
      },
      userId: "u1",
      now: NOW,
      today: TODAY,
    });
  }

  it("gi → gastrointestinal", () => {
    expect(build("gi").illness_type).toBe("gastrointestinal");
  });
  it("other → other_illness", () => {
    expect(build("other").illness_type).toBe("other_illness");
  });
  it("serious → serious_illness", () => {
    expect(build("serious").illness_type).toBe("serious_illness");
  });
  it("unmapped token passes through unchanged", () => {
    expect(build("respiratory").illness_type).toBe("respiratory");
  });

  it("EXACT key set, return_date = today, fit_for_work: true hardcoded, injected now", () => {
    const persist = build("gi");
    expect(persist).toEqual({
      submitted_by: "u1",
      record_type: "return_to_work",
      date: TODAY,
      staff_name: "Ada",
      absence_from: "2026-06-01",
      absence_to: "2026-06-05",
      return_date: TODAY,
      illness_type: "gastrointestinal",
      health_questions: { q1: "no" },
      symptom_free_48h: true,
      medical_certificate_provided: false,
      fit_for_work: true,
      manager_signed_name: "Boss",
      manager_signed_at: NOW.toISOString(),
    });
  });

  it("absence dates and the two nullable flags default to null", () => {
    const persist = svc.buildReturnToWork({
      input: { staff_name: "Ada", illness_type: "gi", manager_signed_by: "Boss" },
      userId: "u1",
      now: NOW,
      today: TODAY,
    });
    expect(persist.absence_from).toBeNull();
    expect(persist.absence_to).toBeNull();
    expect(persist.symptom_free_48h).toBeNull();
    expect(persist.medical_certificate_provided).toBeNull();
  });
});

describe("HaccpPeopleService — buildVisitorHealthRecord (shared, auth-agnostic)", () => {
  const svc = createHaccpPeopleService({
    people: createFakeHaccpPeopleRepository(),
  });

  it("EXACT visitor key set + a REAL userId (people-visitor path)", () => {
    const persist = svc.buildVisitorHealthRecord({
      input: {
        visitor_name: "  Bob  ",
        visitor_company: "  Acme  ",
        visitor_reason: "  Tour  ",
        health_questions: { q1: "no" },
        visitor_declaration_confirmed: true,
        fit_for_work: true,
        manager_signed_by: "  Boss  ",
      },
      userId: "u1",
      now: NOW,
      today: TODAY,
    });
    expect(persist).toEqual({
      submitted_by: "u1",
      record_type: "visitor",
      date: TODAY,
      visitor_name: "Bob",
      visitor_company: "Acme",
      visitor_reason: "Tour",
      health_questions: { q1: "no" },
      visitor_declaration_confirmed: true,
      fit_for_work: true,
      manager_signed_name: "Boss",
      manager_signed_at: NOW.toISOString(),
    });
  });

  it("the SAME builder with VISITOR_KIOSK_USER_ID (kiosk path) — only submitted_by differs", () => {
    const persist = svc.buildVisitorHealthRecord({
      input: {
        visitor_name: "Bob",
        visitor_company: "Acme",
        visitor_reason: "Tour",
        health_questions: {},
        visitor_declaration_confirmed: false,
        fit_for_work: false,
        manager_signed_by: "Boss",
      },
      userId: VISITOR_KIOSK_USER_ID,
      now: NOW,
      today: TODAY,
    });
    expect(persist.submitted_by).toBe(VISITOR_KIOSK_USER_ID);
    expect(persist.record_type).toBe("visitor");
    expect(persist.visitor_declaration_confirmed).toBe(false);
    expect(persist.fit_for_work).toBe(false);
  });

  it("defaults: visitor_declaration_confirmed/fit_for_work → false when omitted", () => {
    const persist = svc.buildVisitorHealthRecord({
      input: {
        visitor_name: "Bob",
        visitor_company: "Acme",
        visitor_reason: "Tour",
        manager_signed_by: "Boss",
      },
      userId: "u1",
      now: NOW,
      today: TODAY,
    });
    expect(persist.visitor_declaration_confirmed).toBe(false);
    expect(persist.fit_for_work).toBe(false);
  });
});

describe("HaccpPeopleService — insertHealthRecord delegation", () => {
  it("records the persist payload on the Fake", async () => {
    const repo = createFakeHaccpPeopleRepository();
    const svc = createHaccpPeopleService({ people: repo });
    const persist = svc.buildVisitorHealthRecord({
      input: {
        visitor_name: "Bob",
        visitor_company: "Acme",
        visitor_reason: "Tour",
        manager_signed_by: "Boss",
      },
      userId: VISITOR_KIOSK_USER_ID,
      now: NOW,
      today: TODAY,
    });
    await svc.insertHealthRecord(persist);
    expect(repo.insertedHealthRecords).toEqual([persist]);
  });
});
