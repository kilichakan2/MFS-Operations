# F-22 — PdfRenderer port + jsPDF adapter

**Date:** 2026-06-19
**Unit:** F-22 (FORGE — Order phase plan)
**Status:** Plan locked, ready for Render. NO application code written yet.
**Gate 1 spec:** locked & approved (conductor).

---

## Visual mini-map

```
DOMAIN (pricing PDF export)
  └─ PdfRenderer (NEW port) → [jsPDF + jspdf-autotable]  (NEW adapter: lib/adapters/jspdf/)
     consumed via → lib/wiring/pdf.ts (singleton) → app/pricing/page.tsx
🗣 one socket for "make me this PDF"; the jsPDF plug is the only thing that touches the vendor — swap PDF libs = swap the plug
```

---

## Goal

Move the `jsPDF` + `jspdf-autotable` dependency out of the presentation layer and behind an
owned `PdfRenderer` port with a jsPDF adapter. The render routine moves **verbatim** —
same PDF bytes, same filename, same lazy-load-on-click behaviour.

**🗣 In plain English:** Today the pricing screen reaches straight into the PDF-printing
library — like the front desk keeping the printer's wiring on the counter. We move that
wiring into a labelled box ("PdfRenderer") with one cable to the real printer ("jsPDF").
The screen just presses a button; it never sees the printer's brand again. The printed page
comes out exactly the same as before — same layout, same file name, same "only load the heavy
library when you actually click."

This kills a **double** architecture blocker per `CLAUDE.md`:
- (a) a vendor SDK (`jspdf`) imported in `app/**` (presentation layer) — banned.
- (b) a single-use vendor lib with no owned wrapper — banned.

**🗣 In plain English:** Two separate rule-breaks, both fixed by the same move: the vendor
library is currently imported in the UI folder (forbidden), and it's used in exactly one place
with no wrapper around it (also forbidden). One extraction clears both.

### Hard constraints (do NOT violate)
1. **Byte-identical output.** Same PDF content, same `filename`, same `doc.save()` download.
   The 170-line routine moves verbatim — no "improvements," no reformatting of the PDF.
2. **Lazy-load preserved.** `await import('jspdf')` and `await import('jspdf-autotable')`
   stay as dynamic imports **inside the adapter**, so jsPDF is NOT pulled into the initial
   page bundle — it loads only when the Export button is clicked.
   **🗣 In plain English:** jsPDF is heavy. Today it only downloads to the browser the moment
   you click Export, keeping the page fast to open. That must stay true after the move.
3. **No migration, no DB, no RLS change.** RLS for pricing is a separate unit (F-RLS-04d) and
   is explicitly out of scope here.
4. **No new dependency.** `jspdf@^4.2.1` and `jspdf-autotable@^5.0.7` already exist in
   `package.json`; only the **import location** moves.
5. **Render+deliver stays together.** The port is "render and download this agreement as a PDF,"
   NOT "return bytes." Splitting render from download (a Blob-returning port) is **deferred to
   backlog F-TD-26** — do NOT implement it here. Keeping `doc.save()` inside the adapter is what
   guarantees byte-identity with zero new code.

---

## Domain terms

- **Port** (`lib/ports/PdfRenderer.ts`) — the socket the app owns. Pure TypeScript, no jsPDF,
  no browser DOM types. It names ONE operation: "render this price agreement as a PDF and
  deliver it (download)."
  **🗣 In plain English:** the labelled box's interface — "hand me an agreement, I'll make and
  download the PDF." Nothing in here mentions jsPDF.
- **Adapter** (`lib/adapters/jspdf/`) — the only place `jspdf` / `jspdf-autotable` are imported.
  Contains the verbatim render routine, the `svgToPng` canvas helper, and the brand constants.
  **🗣 In plain English:** the actual cable to the jsPDF printer. The one room where the
  vendor's name is allowed.
