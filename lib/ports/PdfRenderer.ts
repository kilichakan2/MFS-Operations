/**
 * lib/ports/PdfRenderer.ts — the owned PDF-rendering port (F-22)
 *
 * The socket the app owns for "render a price agreement as a PDF and deliver it
 * (browser download)". Pure TypeScript: no jsPDF, no jspdf-autotable, no browser
 * DOM types. The concrete jsPDF adapter lives at lib/adapters/jspdf/ and is the
 * ONLY place those vendor packages may be imported (ESLint-enforced).
 *
 * Render+deliver are deliberately ONE operation here — the method resolves once
 * the browser download has been triggered, NOT a Blob of bytes. Splitting render
 * from download (a Blob-returning port that would be headless-byte-assertable) is
 * deferred to backlog F-TD-26; keeping doc.save() inside the adapter is what makes
 * this extraction byte-identical with zero new code.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the PDF library =
 * one new adapter folder (lib/adapters/<vendor>/) + one edit to lib/wiring/pdf.ts.
 * The port, the PriceAgreementPdfData shape, and app/pricing/page.tsx never change.
 *
 * The `unit` union is inlined ("per_kg" | "per_box") rather than imported from
 * lib/domain/Pricing.ts to keep the port a closed island — the PDF port carries
 * no dependency on the pricing domain module.
 */

/** One product line as the PDF needs it (owned, vendor-free). */
export interface PriceAgreementPdfLine {
  readonly productName: string;
  readonly boxSize: string | null;
  readonly price: number;
  readonly unit: "per_kg" | "per_box";
  readonly notes: string | null;
  readonly isFreetext: boolean;
}

/** Everything the price-agreement PDF reads — the app's own words. */
export interface PriceAgreementPdfData {
  readonly referenceNumber: string;
  readonly customerName: string;
  readonly repName: string;
  readonly isProspect: boolean;
  readonly validFrom: string; // YYYY-MM-DD
  readonly validUntil: string | null;
  readonly notes: string | null;
  readonly lines: readonly PriceAgreementPdfLine[];
}

/**
 * Render a price agreement as a PDF and deliver it (browser download).
 * Render+deliver are deliberately one operation (F-TD-26 defers the
 * Blob-returning split). Resolves once the download has been triggered.
 */
export interface PdfRenderer {
  renderPriceAgreement(data: PriceAgreementPdfData): Promise<void>;
}
