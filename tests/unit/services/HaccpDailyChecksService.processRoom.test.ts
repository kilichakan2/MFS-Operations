/**
 * tests/unit/services/HaccpDailyChecksService.processRoom.test.ts
 *
 * Band-aware, DB-driven CCP-3 temps: bands come from the seeded thresholds
 * (Product core 4/7, Room ambient 12/15), the shared cause set is validated, the
 * range guard mirrors the client keypad, and the admin threshold validator
 * rejects nonsense.
 */
import { describe, it, expect } from "vitest";
import { createHaccpDailyChecksService } from "@/lib/services";
import { createFakeHaccpDailyChecksRepository } from "@/lib/adapters/fake";
import type {
  CreateProcessingTempInput,
  ProcessRoomThreshold,
  UpdateProcessRoomThresholdInput,
} from "@/lib/domain";

const TODAY = "2026-07-01";

const THRESHOLDS: readonly ProcessRoomThreshold[] = [
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
];

function svc() {
  return createHaccpDailyChecksService({
    dailyChecks: createFakeHaccpDailyChecksRepository({
      processRoomThresholds: THRESHOLDS,
    }),
  });
}

function temps(over: Partial<CreateProcessingTempInput>): CreateProcessingTempInput {
  return {
    session: "AM",
    date: TODAY,
    product_temp_c: 2,
    room_temp_c: 10,
    ...over,
  };
}

describe("HaccpDailyChecksService — process-room band-aware temps", () => {
  it("product 5°C is amber → deviation, CA row does NOT require mgmt sign-off", () => {
    const s = svc();
    const input = temps({
      product_temp_c: 5,
      corrective_action: {
        cause: "Doors left open",
        disposition: "Assess",
        recurrence: "Retrain staff on door discipline",
      },
    });
    expect(s.validateProcessingTemp({ input, today: TODAY, thresholds: THRESHOLDS })).toEqual({ ok: true });
    const built = s.buildProcessingTemp({ input, userId: "u1", thresholds: THRESHOLDS });
    expect(built.product_within_limit).toBe(false);
    expect(built.within_limits).toBe(false);
    const cas = s.buildProcessingTempCorrectiveActions({
      input,
      userId: "u1",
      sourceId: "s1",
      thresholds: THRESHOLDS,
    });
    const product = cas.find((c) => c.deviation_description.startsWith("Product"));
    expect(product?.management_verification_required).toBe(false);
  });

  it("product 8°C is critical → CA row requires mgmt sign-off", () => {
    const s = svc();
    const input = temps({
      product_temp_c: 8,
      corrective_action: {
        cause: "Equipment failure",
        disposition: "Reject",
        recurrence: "Schedule maintenance check",
      },
    });
    const cas = s.buildProcessingTempCorrectiveActions({
      input,
      userId: "u1",
      sourceId: "s1",
      thresholds: THRESHOLDS,
    });
    const product = cas.find((c) => c.deviation_description.startsWith("Product"));
    expect(product?.management_verification_required).toBe(true);
  });

  it("room 13°C is amber (no mgmt sign-off); room 16°C is critical (mgmt sign-off)", () => {
    const s = svc();
    const amber = s.buildProcessingTempCorrectiveActions({
      input: temps({
        room_temp_c: 13,
        corrective_action: {
          cause: "A/C or cooling failure",
          disposition: "Assess",
          recurrence: "Schedule A/C maintenance",
        },
      }),
      userId: "u1",
      sourceId: "s1",
      thresholds: THRESHOLDS,
    });
    expect(amber.find((c) => c.deviation_description.startsWith("Room"))?.management_verification_required).toBe(false);

    const critical = s.buildProcessingTempCorrectiveActions({
      input: temps({
        room_temp_c: 16,
        corrective_action: {
          cause: "A/C or cooling failure",
          disposition: "Reject",
          recurrence: "Schedule A/C maintenance",
        },
      }),
      userId: "u1",
      sourceId: "s1",
      thresholds: THRESHOLDS,
    });
    expect(critical.find((c) => c.deviation_description.startsWith("Room"))?.management_verification_required).toBe(true);
  });

  it("rejects an out-of-range temperature (server defence-in-depth)", () => {
    const s = svc();
    const r = s.validateProcessingTemp({
      input: temps({ product_temp_c: 60 }),
      today: TODAY,
      thresholds: THRESHOLDS,
    });
    expect(r).toMatchObject({ status: 400, message: "Temperature out of range" });
  });

  it("rejects an unknown cause and accepts a shared PROCESS_ROOM_CAUSES cause", () => {
    const s = svc();
    const bad = s.validateProcessingTemp({
      input: temps({
        product_temp_c: 5,
        corrective_action: { cause: "banana", disposition: "Assess", recurrence: "x" },
      }),
      today: TODAY,
      thresholds: THRESHOLDS,
    });
    expect(bad).toMatchObject({ status: 400 });

    const ok = s.validateProcessingTemp({
      input: temps({
        product_temp_c: 5,
        corrective_action: {
          cause: "Batch too large",
          disposition: "Assess",
          recurrence: "Reduce batch sizes",
        },
      }),
      today: TODAY,
      thresholds: THRESHOLDS,
    });
    expect(ok).toEqual({ ok: true });
  });
});

