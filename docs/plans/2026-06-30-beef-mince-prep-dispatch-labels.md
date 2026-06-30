# Plan — F-PROD-04: beef MINCE + MEAT-PREP DISPATCH labels (BLS-compliant, native Sunmi V3 die-cut)

**Date:** 2026-06-30
**Unit:** F-PROD-04 (next pass — beef mince + meat-prep dispatch labels)
**Phase:** FORGE Render (this plan is the output of Order, ready for an implementer)
**Spec source:** locked spec approved by Hakan at Gate 1 (this session) + BACKLOG §F-PROD-04 + RPA email digest

---

## Visual mini-map

```
DOMAIN (label render — pure, PORT-LESS by ADR-0010)
  ├─ generateLabel/html.ts/zpl.ts (renderer)  — gets the mince≠prep split + verbatim wording
  └─ Printer (port) → [Sunmi native]  (adapter) — gains mince + prep JSON payloads
                    → [Browser/iframe] (adapter) — gains type=prep URL
  SunmiPrintBridge.java (native, in APK) — gains "mince" + "prep" render branches via JSON `type` key
🗣 one socket (Printer), two plugs (Sunmi/Browser); the renderer stays a plain function — no vendor to swap, so no socket round it
```

**🗣 In plain English:** We are adding two new printed-label designs (one for minced beef, one for prepared cuts), making them say the legally-required words, and teaching the Sunmi handheld to print them itself. The "Lego" wiring does not change shape — we add fields to existing plugs, we do not add a new socket.

---

## Goal

