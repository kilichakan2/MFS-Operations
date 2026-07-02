/**
 * tests/unit/services/HaccpDailyChecksService.mincePrep.test.ts
 *
 * DB-driven CCP-M grading: the mince/meatprep validate/build/CA builders
 * delegate to the shared domain rule against the FETCHED thresholds (no
 * hardcoded band table in the service any more), resolution is FAIL-CLOSED
 * (missing key → ServiceError → route 500), CA texts interpolate the DB
 * limits, and the admin threshold validator locks the band STRUCTURE.
 *
 * ⚠️ SPEC-CRITICAL PINS (plan risk R1): the amber band is DISPLAY ONLY. An
 * amber reading (e.g. mince input 7.5) must STILL: reject without a CA (400),
 * persist `input_temp_pass: false`, and file the CCP-M1 CA-register row —
 * the amber band changes NONE of the paperwork (unlike goods-in's
 * saves-free conditional-accept amber).
 */
import { describe, it, expect } from "vitest";
import { createHaccpDailyChecksService } from "@/lib/services";
import { createFakeHaccpDailyChecksRepository } from "@/lib/adapters/fake";
import type {
  CreateMinceInput,
  CreateMeatPrepInput,
  CreateTimeSeparationInput,
  MinceThreshold,
} from "@/lib/domain";
import { ServiceError } from "@/lib/errors";

// Mirrors the migration seed (LOCKED bands) — the fixture the route fetches.
function row(
  key: string,
  label: string,
  kind: "temp" | "kill_days",
  pass_max: number | null,
  amber_max: number | null,
  position: number,
): MinceThreshold {
  return {
    id: `00000000-0000-0000-0000-${String(position).padStart(12, "0")}`,
    key,
    label,
    kind,
    pass_max,
    amber_max,
    position,
  };
}

const THRESHOLDS: readonly MinceThreshold[] = [
  row("mince_input", "Mince input (CCP-M1)", "temp", 7.0, 8.0, 1),
  row("mince_output_chilled", "Mince output — chilled (CCP-M1)", "temp", 2.0, 3.0, 2),
  row("mince_output_frozen", "Mince output — frozen (CCP-M1)", "temp", -18.0, -17.0, 3),
  row("prep_input", "Prep input (CCP-MP1)", "temp", 7.0, 8.0, 4),
  row("prep_output_chilled", "Prep output — chilled (CCP-MP1)", "temp", 4.0, 5.0, 5),
  row("prep_output_frozen", "Prep output — frozen (CCP-MP1)", "temp", -18.0, -17.0, 6),
  row("kill_days_lamb", "Lamb — max days from kill (CCP-M2)", "kill_days", 6, null, 7),
  row("kill_days_beef", "Beef (fresh) — max days from kill (CCP-M2)", "kill_days", 6, null, 8),
  row("kill_days_imported_vac", "Imported / vac-packed — no kill-day limit (CCP-M2)", "kill_days", null, null, 9),
];

// An ADMIN-EDITED variant (input pass 6.0 / amber 7.0, chilled out 1.5/2.5) —
// proves the CA texts carry the DB values, not literals.
const EDITED: readonly MinceThreshold[] = THRESHOLDS.map((t) => {
  if (t.key === "mince_input") return { ...t, pass_max: 6.0, amber_max: 7.0 };
  if (t.key === "mince_output_chilled")
    return { ...t, pass_max: 1.5, amber_max: 2.5 };
  return t;
});

function svc() {
  return createHaccpDailyChecksService({
    dailyChecks: createFakeHaccpDailyChecksRepository({
      minceThresholds: THRESHOLDS,
    }),
  });
}

const CA = { cause: "Chiller malfunction / temperature drift", disposition: "Assess", recurrence: "r", notes: "" };

const MINCE_BASE: CreateMinceInput = {
  form: "mince",
  product_species: "lamb",
  kill_date: "2026-07-01",
  input_temp_c: 5,
  output_temp_c: 1,
};