- **Wiring singleton** (`lib/wiring/pdf.ts`) — the one business-layer file that bolts the
  jsPDF adapter to the `PdfRenderer` port and exports a ready-to-use object.
  **🗣 In plain English:** the patch panel — one line connecting "the socket" to "the jsPDF
  cable." Swapping vendors means editing only this line plus adding a new adapter folder.
- **`PriceAgreementPdfData`** — the owned input shape the port defines: exactly the fields the
  PDF reads, in the app's own words.
  **🗣 In plain English:** the order slip the PDF box accepts. It lists only what the printout
  needs (customer name, ref, dates, lines…), nothing else.

---

## Compliance / architecture flags

- **CLAUDE.md "Build it like Lego"** — satisfied: vendor SDK confined to `lib/adapters/jspdf/`,
  UI depends on the port via the wiring singleton, contract defined before implementation.
- **CLAUDE.md "Dependency justification"** — no NEW dependency added, so no new justification
  line is required. The existing `jspdf` / `jspdf-autotable` entries gain a clarifying
  `// reason:` is optional but recommended (see Step 7); they now sit behind a wrapper, which
  is itself the compliance fix for the "single-use vendor not wrapped" blocker.
- **CLAUDE.md "Blockers"** — the change REMOVES two existing blockers (vendor SDK in `app/**`;
  single-use vendor unwrapped). After this unit `app/pricing/page.tsx` has zero `jspdf` imports.
- **ESLint `no-restricted-imports`** — a NEW restriction for `jspdf` + `jspdf-autotable` must be
  added (mirroring the leaflet entries), with `lib/adapters/jspdf/**` whitelisted in the
  override. See Step 6. The lint-pin test (`tests/unit/lint/no-adapter-imports.test.ts`) asserts
  these messages verbatim, so the new messages must be added there too.

### ADR conflicts
- **ADR-0002 (hexagonal shape & naming):** No conflict — this unit is a textbook application of
  it (the exact F-24 leaflet pattern). It ADDS a port + adapter following the naming rules.
- **ADR-0003 (strangler-fig / FREEZE rule):** No conflict — no new raw vendor surface; we are
  shrinking vendor surface.
- **ADR-0004 / 0007 (RLS):** No conflict — explicitly out of scope (F-RLS-04d owns pricing RLS).
- **No ADR conflicts found.**

---

## Open question RESOLVED: the port's input shape

**Decision: Option A — define an owned `PriceAgreementPdfData` interface in the port, and map
to it at the call site in `app/pricing/page.tsx`.** Do NOT reuse the domain `PriceAgreement`
types from `lib/domain/Pricing.ts`.

### Why (rationale)
1. **The page's data is snake_case, the domain type is camelCase — they do not match.**
   `app/pricing/page.tsx` defines its OWN local `interface Agreement` (line 33) with snake_case
   fields (`customer_name`, `reference_number`, `box_size`, `is_freetext`, `valid_from`, etc.).
   It fetches the raw wire shape from `/api/pricing` (snake_case) and never imports the domain
   `PriceAgreement` (which is camelCase: `customerName`, `referenceNumber`, `boxSize`,
   `isFreetext`). Reusing the domain type would force the page to ALSO adopt a camelCase
   mapping it does not have today — that is churn and behaviour-adjacent risk this unit forbids.
   **🗣 In plain English:** the screen speaks "snake_case" (customer_name); the official domain
   model speaks "camelCase" (customerName). Forcing the screen to switch dialects just to print
   a PDF is extra work and extra risk for zero benefit right now.

2. **A dedicated PDF input shape keeps the port honest and minimal.** The PDF only reads a
   subset of the agreement. `PriceAgreementPdfData` lists exactly that subset, so the port's
   interface (its "tax") is small and the seam is clean.
   **🗣 In plain English:** the box accepts a short order slip with only what it prints — not
   the whole customer record. Smaller slip = easier to understand and to keep stable.

3. **The mapping is explicit and lives at the boundary (the page).** The page already holds
   the snake_case `Agreement`; mapping it to `PriceAgreementPdfData` is a flat field copy —
   trivial, visible, and the natural place for "page shape → port shape" translation.

