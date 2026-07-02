import { describe, it, expect } from "vitest";
import {
  resolveGoodsInThreshold,
  goodsInStatus,
  describeGoodsInBands,
} from "@/lib/domain/goodsIn";
import type { GoodsInThreshold } from "@/lib/domain/goodsIn";

// ─── LOCKED seed fixture ──────────────────────────────────────────────────────
// Mirrors the migration seed (20260702120000_haccp_goods_in_thresholds.sql)
// verbatim — the LOCKED band table from the Gate-1 spec. Band literals are
// allowed here (test fixture) and in the migration seed ONLY.

function row(
  category: string,
  label: string,
  pass_max_c: number | null,
  amber_max_c: number | null,
  position: number,
): GoodsInThreshold {
  return {
    id: `00000000-0000-0000-0000-${String(position).padStart(12, "0")}`,
    category,
    label,
    pass_max_c,
    amber_max_c,
    position,
  };
}

const SEED: readonly GoodsInThreshold[] = [
  row("lamb", "Lamb", 5.0, 8.0, 1),
  row("beef", "Beef", 5.0, 8.0, 2),
  row("offal", "Offal", 3.0, null, 3),
  row("frozen", "Frozen", -18.0, -15.0, 4),
  row("frozen_beef_lamb", "Frozen Beef/Lamb", -18.0, -15.0, 5),
  row("poultry", "Poultry", 4.0, 5.0, 6),
  row("dairy", "Dairy / Chilled", 8.0, null, 7),
  row("chilled_other", "Chilled Other", 8.0, null, 8),
  row("dry_goods", "Dry Goods", null, null, 9),
  row("red_meat", "Red meat (legacy)", 5.0, 8.0, 10),
  row("mince_prep", "Mince / prep (legacy)", 4.0, null, 11),
];

function seedFor(category: string): GoodsInThreshold {
  return resolveGoodsInThreshold(SEED, category);
}

function status(temp: number | null, category: string) {
  return goodsInStatus(temp, seedFor(category));
}

// ─── R1 completeness: every category key gradeable today has a seed row ──────
// These are ALL keys the screen's calcStatus / the service's deliveryTempStatus
// handle today. A missing seed row would fail-close (500) an entire delivery
// lane — this enumeration proves the seed covers every grading key.

const ALL_GRADEABLE_KEYS = [
  "lamb",
  "beef",
  "red_meat",
  "offal",
  "mince_prep",
  "frozen",
  "frozen_beef_lamb",
  "poultry",
  "dairy",
  "chilled_other",
  "dry_goods",
] as const;

describe("goodsIn — seed completeness (R1)", () => {
  it("has a seed row for every category key gradeable today (11 keys)", () => {
    for (const key of ALL_GRADEABLE_KEYS) {
      expect(() => resolveGoodsInThreshold(SEED, key)).not.toThrow();
    }
    expect(SEED).toHaveLength(ALL_GRADEABLE_KEYS.length);
  });
});

// ─── band boundaries (both sides of every fence-post) ────────────────────────

