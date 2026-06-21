/**
 * tests/unit/wiring/complimentsService.test.ts
 *
 * F-17 PR1 — pins the Compliments composition root.
 *
 * `lib/wiring/compliments.ts` exports the service-role `complimentsService`
 * singleton (master key — bypasses RLS, identical to the routes today). PR1 is
 * introduce-only: the singleton is constructed but has no caller yet (the
 * per-caller authenticated factory is deferred to F-RLS-04f).
 *
 * Two pins, same posture as the existing wiring pins:
 *   - `complimentsService` is defined and exposes the ComplimentsService surface.
 *   - `createComplimentsService` returns a DISTINCT object per call.
 *
 * The Supabase adapter singleton is mocked so importing the wiring module does
 * not stand up a real Supabase client.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseComplimentsRepository: { __complimentsRepoSingleton: true },
}));

const COMPLIMENTS_SERVICE_METHODS = [
  "listRecent",
  "validateCreate",
  "createCompliment",
  "listActiveRecipients",
] as const;

describe("F-17 complimentsService wiring (service-role singleton)", () => {
  it("exports a defined complimentsService exposing the ComplimentsService surface", async () => {
    const { complimentsService } = await import("@/lib/wiring/compliments");
    expect(complimentsService).toBeDefined();
    for (const m of COMPLIMENTS_SERVICE_METHODS) {
      expect(
        typeof (complimentsService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("createComplimentsService returns a distinct object per call (no shared state)", async () => {
    const { createComplimentsService } = await import("@/lib/services");
    const deps = {
      compliments: { __complimentsRepoSingleton: true },
    } as unknown as Parameters<typeof createComplimentsService>[0];
    const a = createComplimentsService(deps);
    const b = createComplimentsService(deps);
    expect(a).not.toBe(b);
  });
});
