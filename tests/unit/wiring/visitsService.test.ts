/**
 * tests/unit/wiring/visitsService.test.ts
 *
 * F-18 PR1 — pins the Visits composition root.
 *
 * `lib/wiring/visits.ts` exports the service-role `visitsService` singleton
 * (master key — bypasses RLS, identical to the routes today). PR1 is
 * introduce-only: the singleton is constructed but has no caller yet (the
 * per-caller authenticated factory `visitsServiceForCaller` is DEFERRED to
 * F-RLS-04g — this test pins that it is NOT exported yet).
 *
 * The Supabase adapter singleton is mocked so importing the wiring module does
 * not stand up a real Supabase client.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseVisitsRepository: { __visitsRepoSingleton: true },
}));

const VISITS_SERVICE_METHODS = [
  "validateCreate",
  "validatePipelineStatus",
  "validateNote",
  "validateUpdateNote",
  "createVisit",
  "updateProspectLocation",
  "listForCaller",
  "deleteOwnVisit",
  "updatePipelineStatus",
  "verifyVisitOwnership",
  "listNotes",
  "createNote",
  "updateNote",
  "findDetailById",
  "listAllWithFilters",
] as const;

describe("F-18 visitsService wiring (service-role singleton)", () => {
  it("exports a defined visitsService exposing the VisitsService surface", async () => {
    const { visitsService } = await import("@/lib/wiring/visits");
    expect(visitsService).toBeDefined();
    for (const m of VISITS_SERVICE_METHODS) {
      expect(
        typeof (visitsService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("does NOT export visitsServiceForCaller yet (deferred to F-RLS-04g)", async () => {
    const mod = await import("@/lib/wiring/visits");
    expect(
      (mod as Record<string, unknown>).visitsServiceForCaller,
    ).toBeUndefined();
  });

  it("createVisitsService returns a distinct object per call (no shared state)", async () => {
    const { createVisitsService } = await import("@/lib/services");
    const deps = {
      visits: { __visitsRepoSingleton: true },
    } as unknown as Parameters<typeof createVisitsService>[0];
    const a = createVisitsService(deps);
    const b = createVisitsService(deps);
    expect(a).not.toBe(b);
  });
});
