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
 *   - the wiring exports the 12 service-role singletons (parachutes) AND, since
 *     F-RLS-04h PR10a, the 12 `…ForCaller` per-caller factories (the per-request
 *     authenticated keycards — LIVE as of PR10b: the 32 routes now call them; the
 *     singletons survive purely as rollback parachutes + the public visitor kiosk);
 *   - the factories return a distinct object per call (no shared mutable state).
 *
 * The per-request / never-memoize behaviour of the `…ForCaller` factories is
 * pinned separately in `haccpServiceForCaller.test.ts`.
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
  supabaseHaccpReportingRepository: { __reportingRepoSingleton: true },
  // F-19 PR9a — Cluster F docs & lookups repos.
  supabaseHaccpHandbookRepository: { __handbookRepoSingleton: true },
  supabaseHaccpSuppliersRepository: { __suppliersRepoSingleton: true },
  supabaseHaccpLookupsRepository: { __lookupsRepoSingleton: true },
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

// F-19 PR7 — Cluster E reporting singleton (read-only cross-table aggregator).
const REPORTING_METHODS = [
  "getTodayStatus",
  "getOverview",
  "getAnnualReviewData",
  "getAuditHeatmap",
  "getAuditSection",
  "buildAuditWorkbook",
] as const;

// F-19 PR9a — Cluster F docs & lookups singletons.
const HANDBOOK_METHODS = ["getHandbook", "search", "getDocuments"] as const;

const SUPPLIERS_METHODS = [
  "getLabelCode",
  "getRecallContactList",
  "saveRecallConfig",
  "updateRecallSupplierContact",
  "listSuppliers",
  "createSupplier",
  "updateSupplier",
] as const;

const LOOKUPS_METHODS = ["getUsers", "getCustomers"] as const;

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

  it("exports the F-19 PR7 Cluster E reporting singleton exposing its surface", async () => {
    const { haccpReportingService } = await import("@/lib/wiring/haccp");

    expect(haccpReportingService).toBeDefined();
    for (const m of REPORTING_METHODS) {
      expect(
        typeof (haccpReportingService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("exports the F-19 PR9a Cluster F docs & lookups singletons exposing their surfaces", async () => {
    const { haccpHandbookService, haccpSuppliersService, haccpLookupsService } =
      await import("@/lib/wiring/haccp");

    expect(haccpHandbookService).toBeDefined();
    for (const m of HANDBOOK_METHODS) {
      expect(
        typeof (haccpHandbookService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }

    expect(haccpSuppliersService).toBeDefined();
    for (const m of SUPPLIERS_METHODS) {
      expect(
        typeof (haccpSuppliersService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }

    expect(haccpLookupsService).toBeDefined();
    for (const m of LOOKUPS_METHODS) {
      expect(
        typeof (haccpLookupsService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("exports the 12 service-role singletons (parachutes) AND the 12 …ForCaller factories (F-RLS-04h PR10a)", async () => {
    const mod = (await import("@/lib/wiring/haccp")) as Record<string, unknown>;
    const exportNames = Object.keys(mod);

    // F-RLS-04h PR10a added the keycard factories; PR10b made them LIVE (the 32
    // routes call them). Pin both halves: the 12 master-key singletons SURVIVE as
    // the rollback parachute (+ public visitor kiosk), AND the 12 per-caller
    // …ForCaller factories are present.
    const SINGLETONS = [
      "haccpDailyChecksService",
      "haccpCorrectiveActionsService",
      "submitHaccpDailyCheck",
      "haccpAssessmentsService",
      "haccpTrainingService",
      "haccpPeopleService",
      "haccpReviewsService",
      "haccpAnnualReviewService",
      "haccpReportingService",
      "haccpHandbookService",
      "haccpSuppliersService",
      "haccpLookupsService",
    ];
    const FOR_CALLER = [
      "haccpDailyChecksServiceForCaller",
      "haccpCorrectiveActionsServiceForCaller",
      "haccpAssessmentsServiceForCaller",
      "haccpTrainingServiceForCaller",
      "haccpPeopleServiceForCaller",
      "haccpReviewsServiceForCaller",
      "haccpAnnualReviewServiceForCaller",
      "haccpReportingServiceForCaller",
      "haccpHandbookServiceForCaller",
      "haccpSuppliersServiceForCaller",
      "haccpLookupsServiceForCaller",
      "submitHaccpDailyCheckForCaller",
    ];

    // Every singleton STILL exported (parachutes survive).
    for (const n of SINGLETONS) expect(mod[n]).toBeDefined();
    // Every …ForCaller factory now exists, and is a function (the keycard machine).
    for (const n of FOR_CALLER) expect(typeof mod[n]).toBe("function");

    // EXACT export set = the 12 singletons + the 12 new ForCaller factories (24).
    expect(new Set(exportNames)).toEqual(new Set([...SINGLETONS, ...FOR_CALLER]));
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
