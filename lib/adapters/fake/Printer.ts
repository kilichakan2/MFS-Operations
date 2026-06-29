/**
 * lib/adapters/fake/Printer.ts
 *
 * Deterministic in-memory Fake for the Printer port (F-PROD-04 Pass 2a). No DOM,
 * no native bridge, no fetch — pure JavaScript. Records every print call and lets
 * a test SCRIPT an error so the contract can assert that onError is invoked and
 * no throw escapes (mirrors the F-25 PushSender / F-26 LocalCache Fake style).
 *
 * Boundary discipline (ADR-0002): imports zero vendor SDKs; works in the owned
 * Printer port shapes only.
 */

import type {
  Printer,
  DeliveryLabelInput,
  MinceLabelInput,
  PrintErrorKind,
} from "@/lib/ports";

export interface FakePrinterSeed {
  /** If set, every print call invokes onError(error) and resolves without throwing. */
  readonly error?: PrintErrorKind;
}

export interface FakePrinter extends Printer {
  /** Test inspection: every delivery print received, in order. */
  readonly deliveryCalls: readonly DeliveryLabelInput[];
  /** Test inspection: every mince print received, in order. */
  readonly minceCalls: readonly MinceLabelInput[];
}

export function createFakePrinter(seed?: FakePrinterSeed): FakePrinter {
  const deliveryCalls: DeliveryLabelInput[] = [];
  const minceCalls: MinceLabelInput[] = [];
  return {
    deliveryCalls,
    minceCalls,
    async printDeliveryLabel(
      input: DeliveryLabelInput,
      onError: (kind: PrintErrorKind) => void,
    ): Promise<void> {
      deliveryCalls.push(input);
      if (seed?.error) onError(seed.error);
    },
    async printMinceLabel(
      input: MinceLabelInput,
      onError: (kind: PrintErrorKind) => void,
    ): Promise<void> {
      minceCalls.push(input);
      if (seed?.error) onError(seed.error);
    },
  };
}

export const fakePrinter: FakePrinter = createFakePrinter();
