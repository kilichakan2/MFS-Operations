/**
 * tests/unit/wiring/customersService.test.ts
 *
 * F-20 PR1 — pins the Customers admin composition root.
 *
 * `lib/wiring/customers.ts` exports the service-role `customersService`
 * singleton (master key — bypasses RLS, identical to the three admin routes
 * today). Two pins, same posture as the other wiring pins:
 *   - `customersService` is defined and exposes the CustomersService surface.
 *   - `createCustomersService` returns a DISTINCT object per call (no shared
 *     mutable state) — so a per-caller variant is safe to add later (F-RLS-04i).
 *
 * The Supabase adapter singleton is mocked so importing the wiring module does
 * not stand up a real Supabase client (keeps the test hermetic).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseCustomersRepository: { __customersRepoSingleton: true },
}));

const CUSTOMERS_SERVICE_METHODS = [
  "listAll",
  "listUngeocoded",
  "setActive",
  "setPostcodeAndCoords",
  "setCoords",
] as const;

describe("F-20 customersService wiring (service-role singleton)", () => {
  it("exports a defined customersService exposing the CustomersService surface", async () => {
    const { customersService } = await import("@/lib/wiring/customers");
    expect(customersService).toBeDefined();
    for (const m of CUSTOMERS_SERVICE_METHODS) {
      expect(
        typeof (customersService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("createCustomersService returns a distinct object per call (no shared state)", async () => {
    const { createCustomersService } = await import("@/lib/services");
    const deps = {
      customers: { __customersRepoSingleton: true },
    } as unknown as Parameters<typeof createCustomersService>[0];
    const a = createCustomersService(deps);
    const b = createCustomersService(deps);
    expect(a).not.toBe(b);
  });
});
