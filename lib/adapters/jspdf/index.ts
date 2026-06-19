/**
 * lib/adapters/jspdf/index.ts
 *
 * Barrel for the jsPDF adapter (F-22). Exports the adapter factory ONLY —
 * the composition root (lib/wiring/pdf.ts) imports createJsPdfRenderer from here
 * and wires it to the PdfRenderer port. This folder is the sole place jspdf /
 * jspdf-autotable may be imported (ESLint-enforced).
 */
export { createJsPdfRenderer } from "./JsPdfRenderer";
