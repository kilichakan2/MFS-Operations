/**
 * lib/wiring/pdf.ts — composition root for the PdfRenderer port (F-22)
 *
 * The ONE business-layer file where the PdfRenderer port is bolted to its
 * concrete jsPDF adapter (same F-TD-11 rule as the other wiring files: only
 * composition roots import from `@/lib/adapters/*`). The page imports the
 * `pdfRenderer` singleton from here — never the adapter directly.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the PDF library =
 * one new adapter folder (`lib/adapters/<vendor>/`) + one edit to THIS file.
 * The port, the PriceAgreementPdfData shape, and app/pricing/page.tsx never change.
 *
 * This file is a parts list, not logic. Importing it triggers NO jsPDF load:
 * createJsPdfRenderer() only returns an object with an async method; the
 * `await import('jspdf')` runs lazily inside that method when Export is clicked,
 * so the lazy-load contract survives the wiring indirection.
 */
import { createJsPdfRenderer } from "@/lib/adapters/jspdf";
import type { PdfRenderer } from "@/lib/ports";

export const pdfRenderer: PdfRenderer = createJsPdfRenderer();
