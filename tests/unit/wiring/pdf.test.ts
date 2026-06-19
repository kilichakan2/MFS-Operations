/**
 * tests/unit/wiring/pdf.test.ts
 *
 * F-22 — pins the PdfRenderer composition root. The wiring is a parts list: it
 * bolts the jsPDF adapter into the PdfRenderer port and exports a ready
 * singleton. The heavy jsPDF / jspdf-autotable load is lazy (a dynamic
 * `await import(...)` INSIDE renderPriceAgreement, per click), so importing this
 * module — and constructing the singleton — must trigger NO jsPDF load.
 *
 * jspdf / jspdf-autotable are mocked with spy constructors so we can assert the
 * vendor is never touched at import/wiring time (the lazy-load contract that
 * keeps jsPDF out of the initial /pricing bundle).
 */
import { describe, it, expect, vi } from "vitest";

const jsPdfCtor = vi.fn();
const autoTableFn = vi.fn();

vi.mock("jspdf", () => ({
  jsPDF: class {
    constructor(...args: unknown[]) {
      jsPdfCtor(...args);
    }
  },
}));

vi.mock("jspdf-autotable", () => ({
  default: (...args: unknown[]) => autoTableFn(...args),
}));

describe("lib/wiring/pdf — composition root", () => {
  it("imports without loading jsPDF (side-effect free)", async () => {
    const mod = await import("@/lib/wiring/pdf");
    expect(mod.pdfRenderer).toBeDefined();
  });

  it("exports a PdfRenderer singleton with a renderPriceAgreement function", async () => {
    const { pdfRenderer } = await import("@/lib/wiring/pdf");
    expect(typeof pdfRenderer.renderPriceAgreement).toBe("function");
  });

  it("does NOT construct jsPDF merely by importing/wiring (lazy-load contract)", async () => {
    // Importing the wiring and holding the singleton must not pull jsPDF in —
    // the `await import('jspdf')` lives inside the method, fired only on Export.
    await import("@/lib/wiring/pdf");
    expect(jsPdfCtor).not.toHaveBeenCalled();
    expect(autoTableFn).not.toHaveBeenCalled();
  });
});