### The exact mapping at the call site
`PriceAgreementPdfData` field names should mirror the snake_case names the routine already
reads, so the moved routine needs **zero internal renames** (preserving byte-identity). The
page maps its local `Agreement` → `PriceAgreementPdfData` as a 1:1 field copy:

| `PriceAgreementPdfData` field | from page `Agreement` | used by PDF for |
|---|---|---|
| `referenceNumber` | `reference_number` | Ref, filename |
| `customerName` | `customer_name` | customer block, filename |
| `repName` | `rep_name` | "Agreed by" |
| `isProspect` | `is_prospect` | "Prospect" tag |
| `validFrom` | `valid_from` | Valid date |
| `validUntil` | `valid_until` | Valid date |
| `notes` | `notes` | notes block |
| `lines[]` | `lines[]` (mapped per-line below) | products table |

Per line (`PriceAgreementPdfLine`):

| field | from page `PriceLine` | used for |
|---|---|---|
| `productName` | `product_name` | table col 1 |
| `boxSize` | `box_size` | table col 2 (Pack Size) |
| `price` | `price` (cast `number`) | table col 3 |
| `unit` | `unit` | table col 4 |
| `notes` | `notes` | table col 5 |
| `isFreetext` | `is_freetext` | `*` marker + footnote |

> **Naming note:** the port field names are written camelCase to match the owned-domain
> convention (the port is owned vocabulary). The moved routine inside the adapter therefore
> reads `data.customerName` instead of `agreement.customer_name`, etc. This is a pure rename of
> field ACCESS inside the routine (the PDF *content* — strings, coordinates, colours — is
> untouched), so output stays byte-identical. The mapping object at the call site is where the
> snake→camel translation happens, once, explicitly.
>
> **🗣 In plain English:** inside the box we tidy the field labels to the house style
> (customerName), but every word and number that lands on the printed page is identical. The
> one place the old "customer_name" turns into "customerName" is a small translation slip the
> screen fills in when it hands over the job.

---

## Files to change

### NEW files
| Path | Role |
|---|---|
| `lib/ports/PdfRenderer.ts` | The owned port: `PriceAgreementPdfData`, `PriceAgreementPdfLine`, and the `PdfRenderer` interface (one method). Pure TS — no jsPDF, no DOM types. |
| `lib/adapters/jspdf/index.ts` | Barrel. Exports the adapter factory `createJsPdfRenderer()` only. |
| `lib/adapters/jspdf/JsPdfRenderer.ts` | The adapter: the verbatim `exportPdf` routine + `svgToPng` + brand constants + logo data URI, implementing `PdfRenderer`. The ONLY file importing `jspdf` / `jspdf-autotable`. |
| `lib/wiring/pdf.ts` | Composition root: wires the jsPDF adapter to the `PdfRenderer` port; exports the `pdfRenderer` singleton. |

### CHANGED files
| Path | Change |
|---|---|
| `app/pricing/page.tsx` | DELETE `svgToPng` + `exportPdf` + the two dynamic `import('jspdf'/'jspdf-autotable')` lines + brand constants + logo URI. Import `pdfRenderer` from `@/lib/wiring/pdf`. Replace `onExportPdf={exportPdf}` (×2) with a thin handler that maps `Agreement → PriceAgreementPdfData` and calls `pdfRenderer.renderPriceAgreement(...)`. End state: ZERO `jspdf`/`jspdf-autotable` imports. |
| `lib/ports/index.ts` | Add `export type { PdfRenderer, PriceAgreementPdfData, PriceAgreementPdfLine } from "./PdfRenderer";` |
| `.eslintrc.json` | Add `jspdf` + `jspdf-autotable` to BOTH `no-restricted-imports` `paths` blocks (top-level rule AND the services/usecases override). Add `lib/adapters/jspdf/**/*.{ts,tsx}` to the adapter whitelist override. |
| `tests/unit/lint/no-adapter-imports.test.ts` | Add the new `jspdf` / `jspdf-autotable` forbidden-message constants + assertions (drift-catcher pins, verbatim against the shipped config). |
| `package.json` | (Optional, recommended) add `// reason:` is not valid JSON — instead note the justification in the PR description. No code change required; deps already present. |

