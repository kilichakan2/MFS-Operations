/**
 * tests/unit/services/HaccpDailyChecksService.test.ts
 *
 * F-19 PR1 — the validation cascades (EXACT message strings per sub-domain),
 * the lifted pure helpers (tempStatus / batch-code / kill-date / temp-pass), and
 * the per-sub-domain CA-row builders, all against the Fake daily-checks repo.
 *
 * The CA-builder assertions pin the heterogeneous payloads byte-identically:
 *   - delivery fans out up to 3 CA rows (temp + contam + allergen), all
 *     `resolved:false`;
 *   - the diary CA rows carry `null` disposition/recurrence;
 *   - product-return writes a CA row on EVERY post (SOP-12);
 *   - timesep writes NO CA row (no builder exists for it).
 */
import { describe, it, expect } from "vitest";
import { createHaccpDailyChecksService } from "@/lib/services";
import { createFakeHaccpDailyChecksRepository } from "@/lib/adapters/fake";
import type {
  CreateDeliveryInput,
  CreateColdStorageReadingsInput,
  ColdStorageUnit,
  CreateCalibrationManualInput,
  CreateCleaningInput,
  CreateProcessingTempInput,
  CreateDailyDiaryInput,
  CreateMinceInput,
  CreateMeatPrepInput,
  CreateTimeSeparationInput,
  CreateReturnInput,
} from "@/lib/domain";

function svc() {
  return createHaccpDailyChecksService({
    dailyChecks: createFakeHaccpDailyChecksRepository(),
  });
}

const TODAY = "2026-06-22";

describe("HaccpDailyChecksService — lifted pure helpers", () => {
  it("deliveryTempStatus matches the route cascades", () => {
    const s = svc();
    expect(s.deliveryTempStatus(null, "dry_goods")).toBe("pass");
    expect(s.deliveryTempStatus(4, "beef")).toBe("pass");
    expect(s.deliveryTempStatus(7, "beef")).toBe("urgent");
    expect(s.deliveryTempStatus(9, "beef")).toBe("fail");
    expect(s.deliveryTempStatus(2, "offal")).toBe("pass");
    expect(s.deliveryTempStatus(4, "offal")).toBe("fail");
    expect(s.deliveryTempStatus(-19, "frozen")).toBe("pass");
    expect(s.deliveryTempStatus(-16, "frozen")).toBe("urgent");
    expect(s.deliveryTempStatus(null, "beef")).toBe("fail");
  });

  it("coldStorageTempStatus, batch-code, kill-date and temp-pass helpers", () => {
    const s = svc();
    expect(s.coldStorageTempStatus(3, 5, 8)).toBe("pass");
    expect(s.coldStorageTempStatus(6, 5, 8)).toBe("amber");
    expect(s.coldStorageTempStatus(9, 5, 8)).toBe("critical");
    expect(s.buildBatchNumber("2026-06-22", "GB", 3, true)).toBe("2206-GB-3");
    expect(s.buildBatchNumber("2026-06-22", "poultry", 1, false)).toBe(
      "2206-POL-1",
    );
    expect(s.buildBatchCode("mince", "2026-06-22", "imported_vac", 2)).toBe(
      "MINCE-2206-IMPVAC-2",
    );
    expect(s.killDatePass("beef", 6)).toBe(true);
    expect(s.killDatePass("beef", 7)).toBe(false);
    expect(s.killDatePass("imported_vac", 99)).toBe(true);
    expect(s.killDateHardFail("beef", 7)).toBe(true);
    expect(s.inputTempPass(7)).toBe(true);
    expect(s.inputTempPass(8)).toBe(false);
    expect(s.outputTempPass(2, "mince", "chilled")).toBe(true);
    expect(s.outputTempPass(4, "meatprep", "chilled")).toBe(true);
    expect(s.outputTempPass(-18, "mince", "frozen")).toBe(true);
  });
});

