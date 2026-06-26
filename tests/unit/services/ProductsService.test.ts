/**
 * tests/unit/services/ProductsService.test.ts
 *
 * F-20 PR3 — exercises the ProductsService import surface (insertMany,
 * insertOne) over the Fake ProductsRepository. The service is a thin
 * pass-through, so these prove each method delegates and returns the typed
 * result unchanged. No DB, no network.
 */
import { describe, it, expect } from "vitest";
import { createProductsService } from "@/lib/services";
import { createFakeProductsRepository } from "@/lib/adapters/fake";

function makeService() {
  return createProductsService({ products: createFakeProductsRepository([]) });
}

describe("ProductsService — import surface (F-20 PR3)", () => {
  it("insertMany delegates and returns an id for each created row", async () => {
    const created = await makeService().insertMany([
      {
        name: "Lamb leg",
        category: "Lamb",
        code: "LMB",
        box_size: "10 kg",
        created_by: "u-1",
      },
      {
        name: "Beef rib",
        category: null,
        code: null,
        box_size: null,
        created_by: "u-1",
      },
    ]);
    expect(created.length).toBe(2);
    for (const c of created) expect(typeof c.id).toBe("string");
  });

  it("insertOne returns inserted on a fresh name, duplicate on a repeat", async () => {
    const svc = makeService();
    const row = {
      name: "Dup product",
      category: null,
      code: null,
      box_size: null,
      created_by: "u-1",
    };
    expect(await svc.insertOne(row)).toEqual({ outcome: "inserted" });
    expect(await svc.insertOne(row)).toEqual({ outcome: "duplicate" });
  });
});
