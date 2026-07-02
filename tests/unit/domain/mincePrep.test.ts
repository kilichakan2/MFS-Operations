import { describe, it, expect } from "vitest";
import {
  resolveMinceThreshold,
  minceTempKey,
  minceTempStatus,
  minceTempPass,
  minceKillDaysPass,
  minceKillDaysHardFail,
  describeMinceBand,
} from "@/lib/domain/mincePrep";
import type { MinceThreshold } from "@/lib/domain/mincePrep";

// ─── LOCKED seed fixture ──────────────────────────────────────────────────────
// Mirrors the migration seed (20260702150000_haccp_mince_thresholds.sql)
// verbatim — the LOCKED band table from the Gate-1 spec (Reg 853/2004 Annex III
// Sec V Ch III, verified 2026-07-02). Band literals are allowed here (test
// fixture), in the migration seed and in the register doc ONLY.

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

const SEED: readonly MinceThreshold[] = [
  row("mince_input", "Mince input (CCP-M1)", "temp", 7.0, 8.0, 1),
  row("mince_output_chilled", "Mince output — chilled (CCP-M1)", "temp", 2.0, 3.0, 2),
  row("mince_output_frozen", "Mince output — frozen (CCP-M1)", "temp", -18.0, -17.0, 3),
  row("prep_input", "Prep input (CCP-MP1)", "temp", 7.0, 8.0, 4),
  row("prep_output_chilled", "Prep output — chilled (CCP-MP1)", "temp", 4.0, 5.0, 5),
  row("prep_output_frozen", "Prep output — frozen (CCP-MP1)", "temp", -18.0, -17.0, 6),
  row("kill_days_lamb", "Lamb — max days from kill (CCP-M2)", "kill_days", 6, null, 7),
  row("kill_days_beef", "Beef (fresh) — max days from kill (CCP-M2)", "kill_days", 6, null, 8),
  row(
    "kill_days_imported_vac",
    "Imported / vac-packed — no kill-day limit (CCP-M2)",
    "kill_days",
    null,
    null,
    9,
  ),
];

function seedFor(key: string): MinceThreshold {
  return resolveMinceThreshold(SEED, key);
}

function status(temp: number | null, key: string) {
  return minceTempStatus(temp, seedFor(key));
}

// ─── R2 completeness: every key the page/service can emit has a seed row ─────
// The 6 temp channel keys `minceTempKey` can produce plus the 3 per-species
// kill-day keys. A missing seed row would fail-close (500) an entire
// submission lane — this enumeration proves the seed covers every grading key.

const ALL_GRADEABLE_KEYS = [
  "mince_input",
  "mince_output_chilled",
  "mince_output_frozen",
  "prep_input",
  "prep_output_chilled",
  "prep_output_frozen",
  "kill_days_lamb",
  "kill_days_beef",
  "kill_days_imported_vac",
] as const;

describe("mincePrep — seed completeness (R2)", () => {
  it("has a seed row for every gradeable key (9 keys)", () => {
    for (const key of ALL_GRADEABLE_KEYS) {
      expect(() => resolveMinceThreshold(SEED, key)).not.toThrow();
    }
    expect(SEED).toHaveLength(ALL_GRADEABLE_KEYS.length);
  });
});

// ─── channel-key derivation ───────────────────────────────────────────────────

describe("mincePrep — minceTempKey (form × channel × mode)", () => {
  it("derives the 6 channel keys; input ignores the output mode", () => {
    expect(minceTempKey("mince", "input", "chilled")).toBe("mince_input");
    expect(minceTempKey("mince", "input", "frozen")).toBe("mince_input");
    expect(minceTempKey("mince", "output", "chilled")).toBe("mince_output_chilled");
    expect(minceTempKey("mince", "output", "frozen")).toBe("mince_output_frozen");
    expect(minceTempKey("meatprep", "input", "chilled")).toBe("prep_input");
    expect(minceTempKey("meatprep", "input", "frozen")).toBe("prep_input");
    expect(minceTempKey("meatprep", "output", "chilled")).toBe("prep_output_chilled");
    expect(minceTempKey("meatprep", "output", "frozen")).toBe("prep_output_frozen");
  });

  it("a non-'frozen' mode string grades as chilled (mirrors the persisted default)", () => {
    expect(minceTempKey("mince", "output", "")).toBe("mince_output_chilled");
    expect(minceTempKey("meatprep", "output", "anything")).toBe("prep_output_chilled");
  });
});

