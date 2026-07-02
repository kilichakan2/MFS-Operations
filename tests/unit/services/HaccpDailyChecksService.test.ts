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
 *   - timesep files a CA row only when its free-text corrective action is
 *     non-empty (bug fix 1 — contract pinned in the .mincePrep twin).
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
  GoodsInThreshold,
  MinceThreshold,
} from "@/lib/domain";
import { COLD_STORAGE_CAUSES } from "@/lib/domain";

function svc() {
  return createHaccpDailyChecksService({
    dailyChecks: createFakeHaccpDailyChecksRepository(),
  });
}

const TODAY = "2026-06-22";

// CCP-1 bands are DB-driven since the Goods In unit — the fixture mirrors the
// migration seed for the categories exercised here (values unchanged for these
// categories, so every verdict below is byte-identical to the old cascades).
function giRow(
  category: string,
  pass_max_c: number | null,
  amber_max_c: number | null,
  position: number,
): GoodsInThreshold {
  return {
    id: `00000000-0000-0000-0000-${String(position).padStart(12, "0")}`,
    category,
    label: category,
    pass_max_c,
    amber_max_c,
    position,
  };
}
const GI_THRESHOLDS: readonly GoodsInThreshold[] = [
  giRow("lamb", 5.0, 8.0, 1),
  giRow("beef", 5.0, 8.0, 2),
  giRow("offal", 3.0, null, 3),
  giRow("frozen", -18.0, -15.0, 4),
  giRow("dry_goods", null, null, 9),
];

// CCP-M bands are DB-driven since the mince unit — the fixture mirrors the
// migration seed (values unchanged, so every verdict below is byte-identical
// to the old hardcoded cascades).
function mRow(
  key: string,
  kind: "temp" | "kill_days",
  pass_max: number | null,
  amber_max: number | null,
  position: number,
): MinceThreshold {
  return {
    id: `00000000-0000-0000-0000-${String(position + 20).padStart(12, "0")}`,
    key,
    label: key,
    kind,
    pass_max,
    amber_max,
    position,
  };
}
const M_THRESHOLDS: readonly MinceThreshold[] = [
  mRow("mince_input", "temp", 7.0, 8.0, 1),
  mRow("mince_output_chilled", "temp", 2.0, 3.0, 2),
  mRow("mince_output_frozen", "temp", -18.0, -17.0, 3),
  mRow("prep_input", "temp", 7.0, 8.0, 4),
  mRow("prep_output_chilled", "temp", 4.0, 5.0, 5),
  mRow("prep_output_frozen", "temp", -18.0, -17.0, 6),
  mRow("kill_days_lamb", "kill_days", 6, null, 7),
  mRow("kill_days_beef", "kill_days", 6, null, 8),
  mRow("kill_days_imported_vac", "kill_days", null, null, 9),
];

