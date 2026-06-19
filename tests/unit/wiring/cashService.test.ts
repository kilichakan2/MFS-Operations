/**
 * tests/unit/wiring/cashService.test.ts
 *
 * F-16 PR1 — pins the Cash composition root.
 *
 * `lib/wiring/cash.ts` exports the service-role `cashService` singleton
 * (master key — bypasses RLS, identical to the routes today). PR1 is
 * introduce-only: the singleton is constructed but has no caller yet.
 *
 * Two pins, same posture as the existing wiring pins:
 *   - `cashService` is defined and exposes the CashService surface.
 *   - `createCashService` returns a DISTINCT object per call (no accidental
 *     shared mutable state) — so PR2 / F-RLS-04e per-caller construction is
 *     safe to add later.
 *
 * The Supabase adapter singletons are mocked so importing the wiring module
 * does not stand up a real Supabase client (lazy proxy needs no env, but the
 * mock keeps the test hermetic and inspectable).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseCashRepository: { __cashRepoSingleton: true },
  supabaseAttachmentStorage: { __attachmentStorageSingleton: true },
}));

const CASH_SERVICE_METHODS = [
  "closingBalance",
  "monthSummary",
  "validateEntry",
  "validateCheque",
  "validateAndBuildUploadPath",
  "buildCashBookCsv",
  "buildChequeRegisterCsv",
  "findMonth",
  "findMonthById",
  "probeMonth",
  "createMonth",
  "setMonthLocked",
  "listEntriesForMonth",
  "createEntry",
  "updateEntry",
  "deleteEntry",
  "listCheques",
  "createCheque",
  "bankCheque",
  "updateCheque",
  "deleteCheque",
  "uploadAttachment",
  "readCashBookData",
  "readChequeRegisterData",
] as const;

describe("F-16 cashService wiring (service-role singleton)", () => {
  it("exports a defined cashService exposing the CashService surface", async () => {
    const { cashService } = await import("@/lib/wiring/cash");
    expect(cashService).toBeDefined();
    for (const m of CASH_SERVICE_METHODS) {
      expect(typeof (cashService as unknown as Record<string, unknown>)[m]).toBe(
        "function",
      );
    }
  });

  it("createCashService returns a distinct object per call (no shared state)", async () => {
    const { createCashService } = await import("@/lib/services");
    const deps = {
      cash: { __cashRepoSingleton: true },
      attachments: { __attachmentStorageSingleton: true },
    } as unknown as Parameters<typeof createCashService>[0];
    const a = createCashService(deps);
    const b = createCashService(deps);
    expect(a).not.toBe(b);
  });
});