// ─── band boundaries (both sides of every fence-post, LOCKED values) ─────────

describe("mincePrep — minceTempStatus band boundaries (LOCKED values)", () => {
  it.each(["mince_input", "prep_input"])(
    "%s: 7.0→pass, 7.1→amber, 8.0→amber, 8.1→fail",
    (key) => {
      expect(status(7.0, key)).toBe("pass");
      expect(status(7.1, key)).toBe("amber");
      expect(status(8.0, key)).toBe("amber");
      expect(status(8.1, key)).toBe("fail");
    },
  );

  it("mince_output_chilled: 2.0→pass, 2.1→amber, 3.0→amber, 3.1→fail", () => {
    expect(status(2.0, "mince_output_chilled")).toBe("pass");
    expect(status(2.1, "mince_output_chilled")).toBe("amber");
    expect(status(3.0, "mince_output_chilled")).toBe("amber");
    expect(status(3.1, "mince_output_chilled")).toBe("fail");
  });

  it("prep_output_chilled: 4.0→pass, 4.1→amber, 5.0→amber, 5.1→fail", () => {
    expect(status(4.0, "prep_output_chilled")).toBe("pass");
    expect(status(4.1, "prep_output_chilled")).toBe("amber");
    expect(status(5.0, "prep_output_chilled")).toBe("amber");
    expect(status(5.1, "prep_output_chilled")).toBe("fail");
  });

  it.each(["mince_output_frozen", "prep_output_frozen"])(
    "%s: -18.0→pass, -17.9→amber, -17.0→amber, -16.9→fail",
    (key) => {
      expect(status(-18.0, key)).toBe("pass");
      expect(status(-17.9, key)).toBe("amber");
      expect(status(-17.0, key)).toBe("amber");
      expect(status(-16.9, key)).toBe("fail");
    },
  );

  it("frozen: a DECIMAL negative -17.5 grades amber — pins the pad offering '.' AND '-' together", () => {
    expect(status(-17.5, "mince_output_frozen")).toBe("amber");
    // Rounded to -18 the same reading would false-pass — decimal entry must
    // stay available on the frozen mode.
    expect(status(-18, "mince_output_frozen")).toBe("pass");
  });
});

// ─── THE spec-critical rule: amber is DISPLAY ONLY ────────────────────────────
// `minceTempPass` is the persisted/paperwork authority. An amber reading is
// pass:false — the CCA popup, the 400-without-CA validation and the CA-register
// write ALL still fire. Copying goods-in's saves-free amber here would silently
// stop legal paperwork (plan risk R1).

describe("mincePrep — minceTempPass (amber = pass:false, the paperwork trigger)", () => {
  it("amber reading persists pass:false (7.5 on mince_input)", () => {
    expect(minceTempPass(7.5, seedFor("mince_input"))).toBe(false);
  });

  it("pass-line reading persists pass:true (7.0 on mince_input)", () => {
    expect(minceTempPass(7.0, seedFor("mince_input"))).toBe(true);
  });

  it("fail reading persists pass:false (8.1 on mince_input)", () => {
    expect(minceTempPass(8.1, seedFor("mince_input"))).toBe(false);
  });

  it("amber ⇒ pass:false on EVERY temp channel (the rule is blind to amber)", () => {
    expect(minceTempPass(2.5, seedFor("mince_output_chilled"))).toBe(false);
    expect(minceTempPass(4.5, seedFor("prep_output_chilled"))).toBe(false);
    expect(minceTempPass(-17.5, seedFor("mince_output_frozen"))).toBe(false);
    expect(minceTempPass(-17.5, seedFor("prep_output_frozen"))).toBe(false);
    expect(minceTempPass(7.5, seedFor("prep_input"))).toBe(false);
  });

  it("null / NaN temp → pass:false (never a silent pass)", () => {
    expect(minceTempPass(null, seedFor("mince_input"))).toBe(false);
    expect(minceTempPass(NaN, seedFor("mince_input"))).toBe(false);
  });
});

