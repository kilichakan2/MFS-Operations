'use client'

/**
 * lib/wiring/printer.ts — composition root for the Printer port (F-PROD-04 Pass 2a)
 *
 * The ONE business-layer file where the Printer port is bolted to its concrete
 * adapters (same F-TD-11 rule as the other wiring files: only composition roots
 * import from `@/lib/adapters/*`), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): adding a future printer (e.g.
 * Zebra) = one new adapter folder (`lib/adapters/zebra/Printer.ts`) + one line in
 * THIS file. The port, the two existing adapters, both HACCP screens and the
 * renderer never change.
 *
 * SSR safety (ADR-0010): this file is imported by client pages. It touches NO
 * `window` at module load — `getPrinter()` defers the device check
 * (`isSunmiNative()`) to CALL time (a button tap), exactly mirroring the F-26
 * `localCache.ts` precedent. Constructing the adapters is side-effect-free; the
 * native bridge / iframe are only reached when a print method actually runs.
 *
 * The Sunmi adapter gets the Browser adapter INJECTED here as its fallback, so no
 * adapter reaches into another adapter's internals — the wiring connects them.
 *
 * This file is a parts list, not logic.
 */
import { createBrowserPrinter } from "@/lib/adapters/browser";
import { createSunmiPrinter, isSunmiNative } from "@/lib/adapters/sunmi";
import type { Printer } from "@/lib/ports";

/**
 * Build the right Printer for this device, at call time.
 *
 * Inside the MFS Android shell (the Sunmi V3 native bridge is present): the Sunmi
 * adapter, with the Browser adapter injected as its fallback (100mm, mince, or any
 * native throw → iframe). Everywhere else (iPad, desktop browser, iOS PWA): the
 * Browser adapter directly.
 */
export function getPrinter(): Printer {
  const browser = createBrowserPrinter();
  if (isSunmiNative()) return createSunmiPrinter(browser); // device check at CALL time
  return browser;
}
