/**
 * lib/ports/__contracts__/Printer.contract.ts
 *
 * Shared behavioural contract for the Printer port (F-PROD-04 Pass 2a, ADR-0010).
 * Every Printer adapter must honour the SAME port-level guarantees.
 *
 * Pattern matches the other __contracts__ files (the setup-closure shape locked at
 * F-06 Gate 1). The setup closure yields `{ printer, expectsError }`:
 *   - `printer` — the adapter under test.
 *   - `expectsError` — null when the setup is scripted to print successfully;
 *     otherwise the PrintErrorKind the setup is scripted to surface via onError.
 *
 * The contract asserts ONLY the port-level promises both adapters share:
 *   - printDeliveryLabel / printMinceLabel resolve (never throw to the caller).
 *   - on a success setup, onError is NOT called.
 *   - on a scripted error setup, onError IS called with the kind, and still no
 *     throw escapes.
 *
 * Device-selection (native-vs-iframe) and fallback delegation are NOT port
 * guarantees — they live in lib/wiring/printer.ts and are tested separately
 * (tests/unit/wiring/printer.test.ts). The real native print and real iframe
 * print are not unit-testable (no native bridge / jsdom print dialog in CI).
 */
import { describe, it, expect, vi } from "vitest";
import type {
  Printer,
  DeliveryLabelInput,
  MinceLabelInput,
  PrintErrorKind,
} from "@/lib/ports";

export interface PrinterContractSetup {
  printer: Printer;
  /** null → success setup; otherwise the kind onError must be called with. */
  expectsError: PrintErrorKind | null;
}

const DELIVERY: DeliveryLabelInput = {
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
  width: "58mm",
  copies: 1,
};

const MINCE: MinceLabelInput = {
  kind: "mince",
  id: "min-1",
  usebydays: 2,
  width: "100mm",
  copies: 1,
};

export function printerContract(
  setup: () => Promise<PrinterContractSetup>,
): void {
  describe("Printer contract", () => {
    it("printDeliveryLabel resolves without throwing", async () => {
      const ctx = await setup();
      const onError = vi.fn();
      await expect(
        ctx.printer.printDeliveryLabel(DELIVERY, onError),
      ).resolves.toBeUndefined();
    });

    it("printMinceLabel resolves without throwing", async () => {
      const ctx = await setup();
      const onError = vi.fn();
      await expect(
        ctx.printer.printMinceLabel(MINCE, onError),
      ).resolves.toBeUndefined();
    });

    it("does not call onError on a success setup", async () => {
      const ctx = await setup();
      if (ctx.expectsError !== null) return; // only meaningful for success setups
      const deliveryErr = vi.fn();
      const minceErr = vi.fn();
      await ctx.printer.printDeliveryLabel(DELIVERY, deliveryErr);
      await ctx.printer.printMinceLabel(MINCE, minceErr);
      expect(deliveryErr).not.toHaveBeenCalled();
      expect(minceErr).not.toHaveBeenCalled();
    });

    it("calls onError with the kind on an error setup, no throw escapes", async () => {
      const ctx = await setup();
      if (ctx.expectsError === null) return; // only meaningful for error setups
      const deliveryErr = vi.fn();
      const minceErr = vi.fn();
      await expect(
        ctx.printer.printDeliveryLabel(DELIVERY, deliveryErr),
      ).resolves.toBeUndefined();
      await expect(
        ctx.printer.printMinceLabel(MINCE, minceErr),
      ).resolves.toBeUndefined();
      expect(deliveryErr).toHaveBeenCalledWith(ctx.expectsError);
      expect(minceErr).toHaveBeenCalledWith(ctx.expectsError);
    });
  });
}
