# Code review — F-PROD-04 Pass 3: real allergens on the delivery label

- **PR:** #105 `feat/fprod04-pass3-delivery-allergens`
- **Date:** 2026-06-30
- **Phase:** FORGE Guard (code-critic subagent)
- **Verdict:** **No blockers — hand to ANVIL.** One 🟡 security item surfaced for a conscious decision.

## Test / lint / type results

- **Unit (affected areas):** 159/159 pass — `labelPrinting.test.ts`, `adapters/sunmi/Printer.test.ts`, `adapters/browser/Printer.test.ts`, `adapters/fake/Printer.test.ts`, `wiring/printer.test.ts`. (Full suite at Render: 3032 passing.)
- **tsc --noEmit:** clean (exit 0).
- **eslint** (9 changed source files): clean (exit 0).
- **Integration** (`tests/integration/labels.test.ts`): not run locally — Docker/Supabase down. Runs in CI via the blocking `smoke` check. New specs (flagged → `#991b1b` + notes; not-flagged → exact green `None`; `format=json` carries both fields) read as real oracles.

## 🔴 Blockers

None.

## 🟡 Warnings (should-fix, non-blocking)

**1. `lib/printing/html.ts:198` & `:302` — `allergen_notes` free-text interpolated into label HTML unescaped, rendered in a same-origin iframe with no `sandbox` attribute (`lib/adapters/browser/Printer.ts:135` `doc.write(html)`) → stored-XSS vector.**
The flagged-case text is user-entered free text injected raw. **Pre-existing class, not new:** `data.supplier`, `data.product`, `data.slaughter_site`, `data.cut_site` (`html.ts:189`, `:178-184`) are already interpolated raw through the same sink. This diff widens the surface by one field; it does not invent it. ZPL + native Sunmi pass through `sanitise()` / plain string fields, so only the HTML transport is exposed.
Graded 🟡 not 🔴 because: (a) authenticated internal-only tool, data entered by trusted warehouse/admin staff; (b) follows the file's existing unescaped convention verbatim. Proper fix: a small `escapeHtml()` applied to **all** free-text fields in `renderDeliveryHTML`/`renderDeliveryHTML58` (supplier, product, sites, allergen_notes), or add `sandbox` to the print iframe.

## 🔵 Architecture notes (follow-up, not blocking)

**1. `lib/adapters/sunmi/Printer.ts:27`** imports `formatDeliveryAllergens` from the barrel `@/lib/printing`, while `html.ts`/`zpl.ts` import directly from `./allergens`. Cosmetic; pulling the barrel into the adapter also drags in unused `html`/`zpl` exports. No correctness/boundary impact (direction is legal — `lib/printing` is inner relative to the adapter).

## 🟢 Test-quality notes

1. `tests/unit/labelPrinting.test.ts:825-841` — the route mapping test re-implements `mapAllergens` rather than exercising the real route (route pulls server-only Supabase). Real mapping covered by the integration `format=json` assertion. Acceptable given the integration backstop; the unit mirror can drift from `route.ts:197-198` if `?? false` / `?? null` ever changes.
2. **Strong oracles (good):** byte-identical R1 cases assert the full exact markup string plus a negative `not.toContain('#991b1b...None')` — real bit-for-bit oracles, not loose `toContain`. Truth table covers all three branches plus trim, null-vs-empty, "notes ignored when not flagged." Sunmi uses exact `.toBe`.
3. **Prep/mince allergen paths confirmed untouched** (`joinAllergens` / `allergens_present` not in diff). No collateral.

## R1 byte-identical verification (headline risk) — PASS

Not-flagged path traced on all four transports against `main`:
- **HTML 100mm** (`html.ts:198`): colour `#166534`, text `None` → identical to old literal. ✓
- **HTML 58mm** (`html.ts:302`): same. ✓
- **ZPL** (`zpl.ts:106`): `Allergens: ${sanitise('None', 30)}` = `Allergens: None` → byte-identical. ✓
- **Native Sunmi** (`sunmi/Printer.ts:159`): `formatDeliveryAllergens(false, …).text` = `'None'`. ✓
- Null-safety: route maps `?? false` / `?? null` (`route.ts:197-198`); helper trims, treats null/empty/whitespace-only identically → `FLAGGED - see record` only when flagged-with-blank. ✓

## Depth verdict

- `lib/printing/allergens.ts` → **DEEP** — small interface, genuine branching, single source consumed by four transports; deletion test concentrates complexity (removing it forces copy-paste into 4 render points). Pure, no I/O, no vendor import, correctly homed in `lib/printing/`. Not a pass-through, not a speculative seam.
- `DeliveryLabelData` / `DeliveryLabelInput` field additions → additive, no vendor type leaked, no new seam.

## Hexagonal / boundary check — clean

- No new `package.json` dependency. No vendor SDK outside `lib/adapters/<vendor>/`. `allergens.ts` imports nothing (pure). Inner layers don't import adapters. Delivery page prints via the wired `Printer` port. All four render points call `formatDeliveryAllergens` — no copy-pasted branching left to drift.

## Conductor decision

🟡 #1 (HTML-escaping) put to Hakan as a conscious decision: he chose **fix-now**. Looped back to Render (same branch).

## Re-review delta — escapeHtml fix (commit `2a4becc`)

Focused Guard re-review of the escaping commit — **no blockers, ship to ANVIL.**

- `escapeHtml` (`lib/printing/html.ts:27-34`) — ampersand FIRST, then `< > " '`; pure, no I/O, no vendor import. `'None' → 'None'`, `'GB1234' → 'GB1234'` unchanged → R1 byte-identical oracles still pass.
- Every DB free-text interpolation in BOTH `renderDeliveryHTML` (`:201-217`) and `renderDeliveryHTML58` (`:306-322`) now wrapped: `species`, `batch_code` (bc div), `supplier`, `product`, `bornName`/`rearedName`, `slaughter_site`/`cut_site`, 58mm `code`, `allergen.text`. Self-generated values (date via `fmtDisplayDate`, numeric temp, `mfs_plant` constant, colour hex) correctly left raw.
- `!` non-null assertion on `data.slaughter_site` (`:195`/`:300`) is sound — the `sameSite` branch guarantees truthy; satisfies tsc narrowing, masks no real null.
- No over-escaping (`allergen.text` returns plain strings; colour applied via separate `style` attr).
- New XSS tests (`tests/unit/labelPrinting.test.ts:834-873`) assert escaped form present AND raw payload absent, 100mm + 58mm, note + supplier/product/site + code.
- Results: unit **99/99** affected (3036 full) · `tsc --noEmit` clean · `next lint` clean.

### 🔵 New follow-up (pre-existing, out of this delta — do NOT block)

`generateBarcodeSVG` embeds `batch_code` raw into the inline-SVG `<text>` node in the same iframe — the visible `bc` div copy is now escaped but the barcode caption copy is not. Low risk today (`batch_code` is system-generated, e.g. `3006-GB-1`, not user-typed); inline-SVG `<script>` would execute, so **promote to 🔴 if `batch_number` ever becomes user-editable**. One-line fix: escape `text` inside `generateBarcodeSVG`. Logged to BACKLOG §F-PROD-04.
