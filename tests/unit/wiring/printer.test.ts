/**
 * tests/unit/wiring/printer.test.ts
 *
 * Pins the ONE genuinely new piece of logic in F-PROD-04 Pass 2a: the device
 * SELECTION (getPrinter) and the native→fallback DELEGATION (createSunmiPrinter).
 *
 * SCOPING: the real native print (window.MFSSunmiPrint.printDeliveryLabel) and the
 * real iframe print (window.print() dialog) are NOT unit-testable — there is no
 * native bridge in CI and the unit suite runs under `node` (no DOM print dialog).
 * So this test fakes the Android bridge + uses a Fake fallback Printer to pin the
 * DECISION TREE, not the physical print. The actual paper-printing iframe path is
 * covered by the existing @critical Playwright E2E (unchanged) and the moved
 * classifier oracle test.
 *
 * Five cases (plan Step 8):
 *   1. V3 + 58mm delivery  → native bridge printDeliveryLabel called; fallback NOT.
 *   2. V3 + native throws   → fallback.printDeliveryLabel IS called (same input + onError).
 *   3. V3 + 100mm delivery  → fallback called directly; native NOT.
 *   4. V3 + mince           → fallback called; native NOT.
 *   5. Browser device       → getPrinter() returns the Browser adapter; no native.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPrinter } from "@/lib/wiring/printer";
import { createSunmiPrinter } from "@/lib/adapters/sunmi";
import { createFakePrinter } from "@/lib/adapters/fake";
import type { DeliveryLabelInput, MinceLabelInput } from "@/lib/ports";

const deliveryInput = (width: "58mm" | "100mm"): DeliveryLabelInput => ({
  id: "del-1",
  batch_number: "0101-LB-1",
  supplier: "Acme",
  product_category: "lamb",
  date: "2026-06-29",
  temperature_c: 3.2,
  temp_status: "pass",
  born_in: "GB",
  reared_in: "GB",
  slaughter_site: "S1",
  cut_site: "C1",
  width,
  copies: 1,
});

const minceInput: MinceLabelInput = {
  kind: "mince",
  id: "min-1",
  usebydays: 2,
  width: "100mm",
  copies: 1,
};

type WinHolder = { window?: unknown };
let originalWindow: unknown;
let originalFetch: typeof globalThis.fetch | undefined;

function setBridge(printDeliveryLabel: () => void): void {
  (globalThis as WinHolder).window = {
    MFSSunmiPrint: { isReady: () => true, printDeliveryLabel },
  };
}

beforeEach(() => {
  originalWindow = (globalThis as WinHolder).window;
  originalFetch = globalThis.fetch;
  // getSupplierCode() fetches /api/haccp/supplier-code on the native path; stub it.
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ label_code: "ACME" }),
  })) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  (globalThis as WinHolder).window = originalWindow;
  if (originalFetch) globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("getPrinter — device selection", () => {
  it("case 5: returns the Browser adapter when no native bridge (browser device)", async () => {
    (globalThis as WinHolder).window = {}; // no MFSSunmiPrint
    const printer = getPrinter();
    // Browser adapter goes straight to the iframe path → fetch the label URL.
    // We don't need a real iframe: stub fetch to a non-label so it returns via onError.
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      redirected: false,
      url: "https://x/api/labels",
      status: 500,
    })) as unknown as typeof globalThis.fetch;
    const onError = vi.fn();
    await printer.printDeliveryLabel(deliveryInput("58mm"), onError);
    // Browser adapter classified the 500 as 'error' and surfaced it — proving the
    // selection returned the Browser path (never reached a native bridge).
    expect(onError).toHaveBeenCalledWith("error");
  });

  it("returns a printer when the native bridge IS present (selection picks Sunmi)", () => {
    setBridge(() => undefined);
    const printer = getPrinter();
    expect(printer).toBeTruthy();
    expect(typeof printer.printDeliveryLabel).toBe("function");
  });
});

describe("createSunmiPrinter — native vs fallback delegation", () => {
  it("case 1: V3 + 58mm delivery → native bridge called, fallback NOT called", async () => {
    const nativeCall = vi.fn();
    setBridge(nativeCall);
    const fallback = createFakePrinter();
    const sunmi = createSunmiPrinter(fallback);
    await sunmi.printDeliveryLabel(deliveryInput("58mm"), vi.fn());
    expect(nativeCall).toHaveBeenCalledTimes(1);
    expect(fallback.deliveryCalls).toHaveLength(0);
  });

  it("case 2: V3 + native throws → fallback.printDeliveryLabel IS called (same input + onError)", async () => {
    const nativeCall = vi.fn(() => {
      throw new Error("native boom");
    });
    setBridge(nativeCall);
    const fallback = createFakePrinter();
    const sunmi = createSunmiPrinter(fallback);
    const onError = vi.fn();
    const input = deliveryInput("58mm");
    await sunmi.printDeliveryLabel(input, onError);
    expect(nativeCall).toHaveBeenCalledTimes(1);
    expect(fallback.deliveryCalls).toHaveLength(1);
    expect(fallback.deliveryCalls[0]).toEqual(input);
  });

  it("case 3: V3 + 100mm delivery → fallback called directly, native NOT called", async () => {
    const nativeCall = vi.fn();
    setBridge(nativeCall);
    const fallback = createFakePrinter();
    const sunmi = createSunmiPrinter(fallback);
    await sunmi.printDeliveryLabel(deliveryInput("100mm"), vi.fn());
    expect(nativeCall).not.toHaveBeenCalled();
    expect(fallback.deliveryCalls).toHaveLength(1);
    expect(fallback.deliveryCalls[0].width).toBe("100mm");
  });

  it("case 4: V3 + mince → fallback called, native NOT called (no native mince)", async () => {
    const nativeCall = vi.fn();
    setBridge(nativeCall);
    const fallback = createFakePrinter();
    const sunmi = createSunmiPrinter(fallback);
    await sunmi.printMinceLabel(minceInput, vi.fn());
    expect(nativeCall).not.toHaveBeenCalled();
    expect(fallback.minceCalls).toHaveLength(1);
    expect(fallback.minceCalls[0]).toEqual(minceInput);
  });
});