**🗣 In plain English:** four brand-new small files (the contract, the jsPDF cable + its barrel,
the patch panel) and a handful of edits (gut the PDF code out of the screen, register the new
contract, and teach the lint robot that jsPDF is now only allowed in its one room).

---

## Port interface sketch (`lib/ports/PdfRenderer.ts`)

Pure TypeScript. No `jspdf`, no `window`, no `HTMLCanvasElement`. The render method returns
`Promise<void>` because delivery (the browser download) happens as a side effect inside the
adapter — this is the deliberate F-TD-26 decision (render+deliver, not return-bytes).

```ts
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
  readonly validFrom: string;       // YYYY-MM-DD
  readonly validUntil: string | null;
  readonly notes: string | null;
  readonly lines: readonly PriceAgreementPdfLine[];
}

/** Render a price agreement as a PDF and deliver it (browser download).
 *  Render+deliver are deliberately one operation (F-TD-26 defers the
 *  Blob-returning split). Resolves once the download has been triggered. */
export interface PdfRenderer {
  renderPriceAgreement(data: PriceAgreementPdfData): Promise<void>;
}
```

> The `unit` union is inlined (`"per_kg" | "per_box"`) rather than imported from
> `lib/domain/Pricing.ts` to keep the port self-contained and avoid coupling the PDF port to the
> pricing domain module. (Alternatively re-export `PriceUnit` — implementer's choice, but inline
> keeps the port a closed island. Document whichever is chosen.)

**🗣 In plain English:** the contract says "give me a slip with these fields, I'll print and
download it; I'll tell you when the download has started." It mentions nothing about jsPDF.

---

## Adapter structure (`lib/adapters/jspdf/`)

`JsPdfRenderer.ts`:
- `'use client'` directive is NOT needed on a plain `.ts` module — but the file WILL run in the
  browser (it touches `window.Image`, `document.createElement('canvas')`, and triggers a
  download). It is only ever called from a `'use client'` component (`app/pricing/page.tsx`) on a
  user click, so it never executes during SSR. (See Risks: SSR.)
- Moves **verbatim** from `app/pricing/page.tsx`:
  - `svgToPng(svgDataUri, pxW, pxH)` (lines 842–857) — browser canvas/Image helper.
  - the brand constants `navy`, `orange`, `gray` (lines 864–866).
  - the base64 `logoDataUri` (line 878).
  - the entire body of `exportPdf` (lines 859–1028), including the two dynamic imports
    (`await import('jspdf')`, `await import('jspdf-autotable')`) and the final
    `doc.save(filename)`.
  - **NOTE — `fmtDate` dependency:** the routine calls `fmtDate(...)` (lines 933–934), which is a
    page-level helper (line 73). The adapter must NOT import from `app/pricing/page.tsx`
    (presentation). Copy `fmtDate` into the adapter as a private helper (it is a pure date
    formatter — 4 lines, no app coupling). This keeps the moved routine byte-identical AND keeps
    the dependency arrow pointing inward. (The page keeps its own copy of `fmtDate` — it is still
    used elsewhere on the page at lines 130, 710, 714.)
    **🗣 In plain English:** the PDF code uses a little date-formatting helper that lives on the
    screen. The box can't reach back into the screen, so we give the box its own identical copy.
    The screen keeps using its copy for its other date labels.
- Field-access rename ONLY: `agreement.customer_name` → `data.customerName`, etc. (per the mapping
  table). No change to any string literal, coordinate, colour, or layout call.
- Exports a factory:
  ```ts
  export function createJsPdfRenderer(): PdfRenderer {
    return {
      async renderPriceAgreement(data) { /* the verbatim routine, reading `data.*` */ },
    };
  }
  ```

`index.ts` (barrel) — mirrors the leaflet barrel, exports the factory only:
```ts
export { createJsPdfRenderer } from "./JsPdfRenderer";
```

