/**
 * tests/unit/wiring/visitsService.test.ts
 *
 * F-18 PR1 — pins the Visits composition root.
 *
 * `lib/wiring/visits.ts` exports the service-role `visitsService` singleton
 * (master key — bypasses RLS, the rollback parachute). Since F-RLS-04g it ALSO
 * exports the per-caller authenticated factory `visitsServiceForCaller` — this
 * test pins that the singleton is intact and the factory is now exported (the
 * factory's behaviour is covered in detail by visitsServiceForCaller.test.ts).
 *
 * The Supabase adapter exports the wiring touches are mocked so importing the
 * wiring module does not stand up a real Supabase client.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseVisitsRepository: { __visitsRepoSingleton: true },
  createSupabaseVisitsRepository: vi.fn(() => ({ __perCallerVisitsRepo: true })),
  authenticatedClientForCaller: vi.fn(() => ({ __authedClient: true })),
}));

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: vi.fn(async () => "test.jwt.token") },
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

  it("exports visitsServiceForCaller (added by F-RLS-04g; behaviour pinned in visitsServiceForCaller.test.ts)", async () => {
    const mod = await import("@/lib/wiring/visits");
    expect(
      typeof (mod as Record<string, unknown>).visitsServiceForCaller,
    ).toBe("function");
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
