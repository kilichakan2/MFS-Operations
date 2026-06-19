# F-22 — PdfRenderer port + jsPDF adapter — code-critic review (FORGE Guard)

**Date:** 2026-06-19
**Branch / PR:** `feat/f-22-pdfrenderer-port` / #57
**Reviewer:** code-critic subagent (FORGE Guard phase, sole review authority)
**Verdict:** ✅ **CLEAR — no blockers. Hand to ANVIL.**

## Scope reviewed
Diff `main...feat/f-22-pdfrenderer-port` — 4 commits: `27ff06d` (port), `208b224` (lint ban static+dynamic + pin test), `22a3bd6` (adapter), `5111fc5` (page swap + wiring test).

## Test / lint / tsc
| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx next lint` (5 changed files) | PASS (no warnings/errors) |
| `tests/unit/wiring/pdf.test.ts` + `tests/unit/lint/no-adapter-imports.test.ts` | PASS 52/52 |
| `tests/unit/pricing*` | PASS 28/28 |
| Full unit suite (at Render) | 1925/1925 |
| `package.json` / `package-lock.json` | unchanged — no new dependency |

## Architecture / depth verdict
**`PdfRenderer` is a DEEP module, not a pass-through.** Interface = one method `renderPriceAgreement(data): Promise<void>` + a vendor-free `PriceAgreementPdfData` shape (`lib/ports/PdfRenderer.ts:51-53`); behind it the adapter hides ~180 lines of layout/coordinates/colours/base64-logo/table/download (`lib/adapters/jspdf/JsPdfRenderer.ts:68-246`). Deletion test: removing the port collapses the 180-line routine back into the page *with* a raw `jspdf` import — complexity concentrates behind the seam, doesn't merely move. No speculative seam: the data shape is sized to the one real PDF.

## Rip-out test: PASS
Swap PDF library = add `lib/adapters/<newvendor>/` implementing `PdfRenderer` + change the one import line in `lib/wiring/pdf.ts:18`. Port, `PriceAgreementPdfData`, and `app/pricing/page.tsx` unchanged. `lib/wiring/pdf.ts` is the only business-layer file importing `@/lib/adapters/jspdf` (grep-verified).

## Findings

### 🟢 Byte-identity verified (manual line-by-line)
`JsPdfRenderer.ts:68-246` vs `main:app/pricing/page.tsx` old `exportPdf`. Every coordinate, colour triple, font size, base64 logo, `splitTextToSize` width, autoTable head/body/columnStyles/margin, freetext footnote, footer paragraph, and the filename template `MFS-Pricing-${referenceNumber}-${customerName.replace(/[^a-zA-Z0-9]/g,"-")}.pdf` (`:244`) are identical. Mapper at `app/pricing/page.tsx:846-865` is a clean 1:1 snake→camel map, no field swapped.

### 🟢 Lazy-load preserved
`await import("jspdf")` / `import("jspdf-autotable")` are inside `exportPdf` (`JsPdfRenderer.ts:69-70`), fired only on Export click. Factory + wiring do no I/O. Wiring test asserts importing the wiring never constructs jsPDF (`tests/unit/wiring/pdf.test.ts:42-48`).

### 🟢 Dynamic-import lint hole closed (conductor ruling)
`.eslintrc.json:51-61` adds `no-restricted-syntax` `ImportExpression[source.value='jspdf'|'jspdf-autotable']`; `:71,75-77` whitelist `lib/adapters/jspdf/**`. Pin cases 46-49 (`no-adapter-imports.test.ts:638-687`) prove the dynamic ban bites in `app/pricing` + `lib/services` and is off inside the adapter. Static ban pinned cases 38-45.

### 🟢 `fmtDate` duplication consistent & forced
Adapter copy (`JsPdfRenderer.ts:30-40`) and page copy (`app/pricing/page.tsx:75-78`) produce identical output; duplication is required by the inward-dependency rule (adapters can't import `app/**`). Correct.

### 🟢 Test quality
Tests exercise the public seam (singleton, not internals); the lint pin loads the real `.eslintrc.json` from disk so it catches drift rather than codifying it.

### 🔵 Latent paper-only difference — `Number(l.price)` (no action)
`app/pricing/page.tsx:858` maps `price: Number(l.price)`; `PriceLine.price` typed `number | ''`. For real values identical to old `(l.price as number).toFixed(2)`. Only divergence: `price === ''` (old throws, new → `0` → "0.00"). Unreachable for export: `onExportPdf` only runs on a saved `Agreement` from `/api/pricing` with real DB numbers, and the save path rejects `Number(l.price) <= 0` (`:397`). Paper difference, not real.

### 🔵 Coverage gap — deferred to ANVIL / F-TD-26 (do not block)
No headless test asserts actual PDF bytes (port is render+deliver, adapter calls `doc.save()` internally — deliberate Gate-1 choice, logged F-TD-26). Byte-identity for review rests on the verbatim move + 1:1 mapper, both manually confirmed. **Recommendation for ANVIL:** generate + open a real price-agreement PDF covering: long customer name (truncation), a prospect, a freetext line, a note, and a no-`valid_until` "ongoing" agreement.

## Summary
No blockers. jsPDF is the sole importer of its own SDK behind an app-owned deep `PdfRenderer` port; page is vendor-free; behaviour byte-identical (verbatim move + faithful mapping, manually verified); lazy-load survives wiring; lint guard hardened for dynamic imports. tsc/lint/tests green; no dependency change. One unreachable paper edge + one testability gap correctly deferred. **Advance to ANVIL** with the manual/E2E export recommendation above.
