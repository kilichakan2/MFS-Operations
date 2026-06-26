/**
 * tests/unit/services/CustomersService.test.ts
 *
 * F-20 PR1 — exercises CustomersService over the Fake CustomersRepository.
 * The service is a thin pass-through, so these tests prove each method
 * delegates to the right repository method and returns the CustomerAdminView
 * shape unchanged. No DB, no network.
 */
import { describe, it, expect } from "vitest";
import { createCustomersService } from "@/lib/services";
import { createFakeCustomersRepository } from "@/lib/adapters/fake";
import type { CustomerAdminView } from "@/lib/domain";

const A: CustomerAdminView = {
  id: "00000000-0000-0000-0000-0000000000a1",
  name: "Alpha Co",
  postcode: "S3 8DG",
  lat: null,
  lng: null,
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
};
const B: CustomerAdminView = {
  id: "00000000-0000-0000-0000-0000000000b2",
  name: "Bravo Ltd",
  postcode: "S70 1KW",
  lat: 53.5,
  lng: -1.4,
  active: true,
  created_at: "2026-01-02T00:00:00.000Z",
};

function makeService(seed = [B, A]) {
  return createCustomersService({
    customers: createFakeCustomersRepository(seed),
  });
}

describe("CustomersService", () => {
  it("listAll returns all customers ordered by name asc", async () => {
    const svc = makeService();
    const rows = await svc.listAll();
    expect(rows.map((r) => r.name)).toEqual(["Alpha Co", "Bravo Ltd"]);
  });

  it("listUngeocoded returns only rows with a postcode and no coords", async () => {
    const svc = makeService();
    const rows = await svc.listUngeocoded(500);
    // Only A is ungeocoded (B has coords).
    expect(rows.map((r) => r.id)).toEqual([A.id]);
  });

  it("listUngeocoded respects the limit", async () => {
    const svc = makeService([A, { ...A, id: "x", name: "x" }]);
    const rows = await svc.listUngeocoded(1);
    expect(rows).toHaveLength(1);
  });

  it("setActive flips the flag and returns the updated row", async () => {
    const svc = makeService();
    const updated = await svc.setActive(A.id, false);
    expect(updated?.active).toBe(false);
    expect(updated?.id).toBe(A.id);
  });

  it("setActive returns null for an unknown id", async () => {
    const svc = makeService();
    expect(await svc.setActive("nope", true)).toBeNull();
  });

  it("setPostcodeAndCoords persists and returns the updated row", async () => {
    const svc = makeService();
    const updated = await svc.setPostcodeAndCoords(A.id, {
      postcode: "LS1 1AA",
      lat: 53.8,
      lng: -1.55,
      geocoded_at: "2026-06-26T00:00:00.000Z",
      is_approximate_location: false,
    });
    expect(updated?.postcode).toBe("LS1 1AA");
    expect(updated?.lat).toBe(53.8);
    expect(updated?.is_approximate_location).toBe(false);
  });

  it("setCoords stamps coords (void) and is reflected on a later read", async () => {
    const repo = createFakeCustomersRepository([A]);
    const svc = createCustomersService({ customers: repo });
    await expect(
      svc.setCoords(A.id, {
        lat: 51.5,
        lng: -0.12,
        geocoded_at: "2026-06-26T00:00:00.000Z",
        is_approximate_location: true,
      }),
    ).resolves.toBeUndefined();
    // A had a postcode + null coords; after setCoords it is no longer ungeocoded.
    const remaining = await svc.listUngeocoded(500);
    expect(remaining.map((r) => r.id)).not.toContain(A.id);
  });
});
