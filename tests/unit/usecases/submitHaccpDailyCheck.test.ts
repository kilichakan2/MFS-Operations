/**
 * tests/unit/usecases/submitHaccpDailyCheck.test.ts
 *
 * F-19 PR1 — the daily-check submit use-case's soft-fail contract.
 *   - happy path: N CA rows fan out to the CA service, ca_write_failed=false;
 *   - the 3-CA-row delivery case files 3 rows;
 *   - empty rows → no-op, ca_write_failed=false;
 *   - CA-insert FAILURE → ca_write_failed=true, NOT thrown (the daily-check
 *     row stays committed — this is the central soft-fail pin).
 */
import { describe, it, expect, vi } from "vitest";
import { createSubmitHaccpDailyCheck } from "@/lib/usecases/submitHaccpDailyCheck";
import { createHaccpCorrectiveActionsService } from "@/lib/services";
import { createFakeHaccpCorrectiveActionsRepository } from "@/lib/adapters/fake";
import type { CorrectiveActionInsert } from "@/lib/domain";

// Silence the use-case's structured error log on the soft-fail case.
vi.mock("@/lib/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function rows(n: number): CorrectiveActionInsert[] {
  return Array.from({ length: n }, (_, i) => ({
    actioned_by: "u1",
    source_table: "haccp_deliveries" as const,
    source_id: `src${i}`,
    ccp_ref: "CCP1",
    deviation_description: "x",
    action_taken: "y",
    product_disposition: "reject",
    recurrence_prevention: "z",
    management_verification_required: true,
    resolved: false,
  }));
}

function makeUseCase(caRepo = createFakeHaccpCorrectiveActionsRepository()) {
  const correctiveActions = createHaccpCorrectiveActionsService({
    correctiveActions: caRepo,
  });
  return {
    uc: createSubmitHaccpDailyCheck({ correctiveActions }),
    caRepo,
  };
}

describe("submitHaccpDailyCheck — soft-fail contract", () => {
  it("happy path files the CA rows and reports ca_write_failed:false", async () => {
    const { uc, caRepo } = makeUseCase();
    const res = await uc.fileCorrectiveActions(rows(2), "delivery");
    expect(res.ca_write_failed).toBe(false);
    expect(caRepo.inserted).toHaveLength(2);
  });

  it("the 3-row delivery fan-out files exactly 3 rows", async () => {
    const { uc, caRepo } = makeUseCase();
    const res = await uc.fileCorrectiveActions(rows(3), "delivery");
    expect(res.ca_write_failed).toBe(false);
    expect(caRepo.insertBatches).toHaveLength(1);
    expect(caRepo.inserted).toHaveLength(3);
  });

  it("an empty batch is a no-op (ca_write_failed:false, nothing inserted)", async () => {
    const { uc, caRepo } = makeUseCase();
    const res = await uc.fileCorrectiveActions([], "timesep");
    expect(res.ca_write_failed).toBe(false);
    expect(caRepo.inserted).toHaveLength(0);
  });

  it("a CA-insert failure → ca_write_failed:true and does NOT throw", async () => {
    const failingRepo = createFakeHaccpCorrectiveActionsRepository({
      insertFailsWith: new Error("DB down"),
    });
    const { uc } = makeUseCase(failingRepo);
    // Must resolve (not reject) — the daily-check row is already committed.
    const res = await uc.fileCorrectiveActions(rows(1), "cold-storage");
    expect(res.ca_write_failed).toBe(true);
  });
});
