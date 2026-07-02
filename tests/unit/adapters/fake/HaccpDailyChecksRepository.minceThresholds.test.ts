import { describe, it, expect } from "vitest";
import { createFakeHaccpDailyChecksRepository } from "@/lib/adapters/fake/HaccpDailyChecksRepository";
import type { MinceThreshold, TimeSeparationPersist } from "@/lib/domain";

const SEED: readonly MinceThreshold[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    key: "mince_input",
    label: "Mince input (CCP-M1)",
    kind: "temp",
    pass_max: 7,
    amber_max: 8,
    position: 1,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    key: "mince_output_chilled",
    label: "Mince output — chilled (CCP-M1)",
    kind: "temp",
    pass_max: 2,
    amber_max: 3,
    position: 2,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    key: "kill_days_imported_vac",
    label: "Imported / vac-packed — no kill-day limit (CCP-M2)",
    kind: "kill_days",
    pass_max: null,
    amber_max: null,
    position: 9,
  },
];

const TS_PERSIST: TimeSeparationPersist = {
  submitted_by: "u1",
  date: "2026-07-02",
  time_of_entry: "12:00:00",
  plain_products_end_time: null,
  clean_completed_time: "12:00",
  allergen_products_start_time: null,
  clean_verified_by: "v",
  allergens_in_production: "Mustard",
  corrective_action: "note",
};

describe("fake HaccpDailyChecksRepository — mince thresholds", () => {
  it("listMinceThresholds returns the seeded rows in position order", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      minceThresholds: [SEED[2], SEED[0], SEED[1]], // shuffled in
    });
    const rows = await repo.listMinceThresholds();
    expect(rows.map((t) => t.key)).toEqual([
      "mince_input",
      "mince_output_chilled",
      "kill_days_imported_vac",
    ]);
  });

  it("updateMinceThreshold mutates the row AND appends an audit entry", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      minceThresholds: SEED,
    });
    const updated = await repo.updateMinceThreshold(
      { id: SEED[1].id, pass_max: 2, amber_max: 3.5 },
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(updated.amber_max).toBe(3.5);

    const all = await repo.listMinceThresholds();
    expect(all.find((t) => t.id === SEED[1].id)?.amber_max).toBe(3.5);

    expect(repo.minceThresholdAudits).toHaveLength(1);
    const audit = repo.minceThresholdAudits[0];
    expect(audit.threshold_id).toBe(SEED[1].id);
    expect(audit.changed_by).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(audit.old_amber_max).toBe(3);
    expect(audit.new_amber_max).toBe(3.5);
    expect(audit.old_pass_max).toBe(2);
    expect(audit.new_pass_max).toBe(2);
  });

  it("updateMinceThreshold throws on an unknown id", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      minceThresholds: SEED,
    });
    await expect(
      repo.updateMinceThreshold(
        { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", pass_max: 1, amber_max: 2 },
        "u1",
      ),
    ).rejects.toThrow();
  });

  it("includes the seeded thresholds in the mince-prep list result (appended key)", async () => {
    const repo = createFakeHaccpDailyChecksRepository({
      minceThresholds: SEED,
    });
    const list = await repo.listMincePrep("today");
    expect(list.thresholds.map((t) => t.key)).toEqual([
      "mince_input",
      "mince_output_chilled",
      "kill_days_imported_vac",
    ]);
  });

  it("insertTimeSeparation returns the new row id AND records the insert", async () => {
    const repo = createFakeHaccpDailyChecksRepository();
    const { id } = await repo.insertTimeSeparation(TS_PERSIST);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repo.timeSeparationInserts).toHaveLength(1);
    expect(repo.timeSeparationInserts[0]).toEqual(TS_PERSIST);
  });
});