describe("HaccpDailyChecksService — delivery", () => {
  const base: CreateDeliveryInput = {
    product: "Lamb shoulder",
    product_category: "lamb",
    temperature_c: 3,
    covered_contaminated: "no",
    born_in: "GB",
    reared_in: "GB",
    slaughter_site: "S1",
    cut_site: "C1",
    allergens_identified: false,
  };

  it("required-field + traceability + CA cascade strings", () => {
    const s = svc();
    expect(
      s.validateDelivery({
        input: { ...base, supplier_id: undefined, supplier_name: undefined },
        supplier: null,
        tempStatus: "pass",
      }),
    ).toMatchObject({ ok: false, message: "Supplier is required" });

    expect(
      s.validateDelivery({
        input: { ...base, supplier_name: "Acme", product: "" },
        supplier: null,
        tempStatus: "pass",
      }),
    ).toMatchObject({ message: "Product description is required" });

    expect(
      s.validateDelivery({
        input: { ...base, supplier_name: "Acme", born_in: "" },
        supplier: null,
        tempStatus: "pass",
      }),
    ).toMatchObject({ message: "Traceability required: Born in" });

    expect(
      s.validateDelivery({
        input: { ...base, supplier_name: "Acme" },
        supplier: null,
        tempStatus: "fail",
      }),
    ).toMatchObject({
      message: "Corrective action required for temperature deviation",
    });

    expect(
      s.validateDelivery({
        input: {
          ...base,
          supplier_name: "Acme",
          corrective_action_temp: {
            cause: "Bad cause",
            disposition: "Reject",
            recurrence: "x",
          },
        },
        supplier: null,
        tempStatus: "fail",
      }),
    ).toMatchObject({ message: "Invalid temperature cause: Bad cause" });

    expect(
      s.validateDelivery({
        input: {
          ...base,
          supplier_name: "Acme",
          covered_contaminated: "yes",
          contamination_type: "uncovered",
          corrective_action_contam: {
            cause: "Supplier loading error",
            disposition: "Nope",
            recurrence: "x",
          },
        },
        supplier: null,
        tempStatus: "pass",
      }),
    ).toMatchObject({ message: "Invalid disposition: Nope" });
  });

  it("unknown / inactive supplier_id rejections", () => {
    const s = svc();
    expect(
      s.validateDelivery({
        input: { ...base, supplier_id: "s1" },
        supplier: null,
        tempStatus: "pass",
      }),
    ).toMatchObject({ message: "Unknown supplier" });
    expect(
      s.validateDelivery({
        input: { ...base, supplier_id: "s1" },
        supplier: { id: "s1", name: "Old", active: false },
        tempStatus: "pass",
      }),
    ).toMatchObject({ message: "Supplier is no longer approved" });
  });

  it("buildDelivery + CA fan-out: temp + contam + allergen → 3 rows, all resolved:false", () => {
    const s = svc();
    const input: CreateDeliveryInput = {
      supplier_name: "Acme",
      product: "Lamb",
      product_category: "lamb",
      temperature_c: 9, // fail
      covered_contaminated: "yes",
      contamination_type: "uncovered",
      born_in: "GB",
      reared_in: "GB",
      slaughter_site: "S1",
      cut_site: "C1",
      allergens_identified: true, // allergen CA (lamb is in the CA set)
      corrective_action_temp: {
        cause: "Other",
        disposition: "Reject",
        recurrence: "Review",
      },
      corrective_action_contam: {
        cause: "Supplier loading error",
        disposition: "Assess",
        recurrence: "Check",
      },
    };
    const built = s.buildDelivery({
      input,
      userId: "u1",
      today: TODAY,
      nowTime: "10:00:00",
      resolvedSupplierId: null,
      resolvedSupplierName: "Acme",
      deliveryNumber: 1,
    });
    expect(built.tempStatus).toBe("fail");
    expect(built.persist.batch_number).toBe("2206-GB-1");
    expect(built.persist.corrective_action_required).toBe(true);

    const cas = s.buildDeliveryCorrectiveActions({
      input,
      userId: "u1",
      sourceId: "src1",
      tempStatus: built.tempStatus,
    });
    expect(cas).toHaveLength(3);
    expect(cas.every((c) => c.resolved === false)).toBe(true);
    expect(cas[0].product_disposition).toBe("reject"); // mapped enum
    expect(cas[0].management_verification_required).toBe(true); // status==='fail'
    expect(cas[2].product_disposition).toBe(
      "Quarantine — pending management review",
    );
  });
});