const PREP_BASE: CreateMeatPrepInput = {
  form: "meatprep",
  product_name: "Burgers",
  input_temp_c: 5,
  output_temp_c: 3,
};

// ─── SPEC-CRITICAL: amber still requires + files the paperwork ────────────────

describe("HaccpDailyChecksService — amber is display-only (paperwork unchanged)", () => {
  it("mince input 7.5 (amber) WITHOUT a CA → 400 (CA still required)", () => {
    const s = svc();
    expect(
      s.validateMince({
        input: { ...MINCE_BASE, input_temp_c: 7.5 },
        daysFromKill: 1,
        thresholds: THRESHOLDS,
      }),
    ).toMatchObject({
      status: 400,
      message: "Corrective action is required for temperature deviation",
    });
  });

  it("mince input 7.5 (amber) persists input_temp_pass: false", () => {
    const s = svc();
    const built = s.buildMince({
      input: { ...MINCE_BASE, input_temp_c: 7.5, corrective_action: CA },
      userId: "u1",
      today: "2026-07-02",
      nowTime: "10:00:00",
      daysFromKill: 1,
      runNum: 1,
      thresholds: THRESHOLDS,
    });
    expect(built.input_temp_pass).toBe(false);
    expect(built.output_temp_pass).toBe(true);
  });

  it("mince input 7.5 (amber) emits the CCP-M1 input CA row", () => {
    const s = svc();
    const cas = s.buildMinceCorrectiveActions({
      input: { ...MINCE_BASE, input_temp_c: 7.5, corrective_action: CA },
      userId: "u1",
      sourceId: "m1",
      thresholds: THRESHOLDS,
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].ccp_ref).toBe("CCP-M1");
    expect(cas[0].source_table).toBe("haccp_mince_log");
    expect(cas[0].deviation_description).toContain("7.5°C");
  });

  it("prep output 4.5 (amber) → CA required + pass:false + CA row (meatprep twin)", () => {
    const s = svc();
    expect(
      s.validateMeatPrep({ ...PREP_BASE, output_temp_c: 4.5 }, THRESHOLDS),
    ).toMatchObject({ status: 400 });

    const built = s.buildMeatPrep({
      input: { ...PREP_BASE, output_temp_c: 4.5, corrective_action: CA },
      userId: "u1",
      today: "2026-07-02",
      nowTime: "10:00:00",
      daysFromKill: null,
      runNum: 1,
      thresholds: THRESHOLDS,
    });
    expect(built.output_temp_pass).toBe(false);

    const cas = s.buildMeatPrepCorrectiveActions({
      input: { ...PREP_BASE, output_temp_c: 4.5, corrective_action: CA },
      userId: "u1",
      sourceId: "p1",
      thresholds: THRESHOLDS,
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].ccp_ref).toBe("CCP-MP1");
  });

  it("pass-line readings stay clean: no CA demanded, pass:true, zero CA rows", () => {
    const s = svc();
    expect(
      s.validateMince({ input: MINCE_BASE, daysFromKill: 1, thresholds: THRESHOLDS }),
    ).toEqual({ ok: true });
    const built = s.buildMince({
      input: MINCE_BASE,
      userId: "u1",
      today: "2026-07-02",
      nowTime: "10:00:00",
      daysFromKill: 1,
      runNum: 1,
      thresholds: THRESHOLDS,
    });
    expect(built.input_temp_pass).toBe(true);
    expect(built.output_temp_pass).toBe(true);
    expect(
      s.buildMinceCorrectiveActions({
        input: MINCE_BASE,
        userId: "u1",
        sourceId: "m1",
        thresholds: THRESHOLDS,
      }),
    ).toHaveLength(0);
  });
});

// ─── fail-closed threading ────────────────────────────────────────────────────

