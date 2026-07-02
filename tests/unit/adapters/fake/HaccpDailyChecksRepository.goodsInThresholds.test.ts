import { describe, it, expect } from "vitest";
import { createFakeHaccpDailyChecksRepository } from "@/lib/adapters/fake/HaccpDailyChecksRepository";
import type { GoodsInThreshold } from "@/lib/domain";

const SEED: readonly GoodsInThreshold[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    category: "poultry",
    label: "Poultry",
    pass_max_c: 4,
    amber_max_c: 5,
    position: 1,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    category: "offal",
    label: "Offal",
    pass_max_c: 3,
    amber_max_c: null,
    position: 2,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    category: "dry_goods",
    label: "Dry Goods",
    pass_max_c: null,
    amber_max_c: null,
    position: 3,
  },
];

describe("fake HaccpDailyChecksRepository — goods-in thresholds", () => {
  it("listGoodsInThresholds returns the seeded rows", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      goodsInThresholds: SEED,
    });
    const rows = await repo.listGoodsInThresholds();
    expect(rows.map((t) => t.category)).toEqual([
      "poultry",
      "offal",
      "dry_goods",
    ]);
  });

  it("updateGoodsInThreshold mutates the row AND appends an audit entry", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      goodsInThresholds: SEED,
    });
    const updated = await repo.updateGoodsInThreshold(
      { id: SEED[0].id, pass_max_c: 4, amber_max_c: 5.5 },
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(updated.amber_max_c).toBe(5.5);

    const all = await repo.listGoodsInThresholds();
    expect(all.find((t) => t.id === SEED[0].id)?.amber_max_c).toBe(5.5);

    expect(repo.goodsInThresholdAudits).toHaveLength(1);
    const audit = repo.goodsInThresholdAudits[0];
    expect(audit.threshold_id).toBe(SEED[0].id);
    expect(audit.changed_by).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(audit.old_amber_max_c).toBe(5);
    expect(audit.new_amber_max_c).toBe(5.5);
    expect(audit.old_pass_max_c).toBe(4);
    expect(audit.new_pass_max_c).toBe(4);
  });

  it("updateGoodsInThreshold throws on an unknown id", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      goodsInThresholds: SEED,
    });
    await expect(
      repo.updateGoodsInThreshold(
        { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", pass_max_c: 1, amber_max_c: 2 },
        "u1",
      ),
    ).rejects.toThrow();
  });

  it("includes the seeded thresholds in the delivery list result", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      goodsInThresholds: SEED,
    });
    const list = await repo.listDeliveries("today");
    expect(list.thresholds.map((t) => t.category)).toEqual([
      "poultry",
      "offal",
      "dry_goods",
    ]);
  });
});
