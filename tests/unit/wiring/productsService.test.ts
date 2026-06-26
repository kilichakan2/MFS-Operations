/**
 * tests/unit/wiring/productsService.test.ts
 *
 * F-20 PR2 — pins the Products admin composition root.
 *
 * `lib/wiring/products.ts` exports the service-role `productsService` singleton
 * (master key — bypasses RLS, identical to the two admin routes today). Two
 * pins, same posture as the other wiring pins:
 *   - `productsService` is defined and exposes the ProductsService surface.
 *   - `createProductsService` returns a DISTINCT object per call (no shared
 *     mutable state) — so a per-caller variant is safe to add later (F-RLS-04i).
 *
 * The Supabase adapter singleton is mocked so importing the wiring module does
 * not stand up a real Supabase client (keeps the test hermetic).
 */
import { describe, it, expect } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseProductsRepository: { __productsRepoSingleton: true },
}));

const PRODUCTS_SERVICE_METHODS = [
  "findProductsByIds",
  "listAll",
  "setActive",
] as const;

describe("F-20 productsService wiring (service-role singleton)", () => {
  it("exports a defined productsService exposing the ProductsService surface", async () => {
    const { productsService } = await import("@/lib/wiring/products");
    expect(productsService).toBeDefined();
    for (const m of PRODUCTS_SERVICE_METHODS) {
      expect(
        typeof (productsService as unknown as Record<string, unknown>)[m],
      ).toBe("function");
    }
  });

  it("createProductsService returns a distinct object per call (no shared state)", async () => {
    const { createProductsService } = await import("@/lib/services");
    const deps = {
      products: { __productsRepoSingleton: true },
    } as unknown as Parameters<typeof createProductsService>[0];
    const a = createProductsService(deps);
    const b = createProductsService(deps);
    expect(a).not.toBe(b);
  });
});