describe("HaccpDailyChecksService — fail-closed on missing threshold keys", () => {
  it("validateMince throws ServiceError when the channel row is missing (→ route 500)", () => {
    const s = svc();
    const noInput = THRESHOLDS.filter((t) => t.key !== "mince_input");
    expect(() =>
      s.validateMince({ input: MINCE_BASE, daysFromKill: 1, thresholds: noInput }),
    ).toThrow(ServiceError);
    expect(() =>
      s.validateMince({ input: MINCE_BASE, daysFromKill: 1, thresholds: [] }),
    ).toThrow(ServiceError);
  });

  it("buildMince / buildMeatPrep throw ServiceError on an empty set", () => {
    const s = svc();
    expect(() =>
      s.buildMince({
        input: MINCE_BASE,
        userId: "u1",
        today: "2026-07-02",
        nowTime: "10:00:00",
        daysFromKill: 1,
        runNum: 1,
        thresholds: [],
      }),
    ).toThrow(ServiceError);
    expect(() =>
      s.buildMeatPrep({
        input: PREP_BASE,
        userId: "u1",
        today: "2026-07-02",
        nowTime: "10:00:00",
        daysFromKill: null,
        runNum: 1,
        thresholds: [],
      }),
    ).toThrow(ServiceError);
  });

  it("killDatePass / killDateHardFail throw ServiceError on a missing species row", () => {
    const s = svc();
    const noLamb = THRESHOLDS.filter((t) => t.key !== "kill_days_lamb");
    expect(() => s.killDatePass("lamb", 3, noLamb)).toThrow(ServiceError);
    expect(() => s.killDateHardFail("lamb", 3, noLamb)).toThrow(ServiceError);
  });
});

// ─── kill-days via thresholds ─────────────────────────────────────────────────

describe("HaccpDailyChecksService — kill-day rules from the DB rows", () => {
  it("lamb 6d passes; lamb 7d hard-fails; imported_vac 40d passes (no limit)", () => {
    const s = svc();
    expect(s.killDatePass("lamb", 6, THRESHOLDS)).toBe(true);
    expect(s.killDateHardFail("lamb", 6, THRESHOLDS)).toBe(false);
    expect(s.killDatePass("lamb", 7, THRESHOLDS)).toBe(false);
    expect(s.killDateHardFail("lamb", 7, THRESHOLDS)).toBe(true);
    expect(s.killDatePass("imported_vac", 40, THRESHOLDS)).toBe(true);
    expect(s.killDateHardFail("imported_vac", 40, THRESHOLDS)).toBe(false);
  });

  it("validateMince kill-date hard-fail 400 keeps its exact message", () => {
    const s = svc();
    expect(
      s.validateMince({
        input: MINCE_BASE,
        daysFromKill: 7,
        thresholds: THRESHOLDS,
      }),
    ).toMatchObject({
      status: 400,
      message:
        "Kill date exceeded (7 days) — DO NOT MINCE. Segregate and return to supplier or dispose as Category 3 ABP.",
    });
  });

  it("buildMince persists kill_date_within_limit from the DB row", () => {
    const s = svc();
    const built = s.buildMince({
      input: { ...MINCE_BASE, product_species: "imported_vac" },
      userId: "u1",
      today: "2026-07-02",
      nowTime: "10:00:00",
      daysFromKill: 40,
      runNum: 1,
      thresholds: THRESHOLDS,
    });
    expect(built.kill_date_within_limit).toBe(true);
    expect(built.batch_code).toBe("MINCE-0207-IMPVAC-1");
  });
});

// ─── CA texts interpolate the DB limits (no literals) ─────────────────────────

