# Guard review — beef mince + meat-prep BLS dispatch labels

- **Date:** 2026-06-30
- **Branch / PR:** `fprod04-beef-mince-prep-dispatch-labels` / #102
- **Reviewer:** code-critic subagent (FORGE Guard — sole review authority this run)
- **Unit:** F-PROD-04 beef mince + meat-prep dispatch labels (native V3 die-cut + BLS compliance)

## Verdict: NO BLOCKERS — hand to ANVIL

All four headline risks check out. Regulated wording is verbatim-correct and consistent across all
four render paths, mince stays country-only, prep is country+plant, GB2946 is the value everywhere
with UK2946 absent from production, both Java bridge signatures are unchanged, the hexagonal boundary
holds, and no new dependency/migration/RLS appeared. Tests, tsc, and lint all green.

## Hard-constraint verification

**1 — Regulated correctness: PASS.** Compulsory wording verbatim in every renderer:
- HTML (`lib/printing/html.ts`): mince `Born in:` / `Slaughtered in:` / `Minced in:` (233-235, 329-331);
  prep `Born in:`/`Reared in:` / `Slaughtered in:` / `Cut in:` / `Further cut in:` (355-356, 389-391, 431-433).
- ZPL (`lib/printing/zpl.ts:200-209`): prep `Slaughtered in:`/`Cut in:`/`Further cut in:` with GB2946.
- Java native (`SunmiPrintBridge.java`): mince `Slaughtered in`/`Minced in` (269-270); prep
  `Slaughtered in`/`Cut in`/`Further cut in` (328-330).
- Granularity split correct: mince `slaughtered_in` country-only (route strips digits
  `site.replace(/[^A-Za-z]/g,'').slice(0,2)` ~route.ts:210; `minced_in:'GB'` hardcoded country); prep
  keeps raw `GBxxxx` (~route.ts:228, no strip). Mince has no `cut_in`/`further_cut_in` field at all —
  no plant code can leak onto a mince label.
- Multi-source aggregation DISTINCT + deterministic: `[...new Set(...)].filter(Boolean)` then `.map(toName)`,
  renderers `.join(', ')`. Order = DB-row order via insertion-ordered Set.

**2 — ADR-0013 no-signature-change: PASS.** `printLabel(String json)` (`SunmiPrintBridge.java:58`) and
the legacy 9-arg positional `printDeliveryLabel(...)` (121-135) both byte-unchanged (neither on a `-`
diff line). Bridge added only a `type`-branch (`mince`/`prep`/else) + two new private
`renderMinceLabel`/`renderPrepLabel`. Web JS feature-detects (`typeof bridge.printLabel !== 'function'`
→ throws → iframe fallback), so an old APK degrades to iframe rather than mis-printing.

**3 — Hexagonal (ADR-0010/0002): PASS.** Renderers stay port-less pure functions. Mince page imports
only `getPrinter` from `@/lib/wiring/printer` (page.tsx:10) — no adapter import. Vendor/native code
confined to `lib/adapters/sunmi/` + Java bridge. `MFS_PLANT_CODE` is a domain constant in
`lib/printing/types.ts`. Rip-out holds: a future Zebra = one new `lib/adapters/zebra/` + one
`lib/wiring/printer.ts` line (ZPL generator already exists).

**4 — No new dep / migration / RLS: PASS.** `package.json`/`package-lock.json` unchanged; zero files
under `supabase/migrations/`. Route reads pre-existing columns (`haccp_meatprep_log`,
`haccp_deliveries.cut_site/slaughter_site`).

**5 — No AI references: PASS.** Commits + code clean. (Grep `Anthropic` hits = the legitimate
pre-existing `lib/adapters/anthropic/LLMExtractor.ts` vendor SDK, not authorship.)

**Accepted item confirmed:** `tests/unit/labelPrinting.test.ts:226` (`mfs_plant: 'UK2946'`) is a
test-local inline mock feeding an inline test-copy renderer — never touches production; same file
584-599 actively assert UK2946 never appears in real renderers' output. Correctly left unchanged.

**Allergen behaviour byte-unchanged:** `allergens_present.length === 0 ? 'None'…` identical to existing
mince/delivery renderers; prep reuses it. No Pass-3 allergen logic leaked in.

## Depth verdicts (new/touched modules)

- `renderPrepHTML` / `renderPrepHTML58` (html.ts) → DEEP — small input hides full BLS layout + collapse + barcode.
- `generatePrepZPL` (zpl.ts) → DEEP — hides ZPL coordinate math + conditional row offsets.
- `buildMincePayload` / `buildPrepPayload` (sunmi) → DEEP (borderline-thin but earns it) — typed contract
  boundary to the Java bridge keys, pinned by oracle; encodes granularity choice, not pass-through.
- `PrepLabelData` (types.ts) → DEEP — deliberately separate from MinceLabelData (honest fields, passes deletion test).
- route `prep` / `format=json` branches (route.ts) → DEEP — the json branch is the single-source-of-truth
  seam; aggregation happens ONCE server-side, adapter only string-joins.
- `countries.ts` (`countryName`/`COUNTRY_NAMES`) → DEEP — de-duplicates a map previously copied 3×.

No PASS-THROUGH, no SPECULATIVE SEAM introduced. No client-side re-aggregation of regulated content.

## 🔵 Non-blocking notes (audit trail, no action this PR)

1. **Cross-language key sync** (`lib/adapters/sunmi/Printer.ts:181-211` ↔ `SunmiPrintBridge.java:225-235,298-308`):
   JS payload keys (`slaughteredIn`/`cutIn`/`furtherCutIn`/`mincedIn`) and Java `o.optString(...)` reads are
   hand-synchronised across two languages with no shared schema. Sunmi unit test pins the JS side; a typo'd
   Java key would silently render an empty field (`optString(...,"")`) rather than fail. **Pre-existing
   pattern** (delivery label already works this way) — noted, not introduced here.
2. **Wording-style difference (intentional, confirmed safe):** HTML/ZPL render `Slaughtered in:` (colon,
   label:value) while Java native renders `Slaughtered in GB1234` (inline, no colon). Both satisfy the
   compulsory phrase — the colon is presentational, not part of the regulated wording. Flagged so the
   audit records it was checked deliberately.

## Test / lint / type results

```
Unit (scoped to printing + adapters + wiring): 143/143 passed (5 files)
  labelPrinting.test.ts ✓ · adapters/sunmi/Printer.test.ts ✓ · wiring/printer.test.ts ✓
  adapters/browser/Printer.test.ts ✓ · adapters/fake/Printer.test.ts ✓
tsc --noEmit → clean (exit 0)
next lint    → clean on all 9 changed prod files
```
