import { describe, it, expect } from "vitest";
import { createFakeHaccpDailyChecksRepository } from "@/lib/adapters/fake/HaccpDailyChecksRepository";
import type { ProcessRoomThreshold } from "@/lib/domain";

const SEED: readonly ProcessRoomThreshold[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Product core",
    target_temp_c: 4,
    max_temp_c: 7,
    active: true,
    position: 1,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Room ambient",
    target_temp_c: 12,
    max_temp_c: 15,
    active: false,
    position: 2,
  },
];

describe("fake HaccpDailyChecksRepository — process-room thresholds", () => {
  it("listActiveProcessRoomThresholds returns only active rows", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      processRoomThresholds: SEED,
    });
    const active = await repo.listActiveProcessRoomThresholds();
    expect(active.map((t) => t.name)).toEqual(["Product core"]);
  });

  it("listAllProcessRoomThresholds returns active + inactive", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      processRoomThresholds: SEED,
    });
    const all = await repo.listAllProcessRoomThresholds();
    expect(all.map((t) => t.name)).toEqual(["Product core", "Room ambient"]);
  });

  it("updateProcessRoomThreshold mutates the row AND appends an audit entry", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      processRoomThresholds: SEED,
    });
    const updated = await repo.updateProcessRoomThreshold(
      { id: SEED[0].id, target_temp_c: 3 },
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(updated.target_temp_c).toBe(3);

    const all = await repo.listAllProcessRoomThresholds();
    expect(all.find((t) => t.id === SEED[0].id)?.target_temp_c).toBe(3);

    expect(repo.thresholdAudits).toHaveLength(1);
    const audit = repo.thresholdAudits[0];
    expect(audit.threshold_id).toBe(SEED[0].id);
    expect(audit.changed_by).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(audit.old_target_temp_c).toBe(4);
    expect(audit.new_target_temp_c).toBe(3);
  });

  it("includes active thresholds in the process-room list result", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      processRoomThresholds: SEED.map((t) => ({ ...t, active: true })),
    });
    const list = await repo.listProcessRoom("2026-07-01");
    expect(list.thresholds.map((t) => t.name)).toEqual([
      "Product core",
      "Room ambient",
    ]);
  });
});
