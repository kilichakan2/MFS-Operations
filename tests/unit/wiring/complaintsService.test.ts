/**
 * tests/unit/wiring/complaintsService.test.ts
 *
 * F-17 PR1 — pins the Complaints composition root.
 *
 * `lib/wiring/complaints.ts` exports the service-role `complaintsService`
 * singleton (master key — bypasses RLS, identical to the routes today). PR1 is
 * introduce-only: the singleton is constructed but has no caller yet (the
 * per-caller authenticated factory is deferred to F-RLS-04f).
 *
 * Two pins, same posture as the existing wiring pins:
 *   - `complaintsService` is defined and exposes the ComplaintsService surface.
 *   - `createComplaintsService` returns a DISTINCT object per call (no shared
 *     mutable state) — so per-caller construction is safe to add later.
 *
 * The Supabase adapter singleton is mocked so importing the wiring module does
 * not stand up a real Supabase client.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseComplaintsRepository: { __complaintsRepoSingleton: true },
}));

const COMPLAINTS_SERVICE_METHODS = [
  "listAllWithNotes",
  "listOpen",
  "findDetailById",
  "validateCreate",
  "validateResolve",
  "validateNote",
  "createComplaint",
  "resolveOpen",
  "findEmailContext",
  "createNote",
] as const;

describe("F-17 complaintsService wiring (service-role singleton)", () => {
  it("exports a defined complaintsService exposing the ComplaintsService surface", async () => {
    const { complaintsService } = await import("@/lib/wiring/complaints");
    expect(complaintsService).toBeDefined();
    for (const m of COMPLAINTS_SERVICE_METHODS) {
      expect(
        typeof (complaintsService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("createComplaintsService returns a distinct object per call (no shared state)", async () => {
    const { createComplaintsService } = await import("@/lib/services");
    const deps = {
      complaints: { __complaintsRepoSingleton: true },
    } as unknown as Parameters<typeof createComplaintsService>[0];
    const a = createComplaintsService(deps);
    const b = createComplaintsService(deps);
    expect(a).not.toBe(b);
  });
});