Produce **two distinct, beef-labelling-compliant dispatch labels** — a **MINCE** template and a **PREP** template — that:
1. Carry the exact compulsory BLS wording the RPA inspector requires.
2. Print **natively on the Sunmi V3 die-cut 52×38mm roll** (the same label-mode path the delivery label already uses), AND on the HTML/AirPrint + ZPL fallbacks with identical compliant content.
3. Replace the single hardcoded `UK2946` plant code with a named `GB2946` constant (which also corrects the delivery label's "Further cut in" line — desired, not a regression).

**🗣 In plain English:** Right now there is ONE production label and it is missing legally-mandated wording, it cannot print on the handheld, and it carries the wrong plant code prefix (`UK2946`). After this unit there are two correct labels — one for mince, one for prep — that print on the handheld, browser, and the future Zebra alike, all carrying the right words and the right code.

---

## Domain terms (plain-English bridge)

- **BLS** — Compulsory Beef Labelling Scheme (UK/RPA). 🗣 The government rulebook for what a beef label must say; getting a word or a code wrong is a regulatory failure, not a cosmetic bug.
- **Dispatch label** — the sticker that goes on product leaving the building (mince / prep). 🗣 Unlike the goods-in/delivery label (already shipped), this one carries the FULL compulsory wording because it travels to a customer.
- **MINCE template vs PREP template** — two different layouts driven by which sub-form the record came from. 🗣 Mince says country-only ("Slaughtered in GB", "Minced in GB"); prep says country+plant ("Slaughtered in GB1234", "Cut in GB5678", "Further cut in GB2946"). Different rules, so two designs.
- **`GB2946`** — MFS's own cutting-plant code in the beef-labelling-scheme form (prefix `GB`, NOT the health-mark `UK2946`). 🗣 Same plant number 2946, different official prefix for this scheme. A domain constant, not a vendor.
- **`haccp_mince_log` / `haccp_meatprep_log`** — the two database tables behind the mince and meatprep sub-forms. 🗣 Two separate filing cabinets; the API currently only reads the mince one for labels.
- **`source_delivery_ids`** — the array of intake-delivery UUIDs a production run drew from. 🗣 The breadcrumb trail back to where the meat came from; we read each source delivery's `born_in`/`slaughter_site`/`cut_site` to build the origin lines.
- **`printColumnsString` / `labelLocate` / `labelOutput`** — the Sunmi native label-mode API. 🗣 The handheld's "lay text in fixed columns inside one die-cut sticker, then feed to the next" commands; already proven for the delivery label.
- **Version-tolerant JSON bridge (ADR-0013)** — the web sends one JSON string, Java reads keys by name. 🗣 Add fields = add JSON keys, NEVER change the method signature; a signature change silently breaks printing because the web and the APK ship separately.

---

## Compliance flags

- **REGULATED OUTPUT (highest care).** The label content is held to UK/FSA Compulsory Beef Labelling Scheme rules. Wrong wording or a wrong/missing plant code is a real-world regulatory failure. The verbatim-wording oracle tests (Step 8) are the must-pass gate.
- **No PII / no auth-surface change.** `/api/labels` auth is unchanged (`x-mfs-user-role` ∈ {admin, warehouse, butcher}); we only add a `type=prep` value and a `cut_site` column read.
- **No new staff-entry field** ⇒ **no app-screen data-capture change** ⇒ no UI-rebuild-Phase-1 entanglement. We add one print button to the meatprep tab using existing components only (decision #17/#19, no bespoke styling).

**🗣 In plain English:** The risky part is the words on the sticker, not the plumbing. Nothing here touches logins, customer data, or the database shape — so the danger is purely "did we print the legally-correct text", which the tests pin hard.

---

## ADR review — conflicts & compliance

| ADR | Relevance | Verdict |
|-----|-----------|---------|
| **0010** (Printer port abstracts transport only; renderer stays port-less) | We extend the renderer (still pure) and the Printer adapters (transport). | **Complies.** Renderer stays a pure function — no port added. Sunmi adapter gains native mince/prep; Browser gains a prep URL. No new port, no new vendor. |
| **0012** (Sunmi label mode + 52×38mm die-cut layout) | The native mince/prep branches MUST reuse `printerInit → labelLocate → … → labelOutput`, `printColumnsString`, no receipt-mode tail. | **Complies.** New branches mirror `renderDeliveryLabel`'s label-mode sequence. The PREP label is denser — expect on-device calibration (publish-then-calibrate, Hakan runs the device). |
| **0013** (version-tolerant JSON bridge — change keys, NEVER signature) | We add `type:"mince"` / `type:"prep"` payloads + Java render branches keyed on `type`. | **Complies — and is the safety mechanism.** `printLabel(String json)` signature is untouched; we add JSON keys + Java branches. The legacy positional `printDeliveryLabel(...)` stays untouched (delivery only). |
| **0001** (bridge mechanism, print-only rule) | New Java methods must be print-only. | **Complies.** Mince/prep render branches add no filesystem/network/credential capability. |
| **0002** (hexagonal shape) | Vendor/native code only in `lib/adapters/sunmi/` + the Java bridge; UI imports only `getPrinter()`. | **Complies.** No new vendor import; the `GB2946` constant is a domain constant, not a vendor. |

**No ADR conflicts.** No new ADR required (this pass operates entirely within ADR-0010/0012/0013's established decisions). If the implementer finds the PREP label needs a NEW Java method rather than a `type`-branch inside `printLabel`, STOP — that would be an ADR-0013 deviation and must return to the conductor.

**🗣 In plain English:** Every architecture decision already on the books covers this work; we are filling in slots the previous passes deliberately left open ("one method serves delivery now and mince later" — ADR-0013's own words). Nothing here overturns a prior decision.

---

## Migration / RLS / PITR confirmation

**NO DB migration. NO RLS change. NO PITR gate.**

- All data already exists: `haccp_deliveries` stores `born_in`, `reared_in`, `slaughter_site`, `cut_site`, `species`; `haccp_mince_log` and `haccp_meatprep_log` both store `source_delivery_ids` + `source_batch_numbers` + `output_mode` + `kill_date` + `days_from_kill` + `batch_code` + `product_species`/`product_name`.
- The PREP branch reads `haccp_meatprep_log` (already exists, already RLS-policied — `20260625120000_haccp_authenticated_rls_policies.sql`) via the existing **service-role** `/api/labels` route (Rule-A allow-listed in F-RLS-final). No new table, no new column, no policy change.
- **Confirmed: zero schema delta.** If the implementer discovers a needed column does NOT exist (e.g. a prep record without `source_delivery_ids` populated), **STOP and flag the conductor** — that would introduce a migration + a PITR gate and is out of this plan's scope.

**🗣 In plain English:** Every field the new labels need is already captured at intake and at production time. We are only re-reading and re-arranging existing data, so there is no database change and no point-in-time-recovery safety gate to clear.

---

## Files to change (exact paths)

| # | File | Change |
|---|------|--------|
| 1 | `lib/printing/types.ts` | Add `'prep'` to `LabelType`; add `PrepLabelData` interface; add exported `MFS_PLANT_CODE = 'GB2946'` constant; fix the `mfs_plant` comment (`UK2946`→`GB2946`). Add `cut_sites: string[]` to `MinceLabelData` is NOT needed (mince has no cut-site line) — prep-only field lives on `PrepLabelData`. |
| 2 | `app/api/labels/route.ts` | Accept `type=prep`; add a prep branch reading `haccp_meatprep_log` + source-delivery `cut_site`/`slaughter_site`(country+plant) aggregation; replace hardcoded `'UK2946'` (line 132) with `MFS_PLANT_CODE`; in the mince branch keep `slaughtered_in` country-only. |
| 3 | `lib/printing/html.ts` | Split `renderMinceHTML` + `renderMinceHTML58` to use verbatim BLS wording for mince; add `renderPrepHTML` + `renderPrepHTML58`; fix the delivery `Further cut in` to read `data.mfs_plant` (already does — value now `GB2946` via Step 2). |
| 4 | `lib/printing/zpl.ts` | Update `generateMinceZPL` wording; add `generatePrepZPL`. The inline `mfs_plant` use stays data-driven. |
| 5 | `lib/printing/index.ts` | Route `type==='prep'` through the new prep renderers (HTML 58mm/100mm + ZPL); export `MFS_PLANT_CODE` if useful. |
| 6 | `lib/ports/Printer.ts` | Add `kind: 'mince' \| 'prep'` to `MinceLabelInput` (the discriminator the transport needs). |
| 7 | `lib/adapters/browser/Printer.ts` | `minceUrl` builds `type=${input.kind}` (mince→`mince`, prep→`prep`). |
| 8 | `lib/adapters/sunmi/Printer.ts` | Add `buildMincePayload` + `buildPrepPayload` (each emits `type:'mince'\|'prep'` + its BLS keys); make `createSunmiPrinter().printMinceLabel` go NATIVE for 58mm when `isSunmiNative()` (try native, fall back on throw — mirror the delivery path), else delegate to fallback. |
| 9 | `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java` | In `printLabel`, branch on `type`: `"mince"`→`renderMinceLabel(...)`, `"prep"`→`renderPrepLabel(...)`, default→`renderDeliveryLabel(...)`. Add the two new private render methods (label-mode, `printColumnsString`, CODE128, verbatim wording). **DO NOT touch the method signature** (ADR-0013). |
| 10 | `app/haccp/mince/page.tsx` | Add `kind` to the `printMinceLabel` call (mince tab → `kind:'mince'`); add a `PrintLabelStrip` + use-by dialog wiring to the **meatprep** tab (prep records, `kind:'prep'`). Reuse the existing dialog + `printTarget` state (extend `printTarget` with a `kind` field). |
| 11 | `tests/unit/labelPrinting.test.ts` | EXTEND: verbatim-wording oracles for mince & prep, GB2946 pin, multi-source distinct-list aggregation, mince=country-only vs prep=country+plant. |
| 12 | `tests/unit/adapters/sunmi/Printer.test.ts` | EXTEND: pin `buildMincePayload` + `buildPrepPayload` key sets + values (the JSON-keys contract for the two new payloads). |

**🗣 In plain English:** Twelve files, but the spine is small: one constant, one new API branch, two new label designs in three render formats (HTML/58mm-HTML/ZPL), the handheld learning two new layouts, and one new print button on the meat-prep screen. The rest is wiring the right data into the right words.

---

## Numbered steps (ordered, atomic, TDD where it fits)

> **Implementation status (all steps complete):**
> - [x] Step 0 — recon confirmed (all 5 facts true)
> - [x] Step 1 — `GB2946` (`MFS_PLANT_CODE`) constant + `PrepLabelData` type + shared `countries.ts`
> - [x] Step 2 — API prep branch + `cut_site` read + country-vs-plant split + `format=json`
> - [x] Step 3 — mince renderers verbatim wording (html/58/zpl)
> - [x] Step 4 — prep renderers (html/58/zpl)
> - [x] Step 5 — `index.ts` prep routing + renderer re-exports
> - [x] Step 6 — `kind` discriminator on `MinceLabelInput` + browser `type=${kind}` URL
> - [x] Step 7 — Sunmi native mince/prep via `format=json` (Option (a)) + `buildMincePayload`/`buildPrepPayload`
> - [x] Step 8 — Java bridge `renderMinceLabel`/`renderPrepLabel` (JSON `type` key, signature UNCHANGED)
> - [x] Step 9 — mince page prep print button + `kind`
> - [x] Step 10 — oracle tests extended (labelPrinting + sunmi/Printer)
>
> **Conductor scope call resolved:** native data source = **Option (a)** — server aggregates ONCE,
> native fetches `/api/labels?...&format=json`. Single source of truth; no client-side re-aggregation.

### Step 0 — Recon confirmation (read-only, no code)
Confirm in the running tree (the implementer cannot see this conversation):
- `app/api/labels/route.ts` line ~132 hardcodes `mfs_plant: 'UK2946'`; the mince branch (lines ~160–229) reads `haccp_mince_log` only and aggregates `slaughtered_in` **country-only** (strips digits, line ~204) and does NOT select `cut_site`.
- `lib/printing/types.ts` line ~26 comment says `always "UK2946"`.
- The meatprep tab (`app/haccp/mince/page.tsx` ~1239–1268) has **NO print button today** — only the mince tab (~1063) does.
- `createSunmiPrinter().printMinceLabel` (`lib/adapters/sunmi/Printer.ts` ~224) **always delegates to fallback** (no native mince yet).
- `MinceLabelInput` (`lib/ports/Printer.ts` ~37) has no type discriminator.

**🗣 In plain English:** Before writing anything, prove the five facts this plan depends on are still true in the live code. If any is false, stop and tell the conductor — the plan's shape assumes them.

### Step 1 — `GB2946` constant + types (TDD: write the GB2946 pin first)
1. In `lib/printing/types.ts`: add `export const MFS_PLANT_CODE = 'GB2946'`. Add `'prep'` to `LabelType`. Add a `PrepLabelData` interface (fields below). Fix the `mfs_plant` comment to `'GB2946'`.
2. `PrepLabelData` shape (mirror `MinceLabelData`, add prep-specific BLS fields):
   ```
   batch_code, product_name (prep uses product_name not product_species),
   product_species (optional, for traceability), output_mode, date,
   kill_date, days_from_kill, source_batch_numbers, use_by,
   origins: string[],            // born&reared country names (distinct)
   reared_in?: string[],         // if you want separate born/reared, else collapse like delivery
   slaughtered_in: string[],     // COUNTRY+PLANT distinct list e.g. ["GB1234","IE5678"]
   cut_in: string[],             // PRIMARY cut site(s), country+plant distinct list from intake cut_site
   further_cut_in: string,       // MFS_PLANT_CODE = "GB2946"
   allergens_present: string[]
   ```
3. Decide (and document inline) whether `MinceLabelData` extends or `PrepLabelData` is separate. **Recommendation: separate interface** — mince's `slaughtered_in` is country-only and there is no `cut_in`/`further_cut_in`, so a shared type would carry misleading optional fields. Keep them distinct; the deletion test favours two honest types over one fuzzy one.

### Step 2 — API: prep branch + cut_site read + country-vs-plant split (TDD: param-validation test first)
1. `validateParams`: accept `type ∈ {delivery, mince, prep}`; `usebydays` required for `prep` too (same 1–365 rule).
2. Replace hardcoded `'UK2946'` at line ~132 with `MFS_PLANT_CODE`.
3. **Mince branch (existing):** keep `slaughtered_in` country-only (the digit-strip at line ~204 stays). Confirm `minced_in: 'GB'` country-only, no plant.
4. **New prep branch (`type === 'prep'`):** read `haccp_meatprep_log` (`id, date, batch_code, product_name, product_species, output_mode, kill_date, days_from_kill, source_batch_numbers, source_delivery_ids, allergens_present`). Look up `source_delivery_ids` → from `haccp_deliveries` select `born_in, reared_in, slaughter_site, cut_site`. Aggregate:
   - `origins` = distinct born-in country **names** (reuse the existing `COUNTRY_NAMES` map — extract it to a shared helper to avoid the third copy; it currently lives inline in `route.ts`, `html.ts`, and `zpl.ts` consumes none).
   - `slaughtered_in` = distinct `slaughter_site` **country+plant** (the raw `GBxxxx` value — do NOT strip digits here, unlike mince).
   - `cut_in` = distinct `cut_site` **country+plant** (raw value).
   - `further_cut_in` = `MFS_PLANT_CODE`.
5. Build `PrepLabelData`, call `generateLabel('prep', prepData, config)`.

**Multi-source rule:** every aggregated array is `[...new Set(values.filter(Boolean))]`, comma-joined at render. Mirrors the existing mince `origins[]`/`slaughtered_in[]` aggregation.

### Step 3 — Renderers: mince verbatim wording (TDD: wording oracle first)
Update `renderMinceHTML` + `renderMinceHTML58` + `generateMinceZPL` so the MINCE label reads with VERBATIM compulsory wording:
- `Born in X` / `Reared in Y` (collapse to `Born & reared in X` when equal — reuse the delivery collapse logic).
- `Slaughtered in GB` (country-only, distinct comma-joined if multi-source).
- batch code (`MINCE-DDMM-SP-N`) + CODE128 barcode (already present).
- `Minced in GB` (country-only, no plant).
- Keep allergens row unchanged (Pass 3 owns real allergens — leave existing behaviour).

### Step 4 — Renderers: prep template (TDD: wording oracle first)
Add `renderPrepHTML` + `renderPrepHTML58` + `generatePrepZPL` reading `PrepLabelData`, VERBATIM wording:
- `Born in X` / `Reared in Y` (collapse when equal).
- `Slaughtered in GB1234` (country+plant, distinct comma-joined if multi-source).
- `Cut in GB5678` (primary cut site, distinct comma-joined).
- `Further cut in GB2946` (`further_cut_in`).
- batch code (`PREP-DDMM-SP-N`) + barcode.
- allergens row unchanged.

### Step 5 — `lib/printing/index.ts` routing
Route `type === 'prep'` to the prep renderers (`is58mm ? renderPrepHTML58 : renderPrepHTML`; `format==='zpl' → generatePrepZPL`). Filename `label-${batchCode}.html|.zpl`.

### Step 6 — Port + Browser adapter discriminator (TDD: URL test first)
1. `lib/ports/Printer.ts`: add `kind: 'mince' | 'prep'` to `MinceLabelInput`.
2. `lib/adapters/browser/Printer.ts`: `minceUrl` → `type=${input.kind}` (so prep builds `type=prep`). All other params unchanged (id/format/copies/usebydays/width).

### Step 7 — Sunmi native mince + prep (TDD: payload key-set pins first)
1. `lib/adapters/sunmi/Printer.ts`: add `buildMincePayload(input, data)` and `buildPrepPayload(input, data)` emitting `type:'mince'|'prep'` + the BLS string keys. **Native print needs the label DATA, not just the input** — the input only carries id/usebydays/width/copies. Decide the data source:
   - **Option A (recommended):** the native mince/prep path fetches `/api/labels?...&format=json` — but the API does not emit JSON today. **Do NOT add a JSON format** (scope creep + new branch).
   - **Option B (recommended, simpler):** the native path fetches the existing label data the same way the delivery native path resolves its fields. **Check how `printDeliverySunmi` gets its `DeliveryLabelInput`** — the delivery input already carries the raw fields (born_in/slaughter_site/etc.) on `DeliveryLabelInput`. The mince input does NOT. **Decision point for the implementer:** the cleanest path is to have the native mince/prep payload built from a small server fetch of the aggregated BLS fields. If that requires an API JSON branch, that is a real scope question — **STOP and ask the conductor** rather than inventing a data path. A defensible minimal answer: native mince/prep falls back to the iframe Browser adapter for now IF the data isn't available client-side, and native is wired only once a clean data source exists. **Flag this explicitly at Render.**
2. `createSunmiPrinter().printMinceLabel`: when `input.width === '58mm' && isSunmiNative()`, try native (build payload by `input.kind`, call `bridge.printLabel(JSON.stringify(payload))`), catch→fallback. Else delegate to fallback. Mirror the delivery method's try/catch/fallback exactly.

> **⚠ Open design question (raise at Render, do not guess):** the native delivery path works because `DeliveryLabelInput` carries the raw label fields client-side. The mince/prep BLS fields are aggregated **server-side** in `/api/labels` from `source_delivery_ids`. To print mince/prep NATIVELY (not via the iframe), the device needs those aggregated fields client-side. The three honest options are: (a) add a `format=json` response to `/api/labels` so the Sunmi adapter fetches structured data then calls `printLabel`; (b) carry the aggregated fields on `MinceLabelInput` (means the mince page must fetch/aggregate them before printing); (c) ship the compliant labels on the **browser/AirPrint + ZPL** paths first and wire native mince/prep as an immediate fast-follow once (a) or (b) is chosen. **This plan recommends raising this at Render and letting the conductor pick.** Option (a) is the smallest clean addition and keeps the renderer the single source of the aggregation, but it adds an API branch — a Gate-2 scope call. **The compliant-content work (Steps 1–6, 8) does not depend on this** and can proceed regardless.

### Step 8 — Java bridge: mince + prep render branches (ADR-0013 — keys only, NEVER signature)
In `SunmiPrintBridge.java#printLabel`, after reading `type`:
- `"mince"` → new private `renderMinceLabel(...)` reading the mince JSON keys (`bornIn`, `rearedIn`, `slaughteredIn`, `mincedIn`, `batch`, `useBy`, `species`, `allergens`, …).
- `"prep"` → new private `renderPrepLabel(...)` reading the prep JSON keys (`bornIn`, `rearedIn`, `slaughteredIn`, `cutIn`, `furtherCutIn`, `batch`, `useBy`, `productName`, `allergens`, …).
- default/`"delivery"` → existing `renderDeliveryLabel`.
Each new render method reuses the label-mode sequence (`printerInit → labelLocate → printColumnsString rows → CODE128 → labelOutput`), verbatim BLS wording, widths summing ~32. **Signature of `printLabel(String json)` is UNCHANGED.** Keep the legacy positional `printDeliveryLabel(...)` untouched.

### Step 9 — Mince page: prep print button + kind discriminator
1. Extend `printTarget` state with `kind: 'mince' | 'prep'`.
2. Mince tab `PrintLabelStrip` (line ~1063) → set `kind:'mince'`.
3. Add a `PrintLabelStrip` + the use-by dialog to the **meatprep** records (line ~1239–1268), setting `kind:'prep'`. Reuse the EXISTING dialog and `getPrinter().printMinceLabel({ id, usebydays, width, copies:1, kind })` call. **Existing components only** (decision #17/#19 — no bespoke styling).

### Step 10 — Extend the test oracles (Step 11 + 12 files)
Detailed in the TDD plan below. Run `npm run test:unit`, `tsc`, `next lint` (the conductor runs lint if the runner's sandbox denies it — established pattern).

**🗣 In plain English:** Build the constant and types, teach the server the new prep label, write the two label designs in all three print formats with the exact legal words, give the handheld two new layouts, add the missing print button to the meat-prep screen, and pin all of it with tests. The one genuinely open question — how the handheld gets the aggregated origin data for native printing — is flagged for the conductor instead of guessed.

---

## TDD test plan (oracle)

The existing `tests/unit/labelPrinting.test.ts` pins label content with **inline copies** of the renderers (it does not import the real modules). Keep that pattern OR (preferred) extend with cases that import the real `lib/printing` functions for the new templates so the oracle actually guards production code. New/changed cases:

**`tests/unit/labelPrinting.test.ts` — EXTEND:**
1. **GB2946 pin (must-pass, regulated):** the delivery + prep label output contains `GB2946` and NOT `UK2946`. Pin `MFS_PLANT_CODE === 'GB2946'`.
2. **Mince verbatim wording:** mince output contains `Slaughtered in`, `Minced in`, `Born in`/`Born & reared in`; mince `Slaughtered in` value is country-only (`GB`, no digits); `Minced in GB` (no plant).
3. **Prep verbatim wording:** prep output contains `Slaughtered in`, `Cut in`, `Further cut in`, `Born in`/`Reared in`; prep `Slaughtered in` value is country+plant (`GB1234`); `Cut in` value is country+plant (`GB5678`); `Further cut in GB2946`.
4. **Multi-source distinct aggregation:** given source deliveries with `slaughter_site ['GB1234','GB1234','IE5678']`, prep `Slaughtered in` = `GB1234, IE5678` (distinct, comma-joined); given mince sources `['GB1234','IE9999']`, mince `Slaughtered in` = `GB, IE` (country-only distinct).
5. **Born & reared collapse:** equal born/reared → `Born & reared in <country>`; differing → separate `Born in` / `Reared in`.
6. **API param validation:** `type=prep` valid; `usebydays` required for prep.
7. **No regression:** existing delivery + mince ZPL/HTML cases still pass.

**`tests/unit/adapters/sunmi/Printer.test.ts` — EXTEND:**
8. `buildMincePayload` declares exactly its expected key set + `type:'mince'`; values map correctly (country-only slaughtered, minced=GB).
9. `buildPrepPayload` declares exactly its expected key set + `type:'prep'`; values map (country+plant slaughtered, cut, furtherCut=GB2946).
10. Existing `buildDeliveryPayload` 11-key pin UNCHANGED (no regression).

**Native Java + on-device:** the Java render branches are NOT unit-testable in this repo (no Android test harness). They are verified by the **publish-then-calibrate** on-device round-trip on the physical V3 (Hakan runs `git push` / `gradle assembleRelease` / `adb install` — sandbox-denied to subagents). The TS payload key-set pins (cases 8–9) are the compile-time-substitute oracle that the JSON contract is correct on the web side; the Java `optString(key,"")` tolerance + the field-by-field on-device check close the loop (ADR-0013 §Consequences).

**🗣 In plain English:** The tests prove the exact legal words and the right plant code appear, that multiple sources collapse to a clean distinct list, and that the handheld payload carries the right named fields. The one thing tests cannot prove — that the handheld's Java actually lays it out on the sticker — is proven by Hakan printing a real label on the V3, exactly as the delivery label was.

---

## Acceptance criteria

1. `type=prep` returns a compliant PREP label (HTML 100mm + 58mm + ZPL) reading `Born in`/`Reared in`, `Slaughtered in <country+plant>`, `Cut in <country+plant>`, `Further cut in GB2946`, `PREP-DDMM-SP-N` + barcode.
2. `type=mince` returns a compliant MINCE label reading `Born in`/`Reared in`, `Slaughtered in <country>`, `Minced in GB`, `MINCE-DDMM-SP-N` + barcode.
3. Multi-source runs render ALL DISTINCT values comma-joined (mince=country, prep=country+plant + cut sites).
4. `GB2946` replaces `UK2946` everywhere it printed (prep "Further cut in" AND the delivery "Further cut in" — the desired correction).
5. The meatprep tab has a working print button (58mm + 100mm) routing to the PREP template; the mince tab routes to MINCE.
6. On the physical Sunmi V3: native 58mm mince + prep labels print on the die-cut roll with correct wording (publish-then-calibrate; Hakan confirms) **— OR**, if the native-data design question (Step 7) is deferred, the browser/AirPrint + ZPL paths are compliant and native mince/prep is the named immediate fast-follow.
7. All unit tests green; `tsc` + `next lint` clean; no migration, no RLS change.
8. No AI references in commits/PRs/code/comments.

---

## Risk Assessment

### 1. Business-logic / regulatory correctness — **HIGH / MUST-FIX**
- **Risk:** a regulated dispatch label printing WRONG compulsory wording, the wrong plant code, or the wrong country-vs-plant granularity (mince must be country-only `GB`; prep must be country+plant `GB1234`). This is a real-world RPA compliance failure, not a cosmetic bug — the entire reason for the unit.
- **Severity:** HIGH. **Must-fix.**
- **Mitigation:** verbatim-wording oracle tests (cases 1–5) pin the exact strings and the country-vs-plant split per template; the GB2946 pin (case 1) asserts `UK2946` never appears; Guard reviews the rendered output against the RPA digest line-by-line; on-device human read on the V3 before sign-off. **Gate-2 blocker until these tests exist and pass.**

### 2. JS↔Java bridge desync (ADR-0013) — **MEDIUM / MUST-FIX (constraint)**
- **Risk:** touching the `printLabel(String json)` signature (or adding a new positional Java method) silently kills printing, because the web JS and the APK Java ship independently — the exact trap ADR-0013 was written to prevent.
- **Severity:** MEDIUM (bounded by the rule). **Must-fix constraint:** the implementer MUST add only JSON keys + Java `type`-branches, never change the signature.
- **Mitigation:** the plan mandates `type`-keyed branches inside the existing `printLabel`; the TS payload key-set pin tests (cases 8–9) lock the web side; Java `optString(key,"")` tolerates missing keys; on-device field-by-field round-trip. STOP-and-ask if a new Java method seems necessary.

### 3. Native mince/prep data source (Step 7 open question) — **MEDIUM / launch-shaping, not a defect**
- **Risk:** the aggregated BLS fields are computed server-side; native printing needs them client-side. Inventing a data path (e.g. a half-built `format=json`) could create a second, drifting source of truth for the aggregation.
- **Severity:** MEDIUM. **Not must-fix** — but a Gate-2 SCOPE decision the conductor must make (option a/b/c in Step 7).
- **Mitigation:** raised explicitly at Render; the compliant-content work (browser/AirPrint + ZPL) does not depend on it; native can be the named fast-follow. The renderer staying the single aggregation source (option a) is the recommended clean answer.

### 4. Layout overflow on the 52×38mm die-cut — **MEDIUM**
- **Risk:** the PREP label is denser than mince (born/reared + slaughtered + cut + further-cut + batch + barcode + use-by); it may overflow the die-cut sticker on the V3.
- **Severity:** MEDIUM (cosmetic/legibility, not data-correctness).
- **Mitigation:** widths sum ~32 chars (proven for delivery); publish-then-calibrate on the physical V3 (Hakan, expected per spec); `printColumnsString` column wrapping (not manual pad, per ADR-0012's on-device lesson). If a required field cannot fit legibly, that is a Guard finding — do NOT drop a compulsory field to fit; reduce font / re-flow first.

### 5. Concurrency / race conditions — **LOW**
- **Risk:** none material. Label generation is a read-only GET; no writes, no shared mutable state, no idempotency surface. The batch code is already generated at submit time (not at print time).
- **Severity:** LOW. **No material risk in this category.**

### 6. Security — **LOW**
- **Risk:** the prep branch reads `haccp_meatprep_log` + `haccp_deliveries` via the existing service-role `/api/labels` route (Rule-A allow-listed). No new auth surface, no PII, no new vendor.
- **Severity:** LOW. Confirm the `x-mfs-user-role` gate still wraps the prep branch (it wraps the whole `GET`, so yes). **No material new risk.**

### 7. Data migration — **NONE**
- No schema change, no backfill, no PITR gate. **No material risk in this category** (flag loudly if Step 0 recon finds a missing column).

### 8. Launch blockers — **see Risks 1, 2 (must-fix) + Risk 3 (scope call)**
- Gate 2 is blocked until: the regulated-wording + GB2946 oracle tests exist and pass (Risk 1), the no-signature-change constraint is honoured (Risk 2), and the conductor has made the native-data scope call (Risk 3).

**Headline:** **two MUST-FIX items** — (1) regulated wording / plant-code correctness, pinned by verbatim oracle tests; (2) the ADR-0013 no-signature-change constraint. Both are addressable within this plan; neither requires a migration or new vendor.

---

## Hexagonal self-check (verdict for Gate 2)

- **Port used:** `Printer` (`lib/ports/Printer.ts`) — extended with a `kind` discriminator on `MinceLabelInput`. **No new port.** The renderer (`lib/printing/*`) stays deliberately PORT-LESS per ADR-0010 §2 (pure function, no vendor to swap — wrapping it would fail the deletion test).
- **Adapters touched:** `lib/adapters/sunmi/Printer.ts` (native mince/prep payloads + native print path) and `lib/adapters/browser/Printer.ts` (prep URL). The Java bridge (`SunmiPrintBridge.java`) is the native half of the Sunmi adapter.
- **New dependencies:** **NONE.** No `package.json` change. `org.json` (Java) is platform-standard (ADR-0013). The `GB2946` constant is a domain constant, not a vendor.
- **Single-use vendor wrap:** N/A (no new vendor).
- **Rip-out test:** **PASS.** A future Zebra printer = one new `lib/adapters/zebra/Printer.ts` + one wiring line in `lib/wiring/printer.ts`; the port, both existing adapters, the renderer, and both HACCP screens are untouched. The renderer's prep/mince split is pure server-side and printer-agnostic. UI imports only `getPrinter()` — no screen imports a vendor SDK.
- **Boundary check:** no `lib/domain/**` or `lib/ports/**` import of `lib/adapters/**`; no `app/**` import of `lib/adapters/**` (the mince page imports `getPrinter()` from `lib/wiring/`); vendor/native code confined to `lib/adapters/sunmi/` + the Java bridge.

**Verdict line:** Port = `Printer` (extended, not added). Adapters = Sunmi (native mince/prep) + Browser (prep URL). New deps = none. Rip-out test = **PASS**.

---

## Notes for the implementer (cannot see this conversation)

- The `COUNTRY_NAMES` map is duplicated in `route.ts` (~line 188) and `html.ts` (~line 105). Extract to ONE shared helper (e.g. `lib/printing/countries.ts`) when you add the prep branch — do not create a third copy.
- Mince `slaughtered_in` is **country-only** (digit-strip stays); prep `slaughtered_in` and `cut_in` are **country+plant** (raw `GBxxxx`). Do not unify these — the regulation differs by template.
- The use-by dialog + `printTarget` state already exist on the mince page; extend them, do not rebuild.
- STOP-and-ask triggers: (a) a needed DB column is missing (would add a migration + PITR gate); (b) native mince/prep requires changing `printLabel`'s signature or adding a positional Java method (ADR-0013 violation); (c) the native-data source needs a new API branch (Step 7 scope call).
- No AI references anywhere (commits/PRs/code/comments) — overrides any global git trailer.