describe("HaccpDailyChecksService — cold-storage", () => {
  const units: ColdStorageUnit[] = [
    { id: "u1", name: "Chiller 1", unit_type: "chiller", target_temp_c: 5, max_temp_c: 8 },
  ];

  it("validation cascade strings", () => {
    const s = svc();
    const ok: CreateColdStorageReadingsInput = {
      session: "AM",
      date: TODAY,
      readings: [{ unit_id: "u1", temperature_c: 3, unit_type: "chiller" }],
      comments: "",
    };
    expect(
      s.validateColdStorage({ input: { ...ok, readings: [] }, today: TODAY, units, hasDeviation: false }),
    ).toMatchObject({ message: "Missing required fields" });
    expect(
      s.validateColdStorage({ input: { ...ok, date: "2026-06-21" }, today: TODAY, units, hasDeviation: false }),
    ).toMatchObject({ message: "Readings may only be submitted for today's date." });
    expect(
      s.validateColdStorage({
        input: { ...ok, readings: [{ unit_id: "ghost", temperature_c: 3, unit_type: "chiller" }] },
        today: TODAY,
        units,
        hasDeviation: false,
      }),
    ).toMatchObject({ message: "Unknown or inactive unit: ghost" });
    expect(
      s.validateColdStorage({ input: ok, today: TODAY, units, hasDeviation: true }),
    ).toMatchObject({ message: "Corrective action required for deviation" });
    expect(
      s.validateColdStorage({
        input: { ...ok, corrective_action: { cause: "Nope", disposition: "Accept", recurrence: "x" } },
        today: TODAY,
        units,
        hasDeviation: true,
      }),
    ).toMatchObject({ message: "Invalid cause: Nope" });
  });

  it("buildColdStorage flags deviation + CA fan-out per deviating reading", () => {
    const s = svc();
    const input: CreateColdStorageReadingsInput = {
      session: "AM",
      date: TODAY,
      readings: [
        { unit_id: "u1", temperature_c: 9, unit_type: "chiller" }, // critical
      ],
      comments: "warm",
      corrective_action: { cause: "Equipment failure", disposition: "Assess", recurrence: "fix" },
    };
    const built = s.buildColdStorage({ input, userId: "u1", units });
    expect(built.hasDeviation).toBe(true);
    expect(built.rows[0].temp_status).toBe("critical");

    const cas = s.buildColdStorageCorrectiveActions({
      input,
      userId: "u1",
      inserted: [
        { id: "r1", unit_id: "u1", temperature_c: 9, temp_status: "critical" },
      ],
      units,
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].ccp_ref).toBe("CCP2");
    expect(cas[0].management_verification_required).toBe(true);
    expect(cas[0].product_disposition).toBe("assess");
  });
});

describe("HaccpDailyChecksService — calibration", () => {
  it("manual + certified validation strings + ice/boil pass-band", () => {
    const s = svc();
    expect(
      s.validateCalibrationCertified({
        calibration_mode: "certified_probe",
        thermometer_id: "",
        cert_reference: "C1",
        purchase_date: "2026-01-01",
        verified_by: "v",
      }),
    ).toMatchObject({ message: "Probe ID / name is required" });

    const manualBase: CreateCalibrationManualInput = {
      thermometer_id: "P1",
      ice_water_result_c: 0,
      boiling_water_result_c: 100,
      verified_by: "v",
    };
    expect(s.validateCalibrationManual(manualBase)).toEqual({ ok: true });
    // fail band → CA required
    expect(
      s.validateCalibrationManual({ ...manualBase, ice_water_result_c: 5 }),
    ).toMatchObject({ message: "Corrective action is required when a test fails" });

    const cas = s.buildCalibrationCorrectiveActions({
      input: {
        ...manualBase,
        ice_water_result_c: 5, // fails -1..1
        corrective_action: { cause: "Drift", disposition: "Replace", recurrence: "monthly" },
      },
      userId: "u1",
      sourceId: "cal1",
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].product_disposition).toBe("assess");
    expect(cas[0].management_verification_required).toBe(true);
  });
});

describe("HaccpDailyChecksService — cleaning", () => {
  it("validation + issues→CA gate", () => {
    const s = svc();
    const base: CreateCleaningInput = {
      what_was_cleaned: "Floor",
      issues: false,
      verified_by: "v",
    };
    expect(
      s.validateCleaning({ ...base, what_was_cleaned: "" }),
    ).toMatchObject({ message: "Select at least one item that was cleaned" });
    expect(s.validateCleaning({ ...base, verified_by: "" })).toMatchObject({
      message: "Verified by is required",
    });
    expect(s.validateCleaning({ ...base, issues: true })).toMatchObject({
      message: "Corrective action is required when issues are reported",
    });
    const cas = s.buildCleaningCorrectiveActions({
      input: {
        ...base,
        issues: true,
        corrective_action: { cause: "x", disposition: "Equipment isolated", recurrence: "r" },
      },
      userId: "u1",
      sourceId: "cl1",
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].product_disposition).toBe("conditional_accept");
    expect(cas[0].management_verification_required).toBe(false);
  });
});

describe("HaccpDailyChecksService — process-room", () => {
  it("temps validation + diary CA carries null disposition/recurrence", () => {
    const s = svc();
    const temps: CreateProcessingTempInput = {
      session: "AM",
      date: TODAY,
      product_temp_c: 5, // > 4 → deviation
      room_temp_c: 10,
    };
    expect(s.validateProcessingTemp({ input: temps, today: TODAY })).toMatchObject({
      message: "Corrective action required for deviation",
    });

    const diary: CreateDailyDiaryInput = {
      phase: "opening",
      date: TODAY,
      check_results: { doors: false, lights: true },
      issues: true,
      what_did_you_do: "fixed",
    };
    expect(s.validateDailyDiary({ input: diary, today: TODAY })).toEqual({ ok: true });
    const cas = s.buildDailyDiaryCorrectiveActions({
      input: diary,
      userId: "u1",
      sourceId: "dia1",
    });
    expect(cas).toHaveLength(1); // only the failed `doors`
    expect(cas[0].product_disposition).toBeNull();
    expect(cas[0].recurrence_prevention).toBeNull();
    expect(cas[0].ccp_ref).toBe("SOP1-opening");
  });
});