describe("HaccpDailyChecksService — CA texts carry the DB values, not literals", () => {
  it("mince input CA against EDITED rows reads ≤6°C (deviation_description + action)", () => {
    const s = svc();
    const cas = s.buildMinceCorrectiveActions({
      input: { ...MINCE_BASE, input_temp_c: 6.5, corrective_action: CA },
      userId: "u1",
      sourceId: "m1",
      thresholds: EDITED,
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].deviation_description).toContain("limit ≤6°C");
    expect(cas[0].action_taken).toContain("≤6°C");
    expect(cas[0].action_taken).not.toContain("7°C");
  });

  it("mince output CA against EDITED rows reads ≤1.5°C", () => {
    const s = svc();
    const cas = s.buildMinceCorrectiveActions({
      input: { ...MINCE_BASE, output_temp_c: 2, corrective_action: CA },
      userId: "u1",
      sourceId: "m1",
      thresholds: EDITED,
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].deviation_description).toContain("limit ≤1.5°C");
    expect(cas[0].action_taken).toContain("1.5°C");
  });

  it("frozen output CA reads the -18°C row values", () => {
    const s = svc();
    const cas = s.buildMinceCorrectiveActions({
      input: {
        ...MINCE_BASE,
        output_temp_c: -16,
        output_mode: "frozen",
        corrective_action: CA,
      },
      userId: "u1",
      sourceId: "m1",
      thresholds: THRESHOLDS,
    });
    expect(cas).toHaveLength(1);
    expect(cas[0].deviation_description).toContain("limit ≤-18°C");
    expect(cas[0].action_taken).toContain("-18°C");
  });

  it("prep input + output CA rows interpolate their rows (both channels)", () => {
    const s = svc();
    const cas = s.buildMeatPrepCorrectiveActions({
      input: {
        ...PREP_BASE,
        input_temp_c: 9,
        output_temp_c: 6,
        corrective_action: CA,
      },
      userId: "u1",
      sourceId: "p1",
      thresholds: THRESHOLDS,
    });
    expect(cas).toHaveLength(2);
    expect(cas[0].deviation_description).toContain("limit ≤7°C");
    expect(cas[0].action_taken).toContain("≤7°C");
    expect(cas[1].deviation_description).toContain("limit ≤4°C");
    expect(cas[1].action_taken).toContain("4°C");
  });
});

// ─── admin threshold validation (structure locked) ────────────────────────────

