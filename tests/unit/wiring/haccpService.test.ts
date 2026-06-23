/**
 * tests/unit/wiring/haccpService.test.ts
 *
 * F-19 PR1 — pins the HACCP Cluster A composition root.
 *
 * `lib/wiring/haccp.ts` exports THREE service-role singletons
 * (haccpDailyChecksService, haccpCorrectiveActionsService, submitHaccpDailyCheck)
 * built on the master-key (RLS-bypassing) Supabase adapters — identical access
 * to the routes today. PR1 is introduce-only: the singletons are constructed but
 * have no caller yet.
 *
 * Pins:
 *   - the 3 singletons are defined and expose their method surface;
 *   - the wiring exports the service-role singletons ONLY — NO `…ForCaller`
 *     per-caller factory (that fires RLS and is F-RLS-04h);
 *   - the factories return a distinct object per call (no shared mutable state).
 *
 * The Supabase adapter singletons are mocked so importing the wiring module does
 * not stand up a real Supabase client.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseHaccpDailyChecksRepository: { __dailyChecksRepoSingleton: true },
  supabaseHaccpCorrectiveActionsRepository: { __caRepoSingleton: true },
  supabaseHaccpAssessmentsRepository: { __assessmentsRepoSingleton: true },
  supabaseHaccpTrainingRepository: { __trainingRepoSingleton: true },
  supabaseHaccpPeopleRepository: { __peopleRepoSingleton: true },
  supabaseHaccpReviewsRepository: { __reviewsRepoSingleton: true },
  supabaseHaccpAnnualReviewRepository: { __annualReviewRepoSingleton: true },
}));

const DAILY_CHECKS_METHODS = [
  "deliveryTempStatus",
  "buildBatchNumber",
  "validateDelivery",
  "buildDelivery",
  "buildDeliveryCorrectiveActions",
  "validateColdStorage",
  "buildColdStorageCorrectiveActions",
  "validateCalibrationManual",
  "validateCleaning",
  "validateProcessingTemp",
  "validateDailyDiary",
  "validateMince",
  "validateMeatPrep",
  "validateTimeSeparation",
  "validateReturn",
  "buildReturnCorrectiveActions",
  "insertDelivery",
  "insertReturn",
] as const;

const CA_METHODS = [
  "insertCorrectiveActions",
  "listVerificationQueue",
  "signOff",
] as const;

// F-19 PR4 — Cluster C training + people singletons.
const TRAINING_METHODS = [
  "getTraining",
  "validateStaffTraining",
  "buildStaffTrainingPersist",
  "insertStaffTraining",
  "validateAllergenTraining",
  "buildAllergenTrainingPersist",
  "insertAllergenTraining",
] as const;

const PEOPLE_METHODS = [
  "getRecords",
  "insertHealthRecord",
  "validateNewStaffDeclaration",
  "buildNewStaffDeclaration",
  "validateReturnToWork",
  "buildReturnToWork",
  "validateVisitor",
  "buildVisitorHealthRecord",
] as const;

// F-19 PR5 — Cluster D reviews + annual-review singletons.
const REVIEWS_METHODS = [
  "getReviews",
  "validateWeekly",
  "buildWeeklyPersist",
  "buildWeeklyCorrectiveActions",
  "insertWeeklyReview",
  "validateMonthly",
  "buildMonthlyPersist",
  "buildMonthlySystemCorrectiveActions",
  "insertMonthlyReview",
  "insertCorrectiveActions",
] as const;

const ANNUAL_REVIEW_METHODS = [
  "getReviews",
  "validateCreate",
  "buildCreatePersist",
  "createDraft",
  "validatePatch",
  "buildSignOffPersist",
  "buildUpdatePersist",
  "findCurrent",
  "signOff",
  "update",
] as const;

describe("F-19 haccp wiring (service-role singletons)", () => {
  it("exports the 3 singletons exposing their surfaces", async () => {
    const {
      haccpDailyChecksService,
      haccpCorrectiveActionsService,
      submitHaccpDailyCheck,
    } = await import("@/lib/wiring/haccp");

    expect(haccpDailyChecksService).toBeDefined();
    for (const m of DAILY_CHECKS_METHODS) {
      expect(
        typeof (haccpDailyChecksService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }

    expect(haccpCorrectiveActionsService).toBeDefined();
    for (const m of CA_METHODS) {
      expect(
        typeof (haccpCorrectiveActionsService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }

    expect(submitHaccpDailyCheck).toBeDefined();
    expect(typeof submitHaccpDailyCheck.fileCorrectiveActions).toBe("function");
  });

  it("exports the F-19 PR4 Cluster C training + people singletons exposing their surfaces", async () => {
    const { haccpTrainingService, haccpPeopleService } = await import(
      "@/lib/wiring/haccp"
    );

    expect(haccpTrainingService).toBeDefined();
    for (const m of TRAINING_METHODS) {
      expect(
        typeof (haccpTrainingService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }

    expect(haccpPeopleService).toBeDefined();
    for (const m of PEOPLE_METHODS) {
      expect(
        typeof (haccpPeopleService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("exports the F-19 PR5 Cluster D reviews + annual-review singletons exposing their surfaces", async () => {
    const { haccpReviewsService, haccpAnnualReviewService } = await import(
      "@/lib/wiring/haccp"
    );

    expect(haccpReviewsService).toBeDefined();
    for (const m of REVIEWS_METHODS) {
      expect(
        typeof (haccpReviewsService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }

    expect(haccpAnnualReviewService).toBeDefined();
    for (const m of ANNUAL_REVIEW_METHODS) {
      expect(
        typeof (
          haccpAnnualReviewService as unknown as Record<string, unknown>
        )[m],
      ).toBe("function");
    }
  });

  it("exports service-role singletons ONLY — no …ForCaller (that is F-RLS-04h)", async () => {
    const mod = (await import("@/lib/wiring/haccp")) as Record<string, unknown>;
    const exportNames = Object.keys(mod);
    expect(exportNames.some((n) => /ForCaller/.test(n))).toBe(false);
    // Exactly the intended exports (F-19 PR3 added haccpAssessmentsService;
    // F-19 PR4 added haccpTrainingService + haccpPeopleService; F-19 PR5 added
    // haccpReviewsService + haccpAnnualReviewService).
    expect(new Set(exportNames)).toEqual(
      new Set([
        "haccpDailyChecksService",
        "haccpCorrectiveActionsService",
        "submitHaccpDailyCheck",
        "haccpAssessmentsService",
        "haccpTrainingService",
        "haccpPeopleService",
        "haccpReviewsService",
        "haccpAnnualReviewService",
      ]),
    );
  });

  it("the factories return a distinct object per call (no shared state)", async () => {
    const {
      createHaccpDailyChecksService,
      createHaccpCorrectiveActionsService,
    } = await import("@/lib/services");
    const dcDeps = {
      dailyChecks: { __dailyChecksRepoSingleton: true },
    } as unknown as Parameters<typeof createHaccpDailyChecksService>[0];
    expect(createHaccpDailyChecksService(dcDeps)).not.toBe(
      createHaccpDailyChecksService(dcDeps),
    );
    const caDeps = {
      correctiveActions: { __caRepoSingleton: true },
    } as unknown as Parameters<typeof createHaccpCorrectiveActionsService>[0];
    expect(createHaccpCorrectiveActionsService(caDeps)).not.toBe(
      createHaccpCorrectiveActionsService(caDeps),
    );
  });
});