describe("HaccpDailyChecksService — fail-closed when a required threshold is missing", () => {
  // A required CCP-3 measurement point absent from the active set (e.g. an admin
  // somehow deactivated "Product core") must STOP the submit, never grade the
  // product against the Room ambient row (12/15) — that would false-`pass` a
  // 10°C product on a CCP. resolveProcRoomThresholds throws (→ route 500).
  const ROOM_ONLY: readonly ProcessRoomThreshold[] = [THRESHOLDS[1]]; // Room ambient only
  const PRODUCT_ONLY: readonly ProcessRoomThreshold[] = [THRESHOLDS[0]]; // Product core only

  it("validateProcessingTemp throws when 'Product core' is absent (no fallback to Room ambient)", () => {
    const s = svc();
    // 10°C product would falsely 'pass' against Room ambient's 12/15 — must throw instead.
    expect(() =>
      s.validateProcessingTemp({
        input: temps({ product_temp_c: 10, room_temp_c: 10 }),
        today: TODAY,
        thresholds: ROOM_ONLY,
      }),
    ).toThrow(/Product core/);
  });

  it("buildProcessingTemp throws when 'Product core' is absent", () => {
    const s = svc();
    expect(() =>
      s.buildProcessingTemp({
        input: temps({ product_temp_c: 10 }),
        userId: "u1",
        thresholds: ROOM_ONLY,
      }),
    ).toThrow(/Product core/);
  });

  it("throws when 'Room ambient' is absent", () => {
    const s = svc();
    expect(() =>
      s.validateProcessingTemp({
        input: temps({}),
        today: TODAY,
        thresholds: PRODUCT_ONLY,
      }),
    ).toThrow(/Room ambient/);
  });
});

describe("HaccpDailyChecksService — validateProcessRoomThreshold", () => {
  const base: UpdateProcessRoomThresholdInput = { id: "p-1" };

  it("rejects max below target", () => {
    const s = svc();
    expect(
      s.validateProcessRoomThreshold({ ...base, target_temp_c: 9, max_temp_c: 5 }),
    ).toMatchObject({ status: 400 });
  });

  it("rejects an out-of-bounds value", () => {
    const s = svc();
    expect(
      s.validateProcessRoomThreshold({ ...base, target_temp_c: 999 }),
    ).toMatchObject({ status: 400 });
  });

  it("rejects when there is nothing to update", () => {
    const s = svc();
    expect(s.validateProcessRoomThreshold({ id: "p-1" })).toMatchObject({ status: 400 });
  });

  it("accepts a valid target/max change", () => {
    const s = svc();
    expect(
      s.validateProcessRoomThreshold({ ...base, target_temp_c: 3, max_temp_c: 6 }),
    ).toEqual({ ok: true });
  });
});

describe("HaccpDailyChecksService — updateProcessRoomThreshold", () => {
  it("updates the row and returns the updated domain shape", async () => {
    const s = svc();
    const updated = await s.updateProcessRoomThreshold({
      input: { id: "p-1", target_temp_c: 3 },
      changedBy: "admin-1",
    });
    expect(updated.target_temp_c).toBe(3);
    const all = await s.listProcessRoomThresholds();
    expect(all.find((t) => t.id === "p-1")?.target_temp_c).toBe(3);
  });
});