describe("mincePrep — minceTempStatus null/NaN semantics", () => {
  it("null / NaN temp → fail", () => {
    expect(status(null, "mince_input")).toBe("fail");
    expect(status(NaN, "prep_output_chilled")).toBe("fail");
  });
});

// ─── kill-days: BINARY pass / hard-fail (no amber, structurally) ──────────────

describe("mincePrep — kill-day rules (BINARY)", () => {
  it.each(["kill_days_lamb", "kill_days_beef"])(
    "%s: 6→pass (no hardFail), 7→hardFail",
    (key) => {
      const t = seedFor(key);
      expect(minceKillDaysPass(6, t)).toBe(true);
      expect(minceKillDaysHardFail(6, t)).toBe(false);
      expect(minceKillDaysPass(7, t)).toBe(false);
      expect(minceKillDaysHardFail(7, t)).toBe(true);
    },
  );

  it("imported_vac (pass_max NULL) always passes, never hard-fails (informational)", () => {
    const t = seedFor("kill_days_imported_vac");
    expect(minceKillDaysPass(6, t)).toBe(true);
    expect(minceKillDaysPass(40, t)).toBe(true);
    expect(minceKillDaysPass(99, t)).toBe(true);
    expect(minceKillDaysHardFail(40, t)).toBe(false);
    expect(minceKillDaysHardFail(99, t)).toBe(false);
  });
});

// ─── fail-closed resolution ───────────────────────────────────────────────────

describe("mincePrep — resolveMinceThreshold (fail-closed)", () => {
  it("THROWS on a missing key and names the missing key", () => {
    expect(() => resolveMinceThreshold(SEED, "kill_days_pork")).toThrow(
      /kill_days_pork/,
    );
  });

  it("throws on an empty threshold set (never grades against nothing)", () => {
    expect(() => resolveMinceThreshold([], "mince_input")).toThrow(
      /mince_input/,
    );
  });

  it("resolves the exact row for a present key", () => {
    const t = resolveMinceThreshold(SEED, "mince_output_chilled");
    expect(t.key).toBe("mince_output_chilled");
    expect(t.pass_max).toBe(2.0);
    expect(t.amber_max).toBe(3.0);
  });
});

// ─── band copy derivation (screen chips + numpad hints self-update) ──────────

describe("mincePrep — describeMinceBand (copy from row values)", () => {
  it("three-band temp row (mince input): pass · warning · deviation", () => {
    expect(describeMinceBand(seedFor("mince_input"))).toEqual({
      limit: "≤7°C",
      detail: "≤7°C pass · 7–8°C warning · >8°C deviation",
    });
  });

  it("three-band temp row (mince output chilled)", () => {
    expect(describeMinceBand(seedFor("mince_output_chilled"))).toEqual({
      limit: "≤2°C",
      detail: "≤2°C pass · 2–3°C warning · >3°C deviation",
    });
  });

  it("negative three-band row (frozen) uses 'to' for readability", () => {
    expect(describeMinceBand(seedFor("mince_output_frozen"))).toEqual({
      limit: "≤-18°C",
      detail: "≤-18°C pass · -18 to -17°C warning · >-17°C deviation",
    });
  });

  it("amber-less temp row: pass · deviation only", () => {
    const t = row("mince_input", "Mince input (CCP-M1)", "temp", 7.0, null, 1);
    expect(describeMinceBand(t)).toEqual({
      limit: "≤7°C",
      detail: "≤7°C pass · >7°C deviation",
    });
  });

  it("kill-day row with a limit: max N days", () => {
    expect(describeMinceBand(seedFor("kill_days_lamb"))).toEqual({
      limit: "max 6 days",
      detail: "max 6 days from kill",
    });
  });

  it("no-limit kill-day row (imported_vac): traceability wording", () => {
    expect(describeMinceBand(seedFor("kill_days_imported_vac"))).toEqual({
      limit: "No limit",
      detail: "no kill-day limit — recorded for traceability",
    });
  });
});