**🗣 In plain English:** we lift the whole PDF routine out of the screen and drop it, unchanged,
into the jsPDF room. The only edits are reading field names off the order slip instead of off the
screen's variable, and giving it its own date helper. Everything printed stays the same.

---

## Wiring file (`lib/wiring/pdf.ts`)

Mirrors `lib/wiring/mailer.ts`: a parts list, one connecting line, no logic.

```ts
import { createJsPdfRenderer } from "@/lib/adapters/jspdf";
import type { PdfRenderer } from "@/lib/ports";

export const pdfRenderer: PdfRenderer = createJsPdfRenderer();
```

> Importing this module triggers NO jsPDF load: `createJsPdfRenderer()` only returns an object
> with an async method; the `await import('jspdf')` runs lazily inside that method when called.
> So the lazy-load contract survives the wiring indirection.
>
> **🗣 In plain English:** the patch panel is one wire. Plugging it in costs nothing — jsPDF is
> still only fetched the instant someone clicks Export.

Because the renderer is a plain async function (not a JSX component like the Leaflet
`MapCanvas`), the page imports the SINGLETON from `lib/wiring/pdf.ts` — it does NOT import the
adapter directly. This is even cleaner than the Leaflet precedent (which imports the canvas
component straight from the adapter because it's JSX that must render in the tree).

---

## The exact edit to `app/pricing/page.tsx`

**DELETE:**
- lines 840–857 (`svgToPng` + its doc comment)
- lines 859–1028 (`exportPdf`, including the brand constants, logo URI, and `doc.save`)

**ADD** (top, with the other imports, ~line 11):
```ts
import { pdfRenderer } from '@/lib/wiring/pdf'
import type { PriceAgreementPdfData } from '@/lib/ports'
```

**ADD** a thin mapping handler (replacing the deleted `exportPdf`), e.g. near the other
page-level handlers:
```ts
function exportPdf(agreement: Agreement) {
  const data: PriceAgreementPdfData = {
    referenceNumber: agreement.reference_number,
    customerName:    agreement.customer_name,
    repName:         agreement.rep_name,
    isProspect:      agreement.is_prospect,
    validFrom:       agreement.valid_from,
    validUntil:      agreement.valid_until,
    notes:           agreement.notes,
    lines: agreement.lines.map(l => ({
      productName: l.product_name,
      boxSize:     l.box_size,
      price:       Number(l.price),
      unit:        l.unit,
      notes:       l.notes,
      isFreetext:  l.is_freetext,
    })),
  }
  return pdfRenderer.renderPriceAgreement(data)
}
```

> `onExportPdf={exportPdf}` at lines ~1248 and ~1264 stay UNCHANGED — `exportPdf` keeps the
> same `(agreement: Agreement) => …` signature, so the two AgreementCard / AgreementDetail call
> sites and the buttons (~155, ~766) need no edit. The handler is now a thin mapper + delegate.

**🗣 In plain English:** the screen's Export button still calls a function named `exportPdf` with
the same shape, so nothing downstream changes. But that function is now four lines: fill in the
order slip, hand it to the box. All the heavy printing code is gone from the screen.

**Verify end state:** `grep -n "jspdf\|jsPDF" app/pricing/page.tsx` returns ZERO matches.

---

## Step-by-step build sequence (TDD-friendly)

**Order: port → lint guard + pins (RED) → adapter → wiring → page swap → green.**

1. **Write the port** `lib/ports/PdfRenderer.ts` and add to `lib/ports/index.ts`.
   - *Proof:* `npx tsc --noEmit` compiles; the new types are importable. No behaviour yet.

2. **Add the lint restriction + update the lint pin (RED first).**
   - Add `jspdf` + `jspdf-autotable` to both `no-restricted-imports` `paths` blocks in
     `.eslintrc.json`; add `lib/adapters/jspdf/**/*.{ts,tsx}` to the whitelist override.
   - Add the two new forbidden-message constants + assertions to
     `tests/unit/lint/no-adapter-imports.test.ts`.
   - *Proof (RED):* `npm run lint` now FAILS on `app/pricing/page.tsx` (it still imports jspdf) —
     this confirms the guard actually bites. The updated lint-pin test goes GREEN against the new
     config. (The RED on the page is expected and is cleared at Step 5.)
   **🗣 In plain English:** first teach the robot the new rule and confirm it correctly flags the
   screen for still importing jsPDF. That failure is the proof the rule works; we fix the screen
   in step 5.

3. **Write the adapter** `lib/adapters/jspdf/JsPdfRenderer.ts` + `index.ts` barrel.
   - Move `svgToPng`, brand constants, logo URI, `fmtDate` copy, and the verbatim `exportPdf`
     body; rename field access to `data.*`; export `createJsPdfRenderer()`.
   - *Proof:* `npx tsc --noEmit` compiles; `npm run lint` passes for the adapter (whitelisted).

4. **Write the wiring** `lib/wiring/pdf.ts`.
   - *Proof:* compiles; a unit test (Step 8) can import `pdfRenderer` and assert it exposes
     `renderPriceAgreement`.

5. **Swap the page** — delete `svgToPng`/`exportPdf`, add the thin mapper + wiring import.
   - *Proof:* `grep` shows zero `jspdf` in the page; `npm run lint` now PASSES (the RED from
     Step 2 clears); `npx tsc --noEmit` compiles.

6. **Run the full unit suite.**
   - *Proof:* the lint-pin test green; whole suite green.

7. **Document the dependency** in the PR description (deps unchanged, now wrapped — names the
   "single-use vendor now behind `lib/adapters/jspdf/`" compliance fix).

8. **Add the targeted tests** (see Test Strategy) — wiring-shape unit test + the new E2E
   download spec.

> Steps can be merged in one PR (this is a single small extraction), but the lint-RED-then-green
> ordering (Step 2 before Step 5) is the TDD spine: it proves the guard catches the very thing
> we're removing.

---

## Test strategy (given F-TD-26: adapter owns the browser download → not headless-unit-testable)

The PDF bytes are produced by jsPDF in a real browser and immediately handed to
`doc.save()` (a download). There is no headless "return the bytes" surface to assert on (that is
exactly what F-TD-26 defers). So byte-identity is proven by a LAYERED net, not one unit test:

1. **Type-level proof the page is decoupled (cheap, high-value).** A unit/lint assertion that
   `app/pricing/page.tsx` no longer imports `jspdf`/`jspdf-autotable`. This is already enforced by
   the updated `.eslintrc.json` + the lint-pin test (Step 2). `npm run lint` failing on a stray
   jspdf import makes a regression unshippable.
   **🗣 In plain English:** the robot guarantees the screen can never again import jsPDF directly.

2. **Wiring-shape unit test** (`tests/unit/wiring/pdf.test.ts`, new) — import `pdfRenderer` from
   `@/lib/wiring/pdf`, assert it is an object exposing `renderPriceAgreement` (a function).
   Optionally assert importing the module does NOT eagerly load jspdf (no throw in node, where
   `window`/`document` are absent — proving the dynamic import is still lazy).
   **🗣 In plain English:** a quick check that the patch panel is wired and that merely loading it
   doesn't drag in the heavy printer library.

3. **Mapping unit test** (optional but recommended,
   `tests/unit/pricing/exportPdf-mapping.test.ts`) — extract the `Agreement → PriceAgreementPdfData`
   mapper into a tiny pure helper (or test it via a spy injected for `pdfRenderer`) and assert each
   field maps correctly (`reference_number → referenceNumber`, line `price` cast to number, etc.).
   This is the one place the snake→camel translation lives, so it's worth a direct test.
   **🗣 In plain English:** prove the order slip is filled in correctly — every screen field lands
   in the right slot on the slip.

4. **E2E click-through download smoke** (`tests/e2e/07-pricing-export-pdf.spec.ts`, new) — the real
   byte-identity safety net. Load `/pricing` (authed via the existing `_auth.ts` helper, seeded
   data), open an agreement, click the Export PDF button, and assert a download event fires with a
   filename matching `MFS-Pricing-<ref>-<customer>.pdf`. This proves: (a) jsPDF still lazy-loads on
   click without error, (b) `svgToPng`/canvas still work in the browser, (c) the download still
   triggers with the correct filename. Mirror the browser-vendor E2E pattern used for the Leaflet
   adapter (`tests/e2e/06-map-view-markers.spec.ts`). Use Playwright's `page.waitForEvent('download')`.
   **🗣 In plain English:** the strongest check — actually click Export in a real browser and
   confirm a file downloads with the right name. If the move broke the printer, this catches it.

5. **Manual byte-diff (one-time, in the Render/Guard phase, not automated).** Before and after the
   move, export the SAME seeded agreement and diff the two PDFs (or eyeball them side by side).
   Because the routine moved verbatim, they must be identical. This is the human confirmation of
   byte-identity that no automated layer can fully give under the F-TD-26 constraint.
   **🗣 In plain English:** print one agreement before and after, lay the two PDFs side by side —
   they must look pixel-for-pixel the same. A 60-second human sanity check.

**Coverage honesty:** under F-TD-26 we CANNOT unit-assert the PDF byte content. The combination of
(verbatim move) + (E2E download fires with correct filename) + (one-time manual byte-diff) is the
proportionate proof. If true byte-assertion is wanted later, that is F-TD-26 (port returns a Blob,
which IS headless-assertable) — out of scope here.

---

## Risk Assessment

### Concurrency / race conditions
**No material risks.** The renderer is a per-click, single-shot async function with no shared
mutable state; each call constructs its own `jsPDF` doc. Two rapid clicks produce two independent
downloads (same as today). Severity: none. Must-fix: no.

### Security
**No material risks.** No new data path, no auth/RLS change, no network call added (jsPDF runs
client-side; the logo is an inlined base64 data URI, no external fetch). The vendor SDK is now MORE
confined (one folder), not less. Severity: none. Must-fix: no.
**🗣 In plain English:** nothing about who-can-see-what changes; if anything the vendor is locked
into a smaller box.

### Data migration
**None.** Explicitly out of scope — no DB, no schema, no migration file. Severity: none.

### Business-logic flaws
- **Risk: field-mapping drift (snake→camel).** The one real correctness risk: if a field is
  mistyped in the `Agreement → PriceAgreementPdfData` mapper (e.g. `valid_until` → wrong slot, or a
  forgotten `Number(l.price)` cast), the PDF silently prints wrong data. **Severity: medium.**
  **Mitigation:** the mapping unit test (Test Strategy #3) + the one-time manual byte-diff (#5) +
  keeping the port field names mirroring the source so the mapping is a flat 1:1 copy. Must-fix: no
  (mitigated by tests), but the mapping test is STRONGLY recommended.
- **Risk: accidental "improvement" of the moved routine.** Any reflow/edit to the 170 lines breaks
  byte-identity. **Severity: medium.** **Mitigation:** move verbatim; only field-access renames
  allowed; manual byte-diff catches it. Must-fix: no (process discipline + #5).
- **Risk: `fmtDate` divergence.** The adapter's copied `fmtDate` must be character-identical to the
  page's, or "Valid" dates differ. **Severity: low.** **Mitigation:** copy verbatim; it's 4 lines;
  E2E + byte-diff cover it. Must-fix: no.

### Launch blockers
- **Risk: lazy-load broken → jspdf pulled into the initial `/pricing` bundle.** If the dynamic
  `await import('jspdf')` is accidentally converted to a static top-of-file
  `import { jsPDF } from 'jspdf'` during the move, the heavy lib ships in the initial bundle,
  slowing first paint. **Severity: medium (perf regression, not a crash).** **Mitigation:** the
  dynamic imports MUST stay dynamic inside the adapter method (explicitly called out in Step 3 and
  the Hard Constraints); optionally verify with a bundle check / the wiring-shape test asserting no
  eager load. Must-fix: **no** for correctness, but treat as a hard review checklist item — a static
  import here is a silent perf regression. **Flagging it prominently so Guard checks it.**
  **🗣 In plain English:** the one thing that could quietly go wrong: if someone "tidies" the lazy
  import into a normal import, the page gets heavier to open even though the PDF looks fine. Worth a
  deliberate check.
- **Risk: SSR crash from browser globals.** The adapter touches `window`/`document`. **Severity:
  low.** **Mitigation:** the adapter is a plain `.ts` module only ever CALLED from a `'use client'`
  component on a user click — its body never runs during SSR (only the factory `createJsPdfRenderer`
  runs at import, and that touches no browser global). The wiring singleton importing it is fine
  because the factory does no I/O. Must-fix: no. (Confirm: no top-level browser-global access in the
  adapter module body — all of it is inside the method.)

### Risk headline
**No must-fix (Gate 2 blocking) risks.** The two highest-attention items are (1) field-mapping
drift — mitigated by the mapping unit test, and (2) preserving the lazy dynamic import — a review
checklist item for Guard. Both are caught by the layered test net + one-time manual byte-diff.

---

## Hexagonal check (Gate 2 verdict inputs)

- **Port used/added:** ADDS `PdfRenderer` (`lib/ports/PdfRenderer.ts`) — a new owned socket for
  "render+deliver a price-agreement PDF."
- **Adapter:** ADDS `lib/adapters/jspdf/` (`JsPdfRenderer.ts` + `index.ts`) — the sole importer of
  `jspdf` and `jspdf-autotable`.
- **New dependencies:** **NONE.** `jspdf@^4.2.1` and `jspdf-autotable@^5.0.7` already exist; only
  their import LOCATION moves. (They were previously single-use AND unwrapped — a blocker; they are
  now wrapped behind the adapter, which is the compliance FIX. Justification line for the PR:
  "jspdf/jspdf-autotable: client-side PDF generation for pricing agreement export; now wrapped
  behind the PdfRenderer port per CLAUDE.md single-use-vendor rule.")
- **Wrapped?** YES — both are now confined to `lib/adapters/jspdf/`, satisfying the single-use-vendor
  wrapper rule. ESLint enforces it.
- **Rip-out test:** "Replace jsPDF with another PDF library tomorrow — how many files change?"
  → **one new adapter folder (`lib/adapters/<newvendor>/`) + one line in `lib/wiring/pdf.ts`.**
  The port, the page, and the `PriceAgreementPdfData` shape are untouched. **Result: PASS.**
  **🗣 In plain English:** swap the PDF printer brand and you write one new cable + change one wire
  on the patch panel. The screen and the contract don't move. That's the test passing.

**Verdict line:** Adds `PdfRenderer` port + `lib/adapters/jspdf/` adapter · new deps: NONE
(existing jspdf/jspdf-autotable now wrapped — fixes a blocker) · rip-out test: **PASS**.
No Gate 2 blockers.

---

## Acceptance criteria

1. `app/pricing/page.tsx` has **zero** `jspdf` / `jspdf-autotable` imports
   (`grep -n jspdf app/pricing/page.tsx` → empty).
2. `jspdf` / `jspdf-autotable` imported ONLY inside `lib/adapters/jspdf/**`; `npm run lint` passes
   and FAILS if either is imported elsewhere (new restriction + updated lint-pin test green).
3. `lib/ports/PdfRenderer.ts` imports no jsPDF and no browser DOM types (pure TS).
4. `lib/wiring/pdf.ts` is the only business-layer file importing the jspdf adapter; the page imports
   the `pdfRenderer` singleton from wiring, not the adapter.
5. Exporting a seeded agreement produces a byte-identical PDF with the identical filename
   (`MFS-Pricing-<ref>-<customer>.pdf`) — confirmed by the E2E download spec + one-time manual
   byte-diff.
6. jsPDF still lazy-loads only on click (dynamic imports preserved; no eager bundle inclusion).
7. Full unit suite + the new wiring-shape test green; new E2E pricing-export spec green.
8. No migration, no DB, no RLS change in the diff.