describe("HaccpDailyChecksService — lifted pure helpers", () => {
  it("deliveryTempStatus matches the route cascades", () => {
    const s = svc();
    expect(s.deliveryTempStatus(null, "dry_goods", GI_THRESHOLDS)).toBe("pass");
    expect(s.deliveryTempStatus(4, "beef", GI_THRESHOLDS)).toBe("pass");
    expect(s.deliveryTempStatus(7, "beef", GI_THRESHOLDS)).toBe("urgent");
    expect(s.deliveryTempStatus(9, "beef", GI_THRESHOLDS)).toBe("fail");
    expect(s.deliveryTempStatus(2, "offal", GI_THRESHOLDS)).toBe("pass");
    expect(s.deliveryTempStatus(4, "offal", GI_THRESHOLDS)).toBe("fail");
    expect(s.deliveryTempStatus(-19, "frozen", GI_THRESHOLDS)).toBe("pass");
    expect(s.deliveryTempStatus(-16, "frozen", GI_THRESHOLDS)).toBe("urgent");
    expect(s.deliveryTempStatus(null, "beef", GI_THRESHOLDS)).toBe("fail");
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
    expect(s.killDatePass("beef", 6, M_THRESHOLDS)).toBe(true);
    expect(s.killDatePass("beef", 7, M_THRESHOLDS)).toBe(false);
    expect(s.killDatePass("imported_vac", 99, M_THRESHOLDS)).toBe(true);
    expect(s.killDateHardFail("beef", 7, M_THRESHOLDS)).toBe(true);
    expect(s.inputTempPass(7, "mince", M_THRESHOLDS)).toBe(true);
    expect(s.inputTempPass(8, "mince", M_THRESHOLDS)).toBe(false);
    expect(s.outputTempPass(2, "mince", "chilled", M_THRESHOLDS)).toBe(true);
    expect(s.outputTempPass(4, "meatprep", "chilled", M_THRESHOLDS)).toBe(true);
    expect(s.outputTempPass(-18, "mince", "frozen", M_THRESHOLDS)).toBe(true);
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
      thresholds: GI_THRESHOLDS,
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

  it("allergen-only delivery (temp pass, no contamination) → 0 CA rows (route gate parity)", () => {
    // The live route gates the ENTIRE CA-insert block on
    // (hasDeviationTemp || hasDeviationContam) — delivery/route.ts:498. The
    // allergen push lives INSIDE that gate, so an allergen-only delivery writes
    // the delivery row with corrective_action_required:true but ZERO CA rows
    // today. The builder must reproduce that: allergen alone opens NO CA rows.
    const s = svc();
    const input: CreateDeliveryInput = {
      supplier_name: "Acme",
      product: "Lamb",
      product_category: "lamb", // lamb is in ALLERGEN_CA_CATEGORIES
      temperature_c: 2, // pass — no temp deviation
      covered_contaminated: "no", // no contamination deviation
      allergens_identified: true, // allergen flagged
      born_in: "GB",
      reared_in: "GB",
      slaughter_site: "S1",
      cut_site: "C1",
    };
    const cas = s.buildDeliveryCorrectiveActions({
      input,
      userId: "u1",
      sourceId: "src1",
      tempStatus: "pass",
    });
    expect(cas).toEqual([]);
  });

  it("temp deviation WITH allergen → gate opens, allergen row IS emitted (2 rows)", () => {
    // Pins the OTHER side of the gate: once a temp (or contam) deviation opens
    // the gate, the allergen row is emitted exactly as the route does.
    const s = svc();
    const input: CreateDeliveryInput = {
      supplier_name: "Acme",
      product: "Lamb",
      product_category: "lamb",
      temperature_c: 9, // fail — opens the gate
      covered_contaminated: "no", // no contamination
      allergens_identified: true,
      born_in: "GB",
      reared_in: "GB",
      slaughter_site: "S1",
      cut_site: "C1",
      corrective_action_temp: {
        cause: "Other",
        disposition: "Reject",
        recurrence: "Review",
      },
    };
    const cas = s.buildDeliveryCorrectiveActions({
      input,
      userId: "u1",
      sourceId: "src1",
      tempStatus: "fail",
    });
    expect(cas).toHaveLength(2); // temp row + allergen row
    expect(cas[1].product_disposition).toBe(
      "Quarantine — pending management review",
    );
    expect(cas[1].management_verification_required).toBe(true);
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
      readings: [{ unit_id: "u1", temperature_c: 3 }],
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
        input: { ...ok, readings: [{ unit_id: "ghost", temperature_c: 3 }] },
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
        { unit_id: "u1", temperature_c: 9 }, // critical
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

  // ── bug fix: the two legitimate causes the client offers now validate ──
  it.each([
    "Defrost cycle — scheduled temperature rise",
    "High ambient room temperature",
  ])("accepts the previously-rejected cause %s on a deviation", (cause) => {
    const s = svc();
    const input: CreateColdStorageReadingsInput = {
      session: "AM",
      date: TODAY,
      readings: [{ unit_id: "u1", temperature_c: 7 }], // 5<7<=8 → amber deviation
      comments: "",
      corrective_action: {
        cause,
        disposition: "Conditional accept",
        recurrence: "Review defrost cycle schedule",
      },
    };
    expect(
      s.validateColdStorage({ input, today: TODAY, units, hasDeviation: true }),
    ).toEqual({ ok: true });
  });

  it("each new cause builds a CA row with non-empty action + mapped disposition", () => {
    const s = svc();
    for (const cause of [
      "Defrost cycle — scheduled temperature rise",
      "High ambient room temperature",
    ]) {
      const input: CreateColdStorageReadingsInput = {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: "u1", temperature_c: 7 }],
        comments: "",
        corrective_action: {
          cause,
          disposition: "Conditional accept",
          recurrence: "Improve room ventilation",
        },
      };
      const cas = s.buildColdStorageCorrectiveActions({
        input,
        userId: "u1",
        inserted: [
          { id: "r1", unit_id: "u1", temperature_c: 7, temp_status: "amber" },
        ],
        units,
      });
      expect(cas).toHaveLength(1);
      expect(cas[0].action_taken.length).toBeGreaterThan(0);
      expect(cas[0].product_disposition).toBe("conditional_accept");
      expect(cas[0].deviation_description).toContain(cause);
    }
  });

  it("still rejects a junk cause (allow-list not loosened beyond the two strings)", () => {
    const s = svc();
    const input: CreateColdStorageReadingsInput = {
      session: "AM",
      date: TODAY,
      readings: [{ unit_id: "u1", temperature_c: 7 }],
      comments: "",
      corrective_action: { cause: "banana", disposition: "Accept", recurrence: "x" },
    };
    expect(
      s.validateColdStorage({ input, today: TODAY, units, hasDeviation: true }),
    ).toMatchObject({ message: "Invalid cause: banana" });
  });

  it("rejects a physically-impossible reading via the shared entry bound", () => {
    const s = svc();
    const base: CreateColdStorageReadingsInput = {
      session: "AM",
      date: TODAY,
      readings: [{ unit_id: "u1", temperature_c: 300 }],
      comments: "",
    };
    expect(
      s.validateColdStorage({ input: base, today: TODAY, units, hasDeviation: false }),
    ).toMatchObject({ message: "Temperature out of range" });
    expect(
      s.validateColdStorage({
        input: { ...base, readings: [{ unit_id: "u1", temperature_c: -99 }] },
        today: TODAY,
        units,
        hasDeviation: false,
      }),
    ).toMatchObject({ message: "Temperature out of range" });
    // an in-range deviation passes the bound (only impossible values blocked)
    expect(
      s.validateColdStorage({
        input: {
          ...base,
          readings: [{ unit_id: "u1", temperature_c: 12 }],
          corrective_action: {
            cause: "Door left open",
            disposition: "Assess",
            recurrence: "Retrain staff on door discipline",
          },
        },
        today: TODAY,
        units,
        hasDeviation: true,
      }),
    ).toEqual({ ok: true });
  });

  it("server cause set is exactly the shared 8-cause domain constant (de-drift)", () => {
    const s = svc();
    // Every shared cause validates; nothing outside it does. Structural proof
    // that VALID_COLD_STORAGE_CAUSES is derived from COLD_STORAGE_CAUSES.
    expect(COLD_STORAGE_CAUSES).toHaveLength(8);
    for (const cause of COLD_STORAGE_CAUSES) {
      const r = s.validateColdStorage({
        input: {
          session: "AM",
          date: TODAY,
          readings: [{ unit_id: "u1", temperature_c: 7 }],
          comments: "",
          corrective_action: {
            cause,
            disposition: "Assess",
            recurrence: "r",
          },
        },
        today: TODAY,
        units,
        hasDeviation: true,
      });
      expect(r).toEqual({ ok: true });
    }
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
    expect(
      s.validateProcessingTemp({
        input: temps,
        today: TODAY,
        thresholds: [
          {
            id: "p-1",
            name: "Product core",
            target_temp_c: 4,
            max_temp_c: 7,
            active: true,
            position: 1,
          },
          {
            id: "r-1",
            name: "Room ambient",
            target_temp_c: 12,
            max_temp_c: 15,
            active: true,
            position: 2,
          },
        ],
      }),
    ).toMatchObject({
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
      s.validateMince({
        input: { ...base, product_species: "pork" },
        daysFromKill: 2,
        thresholds: M_THRESHOLDS,
      }),
    ).toMatchObject({ message: "Species must be lamb, beef, or imported_vac" });
    expect(
      s.validateMince({ input: base, daysFromKill: 7, thresholds: M_THRESHOLDS }),
    ).toMatchObject({
      message:
        "Kill date exceeded (7 days) — DO NOT MINCE. Segregate and return to supplier or dispose as Category 3 ABP.",
    });
    expect(
      s.validateMince({
        input: { ...base, input_temp_c: 8 },
        daysFromKill: 2,
        thresholds: M_THRESHOLDS,
      }),
    ).toMatchObject({ message: "Corrective action is required for temperature deviation" });

    const cas = s.buildMinceCorrectiveActions({
      input: {
        ...base,
        input_temp_c: 8, // fails ≤7
        corrective_action: { cause: "Warm", disposition: "Assess", recurrence: "r", notes: "n" },
      },
      userId: "u1",
      sourceId: "m1",
      thresholds: M_THRESHOLDS,
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
    expect(
      s.validateMeatPrep({ ...mp, product_name: "" }, M_THRESHOLDS),
    ).toMatchObject({
      message: "Product name is required",
    });
    expect(s.validateMeatPrep(mp, M_THRESHOLDS)).toEqual({ ok: true });
  });

  it("timesep validation + persist (CA rows are covered in the .mincePrep twin)", () => {
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
    // Since the mince unit (bug fix 1), timesep DOES file a CA row when the
    // free-text corrective action is non-empty — the builder contract is
    // pinned in HaccpDailyChecksService.mincePrep.test.ts.
    expect(typeof s.buildTimeSeparationCorrectiveActions).toBe("function");
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