describe("HaccpDailyChecksService — validateMinceThreshold", () => {
  const input = THRESHOLDS[0]; // mince_input 7.0/8.0 temp
  const lamb = THRESHOLDS[6]; // kill_days_lamb 6/null
  const vac = THRESHOLDS[8]; // kill_days_imported_vac null/null

  it("accepts a plain numeric move (input amber 8.0 → 8.5)", () => {
    const s = svc();
    expect(
      s.validateMinceThreshold(
        { id: input.id, pass_max: 7.0, amber_max: 8.5 },
        input,
      ),
    ).toEqual({ ok: true });
  });

  it("accepts amber == pass (means: amber band empty)", () => {
    const s = svc();
    expect(
      s.validateMinceThreshold(
        { id: input.id, pass_max: 7.0, amber_max: 7.0 },
        input,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects amber below pass", () => {
    const s = svc();
    expect(
      s.validateMinceThreshold(
        { id: input.id, pass_max: 7.0, amber_max: 6.0 },
        input,
      ),
    ).toMatchObject({ status: 400 });
  });

  it("rejects non-finite numbers", () => {
    const s = svc();
    expect(
      s.validateMinceThreshold(
        { id: input.id, pass_max: NaN, amber_max: 8.0 },
        input,
      ),
    ).toMatchObject({ status: 400 });
    expect(
      s.validateMinceThreshold(
        { id: input.id, pass_max: 7.0, amber_max: Infinity },
        input,
      ),
    ).toMatchObject({ status: 400 });
  });

  it("rejects changing a value's null-ness (band structure is code-locked)", () => {
    const s = svc();
    // Removing a temp row's amber band → structure change.
    expect(
      s.validateMinceThreshold(
        { id: input.id, pass_max: 7.0, amber_max: null },
        input,
      ),
    ).toMatchObject({ status: 400 });
    // Giving imported_vac a kill-day limit → structure change (the documented
    // no-limit deviation is locked).
    expect(
      s.validateMinceThreshold({ id: vac.id, pass_max: 15, amber_max: null }, vac),
    ).toMatchObject({ status: 400 });
    // Removing lamb's kill-day limit → structure change.
    expect(
      s.validateMinceThreshold({ id: lamb.id, pass_max: null, amber_max: null }, lamb),
    ).toMatchObject({ status: 400 });
  });

  it("kill-day rows: rejects a non-integer or < 1 pass_max", () => {
    const s = svc();
    expect(
      s.validateMinceThreshold({ id: lamb.id, pass_max: 6.5, amber_max: null }, lamb),
    ).toMatchObject({ status: 400 });
    expect(
      s.validateMinceThreshold({ id: lamb.id, pass_max: 0, amber_max: null }, lamb),
    ).toMatchObject({ status: 400 });
    expect(
      s.validateMinceThreshold({ id: lamb.id, pass_max: 5, amber_max: null }, lamb),
    ).toEqual({ ok: true });
  });

  it("kill-day rows: rejects ANY non-null amber (binary, structurally)", () => {
    const s = svc();
    expect(
      s.validateMinceThreshold({ id: lamb.id, pass_max: 6, amber_max: 7 }, lamb),
    ).toMatchObject({ status: 400 });
  });

  it("rejects a missing id", () => {
    const s = svc();
    expect(
      s.validateMinceThreshold({ id: "", pass_max: 7.0, amber_max: 8.0 }, input),
    ).toMatchObject({ status: 400 });
  });
});

// ─── threshold list/update passthroughs ───────────────────────────────────────

describe("HaccpDailyChecksService — listMinceThresholds / updateMinceThreshold", () => {
  it("lists the rows via the port", async () => {
    const s = svc();
    const rows = await s.listMinceThresholds();
    expect(rows).toHaveLength(9);
    expect(rows.find((t) => t.key === "mince_input")?.pass_max).toBe(7.0);
  });

  it("updates via the port and writes the audit trail", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      minceThresholds: THRESHOLDS,
    });
    const s = createHaccpDailyChecksService({ dailyChecks: repo });
    const target = THRESHOLDS[1]; // mince_output_chilled
    const updated = await s.updateMinceThreshold({
      input: { id: target.id, pass_max: 2.0, amber_max: 3.5 },
      changedBy: "admin-1",
    });
    expect(updated.amber_max).toBe(3.5);
    expect(repo.minceThresholdAudits).toHaveLength(1);
    expect(repo.minceThresholdAudits[0].changed_by).toBe("admin-1");
  });
});

// ─── time-separation CA builder (bug fix 1, server half) ─────────────────────

describe("HaccpDailyChecksService — buildTimeSeparationCorrectiveActions", () => {
  const TS: CreateTimeSeparationInput = {
    form: "timesep",
    clean_completed_time: "12:00",
    clean_verified_by: "v",
    allergens_in_production: "Mustard, Gluten",
  };

  it("empty / whitespace corrective_action → no CA rows", () => {
    const s = svc();
    expect(
      s.buildTimeSeparationCorrectiveActions({
        input: TS,
        userId: "u1",
        sourceId: "ts1",
      }),
    ).toEqual([]);
    expect(
      s.buildTimeSeparationCorrectiveActions({
        input: { ...TS, corrective_action: "   " },
        userId: "u1",
        sourceId: "ts1",
      }),
    ).toEqual([]);
  });

  it("non-empty text → exactly one MMP-TS row with the exact contract", () => {
    const s = svc();
    const cas = s.buildTimeSeparationCorrectiveActions({
      input: { ...TS, corrective_action: " Re-cleaned the bench " },
      userId: "u1",
      sourceId: "ts1",
    });
    expect(cas).toEqual([
      {
        actioned_by: "u1",
        source_table: "haccp_time_separation_log",
        source_id: "ts1",
        ccp_ref: "MMP-TS",
        deviation_description:
          "Time separation (MMP-MF-001 Form 3) — issue recorded during allergen changeover. Allergens in production: Mustard, Gluten",
        action_taken: "Re-cleaned the bench",
        product_disposition: null,
        recurrence_prevention: null,
        management_verification_required: true,
      },
    ]);
  });
});