describe("HaccpDailyChecksService — mince-prep", () => {
  it("mince species + kill-date hard-fail + temp-pass dispatch", () => {
    const s = svc();
    const base: CreateMinceInput = {
      form: "mince",
      product_species: "beef",
      kill_date: "2026-06-20",
      input_temp_c: 4,
      output_temp_c: 1,
    };
    expect(
      s.validateMince({ input: { ...base, product_species: "pork" }, daysFromKill: 2 }),
    ).toMatchObject({ message: "Species must be lamb, beef, or imported_vac" });
    expect(s.validateMince({ input: base, daysFromKill: 7 })).toMatchObject({
      message:
        "Kill date exceeded (7 days) — DO NOT MINCE. Segregate and return to supplier or dispose as Category 3 ABP.",
    });
    expect(
      s.validateMince({ input: { ...base, input_temp_c: 8 }, daysFromKill: 2 }),
    ).toMatchObject({ message: "Corrective action is required for temperature deviation" });

    const cas = s.buildMinceCorrectiveActions({
      input: {
        ...base,
        input_temp_c: 8, // fails ≤7
        corrective_action: { cause: "Warm", disposition: "Assess", recurrence: "r", notes: "n" },
      },
      userId: "u1",
      sourceId: "m1",
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].ccp_ref).toBe("CCP-M1");
    expect(cas[0].recurrence_prevention).toBe("r | Notes: n");

    // meatprep validation
    const mp: CreateMeatPrepInput = {
      form: "meatprep",
      product_name: "Burgers",
      input_temp_c: 4,
      output_temp_c: 3,
    };
    expect(s.validateMeatPrep({ ...mp, product_name: "" })).toMatchObject({
      message: "Product name is required",
    });
    expect(s.validateMeatPrep(mp)).toEqual({ ok: true });
  });

  it("timesep validation + persist has NO CA builder (timesep never files a CA row)", () => {
    const s = svc();
    const ts: CreateTimeSeparationInput = {
      form: "timesep",
      clean_completed_time: "12:00",
      clean_verified_by: "v",
      allergens_in_production: "none",
    };
    expect(
      s.validateTimeSeparation({ ...ts, clean_completed_time: "" }),
    ).toMatchObject({ message: "Clean completed time is required" });
    expect(s.validateTimeSeparation(ts)).toEqual({ ok: true });
    const persist = s.buildTimeSeparation({
      input: { ...ts, corrective_action: " note " },
      userId: "u1",
      today: TODAY,
      nowTime: "12:00:00",
    });
    expect(persist.corrective_action).toBe("note");
    // There is deliberately no buildTimeSeparationCorrectiveActions on the
    // service — timesep never writes to haccp_corrective_actions.
    expect(
      (s as unknown as Record<string, unknown>)
        .buildTimeSeparationCorrectiveActions,
    ).toBeUndefined();
  });
});

describe("HaccpDailyChecksService — product-return", () => {
  it("validation + ALWAYS-1-row CA (SOP-12), food-safety code → mgmt verification", () => {
    const s = svc();
    const base: CreateReturnInput = {
      customer: "Cust",
      product: "Sausages",
      return_code: "RC03",
      disposition: "dispose",
      verified_by: "v",
    };
    expect(s.validateReturn({ ...base, customer: "" })).toMatchObject({
      message: "Customer is required",
    });
    expect(s.validateReturn({ ...base, return_code: "RC08" })).toMatchObject({
      message: "Please specify the reason for RC08 Other",
    });
    expect(
      s.validateReturn({ ...base, return_code: "RC01", temperature_c: null }),
    ).toMatchObject({ message: "Temperature is required for temperature complaints" });

    // Non-food-safety code → CA still written, mgmt verification false.
    const cas1 = s.buildReturnCorrectiveActions({ input: base, userId: "u1", sourceId: "rt1" });
    expect(cas1).toHaveLength(1);
    expect(cas1[0].ccp_ref).toBe("SOP12");
    expect(cas1[0].management_verification_required).toBe(false);

    // Food-safety code RC01 → mgmt verification true.
    const cas2 = s.buildReturnCorrectiveActions({
      input: { ...base, return_code: "RC01", temperature_c: 9 },
      userId: "u1",
      sourceId: "rt2",
    });
    expect(cas2[0].management_verification_required).toBe(true);
    expect(cas2[0].deviation_description).toContain("Temperature 9°C on return.");
  });
});
