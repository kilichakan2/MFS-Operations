/**
 * tests/unit/services/HaccpDailyChecksService.goodsIn.test.ts
 *
 * DB-driven CCP-1 delivery grading: `deliveryTempStatus` delegates to the
 * shared domain rule against the FETCHED thresholds (no hardcoded band table in
 * the service any more), resolution is FAIL-CLOSED (missing category → throw →
 * route 500), and the admin threshold validator locks the band STRUCTURE (only
 * the numbers move — a value's null-ness cannot change).
 */
import { describe, it, expect } from "vitest";
import { createHaccpDailyChecksService } from "@/lib/services";
import { createFakeHaccpDailyChecksRepository } from "@/lib/adapters/fake";
import type { CreateDeliveryInput, GoodsInThreshold } from "@/lib/domain";
import { ServiceError } from "@/lib/errors";

// Mirrors the migration seed (LOCKED bands) — the fixture the routes fetch.
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

const THRESHOLDS: readonly GoodsInThreshold[] = [
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

function svc() {
  return createHaccpDailyChecksService({
    dailyChecks: createFakeHaccpDailyChecksRepository({
      goodsInThresholds: THRESHOLDS,
    }),
  });
}

describe("HaccpDailyChecksService — deliveryTempStatus (DB-driven bands)", () => {
  it("delegates to the domain rule: poultry 4.5°C → urgent (the fix), 5.5°C → fail", () => {
    const s = svc();
    expect(s.deliveryTempStatus(4.5, "poultry", THRESHOLDS)).toBe("urgent");
    expect(s.deliveryTempStatus(5.5, "poultry", THRESHOLDS)).toBe("fail");
  });

  it("spot-checks the other bands against the fetched thresholds", () => {
    const s = svc();
    expect(s.deliveryTempStatus(null, "dry_goods", THRESHOLDS)).toBe("pass");
    expect(s.deliveryTempStatus(4, "beef", THRESHOLDS)).toBe("pass");
    expect(s.deliveryTempStatus(7, "beef", THRESHOLDS)).toBe("urgent");
    expect(s.deliveryTempStatus(9, "beef", THRESHOLDS)).toBe("fail");
    expect(s.deliveryTempStatus(4, "offal", THRESHOLDS)).toBe("fail");
    expect(s.deliveryTempStatus(-16, "frozen", THRESHOLDS)).toBe("urgent");
    expect(s.deliveryTempStatus(null, "beef", THRESHOLDS)).toBe("fail");
  });

  it("FAIL-CLOSED: a category with no threshold row throws ServiceError (→ route 500)", () => {
    const s = svc();
    expect(() => s.deliveryTempStatus(5, "venison", THRESHOLDS)).toThrow(
      ServiceError,
    );
    expect(() => s.deliveryTempStatus(5, "venison", THRESHOLDS)).toThrow(
      /venison/,
    );
    // An empty set (thresholds unreadable) must also refuse to grade.
    expect(() => s.deliveryTempStatus(5, "beef", [])).toThrow(ServiceError);
  });
});

describe("HaccpDailyChecksService — buildDelivery threads thresholds", () => {
  const input: CreateDeliveryInput = {
    supplier_name: "Acme",
    product: "Chicken crowns",
    product_category: "poultry",
    temperature_c: 4.5, // NEW amber band — was a silent pass before the fix
    covered_contaminated: "no",
    allergens_identified: false,
  };

  it("persists temp_status from the fetched thresholds (poultry 4.5 → urgent)", () => {
    const s = svc();
    const built = s.buildDelivery({
      input,
      userId: "u1",
      today: "2026-07-02",
      nowTime: "10:00:00",
      resolvedSupplierId: null,
      resolvedSupplierName: "Acme",
      deliveryNumber: 1,
      thresholds: THRESHOLDS,
    });
    expect(built.tempStatus).toBe("urgent");
    expect(built.persist.temp_status).toBe("urgent");
    expect(built.hasDeviationTemp).toBe(true);
    expect(built.persist.corrective_action_required).toBe(true);
  });

  it("throws (fail-closed) when the category row is missing from the set", () => {
    const s = svc();
    expect(() =>
      s.buildDelivery({
        input,
        userId: "u1",
        today: "2026-07-02",
        nowTime: "10:00:00",
        resolvedSupplierId: null,
        resolvedSupplierName: "Acme",
        deliveryNumber: 1,
        thresholds: [],
      }),
    ).toThrow(ServiceError);
  });
});

describe("HaccpDailyChecksService — validateGoodsInThreshold (structure locked)", () => {
  const poultry = THRESHOLDS[5]; // 4.0 / 5.0
  const offal = THRESHOLDS[2]; // 3.0 / null
  const dry = THRESHOLDS[8]; // null / null

  it("accepts a plain numeric move (poultry amber 5.0 → 5.5)", () => {
    const s = svc();
    expect(
      s.validateGoodsInThreshold(
        { id: poultry.id, pass_max_c: 4.0, amber_max_c: 5.5 },
        poultry,
      ),
    ).toEqual({ ok: true });
  });

  it("accepts amber == pass (means: amber band empty)", () => {
    const s = svc();
    expect(
      s.validateGoodsInThreshold(
        { id: poultry.id, pass_max_c: 4.0, amber_max_c: 4.0 },
        poultry,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects amber below pass", () => {
    const s = svc();
    expect(
      s.validateGoodsInThreshold(
        { id: poultry.id, pass_max_c: 4.0, amber_max_c: 3.0 },
        poultry,
      ),
    ).toMatchObject({ status: 400 });
  });

  it("rejects non-finite numbers", () => {
    const s = svc();
    expect(
      s.validateGoodsInThreshold(
        { id: poultry.id, pass_max_c: NaN, amber_max_c: 5.0 },
        poultry,
      ),
    ).toMatchObject({ status: 400 });
    expect(
      s.validateGoodsInThreshold(
        { id: poultry.id, pass_max_c: 4.0, amber_max_c: Infinity },
        poultry,
      ),
    ).toMatchObject({ status: 400 });
  });

  it("rejects changing a value's null-ness (band structure is code-locked)", () => {
    const s = svc();
    // Removing an existing amber band → structure change.
    expect(
      s.validateGoodsInThreshold(
        { id: poultry.id, pass_max_c: 4.0, amber_max_c: null },
        poultry,
      ),
    ).toMatchObject({ status: 400 });
    // Adding an amber band to an amber-less category → structure change.
    expect(
      s.validateGoodsInThreshold(
        { id: offal.id, pass_max_c: 3.0, amber_max_c: 4.0 },
        offal,
      ),
    ).toMatchObject({ status: 400 });
    // Giving dry goods a temperature CCP → structure change.
    expect(
      s.validateGoodsInThreshold(
        { id: dry.id, pass_max_c: 8.0, amber_max_c: null },
        dry,
      ),
    ).toMatchObject({ status: 400 });
    // Removing a category's temperature CCP → structure change.
    expect(
      s.validateGoodsInThreshold(
        { id: offal.id, pass_max_c: null, amber_max_c: null },
        offal,
      ),
    ).toMatchObject({ status: 400 });
  });

  it("rejects a missing id", () => {
    const s = svc();
    expect(
      s.validateGoodsInThreshold(
        { id: "", pass_max_c: 4.0, amber_max_c: 5.0 },
        poultry,
      ),
    ).toMatchObject({ status: 400 });
  });
});

describe("HaccpDailyChecksService — listGoodsInThresholds / updateGoodsInThreshold", () => {
  it("lists the rows via the port", async () => {
    const s = svc();
    const rows = await s.listGoodsInThresholds();
    expect(rows).toHaveLength(11);
    expect(rows.find((t) => t.category === "poultry")?.pass_max_c).toBe(4.0);
  });

  it("updates via the port and writes the audit trail", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      goodsInThresholds: THRESHOLDS,
    });
    const s = createHaccpDailyChecksService({ dailyChecks: repo });
    const poultry = THRESHOLDS[5];
    const updated = await s.updateGoodsInThreshold({
      input: { id: poultry.id, pass_max_c: 4.0, amber_max_c: 5.5 },
      changedBy: "admin-1",
    });
    expect(updated.amber_max_c).toBe(5.5);
    expect(repo.goodsInThresholdAudits).toHaveLength(1);
    expect(repo.goodsInThresholdAudits[0].changed_by).toBe("admin-1");
  });
});