describe("goodsIn — goodsInStatus band boundaries (LOCKED values)", () => {
  it.each(["lamb", "beef", "red_meat"])(
    "%s: 5.0→pass, 5.1→urgent, 8.0→urgent, 8.1→fail",
    (cat) => {
      expect(status(5.0, cat)).toBe("pass");
      expect(status(5.1, cat)).toBe("urgent");
      expect(status(8.0, cat)).toBe("urgent");
      expect(status(8.1, cat)).toBe("fail");
    },
  );

  it("offal: 3.0→pass, 3.1→fail (no amber band)", () => {
    expect(status(3.0, "offal")).toBe("pass");
    expect(status(3.1, "offal")).toBe("fail");
  });

  it("poultry (THE FIX): 4.0→pass, 4.1→urgent, 5.0→urgent, 5.1→fail", () => {
    expect(status(4.0, "poultry")).toBe("pass");
    expect(status(4.1, "poultry")).toBe("urgent");
    expect(status(5.0, "poultry")).toBe("urgent");
    expect(status(5.1, "poultry")).toBe("fail");
  });

  it.each(["dairy", "chilled_other"])("%s: 8.0→pass, 8.1→fail", (cat) => {
    expect(status(8.0, cat)).toBe("pass");
    expect(status(8.1, cat)).toBe("fail");
  });

  it.each(["frozen", "frozen_beef_lamb"])(
    "%s: -18.0→pass, -17.9→urgent, -15.0→urgent, -14.9→fail",
    (cat) => {
      expect(status(-18.0, cat)).toBe("pass");
      expect(status(-17.9, cat)).toBe("urgent");
      expect(status(-15.0, cat)).toBe("urgent");
      expect(status(-14.9, cat)).toBe("fail");
    },
  );

  it("frozen_beef_lamb: a DECIMAL negative -17.5 grades urgent (QFF amber band) — pins the pad offering '.' AND '-' together", () => {
    expect(status(-17.5, "frozen_beef_lamb")).toBe("urgent");
    // Rounded to -18 the same reading would false-pass — the reason decimal
    // entry must stay available on the frozen family (review 🟡1).
    expect(status(-18, "frozen_beef_lamb")).toBe("pass");
  });

  it("mince_prep: 4.0→pass, 4.1→fail (no amber band)", () => {
    expect(status(4.0, "mince_prep")).toBe("pass");
    expect(status(4.1, "mince_prep")).toBe("fail");
  });

  it("dry_goods: pass regardless of temperature (no temperature CCP)", () => {
    expect(status(25, "dry_goods")).toBe("pass");
    expect(status(-5, "dry_goods")).toBe("pass");
    expect(status(null, "dry_goods")).toBe("pass");
  });
});

// ─── null / NaN semantics (server-side: missing temp on a temp CCP = fail) ───

describe("goodsIn — goodsInStatus null/NaN semantics", () => {
  it("null temp on a temperature-CCP row → fail (server semantics)", () => {
    expect(status(null, "lamb")).toBe("fail");
    expect(status(null, "poultry")).toBe("fail");
  });

  it("NaN temp on a temperature-CCP row → fail", () => {
    expect(status(NaN, "lamb")).toBe("fail");
  });

  it("no-CCP row (null pass_max_c) → pass even with null temp", () => {
    expect(status(null, "dry_goods")).toBe("pass");
  });
});

// ─── fail-closed resolution ───────────────────────────────────────────────────

describe("goodsIn — resolveGoodsInThreshold (fail-closed)", () => {
  it("THROWS on a missing category and names the missing key", () => {
    expect(() => resolveGoodsInThreshold(SEED, "venison")).toThrow(/venison/);
  });

  it("throws on an empty threshold set (never grades against nothing)", () => {
    expect(() => resolveGoodsInThreshold([], "lamb")).toThrow(/lamb/);
  });

  it("resolves the exact row for a present category", () => {
    const t = resolveGoodsInThreshold(SEED, "poultry");
    expect(t.category).toBe("poultry");
    expect(t.pass_max_c).toBe(4.0);
    expect(t.amber_max_c).toBe(5.0);
  });
});

// ─── chip copy derivation ─────────────────────────────────────────────────────

describe("goodsIn — describeGoodsInBands (chip copy from row values)", () => {
  it("three-band row (lamb): pass · conditional accept · reject", () => {
    expect(describeGoodsInBands(seedFor("lamb"))).toEqual({
      limit: "≤8°C (target ≤5°C)",
      detail: "≤5°C pass · 5–8°C conditional accept · >8°C reject",
    });
  });

  it("three-band row (poultry — the fix) reads the NEW bands", () => {
    expect(describeGoodsInBands(seedFor("poultry"))).toEqual({
      limit: "≤5°C (target ≤4°C)",
      detail: "≤4°C pass · 4–5°C conditional accept · >5°C reject",
    });
  });

  it("negative three-band row (frozen) uses 'to' for readability", () => {
    expect(describeGoodsInBands(seedFor("frozen"))).toEqual({
      limit: "≤-15°C (target ≤-18°C)",
      detail: "≤-18°C pass · -18 to -15°C conditional accept · >-15°C reject",
    });
  });

  it("amber-less row (offal): pass · reject only", () => {
    expect(describeGoodsInBands(seedFor("offal"))).toEqual({
      limit: "≤3°C",
      detail: "≤3°C pass · >3°C reject",
    });
  });

  it("no-temp-CCP row (dry_goods): ambient wording", () => {
    expect(describeGoodsInBands(seedFor("dry_goods"))).toEqual({
      limit: "Ambient",
      detail: "No temperature CCP — visual / condition check only",
    });
  });
});
