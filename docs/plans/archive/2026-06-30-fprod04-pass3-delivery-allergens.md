# F-PROD-04 Pass 3 — real allergens on the goods-in DELIVERY label

**Date:** 2026-06-30
**FORGE phase:** Order (plan) — implementer executes from this file verbatim
**Spec status:** locked at Gate 1 (semantics, field shape, web-only blast radius)

```
DOMAIN (label rendering — pure, port-less per ADR-0010 §2)
  ├─ Printer (port) → [Browser]  (adapter — iframe/AirPrint, goes via /api/labels DB read)
  └─ Printer (port) → [Sunmi]    (adapter — native 58mm, reads DeliveryLabelInput client-side)
🗣 Two ways a delivery label reaches paper. One reads allergens from the database (iframe), one carries them in the print request itself (native). BOTH must be made honest — fixing only one leaves the other lying "None".
```

---

## 1. Objective

The goods-in DELIVERY label currently prints a hardcoded green **"Allergens: None"** on every transport
(100mm HTML, 58mm HTML, ZPL, and the Sunmi native thermal). When a delivery was logged with an allergen
**non-conformance** (`allergens_identified = true`), the label still says "None" — it hides a food-safety flag.

🗣 In plain English: right now the sticker always says "no allergens", even when the warehouse flagged a
problem on intake. We want the sticker to tell the truth: green "None" for the normal case, and a red warning
showing the note when someone flagged an allergen issue.

After this change the "Allergens:" line reads:

| DB state | Label text | HTML styling |
|---|---|---|
| `allergens_identified = false` | `None` | green `#166534` bold (**unchanged — byte-identical to today**) |
| `allergens_identified = true` + non-blank `allergen_notes` | `<the notes text>` | red `#991b1b` bold |
| `allergens_identified = true` + blank/null notes (defensive) | `FLAGGED — see record` | red `#991b1b` bold |

🗣 In plain English: `allergens_identified` is a true/false alarm flag on the delivery record, and
`allergen_notes` is the free-text the warehouse typed describing what they found. The label shows that text
as a red warning when the alarm is on.

**Critical semantic note (carry into code comments):** `allergens_identified` is a *non-conformance WARNING*
("MFS is allergen-free; true = problem, corrective action required"), **NOT** a product "contains" allergen
list. Do not phrase any output as a normal ingredient declaration — it is an exception flag. (Mince/prep use a
genuine `allergens_present` array; delivery does not — they are different concepts and stay separate.)

**Out of scope (locked):** prep (already reads `allergens_present`), mince (no allergen data model — legitimately
stays "None"). No DB migration. No Java/gradle/adb work — the APK is a remote-URL shell loading
https://mfsops.com, so the web deploy reaches the device with no reinstall.

---

## 2. Blast radius — CORRECTED to 10 files (spec said 5)

