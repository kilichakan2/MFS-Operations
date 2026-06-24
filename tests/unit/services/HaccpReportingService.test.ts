/**
 * tests/unit/services/HaccpReportingService.test.ts
 *
 * F-19 PR7 — the PR8 safety net. For each of the 6 reporting methods, seed the
 * Fake reporting repo with representative fixtures and assert the service output
 * equals the EXACT shape the current route returns. `buildAuditWorkbook` uses
 * the REAL XlsxSpreadsheetExporter so the buffer is genuinely parseable, and
 * pins the 14-tab set/order + each tab's header row (Risk B1). `getTodayStatus`
 * is tested at multiple fixed `now` values to cover the overdue boundaries
 * deterministically (Risk B2).
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { createHaccpReportingService } from "@/lib/services";
import { createFakeHaccpReportingRepository } from "@/lib/adapters/fake";
import { createXlsxSpreadsheetExporter } from "@/lib/adapters/xlsx";
import type {
  TodayStatusData,
  OverviewData,
  AnnualReviewRawData,
  AuditHeatmapRawData,
  AuditSectionRawData,
  AuditExportRawData,
} from "@/lib/domain";
import type { FakeHaccpReportingSeed } from "@/lib/adapters/fake/HaccpReportingRepository";

function makeService(seed: FakeHaccpReportingSeed) {
  return createHaccpReportingService({
    reporting: createFakeHaccpReportingRepository(seed),
    spreadsheet: createXlsxSpreadsheetExporter(),
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 1) getTodayStatus
// ───────────────────────────────────────────────────────────────────────────
describe("getTodayStatus", () => {
  const empty: TodayStatusData = {
    cold: [],
    room: [],
    diary: [],
    cleaning: [],
    deliveries: [],
    mince: [],
    returns: [],
    ccas: [],
    weekly: [],
    monthly: [],
    cal: [],
    training: [],
  };

  it("morning, nothing done — overdue flags OFF before the cutoffs", async () => {
    const svc = makeService({ todayStatus: empty });
    // 2026-06-24 is a Wednesday; 08:00 local is before every cutoff.
    const res = await svc.getTodayStatus(new Date("2026-06-24T08:00:00"));
    expect(res.cold_storage.am_overdue).toBe(false);
    expect(res.cold_storage.pm_overdue).toBe(false);
    expect(res.daily_diary.opening_overdue).toBe(false);
    expect(res.daily_diary.operational_overdue).toBe(false);
    expect(res.daily_diary.closing_overdue).toBe(false);
    expect(res.cleaning.overdue).toBe(false);
    expect(res.weekly_review_overdue).toBe(false);
    expect(res.total_checks).toBe(6);
    expect(res.completed_checks).toBe(0);
  });

  it("late afternoon, nothing done — overdue flags ON after the cutoffs", async () => {
    const svc = makeService({ todayStatus: empty });
    // 18:00 local — past am(10), pm(14), opening(10), operational(13),
    // closing(17), cleaning(15).
    const res = await svc.getTodayStatus(new Date("2026-06-24T18:00:00"));
    expect(res.cold_storage.am_overdue).toBe(true);
    expect(res.cold_storage.pm_overdue).toBe(true);
    expect(res.processing_room.am_overdue).toBe(true);
    expect(res.processing_room.pm_overdue).toBe(true);
    expect(res.daily_diary.opening_overdue).toBe(true);
    expect(res.daily_diary.operational_overdue).toBe(true);
    expect(res.daily_diary.closing_overdue).toBe(true);
    expect(res.cleaning.overdue).toBe(true);
  });

  it("Friday after 17:00 with no weekly review → weekly_review_overdue true", async () => {
    const svc = makeService({ todayStatus: empty });
    // 2026-06-26 is a Friday; 17:30 local.
    const res = await svc.getTodayStatus(new Date("2026-06-26T17:30:00"));
    expect(res.weekly_review_due).toBe(true);
    expect(res.weekly_review_overdue).toBe(true);
  });

  it("Friday before 17:00 → weekly_review_overdue false", async () => {
    const svc = makeService({ todayStatus: empty });
    const res = await svc.getTodayStatus(new Date("2026-06-26T16:00:00"));
    expect(res.weekly_review_overdue).toBe(false);
  });

  it("last day of month with no monthly review → monthly_review_overdue true", async () => {
    const svc = makeService({ todayStatus: empty });
    // 2026-06-30 is the last day of June.
    const res = await svc.getTodayStatus(new Date("2026-06-30T12:00:00"));
    expect(res.monthly_review_overdue).toBe(true);
  });

  it("not last day of month → monthly_review_overdue false", async () => {
    const svc = makeService({ todayStatus: empty });
    const res = await svc.getTodayStatus(new Date("2026-06-15T12:00:00"));
    expect(res.monthly_review_overdue).toBe(false);
  });

  it("reproduces the full tile object for seeded reads", async () => {
    const today = new Date("2026-06-24T18:00:00");
    const todayStr = today.toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    });
    const seed: TodayStatusData = {
      cold: [{ session: "AM" }],
      room: [{ session: "AM" }, { session: "PM" }],
      diary: [{ phase: "opening" }, { phase: "operational" }],
      cleaning: [
        { submitted_at: "2026-06-24T09:00:00Z", issues: true },
        { submitted_at: "2026-06-24T08:00:00Z", issues: false },
      ],
      deliveries: [{ temp_status: "pass" }, { temp_status: "fail" }],
      mince: [
        { id: "m1", input_temp_pass: true, output_temp_pass: false },
      ],
      returns: [
        { id: "r1", return_code: "RC01" },
        { id: "r2", return_code: "RC03" },
      ],
      ccas: [{ id: "c1" }, { id: "c2" }],
      weekly: [{ id: "w1" }],
      monthly: [{ id: "mo1" }],
      cal: [{ id: "cal1", ice_water_pass: true, boiling_water_pass: true }],
      // one overdue (past), one due-soon (within 30 days)
      training: [
        { refresh_date: "2020-01-01" },
        {
          refresh_date: new Date(
            new Date(todayStr).getTime() + 10 * 86400000,
          )
            .toISOString()
            .slice(0, 10),
        },
      ],
    };
    const svc = makeService({ todayStatus: seed });
    const res = await svc.getTodayStatus(today);

    expect(res.cold_storage).toEqual({
      am_done: true,
      pm_done: false,
      am_overdue: false,
      pm_overdue: true,
    });
    expect(res.processing_room).toEqual({
      am_done: true,
      pm_done: true,
      am_overdue: false,
      pm_overdue: false,
    });
    expect(res.daily_diary.opening).toBe(true);
    expect(res.daily_diary.closing).toBe(false);
    expect(res.cleaning).toEqual({
      count_today: 2,
      has_issues_today: true,
      overdue: false,
      last_logged_at: "2026-06-24T09:00:00Z",
    });
    expect(res.deliveries).toEqual({ count_today: 2, deviations: 1 });
    expect(res.mince_runs).toEqual({ count_today: 1, has_deviations: true });
    expect(res.product_returns).toEqual({
      count_today: 2,
      has_safety_returns: true,
    });
    expect(res.corrective_actions).toEqual({ open: 2 });
    expect(res.calibration_due).toBe(false);
    expect(res.calibration_done).toBe(true);
    expect(res.calibration_pass).toBe(true);
    expect(res.weekly_review_due).toBe(false);
    expect(res.monthly_review_due).toBe(false);
    expect(res.training_overdue).toBe(1);
    expect(res.training_due_soon).toBe(1);
    expect(res.completed_checks).toBe(4); // amCold + amRoom + pmRoom + opening
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2) getOverview
// ───────────────────────────────────────────────────────────────────────────
describe("getOverview", () => {
  it("reproduces the overview tallies incl. missing_days + species/code maps", async () => {
    // 2026-06-22 (Mon) .. 2026-06-24 (Wed) → expected working days Mon/Tue/Wed.
    const from = "2026-06-22";
    const to = "2026-06-24";
    const overview: OverviewData = {
      deliveries: [
        {
          date: "2026-06-22",
          temp_status: "fail",
          corrective_action_required: true,
          product_category: "lamb",
        },
        {
          date: "2026-06-22",
          temp_status: "urgent",
          corrective_action_required: false,
          product_category: "beef",
        },
      ],
      coldStorage: [
        { date: "2026-06-22", temp_status: "pass", session: "AM" },
      ],
      processingTemps: [
        {
          date: "2026-06-23",
          session: "AM",
          product_temp_pass: false,
          room_temp_pass: true,
        },
      ],
      dailyDiary: [{ date: "2026-06-23", phase: "opening", issues: true }],
      cleaning: [
        {
          date: "2026-06-22",
          issues: true,
          what_was_cleaned: "floors",
        },
      ],
      mince: [
        {
          date: "2026-06-22",
          product_species: "lamb",
          input_temp_pass: true,
          output_temp_pass: true,
          corrective_action: "x",
        },
        {
          date: "2026-06-23",
          product_species: "lamb",
          input_temp_pass: true,
          output_temp_pass: true,
          corrective_action: null,
        },
      ],
      meatprep: [
        {
          date: "2026-06-22",
          product_name: "diced",
          input_temp_pass: true,
          output_temp_pass: true,
          corrective_action: "y",
        },
      ],
      returns: [
        {
          date: "2026-06-22",
          return_code: "RC01",
          disposition: "destroy",
          temperature_c: 8,
        },
        {
          date: "2026-06-23",
          return_code: "RC01",
          disposition: "resell",
          temperature_c: null,
        },
      ],
      calibration: [
        {
          date: "2026-06-22",
          calibration_mode: "manual",
          ice_water_pass: false,
          boiling_water_pass: true,
        },
      ],
      correctiveActions: [
        {
          ccp_ref: "CCP2",
          management_verification_required: true,
          verified_at: null,
          source_table: "haccp_cold_storage_temps",
        },
        {
          ccp_ref: "CCP2",
          management_verification_required: true,
          verified_at: "2026-06-23",
          source_table: "haccp_cold_storage_temps",
        },
      ],
    };
    const svc = makeService({ overview });
    const res = await svc.getOverview(from, to);

    expect(res.from).toBe(from);
    expect(res.to).toBe(to);
    expect(res.expected_days).toEqual([
      "2026-06-22",
      "2026-06-23",
      "2026-06-24",
    ]);
    expect(res.goods_in).toEqual({
      total: 2,
      entries_by_date: ["2026-06-22"],
      temp_fails: 1,
      temp_urgent: 1,
      ca_raised: 1,
    });
    expect(res.cold_storage.missing_days).toEqual([
      "2026-06-23",
      "2026-06-24",
    ]);
    expect(res.process_room).toEqual({
      total: 1,
      entries_by_date: ["2026-06-23"],
      missing_days: ["2026-06-22", "2026-06-24"],
      product_fails: 1,
      room_fails: 0,
      diary_issues: 1,
    });
    expect(res.cleaning.issues).toBe(1);
    expect(res.mince).toEqual({
      total: 2,
      entries_by_date: ["2026-06-22", "2026-06-23"],
      deviations: 1,
      by_species: { lamb: 2 },
    });
    expect(res.meatprep.deviations).toBe(1);
    expect(res.returns.by_code).toEqual({ RC01: 2 });
    expect(res.returns.dispositions).toEqual({ destroy: 1, resell: 1 });
    expect(res.calibration).toEqual({ done: true, total: 1, any_fail: true });
    expect(res.corrective_actions).toEqual({
      total: 2,
      unresolved: 1,
      by_ccp: { CCP2: 2 },
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3) getAnnualReviewData
// ───────────────────────────────────────────────────────────────────────────
describe("getAnnualReviewData", () => {
  const annual: AnnualReviewRawData = {
    staffRaw: [
      {
        staff_name: "Ann",
        job_role: "butcher",
        training_type: "butchery_process_room",
        completion_date: "2026-01-01",
        refresh_date: "2027-01-01",
        supervisor_name: "Sup",
      },
      // duplicate (staff+type) — deduped out
      {
        staff_name: "Ann",
        job_role: "butcher",
        training_type: "butchery_process_room",
        completion_date: "2025-01-01",
        refresh_date: "2026-01-01",
        supervisor_name: "Sup",
      },
    ],
    allergenRaw: [
      {
        staff_name: "Ann",
        job_role: "butcher",
        certification_date: "2026-01-01",
        refresh_date: "2027-01-01",
      },
      {
        staff_name: "Ann",
        job_role: "butcher",
        certification_date: "2025-01-01",
        refresh_date: "2026-01-01",
      },
    ],
    healthRaw: [
      { record_type: "new_staff_declaration", id: "h1" },
      { record_type: "return_to_work", id: "h2" },
      { record_type: "visitor", id: "h3" },
    ],
    cleaningRaw: [
      {
        date: "2026-03-01",
        issues: true,
        what_did_you_do: "cleaned",
        sanitiser_temp_c: 70,
      },
      {
        date: "2026-02-01",
        issues: false,
        what_did_you_do: null,
        sanitiser_temp_c: 85,
      },
    ],
    calibRaw: [
      {
        thermometer_id: "T1",
        calibration_mode: "manual",
        date: "2026-03-01",
        cert_reference: null,
        ice_water_result_c: 0,
        ice_water_pass: true,
        boiling_water_result_c: 100,
        boiling_water_pass: true,
      },
      // dup thermometer — deduped out
      {
        thermometer_id: "T1",
        calibration_mode: "manual",
        date: "2026-02-01",
        cert_reference: null,
        ice_water_result_c: 0,
        ice_water_pass: true,
        boiling_water_result_c: 100,
        boiling_water_pass: true,
      },
    ],
    unitsRaw: [
      {
        id: "u1",
        name: "Fridge 1",
        unit_type: "fridge",
        target_temp_c: 4,
        max_temp_c: 8,
      },
    ],
    tempsRaw: [
      {
        unit_id: "u1",
        temperature_c: 3,
        temp_status: "pass",
        date: "2026-03-02",
        session: "AM",
      },
      {
        unit_id: "u1",
        temperature_c: 5,
        temp_status: "amber",
        date: "2026-03-01",
        session: "AM",
      },
    ],
    deliveryTempsRaw: [
      { temp_status: "pass" },
      { temp_status: "fail" },
      { temp_status: "urgent" },
    ],
    suppliersRaw: [
      {
        date_approved: "2025-01-01",
        fsa_approval_no: "FSA1",
        cert_type: "x",
        cert_expiry: "2020-01-01",
      },
    ],
    specsRaw: [{ reviewed_at: null }, { reviewed_at: "2026-06-01" }],
    goodsInRaw: [
      {
        batch_number: "B1",
        product_category: "lamb",
        born_in: "UK",
        slaughter_site: "S",
        cut_site: "C",
      },
      {
        batch_number: null,
        product_category: "lamb",
        born_in: null,
        slaughter_site: null,
        cut_site: null,
      },
    ],
    caAllRaw: [
      {
        source_table: "haccp_deliveries",
        resolved: false,
        submitted_at: "2026-03-01T10:00:00Z",
      },
      {
        source_table: "haccp_deliveries",
        resolved: true,
        submitted_at: "2026-03-02T10:00:00Z",
      },
    ],
    returnsRaw: [
      { return_code: "RC01" },
      { return_code: "RC01" },
      { return_code: "RC02" },
    ],
    complaintsRaw: [
      { status: "open" },
      { status: "resolved" },
      { status: "resolved" },
    ],
    ffRaw: {
      version: "1.0",
      issue_date: "2026-01-01",
      next_review_date: "2030-01-01",
    },
    fdRaw: null,
  };

  it("with from&to — full SALSA block structure + dedup + complaints", async () => {
    const svc = makeService({ annualReview: annual });
    const res = await svc.getAnnualReviewData("2026-01-01", "2026-06-24");

    // 3.2 dedup
    expect(res["3.2"].staff_training).toHaveLength(1);
    expect(res["3.2"].allergen_training).toHaveLength(1);
    // 3.3 health
    expect(res["3.3"].new_staff).toHaveLength(1);
    expect(res["3.3"].exclusions).toHaveLength(1);
    expect(res["3.3"].visitors).toHaveLength(1);
    // 3.4 cleaning
    expect(res["3.4"].total).toBe(2);
    expect(res["3.4"].issues_count).toBe(1);
    expect(res["3.4"].sanitiser_checks).toBe(2);
    expect(res["3.4"].low_temp_list).toEqual([
      { date: "2026-03-01", sanitiser_temp_c: 70 },
    ]);
    expect(res["3.4"].last_log_date).toBe("2026-03-01");
    // 3.6 calibration dedup + cold storage latest + delivery temps
    expect(res["3.6"].calibration).toHaveLength(1);
    expect(res["3.6"].cold_storage[0].latest).toEqual({
      temperature_c: 3,
      temp_status: "pass",
      date: "2026-03-02",
      session: "AM",
    });
    expect(res["3.6"].delivery_temps).toEqual({
      total: 3,
      pass: 1,
      urgent: 1,
      fail: 1,
      temp_cas: 2,
    });
    // 3.7 supplier expiry windows
    expect(res["3.7"].supplier_stats.expired_certs).toBe(1);
    expect(res["3.7"].spec_stats.review_due).toBe(1);
    expect(res["3.7"].goods_in).toEqual({
      total: 2,
      has_batch: 1,
      meat_total: 2,
      meat_bls_complete: 1,
    });
    // 3.8 CA + returns + complaints
    expect(res["3.8"].ca_stats.total_open).toBe(1);
    expect(res["3.8"].ca_stats.total_resolved).toBe(1);
    expect(res["3.8"].ca_stats.in_period).toBe(2);
    expect(res["3.8"].ca_stats.open_by_source).toEqual([
      { source: "Deliveries", count: 1 },
    ]);
    expect(res["3.8"].returns_stats.by_code).toEqual([
      { code: "RC01", label: "Temperature", count: 2 },
      { code: "RC02", label: "Quality", count: 1 },
    ]);
    expect(res["3.8"].complaints_stats).toEqual({
      total: 3,
      open: 1,
      resolved: 2,
    });
    // 3.9 food fraud/defence
    expect(res["3.9"].food_fraud.exists).toBe(true);
    expect(res["3.9"].food_fraud.review_due).toBe(false);
    expect(res["3.9"].food_defence.exists).toBe(false);
    expect(res["3.9"].food_defence.review_due).toBe(true);
  });

  it("without from&to — period-filtered sections stay empty", async () => {
    const svc = makeService({ annualReview: annual });
    const res = await svc.getAnnualReviewData(null, null);

    // current-state sections still populated
    expect(res["3.2"].staff_training).toHaveLength(1);
    expect(res["3.6"].calibration).toHaveLength(1);
    expect(res["3.7"].supplier_stats.total).toBe(1);
    // period-filtered sections empty
    expect(res["3.3"]).toEqual({
      new_staff: [],
      exclusions: [],
      visitors: [],
    });
    expect(res["3.4"].total).toBe(0);
    expect(res["3.6"].delivery_temps).toEqual({
      total: 0,
      pass: 0,
      urgent: 0,
      fail: 0,
      temp_cas: 0,
    });
    expect(res["3.7"].goods_in).toEqual({
      total: 0,
      has_batch: 0,
      meat_total: 0,
      meat_bls_complete: 0,
    });
    expect(res["3.8"].ca_stats.in_period).toBe(0);
    expect(res["3.8"].returns_stats).toEqual({ total: 0, by_code: [] });
    expect(res["3.8"].complaints_stats).toEqual({
      total: 0,
      open: 0,
      resolved: 0,
    });
    // but CA open/resolved (not period-filtered) still computed
    expect(res["3.8"].ca_stats.total_open).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4) getAuditHeatmap
// ───────────────────────────────────────────────────────────────────────────
describe("getAuditHeatmap", () => {
  it("reproduces all 11 DayMaps + section deviation logic", async () => {
    const heatmap: AuditHeatmapRawData = {
      deliveries: [
        {
          date: "2026-06-22",
          temp_status: "fail",
          corrective_action_required: false,
        },
        {
          date: "2026-06-23",
          temp_status: "pass",
          corrective_action_required: false,
        },
      ],
      coldStorageTemps: [
        {
          date: "2026-06-22",
          session: "AM",
          temp_status: "pass",
          corrective_action_required: true,
        },
        {
          date: "2026-06-22",
          session: "PM",
          temp_status: "pass",
          corrective_action_required: false,
        },
      ],
      processingTemps: [
        {
          date: "2026-06-22",
          session: "AM",
          within_limits: false,
          corrective_action_required: false,
        },
      ],
      dailyDiary: [
        { date: "2026-06-22", phase: "opening", issues: true },
        { date: "2026-06-22", phase: "closing", issues: false },
      ],
      cleaningLog: [{ date: "2026-06-22", issues: true }],
      minceLog: [
        {
          date: "2026-06-22",
          input_temp_pass: true,
          output_temp_pass: false,
          corrective_action: null,
        },
      ],
      calibrationLog: [
        {
          date: "2026-06-22",
          calibration_mode: "manual",
          ice_water_pass: false,
          boiling_water_pass: true,
        },
        // certified-mode fail is NOT a deviation (manual-only rule)
        {
          date: "2026-06-23",
          calibration_mode: "certified_probe",
          ice_water_pass: false,
          boiling_water_pass: true,
        },
      ],
    };
    const svc = makeService({ auditHeatmap: heatmap });
    const res = await svc.getAuditHeatmap("2026-06-22", "2026-06-24");

    expect(Object.keys(res)).toEqual([
      "deliveries",
      "cold_am",
      "cold_pm",
      "room_am",
      "room_pm",
      "diary_open",
      "diary_operational",
      "diary_close",
      "cleaning",
      "mince",
      "calibration",
    ]);
    expect(res.deliveries["2026-06-22"]).toEqual({
      has_records: true,
      has_deviations: true,
    });
    expect(res.deliveries["2026-06-23"].has_deviations).toBe(false);
    expect(res.cold_am["2026-06-22"].has_deviations).toBe(true); // CA required
    expect(res.cold_pm["2026-06-22"].has_deviations).toBe(false);
    expect(res.room_am["2026-06-22"].has_deviations).toBe(true); // within_limits false
    expect(res.diary_open["2026-06-22"].has_deviations).toBe(true);
    expect(res.diary_close["2026-06-22"].has_deviations).toBe(false);
    expect(res.cleaning["2026-06-22"].has_deviations).toBe(true);
    expect(res.mince["2026-06-22"].has_deviations).toBe(true);
    // manual fail → deviation; certified fail → records but no deviation
    expect(res.calibration["2026-06-22"].has_deviations).toBe(true);
    expect(res.calibration["2026-06-23"]).toEqual({
      has_records: true,
      has_deviations: false,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5) getAuditSection
// ───────────────────────────────────────────────────────────────────────────
describe("getAuditSection", () => {
  function sectionSeed(
    section: string,
    raw: Omit<AuditSectionRawData, "section">,
  ): FakeHaccpReportingSeed {
    return { auditSections: { [section]: { section, ...raw } } };
  }

  it("deliveries — rows/summary/heatmap + user fallback + CA merge", async () => {
    const svc = makeService(
      sectionSeed("deliveries", {
        rows: [
          { id: "d1", date: "2026-06-22", temp_status: "fail", users: null },
          {
            id: "d2",
            date: "2026-06-23",
            temp_status: "pass",
            users: { name: "Bob" },
          },
        ],
        caMap: {
          d1: { resolved: false, deviation_description: "cold" },
        },
      }),
    );
    const res = (await svc.getAuditSection(
      "deliveries",
      "2026-06-22",
      "2026-06-24",
    )) as {
      rows: { submitted_by_name: string; ca: unknown }[];
      summary: Record<string, number>;
      heatmap: { deliveries: Record<string, { has_deviations: boolean }> };
    };
    expect(res.rows[0].submitted_by_name).toBe("—");
    expect(res.rows[1].submitted_by_name).toBe("Bob");
    expect(res.rows[0].ca).toEqual({
      resolved: false,
      deviation_description: "cold",
    });
    expect(res.summary).toEqual({
      total: 2,
      pass: 1,
      urgent: 0,
      fail: 1,
      ca_count: 1,
      unresolved: 1,
    });
    expect(res.heatmap.deliveries["2026-06-22"].has_deviations).toBe(true);
  });

  it("process_room — dual tempRows/diaryRows + 5 heatmap rows", async () => {
    const svc = makeService(
      sectionSeed("process_room", {
        rows: [
          {
            id: "t1",
            date: "2026-06-22",
            session: "AM",
            within_limits: false,
            users: null,
          },
        ],
        secondaryRows: [
          {
            id: "diary1",
            date: "2026-06-22",
            phase: "opening",
            issues: true,
            users: null,
          },
        ],
        caMap: {},
        diaryCaMap: {},
      }),
    );
    const res = (await svc.getAuditSection(
      "process_room",
      "2026-06-22",
      "2026-06-24",
    )) as {
      tempRows: unknown[];
      diaryRows: unknown[];
      tempSummary: Record<string, number>;
      diarySummary: Record<string, number>;
      heatmap: Record<string, Record<string, { has_deviations: boolean }>>;
    };
    expect(res.tempRows).toHaveLength(1);
    expect(res.diaryRows).toHaveLength(1);
    expect(res.tempSummary.fail).toBe(1);
    expect(res.diarySummary.with_issues).toBe(1);
    expect(Object.keys(res.heatmap)).toEqual([
      "room_am",
      "room_pm",
      "diary_open",
      "diary_operational",
      "diary_close",
    ]);
    expect(res.heatmap.room_am["2026-06-22"].has_deviations).toBe(true);
    expect(res.heatmap.diary_open["2026-06-22"].has_deviations).toBe(true);
  });

  it("reviews — weeklyRows/monthlyRows with problem + fail counts", async () => {
    const svc = makeService(
      sectionSeed("reviews", {
        rows: [
          {
            id: "w1",
            week_ending: "2026-06-21",
            assessments: [
              { state: "problem" },
              { state: "ok" },
              { state: "no" },
            ],
            users: { name: "Ann" },
          },
        ],
        secondaryRows: [
          {
            id: "m1",
            month_year: "2026-06",
            equipment_checks: { a: true, b: false },
            facilities_checks: { c: false },
            haccp_system_review: [
              { result: "YES", invertFail: false },
              { result: "NO", invertFail: false },
            ],
            users: { name: "Ann" },
          },
        ],
      }),
    );
    const res = (await svc.getAuditSection(
      "reviews",
      "2026-06-01",
      "2026-06-30",
    )) as {
      weeklyRows: { problem_count: number; total_assessments: number }[];
      monthlyRows: { equip_fail: number; facil_fail: number; sys_fail: number }[];
    };
    expect(res.weeklyRows[0].problem_count).toBe(2);
    expect(res.weeklyRows[0].total_assessments).toBe(3);
    expect(res.monthlyRows[0]).toMatchObject({
      equip_fail: 1,
      facil_fail: 1,
      sys_fail: 1,
    });
  });

  it("training — staffRows/allergenRows status + summary", async () => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    });
    const overdue = "2000-01-01";
    const dueSoon = new Date(new Date(today).getTime() + 10 * 86400000)
      .toISOString()
      .slice(0, 10);
    const svc = makeService(
      sectionSeed("training", {
        rows: [{ id: "s1", refresh_date: overdue }],
        secondaryRows: [{ id: "a1", refresh_date: dueSoon }],
      }),
    );
    const res = (await svc.getAuditSection(
      "training",
      "2020-01-01",
      "2030-01-01",
    )) as {
      staffRows: { status: string }[];
      allergenRows: { status: string }[];
      summary: Record<string, number>;
    };
    expect(res.staffRows[0].status).toBe("overdue");
    expect(res.allergenRows[0].status).toBe("due_soon");
    expect(res.summary).toEqual({
      staff_total: 1,
      allergen_total: 1,
      overdue: 1,
      due_soon: 1,
    });
  });

  it("unknown section → { error } shape (the 400-equivalent)", async () => {
    const svc = makeService({});
    const res = (await svc.getAuditSection("nope", "a", "b")) as {
      error: string;
    };
    expect(res.error).toBe("Unknown section: nope");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6) buildAuditWorkbook (real exporter) — the 14-tab safety net (Risk B1)
// ───────────────────────────────────────────────────────────────────────────
describe("buildAuditWorkbook", () => {
  const EXPECTED_TABS = [
    "01 Deliveries",
    "02 Cold Storage",
    "03a Process Room Temps",
    "03b Process Room Diary",
    "04 Cleaning",
    "05 Calibration",
    "06 Mince & Prep",
    "07 Product Returns",
    "08 Corrective Actions",
    "09a Weekly Reviews",
    "09b Monthly Reviews",
    "10 Health & People",
    "11a Staff Training",
    "11b Allergen Training",
  ];

  const EXPECTED_HEADERS: Record<string, string[]> = {
    "01 Deliveries": [
      "Date", "Time", "Supplier", "Product", "Species", "Category",
      "Temp °C", "Status", "Contamination", "Batch No", "Delivery No",
      "Born in", "Reared in", "Slaughter site", "Cut site", "Notes",
      "Allergens identified", "Allergen detail",
      "Submitted by", "CA logged", "CA resolved", "CA deviation", "CA action taken", "CA disposition",
    ],
    "02 Cold Storage": [
      "Date", "Session", "Unit", "Unit Type", "Target Temp °C", "Max Temp °C",
      "Temp °C", "Status", "Comments", "Submitted by",
      "CA logged", "CA resolved", "CA deviation", "CA action taken", "CA disposition",
    ],
    "03a Process Room Temps": [
      "Date", "Session", "Product Temp °C", "Room Temp °C", "Product Pass", "Room Pass", "Overall",
      "CA logged", "CA resolved", "CA deviation", "CA action taken", "CA disposition", "Submitted by",
    ],
    "03b Process Room Diary": [
      "Date", "Phase", "Checks Passed", "Total Checks", "Issues", "Action Taken", "Submitted by",
    ],
    "04 Cleaning": [
      "Date", "Time", "What was cleaned", "Sanitiser °C", "Sanitiser pass", "Issues", "Action taken", "Verified by",
      "CA logged", "CA resolved", "CA deviation", "CA action taken",
    ],
    "05 Calibration": [
      "Date", "Time", "Probe ID", "Mode", "Ice water °C", "Ice pass", "Boiling water °C", "Boiling pass", "Overall",
      "Cert reference", "Purchase date", "Action taken", "Verified by", "CA logged", "CA resolved", "CA deviation", "CA action taken",
    ],
    "06 Mince & Prep": [
      "Date", "Time", "Species", "Batch code", "Mode", "Input temp °C", "Input pass", "Output temp °C", "Output pass",
      "Kill date", "Days from kill", "Kill limit pass", "CA note", "Source batches", "Linked CA", "CA resolved",
    ],
    "07 Product Returns": [
      "Date", "Time", "Customer", "Product", "Return code", "Code description", "Safety critical", "Temp °C",
      "Disposition", "Batch number", "Corrective action", "Verified by",
    ],
    "08 Corrective Actions": [
      "Date", "CCP ref", "Source section", "Deviation", "Action taken", "Product disposition", "Recurrence prevention",
      "Mgmt verification required", "Resolved", "Verified at", "Actioned by",
    ],
    "09a Weekly Reviews": [
      "Week ending", "Problems found", "Total assessments", "Issues detail", "Submitted by",
    ],
    "09b Monthly Reviews": [
      "Month", "Equipment fails", "Facilities fails", "System review fails", "Further notes", "Submitted by",
    ],
    "10 Health & People": [
      "Date", "Type", "Name", "Company (visitor)", "Fit for work", "Exclusion reason", "Illness type",
      "Absence from", "Absence to", "Manager signed by",
    ],
    "11a Staff Training": [
      "Staff name", "Job role", "Training type", "Document version", "Completed", "Refresh due", "Status", "Supervisor",
    ],
    "11b Allergen Training": [
      "Staff name", "Job role", "Completed", "Refresh due", "Status", "Supervisor", "Allergens confirmed", "Understanding confirmed",
    ],
  };

  function headerRow(ws: XLSX.WorkSheet): string[] {
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    return (aoa[0] ?? []).map(String);
  }

  it("produces a parseable workbook with exactly 14 tabs in order + headers (empty data)", async () => {
    const empty: AuditExportRawData = {
      deliveries: [],
      deliveriesCa: {},
      coldStorage: [],
      coldStorageCa: {},
      processTemps: [],
      processTempsCa: {},
      diary: [],
      cleaning: [],
      cleaningCa: {},
      calibration: [],
      calibrationCa: {},
      mince: [],
      minceCa: {},
      returns: [],
      cas: [],
      weekly: [],
      monthly: [],
      health: [],
      staffTraining: [],
      allergenTraining: [],
    };
    const svc = makeService({ auditExport: empty });
    const buf = await svc.buildAuditWorkbook("2026-06-01", "2026-06-30");

    expect(Buffer.isBuffer(buf)).toBe(true);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(EXPECTED_TABS);
    expect(wb.SheetNames).toHaveLength(14);

    for (const tab of EXPECTED_TABS) {
      expect(headerRow(wb.Sheets[tab])).toEqual(EXPECTED_HEADERS[tab]);
    }
  });

  it("writes a deliveries data row with the verbatim cell shaping", async () => {
    const data: AuditExportRawData = {
      deliveries: [
        {
          id: "d1",
          date: "2026-06-22",
          time_of_delivery: "09:00",
          supplier: "Acme",
          product: "Lamb",
          species: "lamb",
          product_category: "lamb",
          temperature_c: 3,
          temp_status: "pass",
          covered_contaminated: "no",
          batch_number: "B1",
          delivery_number: "D1",
          born_in: "UK",
          reared_in: "UK",
          slaughter_site: "S",
          cut_site: "C",
          notes: null,
          allergens_identified: true,
          allergen_notes: "celery",
          users: { name: "Bob" },
        },
      ],
      deliveriesCa: {
        d1: {
          resolved: true,
          deviation_description: "dev",
          action_taken: "act",
          product_disposition: "destroy",
        },
      },
      coldStorage: [],
      coldStorageCa: {},
      processTemps: [],
      processTempsCa: {},
      diary: [],
      cleaning: [],
      cleaningCa: {},
      calibration: [],
      calibrationCa: {},
      mince: [],
      minceCa: {},
      returns: [],
      cas: [],
      weekly: [],
      monthly: [],
      health: [],
      staffTraining: [],
      allergenTraining: [],
    };
    const svc = makeService({ auditExport: data });
    const buf = await svc.buildAuditWorkbook("2026-06-01", "2026-06-30");
    const wb = XLSX.read(buf, { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets["01 Deliveries"], {
      header: 1,
    }) as unknown[][];
    const row = aoa[1];
    expect(row[0]).toBe("2026-06-22");
    expect(row[6]).toBe(3); // Temp °C
    expect(row[16]).toBe("Yes"); // Allergens identified
    expect(row[18]).toBe("Bob"); // Submitted by
    expect(row[19]).toBe("Yes"); // CA logged
    expect(row[20]).toBe("Yes"); // CA resolved
    expect(row[21]).toBe("dev"); // CA deviation
    expect(row[23]).toBe("destroy"); // CA disposition
  });

  // ── T1 (F-19 PR8): populated-row cell assertions for the non-trivial tabs ──
  // Pins the verbatim cell shaping of every sheet whose mapping is more than a
  // straight column echo — so a future refactor can't silently drift a
  // food-safety value (a wrong "Pass/Fail", a missed 82 °C flag, a mis-counted
  // ${n}/14). Each test seeds ONE section and parses that tab's data row.

  /** Build a fully-empty AuditExportRawData, overlaying the given fields. */
  function emptyExport(
    over: Partial<AuditExportRawData> = {},
  ): AuditExportRawData {
    return {
      deliveries: [],
      deliveriesCa: {},
      coldStorage: [],
      coldStorageCa: {},
      processTemps: [],
      processTempsCa: {},
      diary: [],
      cleaning: [],
      cleaningCa: {},
      calibration: [],
      calibrationCa: {},
      mince: [],
      minceCa: {},
      returns: [],
      cas: [],
      weekly: [],
      monthly: [],
      health: [],
      staffTraining: [],
      allergenTraining: [],
      ...over,
    };
  }

  /** Parse one sheet's first data row (row index 1, after the header row). */
  async function dataRow(
    over: Partial<AuditExportRawData>,
    tab: string,
  ): Promise<unknown[]> {
    const svc = makeService({ auditExport: emptyExport(over) });
    const buf = await svc.buildAuditWorkbook("2026-06-01", "2026-06-30");
    const wb = XLSX.read(buf, { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[tab], {
      header: 1,
    }) as unknown[][];
    return aoa[1];
  }

  it("05 Calibration — certified probe → Overall 'Certified', ice/boiling 'Yes'", async () => {
    const row = await dataRow(
      {
        calibration: [
          {
            id: "c1",
            date: "2026-06-10",
            time_of_check: "09:30:00",
            thermometer_id: "T1",
            calibration_mode: "certified_probe",
            ice_water_result_c: 0.2,
            ice_water_pass: true,
            boiling_water_result_c: 99.8,
            boiling_water_pass: true,
            cert_reference: "CERT-99",
            users: { name: "Ann" },
          },
        ],
      },
      "05 Calibration",
    );
    expect(row[1]).toBe("09:30"); // Time (slice 0,5)
    expect(row[5]).toBe("Yes"); // Ice pass
    expect(row[7]).toBe("Yes"); // Boiling pass
    expect(row[8]).toBe("Certified"); // Overall
  });

  it("05 Calibration — manual probe failing → Overall 'Fail', boiling 'No'", async () => {
    const row = await dataRow(
      {
        calibration: [
          {
            id: "c2",
            date: "2026-06-11",
            time_of_check: "10:00:00",
            thermometer_id: "T2",
            calibration_mode: "manual",
            ice_water_result_c: 1,
            ice_water_pass: true,
            boiling_water_result_c: 95,
            boiling_water_pass: false,
            users: { name: "Ben" },
          },
        ],
      },
      "05 Calibration",
    );
    expect(row[5]).toBe("Yes"); // Ice pass
    expect(row[7]).toBe("No"); // Boiling pass
    expect(row[8]).toBe("Fail"); // Overall (manual + a false)
  });

  it("04 Cleaning — sanitiser >= 82 → 'Yes'; null temp → '' for the pass cell", async () => {
    const pass = await dataRow(
      {
        cleaning: [
          {
            id: "cl1",
            date: "2026-06-12",
            time_of_clean: "14:00:00",
            what_was_cleaned: "Block",
            sanitiser_temp_c: 84,
            issues: false,
            users: { name: "Cara" },
          },
        ],
      },
      "04 Cleaning",
    );
    expect(pass[3]).toBe(84); // Sanitiser °C
    expect(pass[4]).toBe("Yes"); // Sanitiser pass (>= 82)

    const below = await dataRow(
      {
        cleaning: [
          {
            id: "cl2",
            date: "2026-06-12",
            what_was_cleaned: "Bench",
            sanitiser_temp_c: 70,
            issues: false,
            users: { name: "Cara" },
          },
        ],
      },
      "04 Cleaning",
    );
    expect(below[4]).toBe("No"); // 70 < 82

    const nullTemp = await dataRow(
      {
        cleaning: [
          {
            id: "cl3",
            date: "2026-06-12",
            what_was_cleaned: "Floor",
            sanitiser_temp_c: null,
            issues: false,
            users: { name: "Cara" },
          },
        ],
      },
      "04 Cleaning",
    );
    // null temp → '' (the pass cell is blank, not 'Yes'/'No')
    expect(nullTemp[3]).toBe(""); // Sanitiser °C blank (temp ?? '')
    expect(nullTemp[4]).toBe(""); // Sanitiser pass blank
  });

  it("06 Mince & Prep — source_batch_numbers.join(', ') + input/output pass flags", async () => {
    const row = await dataRow(
      {
        mince: [
          {
            id: "m1",
            date: "2026-06-13",
            time_of_production: "11:15:00",
            product_species: "beef",
            batch_code: "BC1",
            output_mode: "mince",
            input_temp_c: 2,
            input_temp_pass: true,
            output_temp_c: 4,
            output_temp_pass: false,
            kill_date: "2026-06-10",
            days_from_kill: 3,
            kill_date_within_limit: true,
            corrective_action: null,
            source_batch_numbers: ["B100", "B200"],
            users: { name: "Dan" },
          },
        ],
      },
      "06 Mince & Prep",
    );
    expect(row[6]).toBe("Yes"); // Input pass
    expect(row[8]).toBe("No"); // Output pass
    expect(row[11]).toBe("Yes"); // Kill limit pass
    expect(row[13]).toBe("B100, B200"); // Source batches join
  });

  it("07 Product Returns — SAFETY code → 'Yes', non-safety → 'No', CODE_LABELS map", async () => {
    const safety = await dataRow(
      {
        returns: [
          {
            date: "2026-06-14",
            time_of_return: "16:00:00",
            customer: "Cust",
            product: "Lamb",
            return_code: "RC04",
            temperature_c: 8,
            disposition: "destroy",
          },
        ],
      },
      "07 Product Returns",
    );
    expect(safety[5]).toBe("Contamination"); // CODE_LABELS[RC04]
    expect(safety[6]).toBe("Yes"); // Safety critical (RC04 in SAFETY)

    const nonSafety = await dataRow(
      {
        returns: [
          {
            date: "2026-06-14",
            customer: "Cust",
            product: "Beef",
            return_code: "RC06",
          },
        ],
      },
      "07 Product Returns",
    );
    expect(nonSafety[5]).toBe("Quantity"); // CODE_LABELS[RC06]
    expect(nonSafety[6]).toBe("No"); // RC06 not in SAFETY
  });

  it("09b Monthly Reviews — invertFail rule counts system-review fails correctly", async () => {
    const row = await dataRow(
      {
        monthly: [
          {
            month_year: "2026-06-01",
            equipment_checks: { fridge: true, slicer: false }, // 1 fail
            facilities_checks: { drains: true }, // 0 fails
            haccp_system_review: [
              { result: "YES", invertFail: false }, // pass (not inverted, YES)
              { result: "NO", invertFail: false }, // FAIL (not inverted, not YES)
              { result: "YES", invertFail: true }, // FAIL (inverted, YES)
              { result: "NO", invertFail: true }, // pass (inverted, not YES)
            ],
            users: { name: "Eve" },
          },
        ],
      },
      "09b Monthly Reviews",
    );
    expect(row[0]).toBe("2026-06"); // Month (slice 0,7)
    expect(row[1]).toBe(1); // Equipment fails
    expect(row[2]).toBe(0); // Facilities fails
    expect(row[3]).toBe(2); // System review fails (invertFail-aware)
  });

  it("11a Staff Training — refresh status Overdue (past) vs Current (far future)", async () => {
    const overdue = await dataRow(
      {
        staffTraining: [
          {
            staff_name: "Stu",
            job_role: "butcher",
            training_type: "butchery_process_room",
            document_version: "v1",
            completion_date: "2020-01-01",
            refresh_date: "2000-01-01", // far past → Overdue
            supervisor_name: "Sup",
          },
        ],
      },
      "11a Staff Training",
    );
    expect(overdue[2]).toBe("Butchery & Process Room"); // TYPE_LABELS
    expect(overdue[6]).toBe("Overdue");

    const current = await dataRow(
      {
        staffTraining: [
          {
            staff_name: "Stu",
            training_type: "warehouse_operative",
            completion_date: "2099-01-01",
            refresh_date: "2099-01-01", // far future → Current
          },
        ],
      },
      "11a Staff Training",
    );
    expect(current[2]).toBe("Warehouse Operative");
    expect(current[6]).toBe("Current");
  });

  it("11b Allergen Training — ${aCount}/14 + ${uCount}/5 confirmation counts", async () => {
    const row = await dataRow(
      {
        allergenTraining: [
          {
            staff_name: "Al",
            job_role: "warehouse",
            certification_date: "2099-01-01",
            refresh_date: "2099-01-01",
            supervisor_name: "Sup",
            confirmation_items: {
              a1: true,
              a2: true,
              a3: false, // 2 allergens confirmed
              u1: true,
              u2: true,
              u3: true,
              u4: false, // 3 understanding confirmed
            },
          },
        ],
      },
      "11b Allergen Training",
    );
    expect(row[4]).toBe("Current"); // Status (far-future refresh)
    expect(row[6]).toBe("2/14"); // Allergens confirmed
    expect(row[7]).toBe("3/5"); // Understanding confirmed
  });
});
