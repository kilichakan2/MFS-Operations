/**
 * tests/unit/adapters/fake/Printer.test.ts
 *
 * Runs the shared Printer contract against the in-memory Fake (F-PROD-04 Pass 2a),
 * once for a success setup and once for a scripted-error setup, plus a couple of
 * Fake-specific call-recording assertions.
 */
import { describe, it, expect, vi } from "vitest";
import { printerContract } from "@/lib/ports/__contracts__/Printer.contract";
import { createFakePrinter } from "@/lib/adapters/fake";

// Success setup — no scripted error.
printerContract(async () => ({
  printer: createFakePrinter(),
  expectsError: null,
}));

// Error setup — every call surfaces an auth-bounce via onError.
printerContract(async () => ({
  printer: createFakePrinter({ error: "auth-bounce" }),
  expectsError: "auth-bounce",
}));

describe("FakePrinter call recording", () => {
  it("records delivery and mince calls in order", async () => {
    const fake = createFakePrinter();
    await fake.printDeliveryLabel(
      {
        id: "d1",
        batch_number: "b",
        supplier: "s",
        product_category: "lamb",
        date: "2026-06-29",
        temperature_c: 3,
        temp_status: "pass",
        born_in: null,
        reared_in: null,
        slaughter_site: null,
        cut_site: null,
        width: "58mm",
        copies: 1,
      },
      vi.fn(),
    );
    await fake.printMinceLabel(
      { kind: "mince", id: "m1", usebydays: 2, width: "100mm", copies: 1 },
      vi.fn(),
    );
    expect(fake.deliveryCalls).toHaveLength(1);
    expect(fake.deliveryCalls[0].id).toBe("d1");
    expect(fake.minceCalls).toHaveLength(1);
    expect(fake.minceCalls[0].id).toBe("m1");
  });
});
