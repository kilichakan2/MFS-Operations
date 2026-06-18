/**
 * tests/unit/services/PricingService.test.ts
 *
 * Unit tests for PricingService — the business box (no DB). Unlike
 * RoutesService, Pricing owns NO date-rollover rule (is_expired is computed
 * in the adapter's read mapping). So this service is a thin passthrough:
 * the tests prove every method delegates to the port unchanged — once
 * against the Fake adapter end-to-end, and once via a spy to pin the exact
 * arguments/return are forwarded verbatim.
 */
import { describe, it, expect, vi } from "vitest";
import { createPricingService } from "@/lib/services";
import { createFakePricingRepository } from "@/lib/adapters/fake";
import type { PricingRepository } from "@/lib/ports";

const AGREED_BY = "00000000-0000-0000-0000-0000000000a1";
const CUSTOMER_ID = "00000000-0000-0000-0000-0000000000c1";
const PRODUCT_ID = "00000000-0000-0000-0000-0000000000d1";

function fakeWithJoins() {
  return createFakePricingRepository({
    people: { [AGREED_BY]: { id: AGREED_BY, name: "ANVIL-FAKE-rep" } },
    customers: {
      [CUSTOMER_ID]: { id: CUSTOMER_ID, name: "ANVIL-FAKE-customer" },
    },
    products: {
      [PRODUCT_ID]: {
        id: PRODUCT_ID,
        name: "ANVIL-FAKE-product",
        boxSize: null,
        code: null,
      },
    },
  });
}

function baseAgreement() {
  return {
    customerId: CUSTOMER_ID,
    prospectName: null,
    agreedBy: AGREED_BY,
    validFrom: "2026-06-01",
    validUntil: "2026-12-31",
    notes: null,
    lines: [
      {
        productId: PRODUCT_ID,
        productNameOverride: null,
        price: 9.5,
        unit: "per_kg" as const,
        notes: null,
        position: 0,
      },
    ],
  };
}

// ─── end-to-end passthrough against the Fake ───────────────────────────

describe("PricingService — passthrough against the Fake adapter", () => {
  it("createAgreement → getAgreementById round-trips through the service", async () => {
    const service = createPricingService({ pricing: fakeWithJoins() });
    const created = await service.createAgreement(baseAgreement());
    expect(created.id).toBeTruthy();

    const full = await service.getAgreementById(created.id);
    expect(full).not.toBeNull();
    expect(full?.id).toBe(created.id);
    expect(full?.lines.length).toBe(1);
    expect(full?.repName).toBe("ANVIL-FAKE-rep");
  });

  it("addLine / replaceLines / updateAgreement / delete flow through the service", async () => {
    const service = createPricingService({ pricing: fakeWithJoins() });
    const created = await service.createAgreement({
      ...baseAgreement(),
      lines: [],
    });

    const added = await service.addLine(created.id, {
      productId: PRODUCT_ID,
      productNameOverride: null,
      price: 5,
      unit: "per_kg",
      notes: null,
      position: null,
    });
    expect(added.position).toBe(0);

    const count = await service.replaceLines(created.id, []);
    expect(count).toBe(0);

    const echo = await service.updateAgreement(created.id, { status: "active" });
    expect(echo?.status).toBe("active");

    const owner = await service.getAgreementOwner(created.id);
    expect(owner?.agreedBy).toBe(AGREED_BY);

    await service.deleteAgreement(created.id);
    expect(await service.getAgreementById(created.id)).toBeNull();
  });
});

// ─── argument/return forwarding (spy) ──────────────────────────────────

describe("PricingService — forwards arguments and returns verbatim", () => {
  it("delegates each method to the matching port method with the same args", async () => {
    const spy: PricingRepository = {
      listAgreements: vi.fn().mockResolvedValue([]),
      getAgreementById: vi.fn().mockResolvedValue(null),
      getAgreementForEmail: vi.fn().mockResolvedValue(null),
      createAgreement: vi
        .fn()
        .mockResolvedValue({ id: "x", referenceNumber: "MFS-2026-0001" }),
      updateAgreement: vi.fn().mockResolvedValue(null),
      deleteAgreement: vi.fn().mockResolvedValue(undefined),
      addLine: vi.fn().mockResolvedValue(null),
      replaceLines: vi.fn().mockResolvedValue(3),
      updateLine: vi.fn().mockResolvedValue(null),
      deleteLine: vi.fn().mockResolvedValue(undefined),
      getAgreementOwner: vi.fn().mockResolvedValue(null),
      getLineOwner: vi.fn().mockResolvedValue(null),
    };
    const service = createPricingService({ pricing: spy });

    await service.listAgreements({ agreedBy: AGREED_BY });
    expect(spy.listAgreements).toHaveBeenCalledWith({ agreedBy: AGREED_BY });

    await service.getAgreementById("a1");
    expect(spy.getAgreementById).toHaveBeenCalledWith("a1");

    await service.getAgreementForEmail("a2");
    expect(spy.getAgreementForEmail).toHaveBeenCalledWith("a2");

    const ret = await service.replaceLines("a3", []);
    expect(spy.replaceLines).toHaveBeenCalledWith("a3", []);
    expect(ret).toBe(3); // return forwarded verbatim

    await service.updateLine("l1", { price: 4 });
    expect(spy.updateLine).toHaveBeenCalledWith("l1", { price: 4 });

    await service.getLineOwner("l2");
    expect(spy.getLineOwner).toHaveBeenCalledWith("l2");
  });
});