> ⚠️ **Scope correction — read this, conductor.** The locked spec lists 5 web files and asserts the native path
> is fixed by "changing one constant" in `buildDeliveryPayload`. That is **incomplete**: `buildDeliveryPayload`
> receives a `DeliveryLabelInput` (built client-side in the delivery page), **not** the route's `DeliveryLabelData`,
> and `DeliveryLabelInput` does not currently carry any allergen data. Changing the constant alone gives the
> native path nothing to compute from — it would still print "None". To make the native path actually honest
> (the spec's stated headline goal) the allergen data must be plumbed through the **port** (`DeliveryLabelInput`)
> and the **page builder** (`buildDeliveryInput`). Likewise, `html.ts` has **two** delivery renderers
> (`renderDeliveryHTML` *and* `renderDeliveryHTML58`) — both hardcode green "None"; the spec named only one.
> None of this changes a locked decision (goal/semantics/field-shape are intact) — it only corrects the file
> count. Plan covers all of it. See Risk R2.

🗣 In plain English: the spec under-counted the files. There are two separate places a delivery label gets its
data (the database read for the iframe path, and the print request for the native path), and the 58mm HTML had a
second copy of the "None" line. We have to touch all of them or the native printer keeps lying.

### Data-source / render map (why each file is in scope)

```
IFRAME / BROWSER path (100mm always; 58mm fallback):
  delivery page → getPrinter().printDeliveryLabel(input)
    → browser adapter builds /api/labels?type=delivery&id=… URL
      → route.ts reads haccp_deliveries  ← (6) ADD allergen columns + map
        → DeliveryLabelData              ← (1) ADD 2 fields
          → renderDeliveryHTML   (100mm) ← (4a) line 192
          → renderDeliveryHTML58 (58mm)  ← (4b) line 291
          → generateDeliveryZPL          ← (5) line 101

NATIVE SUNMI path (58mm on-device):
  delivery page → buildDeliveryInput(d)  ← (7) populate 2 fields from d.allergens_identified / d.allergen_notes
    → DeliveryLabelInput                 ← (8) ADD 2 fields  [port]
      → buildDeliveryPayload             ← (9) compute the `allergens` string  [sunmi adapter]
        → window.MFSSunmiPrint.printLabel(json)  ← Java already prints payload.allergens — NO Java change

SHARED:
  formatDeliveryAllergens()              ← (2) NEW pure helper, single source of the None/notes/FLAGGED branching
  index.ts re-export                     ← (3) so html/zpl/sunmi/tests import it from @/lib/printing
  Printer.contract.ts DELIVERY fixture   ← (10) +2 fields so tsc compiles
```

### Exact file list

| # | File | Change |
|---|---|---|
| 1 | `lib/printing/types.ts` | Add `allergens_flagged: boolean` + `allergen_notes: string \| null` to `DeliveryLabelData` (after line 38, `temp_status`). |
| 2 | `lib/printing/allergens.ts` **(NEW)** | Pure helper `formatDeliveryAllergens(flagged, notes) → { text, flagged }`. |
| 3 | `lib/printing/index.ts` | Re-export `formatDeliveryAllergens` (after the existing renderer re-exports, ~line 28). |
| 4a | `lib/printing/html.ts` | `renderDeliveryHTML` — replace line 192 hardcoded green "None". |
| 4b | `lib/printing/html.ts` | `renderDeliveryHTML58` — replace line 291 hardcoded green "None". |
| 5 | `lib/printing/zpl.ts` | `generateDeliveryZPL` — replace `` `Allergens: None` `` at line 101. |
| 6 | `app/api/labels/route.ts` | Delivery branch: add 2 columns to `.select` (line 159); map 2 fields into `labelData` (after line 196). |
| 7 | `app/haccp/delivery/page.tsx` | `buildDeliveryInput` (line 42): populate the 2 new fields from `d.allergens_identified` / `d.allergen_notes`. |
| 8 | `lib/ports/Printer.ts` | Add `allergens_flagged: boolean` + `allergen_notes: string \| null` to `DeliveryLabelInput` (after line 32). |
| 9 | `lib/adapters/sunmi/Printer.ts` | `buildDeliveryPayload` (line 158): compute `allergens` via the shared helper from the new input fields. |
| 10 | `lib/ports/__contracts__/Printer.contract.ts` | Add the 2 new fields to the `DELIVERY` fixture (after line 51) so tsc compiles. |

**No change needed:** `lib/adapters/browser/Printer.ts` (its `deliveryUrl` only carries `id`; the route's DB read
supplies allergens — correct as-is). `lib/adapters/fake/Printer.ts` (stores inputs, constructs none). The Java
`SunmiPrintBridge.java` (already prints `payload.allergens`).

---

## 3. The shared helper — decision + exact signature

**Decision: YES, centralise.** The None/notes/FLAGGED branching is needed in `html.ts` (×2), `zpl.ts`, and
`sunmi/Printer.ts`. Four copies of the same defensive branching would drift. One pure function is the single
source of truth; HTML additionally needs the boolean to pick colour.

🗣 In plain English: instead of writing the same "is it None, the note, or FLAGGED?" decision in four places
(where they could quietly fall out of sync), we write it once and everyone calls it.

**Home:** new file `lib/printing/allergens.ts` (pure TS, no imports). Re-exported from `lib/printing/index.ts`
so `html.ts`, `zpl.ts`, the route, the Sunmi adapter (which already imports `@/lib/printing/types`), and the
tests all reach it via `@/lib/printing`. This is allowed: `lib/printing` is the deliberately port-less pure
renderer module (ADR-0010 §2), not an adapter — importing a pure function from it mirrors the existing
type imports and breaks no boundary rule.

**Exact signature + behaviour:**

```ts
// lib/printing/allergens.ts
//
// Delivery-label allergen display logic — single source of truth for the
// None / notes / FLAGGED branching used by every delivery transport
// (renderDeliveryHTML, renderDeliveryHTML58, generateDeliveryZPL,
// buildDeliveryPayload). F-PROD-04 Pass 3.
//
// IMPORTANT semantic: `flagged` is a NON-CONFORMANCE warning flag
// (allergens_identified), NOT a product "contains" allergen list. When true the
// label surfaces the note as a warning; when false the site is allergen-free.

export interface DeliveryAllergenDisplay {
  /** The text to print on the "Allergens:" line. */
  text:    string
  /** True when this is a non-conformance warning (renderers colour it red). */
  flagged: boolean
}

export function formatDeliveryAllergens(
  flagged: boolean,
  notes:   string | null,
): DeliveryAllergenDisplay {
  if (!flagged) return { text: 'None', flagged: false }
  const trimmed = (notes ?? '').trim()
  return trimmed !== ''
    ? { text: trimmed,                 flagged: true }
    : { text: 'FLAGGED — see record',  flagged: true }
}
```

🗣 In plain English: feed it the flag and the note; it hands back the exact words for the line plus a
"should this be red?" boolean. False flag → plain "None"; flag with a note → the note; flag with no note → a
safe placeholder so we never print an empty warning.

---

## 4. Numbered implementation steps (TDD: write/extend the failing tests in §5 first)

> General rule: **the not-flagged (`false`) branch of every render point must emit byte-identical output to today.**
> The helper's `flagged=false` arm returns exactly `'None'`; each renderer must keep its existing green/`None`
> markup for that case. Diff-check at Guard.

### Step 1 — `lib/printing/allergens.ts` (NEW, file 2)
Create the file with the exact contents in §3.

### Step 2 — `lib/printing/index.ts` (file 3)
Add, near the other `lib/printing` re-exports (after ~line 28):
```ts
export { formatDeliveryAllergens } from './allergens'
export type { DeliveryAllergenDisplay } from './allergens'
```

### Step 3 — `lib/printing/types.ts` (file 1)
In `DeliveryLabelData`, immediately after `temp_status: string` (line 38), add:
```ts
  allergens_flagged: boolean      // intake allergen non-conformance flag (allergens_identified)
  allergen_notes:    string | null // free-text describing the flagged allergen(s); null/blank when not flagged
```

### Step 4 — `lib/printing/html.ts` `renderDeliveryHTML` (file 4a, line 192)
At the top of the function (near the `tempColour`/`barcode` consts, ~line 156) add:
```ts
  const allergen       = formatDeliveryAllergens(data.allergens_flagged, data.allergen_notes)
  const allergenColour = allergen.flagged ? '#991b1b' : '#166534'
```
Import `formatDeliveryAllergens` from `'./allergens'` (or `'@/lib/printing'`) at the top of the file.
Replace the line-192 array entry with:
```ts
    `<div class="fw"><span class="fk">Allergens:</span><span class="fv" style="color:${allergenColour};font-weight:bold">${allergen.text}</span></div>`,
```
**Byte-identical check:** when `allergens_flagged=false`, `allergen.text='None'` and `allergenColour='#166534'`,
reproducing the current markup exactly. Keep the style ON the `.fv` span — do **not** introduce a nested inner
span (the mince renderer nests; delivery must not, or the not-flagged bytes change).

### Step 5 — `lib/printing/html.ts` `renderDeliveryHTML58` (file 4b, line 291)
Same treatment inside `renderDeliveryHTML58` (add the two consts near ~line 254, replace the line-291 entry with
the identical-shaped span). Same byte-identical guarantee for the not-flagged case.

### Step 6 — `lib/printing/zpl.ts` `generateDeliveryZPL` (file 5, line 101)
Import `formatDeliveryAllergens` at the top. Before the `fields` array (~line 96) add:
```ts
  const allergen = formatDeliveryAllergens(data.allergens_flagged, data.allergen_notes)
```
In the spread on line 101, replace the literal `` `Allergens: None` `` with:
```ts
    `Allergens: ${sanitise(allergen.text, 30)}`,
```
This mirrors the mince ZPL sanitisation at line 160 (`sanitise(value, 30)`). For not-flagged,
`sanitise('None', 30) === 'None'` → byte-identical. (Note: ZPL `sanitise` strips non-ASCII, so the defensive
em-dash in `FLAGGED — see record` becomes `FLAGGED  see record`; see Risk R3 — accepted, matches the existing
em-dash handling on the supplier line at zpl.ts:98.)

### Step 7 — `app/api/labels/route.ts` delivery branch (file 6)
- Line 159 `.select(...)`: append `, allergens_identified, allergen_notes` to the column list.
- In the `labelData` object (after `temp_status:` at line 196) add:
```ts
        allergens_flagged: data.allergens_identified ?? false,
        allergen_notes:    data.allergen_notes ?? null,
```
The route reads the DB once and emits the structured fields; each renderer formats/styles. No auth change — the
route stays the existing service-role-allow-listed `/api/labels` (F-RLS-final Rule-A). The `format=json` branch
(line 200) automatically carries the two new fields (it returns `labelData` verbatim) — good for parity.

### Step 8 — `lib/ports/Printer.ts` `DeliveryLabelInput` (file 8)
After `cut_site: string | null` (line 32), add:
```ts
  allergens_flagged: boolean       // intake allergen non-conformance flag (native path mirror of DeliveryLabelData)
  allergen_notes:    string | null // free-text describing flagged allergen(s); null/blank when not flagged
```

### Step 9 — `app/haccp/delivery/page.tsx` `buildDeliveryInput` (file 7, line 42)
The page's `Delivery` interface already declares `allergens_identified: boolean` (line 115) and
`allergen_notes: string | null` (line 116), and the list query (`listDeliveries` →
`HaccpDailyChecksRepository.ts:72`) already selects both columns — so the data is present client-side.
In the returned object (before `width,` at line 55) add:
```ts
    allergens_flagged: d.allergens_identified,
    allergen_notes:    d.allergen_notes,
```

### Step 10 — `lib/adapters/sunmi/Printer.ts` `buildDeliveryPayload` (file 9, line 158)
Import `formatDeliveryAllergens` from `@/lib/printing` (the adapter already imports types from
`@/lib/printing/types`). Replace `allergens: 'None',` (line 158) with:
```ts
    allergens:     formatDeliveryAllergens(d.allergens_flagged, d.allergen_notes).text,
```
The `DeliveryLabelPayload` shape is **unchanged** (still one `allergens: string` key) — so the native bridge
JSON contract (ADR-0013) and the Java side need **no** change, and the legacy positional fallback (line 266,
passes `payload.allergens`) keeps working.

### Step 11 — `lib/ports/__contracts__/Printer.contract.ts` `DELIVERY` fixture (file 10, line 38–52)
Add to the fixture (after `cut_site: "C1",` line 49, before `width:`):
```ts
  allergens_flagged: false,
  allergen_notes: null,
```
(tsc would otherwise fail to compile the fixture once the port gains required fields.)

---

## 5. Test plan (ANVIL implements; enumerated here — extend existing suites, do NOT create parallel ones)

### A. Unit — `formatDeliveryAllergens` truth table (add to `tests/unit/labelPrinting.test.ts`)
- `false, null` → `{ text: 'None', flagged: false }`
- `false, 'whatever'` → `{ text: 'None', flagged: false }` (flag wins)
- `true, 'Mustard (spill on pallet)'` → `{ text: 'Mustard (spill on pallet)', flagged: true }`
- `true, '  Celery  '` → trimmed `{ text: 'Celery', flagged: true }`
- `true, ''` → `{ text: 'FLAGGED — see record', flagged: true }`
- `true, null` → `{ text: 'FLAGGED — see record', flagged: true }`

### B. Unit — HTML delivery renderers (add to `tests/unit/labelPrinting.test.ts`, near the BLS oracle block using the real `renderDeliveryHTML` import already present at line 517)
Extend the `realDelivery` fixture (line 564) with `allergens_flagged: false, allergen_notes: null`.
- not-flagged: `renderDeliveryHTML(realDelivery)` contains `color:#166534;font-weight:bold">None<` (green None) and **NOT** `#991b1b` on the Allergens line.
- flagged+notes: `{ ...realDelivery, allergens_flagged: true, allergen_notes: 'Mustard' }` → contains `color:#991b1b` and `>Mustard<` on the Allergens line, and **not** `>None<`.
- flagged+blank: `allergen_notes: ''` → contains `FLAGGED — see record` in red.
- Repeat the not-flagged + flagged cases for `renderDeliveryHTML58`.
- **Byte-identical guard:** assert the not-flagged `renderDeliveryHTML(realDelivery)` Allergens substring exactly equals the current literal `<div class="fw"><span class="fk">Allergens:</span><span class="fv" style="color:#166534;font-weight:bold">None</span></div>`.

### C. Unit — ZPL delivery (same block, using `realGenerateDeliveryZPL`)
- not-flagged: output contains `Allergens: None`.
- flagged+notes `'Mustard'`: contains `Allergens: Mustard`.
- flagged+blank: contains `Allergens: FLAGGED` (em-dash stripped by `sanitise` — assert the `FLAGGED` token, not the em-dash).

### D. Unit — Sunmi `buildDeliveryPayload` (add to `tests/unit/adapters/sunmi/Printer.test.ts`)
Extend the `base` `DeliveryLabelInput` fixture (line 97) with `allergens_flagged: false, allergen_notes: null`.
- not-flagged: `buildDeliveryPayload(base, 'ACME').allergens` === `'None'` (preserves the existing assertion at line 138).
- flagged+notes: `{ ...base, allergens_flagged: true, allergen_notes: 'Mustard, Celery' }` → `.allergens === 'Mustard, Celery'`.
- flagged+blank: `.allergens === 'FLAGGED — see record'`.
- The key-set oracle (line 166) is **unchanged** (payload keys identical — only the `allergens` *value* differs).

### E. Unit — route mapping (param/shape level)
The route module pulls in server-only Supabase, so (matching the existing convention at labelPrinting.test.ts
line 691) assert the mapping shape with a small predicate mirroring the route's two new lines:
`allergens_flagged: data.allergens_identified ?? false`, `allergen_notes: data.allergen_notes ?? null`
(true→true, undefined→false; notes→notes, undefined→null).

### F. Integration — `tests/integration/labels.test.ts`
Add a delivery-label describe block. Plant (or reuse `delA`) one delivery with
`allergens_identified: true, allergen_notes: 'Mustard cross-contact'` and one with `allergens_identified: false`.
- `?type=delivery&id=<flagged>&format=html&width=100mm` → html contains `Mustard cross-contact` and `#991b1b`.
- `?type=delivery&id=<clean>&format=html&width=100mm` → html contains green `None`, not `#991b1b`.
- `?type=delivery&id=<flagged>&format=json` → `data.allergens_flagged === true`, `data.allergen_notes === 'Mustard cross-contact'`.
- **Note for conductor:** local Docker/Supabase is DOWN this session → the integration suite SUSPENDs locally
  (fails fast in `_assertStack.ts`) and must run in **CI** (the blocking `smoke` check / preview). Flag at ANVIL.

### G. Contract
`tests/unit/.../Printer.contract.ts` already drives both adapters via the `DELIVERY` fixture (now +2 fields).
No new assertion needed — it just keeps compiling and passing.

---

## 6. Risk Assessment

🗣 In plain English: the dangerous part of this job is *not* the new red warning — it's accidentally changing
the millions of normal "None" labels. Everything below is sized around protecting that common case.

### Concurrency / race conditions — **None (severity: n/a)**
Pure render path, read-only. No shared state, no writes, no ordering. *No material risks in this category.*

### Security — **Low**
No auth change (route stays the F-RLS-final Rule-A service-role-allow-listed `/api/labels`). The two columns
(`allergens_identified` boolean, `allergen_notes` text) are already surfaced in the delivery and audit UIs, so
no new data is exposed. **Mitigation:** none required. **Must-fix:** no.

### Data migration — **None (severity: n/a)**
Columns already exist on `haccp_deliveries` (verified). No schema change, no PITR gate, no backfill.
*No material risks in this category.*

### Business-logic flaws — **Medium**
**R-SEMANTIC:** `allergens_identified` is a *non-conformance warning*, not a product "contains" declaration. If
a renderer phrased it as a normal allergen list it would misrepresent a food-safety exception.
**Mitigation:** the helper + code comments state the semantic explicitly; flagged output is styled red as a
warning, never green; the notes text is shown verbatim, not relabelled. **Must-fix:** no (handled by design).

### Launch blockers / regressions — **HIGH (the headline risk)**
**R1 — byte-identical not-flagged common path.** The overwhelming majority of deliveries are
`allergens_identified=false`; their labels must be **bit-for-bit unchanged** across all four render points
(100mm HTML, 58mm HTML, ZPL, native). A stray colour/markup/spacing change silently reprints every normal label
differently.
**Mitigation:** helper's `flagged=false` arm returns exactly `'None'`; each renderer keeps its existing
green-`#166534`-bold markup for that case; §5-B includes an exact-string byte-identical assertion; Guard does a
`diff` of not-flagged output vs current. **Must-fix:** no (mitigated), but it is the #1 thing ANVIL must prove.

**R2 — incomplete blast radius would make the native fix inert.** If only the 5 spec files were changed, the
Sunmi native path would *still* print "None" because `buildDeliveryPayload` has no allergen data to read. The
plan corrects this by plumbing the data through `DeliveryLabelInput` (port, file 8) + `buildDeliveryInput`
(page, file 7) + the contract fixture (file 10).
**Mitigation:** all 10 files in §2; §5-D proves the native payload carries the real string. **Must-fix:** no —
absorbed into the plan; flagged so the conductor knows the file count grew from 5 to 10.

**R3 — em-dash in `FLAGGED — see record` on monochrome transports.** ZPL `sanitise` strips non-ASCII →
`FLAGGED  see record` (double space) on Zebra; the native thermal may render it oddly. This is a *defensive*
branch (flagged with blank notes — shouldn't occur in practice).
**Mitigation:** accepted — matches the existing em-dash handling on zpl.ts:98 (supplier line). Tests assert the
`FLAGGED` token, not the punctuation. If the conductor prefers zero cosmetic drift, swap the literal to an ASCII
hyphen `FLAGGED - see record` (one-word edit in the helper). **Must-fix:** no.

**R4 — adding required fields breaks fixtures at compile time.** `DeliveryLabelInput` + `DeliveryLabelData`
gaining required fields will fail tsc on the contract fixture (file 10), the Sunmi test `base` (§5-D), and the
`realDelivery` oracle (§5-B) until updated.
**Mitigation:** all listed; tsc is the backstop (cf. the F-TD-12 relative-import lesson — trust tsc to catch any
fixture missed). **Must-fix:** no.

### Headline
**No must-fix / Gate-2-blocking risks.** The one risk to watch hard is **R1 (byte-identical not-flagged path)** —
ANVIL must prove the normal "None" label is unchanged on all four transports. **R2** is a scope correction
(5→10 files), not a blocker, but the conductor should note the expanded surface.

---

## 7. Rollback

Single squashed web PR, no migration, no APK rebuild → rollback = `git revert` the PR (or redeploy the prior
commit on Vercel). Because the APK is a remote-URL shell, reverting the web deploy instantly restores the old
`buildDeliveryPayload` "None" on the device too — no device action. No data written, nothing to unwind.

🗣 In plain English: if anything looks wrong, revert one web deploy and every printer — including the handheld —
goes back to exactly today's behaviour within a deploy cycle. Nothing to clean up.

---

## 8. Acceptance criteria

1. `allergens_identified=false` delivery → label prints green **"None"**, byte-identical to current, on 100mm
   HTML, 58mm HTML, ZPL, and native Sunmi.
2. `allergens_identified=true` + notes → label prints the **notes text** in red (`#991b1b` on HTML) on all four
   transports.
3. `allergens_identified=true` + blank notes → prints **"FLAGGED — see record"** (red on HTML).
4. No DB migration; no Java/gradle/APK change; route auth unchanged.
5. Prep and mince delivery-label behaviour untouched.
6. `tsc` clean, `next lint` clean, unit suite green (incl. new truth-table + renderer + payload cases),
   integration delivery cases green in CI (local SUSPEND acceptable this session).

---

## 9. Hexagonal verdict (populates Gate 2)

- **Port used:** `Printer` (`lib/ports/Printer.ts`) — extended (`DeliveryLabelInput` gains two data fields). No
  new port.
- **Adapters touched:** `Sunmi` (`lib/adapters/sunmi/Printer.ts`) — value of one existing payload key now
  computed, not hardcoded. `Browser` adapter unchanged (correctly routes via the DB read). No new adapter.
- **New dependencies:** **none** (no `package.json` change).
- **Vendor SDKs:** none added/moved; no vendor import crosses the adapter boundary.
- **New pure module:** `lib/printing/allergens.ts` — owned domain-ish formatting in the port-less renderer
  (ADR-0010 §2), no vendor, no framework import. Imported by the Sunmi adapter the same way it already imports
  `@/lib/printing/types`.
- **Rip-out test:** **N/A** (no vendor swap in this change) → treated as **PASS** (no boundary regression: no
  inner layer imports `lib/adapters/**`; no `app/**` or `components/**` imports an adapter directly — the page
  goes via the wired `getPrinter()` Printer port).

🗣 In plain English: no new vendor, no new socket, nothing rewired — we add two data fields to an existing print
request and compute a string that used to be hardcoded. The Lego boundaries are untouched, so Gate 2 has nothing
to block on here.
