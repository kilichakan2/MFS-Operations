/**
 * tests/unit/wiring/haccpAssessments.test.ts
 *
 * F-19 PR3 — pins the Cluster B addition to the HACCP composition root.
 *
 * `lib/wiring/haccp.ts` now also exports `haccpAssessmentsService`, a service-
 * role singleton built on the master-key (RLS-bypassing) Supabase adapter —
 * identical access to the 5 Cluster B routes today.
 *
 * Pins:
 *   - the singleton is defined and exposes its full method surface;
 *   - the wiring still exports the `haccpAssessmentsService` service-role
 *     singleton (the rollback parachute) AND, since F-RLS-04h PR10a, the
 *     matching `haccpAssessmentsServiceForCaller` per-caller factory (the
 *     per-request keycard — LIVE as of PR10b: the assessment routes call it);
 *   - the factory returns a distinct object per call (no shared mutable state).
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
  // F-19 PR9a — Cluster F docs & lookups repos (so the wiring import resolves).
  supabaseHaccpHandbookRepository: { __handbookRepoSingleton: true },
  supabaseHaccpSuppliersRepository: { __suppliersRepoSingleton: true },
  supabaseHaccpLookupsRepository: { __lookupsRepoSingleton: true },
}));

const ASSESSMENTS_METHODS = [
  "listAllergenAssessments",
  "validateAllergenAssessment",
  "buildAllergenAssessmentPersist",
  "insertAllergenAssessment",
  "listMonthlyReviews",
  "runMonthlyReview",
  "getFoodDefence",
  "validateFoodDefence",
  "buildFoodDefencePersist",
  "insertFoodDefencePlan",
  "getFoodFraud",
  "validateFoodFraud",
  "buildFoodFraudPersist",
  "insertFoodFraudAssessment",
  "getProductSpecs",
  "validateProductSpec",
  "buildProductSpecPersist",
  "insertProductSpec",
  "updateProductSpec",
] as const;

describe("F-19 PR3 haccp wiring (Cluster B assessments singleton)", () => {
  it("exports haccpAssessmentsService exposing its full surface", async () => {
    const { haccpAssessmentsService } = await import("@/lib/wiring/haccp");
    expect(haccpAssessmentsService).toBeDefined();
    for (const m of ASSESSMENTS_METHODS) {
      expect(
        typeof (haccpAssessmentsService as unknown as Record<string, unknown>)[
          m
        ],
      ).toBe("function");
    }
  });

  it("exports the haccpAssessmentsService singleton AND its …ForCaller factory (F-RLS-04h PR10a/PR10b)", async () => {
    const mod = (await import("@/lib/wiring/haccp")) as Record<string, unknown>;
    const exportNames = Object.keys(mod);
    // PR10a added the keycard factory; PR10b made it LIVE (the routes call it).
    // The master-key singleton SURVIVES as the rollback parachute alongside its
    // per-caller factory.
    expect(exportNames).toContain("haccpAssessmentsService");
    expect(typeof mod.haccpAssessmentsServiceForCaller).toBe("function");
  });

  it("the factory returns a distinct object per call (no shared state)", async () => {
    const { createHaccpAssessmentsService } = await import("@/lib/services");
    const deps = {
      assessments: { __assessmentsRepoSingleton: true },
    } as unknown as Parameters<typeof createHaccpAssessmentsService>[0];
    expect(createHaccpAssessmentsService(deps)).not.toBe(
      createHaccpAssessmentsService(deps),
    );
  });
});
