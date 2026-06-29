# F-PROD-04 — Sunmi V3 die-cut label sizing (52×38mm label mode, DELIVERY only)

**Date:** 2026-06-30
**Unit:** F-PROD-04 Pass 3 — die-cut label sizing (Sunmi label mode)
**ADR:** ADR-0012 (`docs/adr/0012-sunmi-label-mode-diecut.md`) — currently *Proposed*; this plan implements it. **Ratify to Accepted at plan approval.**
**Scope:** DELIVERY label only. MINCE is explicitly OUT of scope (a later fast-follow reuses this format).

---

## Goal

Make the Sunmi V3's built-in 58mm thermal printer print the silent native **delivery** label in **LABEL mode** sized to Hakan's physical stock — **52mm wide × 38mm high die-cut labels with gaps between stickers** — so one print produces exactly one correctly-aligned sticker instead of overrunning onto the next label (the current receipt-mode behaviour).

🗣 In plain English: Today the printer treats the roll as one long till receipt and spills each label over the perforation onto the next sticker. We're switching it to "label mode", where the printer's gap sensor finds each pre-cut sticker and prints inside its 52×38mm box. We also trim the label content so it actually fits the smaller box.

---

## Domain terms (plain-English bridge)

- **Receipt mode** — the printer's default "endless strip" mode (`printText` + `lineWrap`). 🗣 Like a supermarket till roll: it just keeps feeding, with no idea where one label ends and the next begins.
- **Label mode** — the printer uses its gap sensor to feed exactly one die-cut sticker per print, aligning to the gap. 🗣 Tells the printer "the paper is pre-cut into stickers; line up to each one and stop at the gap."
- **Gap learning / label learning** — a one-time calibration where the printer feeds the roll, detects the gap between stickers, and remembers the label pitch. 🗣 The printer "measures the ruler once" so it knows how tall each sticker is and where the gaps are.
- **Dots @ 203dpi** — the print resolution. 203 dots per inch = ~8 dots/mm. 🗣 The unit the printer thinks in. 52mm ≈ 384 printable dots wide (the 58mm head's usable width), 38mm ≈ ~304 dots tall — everything must fit that box.
- **Die-cut stock** — pre-cut individual stickers on a backing roll, separated by gaps. 🗣 Sheet of address-label stickers, but on a roll.
- **Bridge signature** — the exact list of arguments the JavaScript side passes to the Java `printDeliveryLabel` method. 🗣 The shape of the doorway between the web app and the native printer code; if the two sides disagree on the shape, things fall through the gap silently.
- **Port / adapter** — the `Printer` interface (`lib/ports/Printer.ts`) is the socket; the Sunmi adapter (`lib/adapters/sunmi/Printer.ts`) is one plug. 🗣 We're re-shaping what one plug outputs; the socket and the other plug (browser/iframe fallback) are untouched.

---

## Compliance flags

- **No DB / RLS / web-API change** — nothing touches Supabase, auth, migrations, or any `/api` route. No PITR gate, no pgTAP, no integration suite needed (no data layer involved).
- **No new dependency** — the Sunmi SDK (`com.sunmi:printerlibrary:1.0.24`) and the release-signing pipeline (ADR-0011, Pass 2b) are already present. `package.json` is untouched.
- **No-AI-references rule** — commits, PR body, code, and comments for this unit must contain NO AI/assistant references (this OVERRIDES the global git-trailer convention). The ANVIL cert later needs a BARE `Branch:` line + `CLEARED FOR PRODUCTION` for the merge-lock hook — that is ANVIL's job, not this plan's.
- **Label-content reduction is deliberate** — dropping the PASS/FAIL word and the header is a Hakan-approved label-content change (ADR-0012 §2), separate from and not blocked by the deferred beef-labelling regulatory review.

🗣 In plain English: This is a printer-formatting change on the device, not a data change. So the heavy database/security/regression machinery does not apply — but the real proof (a label that physically fits) has to be done by hand on the device.

---

## ADR conflicts / alignment

- **ADR-0001 (Sunmi JS bridge, print-only methods rule):** ALIGNED. ADR-0001 §"Future Java methods" forbids adding *non-print* methods (filesystem, credentials, HTTP, user data). This unit only *changes the signature of the existing print method* `printDeliveryLabel` and adds *print-mode* SDK calls (`setPrinterMode`/`labelLocate`/`labelOutput`) — all print-related. No new bridge method, no forbidden capability. No conflict.
- **ADR-0010 (Printer transport port):** ALIGNED. The Sunmi adapter still implements the existing `printDeliveryLabel` port method with the same `(DeliveryLabelInput, onError)` signature. The port interface (`lib/ports/Printer.ts`) does NOT change. Rip-out test unaffected.
- **ADR-0011 (Android release signing):** ALIGNED. Signing config + keystore.properties contract already in place. This plan only bumps `versionCode`/`versionName` per the ADR-0011 §5 "increments by 1 per release" rule.
- **ADR-0012 (this unit):** This plan IS the implementation of ADR-0012. Ratify Proposed → Accepted at approval (Step 7).

No conflicts found.

---

## Exact files to change

| # | File | Change |
|---|------|--------|
| 1 | `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java` | New `printDeliveryLabel` signature (born/reared split; temp value-only already formatted TS-side) + receipt mode → **label mode** call sequence sized to 52×38mm; drop header; species+batch one row; shrink barcode; born/reared separate cells. |
| 2 | `android/app/build.gradle` | `versionCode 2 → 3`, `versionName "1.1" → "1.2"` (ADR-0011 §5). |
| 3 | `lib/adapters/sunmi/Printer.ts` | Update `MFSSunmiPrintBridge` TS interface decl to match new Java signature; change `formatTempStatus` (value-only, drop PASS/FAIL); change `formatBornLine` → split born/reared (or replace with passing `bornIn`/`rearedIn` separately); update `printDeliverySunmi` call to the new arg list. |
| 4 | `tests/unit/adapters/sunmi/Printer.test.ts` | Update assertions to the new helper behaviour (the oracle). |
| 5 | `docs/adr/0012-sunmi-label-mode-diecut.md` | Status `Proposed` → `Accepted`. |

**Files that MUST NOT change (verify untouched in the diff):**
`lib/ports/Printer.ts`, `lib/wiring/printer.ts`, `lib/adapters/browser/Printer.ts`, `package.json`, any migration, any `/api` route, `MainActivity.java`.

🗣 In plain English: Four code/doc files plus a version bump. The web "socket" file, the wiring file, and the iframe-fallback plug stay exactly as they are — that is what keeps the architecture clean and the rip-out test passing.

---

## The concrete Sunmi label-mode call sequence + 52×38mm dot geometry

### Geometry (the box everything must fit)
- **Stock:** 52mm wide × 38mm high die-cut, gap-fed (one sticker per print).
- **Resolution:** 203 dpi ≈ **8 dots/mm**.
- **Printable width:** 58mm head → usable ~48mm ≈ **384 dots**. (The 52mm sticker is wider than the head's printable area; content is constrained to the head's ~384px, centred on the sticker.)
- **Printable height:** 38mm ≈ **~304 dots** total. Reserve ~16–24 dots top/bottom margin → usable ~**~270 dots** of content height.
- **Vertical budget (the binding constraint — must fit ~270 dots):**
  - Row 1: SPECIES + BATCH side-by-side, bold, ~fs28–32 → ~36–40 dots
  - Barcode: CODE128 of batch, **height 40 dots** (down from 80) + ~16 dots for the human-readable text below → ~56 dots
  - Body lines (supplier, date, temp, born, reared, slaughter, cut, allergens) at ~fs18–20: each ~24–28 dots. **8 lines × ~26 ≈ 208 dots** — over budget if all stacked. → **MUST use two-column rows** to halve the body height (target ~4 visual rows ≈ ~110 dots).
  - Total target: 40 + 56 + 110 ≈ ~206 dots, comfortably inside ~270. Leaves slack for spacing — exact values tuned on-device.

🗣 In plain English: The sticker is roughly 384 dots wide by ~304 tall. The old layout has ~11 stacked lines plus a tall barcode — far too tall. We pair fields into two columns and shrink the barcode so the whole thing lands at ~200 dots, leaving headroom we'll fine-tune by eye on the device.

### Label-mode call sequence (Sunmi SDK `com.sunmi:printerlibrary:1.0.24`)

> The exact SDK method names below are from the documented `SunmiPrinterService`/`SunmiPrinterApi` label-mode surface for 1.0.24. **The implementer MUST confirm the exact available method names against the bound SDK** (the available methods commonly include `setPrinterMode(int)`, `getPrinterMode()`, `labelLocate()`, `labelOutput()`, and a label-learning/`labelLocate`-area setup). If a named method is absent on this SDK build, the documented ESC/POS escape hatch (`sendRAWData`, ADR-0001) is the fallback transport — but try the high-level label API first. Treat the *exact* call names as the FIRST thing to verify on-device (Step 6, cycle 0).

**One-time / per-bind setup (mode switch):**
1. `printerService.printerInit(null)`
2. Switch the printer to **label mode**: `printerService.setPrinterMode(WoyouConsts.PRINTER_LABEL_MODE)` (or the SDK's equivalent label-mode constant). *(Some firmware also requires a one-time gap learning — if the gap sensor isn't auto-detecting, trigger label learning once during calibration. This is a printer-firmware operation, not per-print.)*

**Per-print sequence (inside `printDeliveryLabel`):**
1. `printerService.printerInit(null)`
2. `printerService.setPrinterMode(label-mode)` *(idempotent; safe to set each print)*
3. `printerService.labelLocate()` — advance/align to the start of the next die-cut label (gap-aligned).
4. **Content** — render the reduced layout (below) using the standard text/barcode calls (`setAlignment`, `setFontSize`, `setPrinterStyle`, `printText`, `printBarCode`). NO `lineWrap(3)` tail (that was the receipt-mode overrun).
5. `printerService.labelOutput()` — eject/feed to the gap so the next print starts clean on the next sticker.

> Do NOT wrap the per-print body in `enterPrinterBuffer(true)/exitPrinterBuffer(true)` if it conflicts with label-mode locate/output on this SDK — buffer + label-mode interaction is a known calibration variable. Start WITHOUT the buffer wrap (label mode commits per locate/output); only add it back if on-device testing shows torn/partial prints. (Calibration variable — Step 6.)

### Reduced layout (ADR-0012 §2), top to bottom

```
Row 1 (one row, bold):   <SPECIES>            <BATCH>      ← side-by-side, fs ~28–32
Barcode:                 [CODE128 of batch], height 40 dots, text below, centred
Row group (two-column where it fits):
   Supplier: <code>            Date: <date>
   Temp: <value>               Born: <GB>
   Reared: <IE>                Sl: <site>
   Cut: <site>
   Allergens: <None/...>
```

- **Header line "MFS GLOBAL  GOODS IN" — DELETED.**
- **Species + batch on ONE row** (the reusable row format for the future mince label). Implement with either two `printText` columns padded to a fixed character width, or `setAlignment` left for species then a tab/padded gap then batch. Padding width tuned on-device.
- **Barcode kept**, CODE128, **height 40 dots** (down from 80) as the *starting* value — tune on-device so it scans but fits.
- **Born / Reared as SEPARATE cells** — no longer combined.
- **Temp = value only** (formatted TS-side; the Java side just prints the string it receives).
- **Two-column body** to fit the height budget; exact column padding/spacing tuned on-device.

🗣 In plain English: First line is the meat type and batch code together. Under it a shorter barcode. Then the rest of the detail paired into two columns so it's short enough. We start with sensible numbers (barcode 40 dots, fonts ~18–32) and nudge them while watching real prints.

---

## The exact new bridge signature + matching TS

### New Java signature (`SunmiPrintBridge.java`)

Replace the combined `bornLine` arg with separate `bornIn` + `rearedIn`. Keep everything else; temp is still a pre-formatted string (now value-only, formatted TS-side).

```java
@JavascriptInterface
public void printDeliveryLabel(
        String batchCode,
        String supplierCode,
        String date,
        String tempLine,      // now value-only, e.g. "4°C" or "—"
        String bornIn,        // was: bornLine (pre-combined) — NOW the raw country, may be ""
        String rearedIn,      // NEW separate arg — raw country, may be ""
        String slaughterSite,
        String cutSite,
        String species,
        String allergens
)
```

- Java renders **Born** and **Reared** as separate cells: print `"Born: " + bornIn` only if `bornIn` non-empty; print `"Reared: " + rearedIn` only if `rearedIn` non-empty (mirror the existing non-empty guards used for slaughter/cut).
- Arg count goes from 9 → 10 (bornLine → bornIn + rearedIn). **This is the #1 sync risk** — see Risks.

### Matching TS interface decl (`lib/adapters/sunmi/Printer.ts`)

```ts
interface MFSSunmiPrintBridge {
  isReady(): boolean
  printDeliveryLabel(
    batchCode:     string,
    supplierCode:  string,
    date:          string,
    tempLine:      string,
    bornIn:        string,   // was bornLine
    rearedIn:      string,   // NEW
    slaughterSite: string,
    cutSite:       string,
    species:       string,
    allergens:     string,
  ): void
}
```

### Matching adapter call (`printDeliverySunmi`)

```ts
const species  = formatSpecies(d.product_category)
const tempLine = formatTempStatus(d.temperature_c, d.temp_status)  // now value-only

bridge.printDeliveryLabel(
  d.batch_number,
  supplierCode,
  d.date,
  tempLine,
  d.born_in  ?? '',   // pass raw country, separate
  d.reared_in ?? '',  // pass raw country, separate
  d.slaughter_site ?? '',
  d.cut_site       ?? '',
  species,
  'None',
)
```

### Helper changes

**`formatTempStatus`** — value only, drop PASS/FAIL entirely:
```ts
export function formatTempStatus(temperatureC: number | null, _tempStatus: string): string {
  return temperatureC != null ? `${temperatureC}°C` : '—'
}
```
*(Keep the `tempStatus` param for signature stability / call-site compatibility even though unused, OR drop it and update the single call site — implementer's choice; if dropped, update the call in `printDeliverySunmi`. Prefer keeping it to minimise call-site churn, prefix `_`.)*

**`formatBornLine`** — RECOMMENDED: **remove it** and pass `d.born_in`/`d.reared_in` separately to the bridge (the bridge now renders the two cells). If the implementer prefers to keep a helper for a unit-test oracle, repurpose it as two trivial helpers or delete and rely on the bridge-side rendering. **Decision for this plan: DELETE `formatBornLine`** — the combining logic is gone, the bridge renders separate cells, and the adapter passes raw `??''` values. Remove its import from the test and its test block.

🗣 In plain English: The web side stops gluing Born and Reared together and stops stamping PASS/FAIL — it just hands the printer the raw country codes and the bare temperature. The native side prints Born and Reared as two separate little fields. The Java and TypeScript argument lists must match exactly (10 args, same order) or the print silently misbehaves.

---

## Updated unit-test assertions (`tests/unit/adapters/sunmi/Printer.test.ts`) — the oracle

**`formatTempStatus` block — replace assertions:**
```ts
it('renders numeric temperature value only (no PASS/FAIL)', () => {
  expect(formatTempStatus(3.2, 'pass')).toBe('3.2°C')
})
it('still value-only on a failed temperature (fail lives in the diary, not the label)', () => {
  expect(formatTempStatus(8.1, 'fail')).toBe('8.1°C')
})
it('value-only for conditional status', () => {
  expect(formatTempStatus(5.5, 'conditional')).toBe('5.5°C')
})
it('substitutes em-dash placeholder when temperature is null', () => {
  expect(formatTempStatus(null, 'pass')).toBe('—')
})
```

**`formatBornLine` block — DELETE entirely** (helper removed; born/reared now rendered by the Java bridge as separate cells, not unit-testable). Remove `formatBornLine` from the import line.

**`formatSpecies` block — UNCHANGED** (still uppercases, underscores→spaces).

**`isSunmiNative` block — UNCHANGED** (the mock `printDeliveryLabel: () => undefined` stub still satisfies the interface regardless of arg count; the test does not call it with args).

🗣 In plain English: The tests that proved "4°C PASS" now prove "4°C". The tests for the old combined Born/Reared line are deleted because that logic no longer exists. The species and bridge-detection tests are unchanged. These updated assertions ARE the spec — they define correct helper behaviour.

---

## Numbered steps (atomic, one commit each where code changes)

> Branch off `main` first (do not commit on `main`). Suggested branch: `fprod04-diecut-label-sizing`.

**Step 0 — Pre-flight grep (no commit).**
Confirm `formatBornLine` / `formatTempStatus` have no callers outside `lib/adapters/sunmi/Printer.ts` and `tests/unit/adapters/sunmi/Printer.test.ts`. Grep BOTH the alias form (`@/lib/adapters/sunmi`) AND any relative form. (Lesson from F-TD-12: grep alias AND relative; trust `tsc` as backstop.) If callers exist elsewhere, STOP and report — the plan assumes the only consumers are the adapter + its test.

**Step 1 — TS helpers + adapter + interface decl + tests (one commit).**
In `lib/adapters/sunmi/Printer.ts`: update `formatTempStatus` to value-only; delete `formatBornLine`; update `MFSSunmiPrintBridge` interface decl to the 10-arg `bornIn`/`rearedIn` signature; update `printDeliverySunmi` to pass `d.born_in ?? ''`, `d.reared_in ?? ''` separately and the value-only temp.
In `tests/unit/adapters/sunmi/Printer.test.ts`: update `formatTempStatus` assertions; delete the `formatBornLine` block + its import.
**Gate:** `npm run test -- tests/unit/adapters/sunmi/Printer.test.ts` green; `npx tsc --noEmit` clean; `npm run lint` clean. Commit message (NO AI refs): `fix(fprod04): temp value-only + split born/reared in Sunmi adapter`.

**Step 2 — Java bridge: signature + label mode (one commit).**
In `SunmiPrintBridge.java`: change `printDeliveryLabel` to the 10-arg signature (bornIn + rearedIn). Replace the receipt-mode body with the label-mode sequence (setPrinterMode label → labelLocate → reduced content → labelOutput), drop the header line, put species+batch on one row, set barcode height to **40 dots**, render Born/Reared as separate non-empty-guarded cells, two-column body, NO `lineWrap(3)` tail. Use starting values from the geometry section.
**Gate:** Java compiles (covered by the Step 3 build). Commit message: `feat(fprod04): Sunmi label mode + reduced 52x38mm delivery layout`.

**Step 3 — Version bump (one commit).**
In `android/app/build.gradle`: `versionCode 3 → 4`? — **verify current value first** (current is `versionCode 2`, `versionName "1.1"`). Bump to `versionCode 3`, `versionName "1.2"` (ADR-0011 §5: +1 per release). Commit: `chore(fprod04): bump Android version to 1.2 (versionCode 3)`.

**Step 4 — Build the signed release APK (no commit; build artifact).**
`cd android && ./gradlew :app:assembleRelease` (signing pipeline + keystore from Pass 2b already present via `android/keystore.properties`). **Pass criterion:** build SUCCEEDS and the output APK at `android/app/build/outputs/apk/release/app-release.apk` is RELEASE-SIGNED (verify with `apksigner verify --print-certs` showing the release key, NOT debug). If the build fails on a Java signature mismatch, fix the bridge — do NOT improvise.

**Step 5 — Back up the current installed APK BEFORE sideloading (safety).**
Confirm the prior signed APK is in `~/mfs-apk-backups/` (Pass 2b). This is the rollback artifact (Step 8). Do not overwrite it with the new build.

**Step 6 — Iterative on-device calibration loop (the real clearance gate).**
Sideload to the physical V3 (in hand, API 33, authorized): `adb install -r android/app/build/outputs/apk/release/app-release.apk`. Print a real delivery label on the 52×38mm die-cut roll from the delivery screen.
**Cycle 0 (first):** confirm the exact SDK label-mode method names compiled and the printer actually entered label mode (watch `adb logcat -s MFSSunmiPrint:*`). If `setPrinterMode`/`labelLocate`/`labelOutput` are not the right names for this SDK build, adjust to the SDK's actual label API (or fall back to `sendRAWData` ESC/POS per ADR-0001) and rebuild.
**Each cycle:** print → measure the print against the physical sticker → adjust label-mode params / font sizes / barcode height / column padding / margins in the Java bridge → rebuild (Step 4) → `adb install -r` → reprint. **Expect SEVERAL cycles.**
**Measurable pass criteria (ALL must hold):**
1. Exactly ONE sticker per print (no overrun onto the next label).
2. Print aligns within the 52×38mm die-cut boundary — no content clipped at top/bottom/sides, no content in the gap.
3. The CODE128 barcode SCANS (test with a scanner / phone) AND fits within the label height.
4. All required fields legible: species, batch, supplier, date, temp (value-only, no PASS/FAIL), Born + Reared as separate fields, slaughter, cut, allergens.
5. The header "MFS GLOBAL GOODS IN" is absent; species+batch are on one row.
6. The next print starts clean on the next sticker (gap alignment holds across consecutive prints — print at least 2–3 in a row).
Any tuning that changes Java values gets folded into the Step 2 commit (amend) or a follow-up `fix(fprod04): on-device label calibration` commit — keep the final committed Java matching the APK that passed.

**Step 7 — Ratify ADR-0012 (one commit).**
`docs/adr/0012-sunmi-label-mode-diecut.md`: Status `Proposed` → `Accepted (ratified <date>, F-PROD-04)`. Commit: `docs(fprod04): ratify ADR-0012 (Sunmi label mode accepted)`.

**Step 8 — Rollback path (documented, not executed unless needed).**
If label mode misbehaves in production on the V3: `adb uninstall com.mfsglobal.ops` then `adb install ~/mfs-apk-backups/<prior-release>.apk` (the backed-up prior signed APK). Same release key → in-place reinstall works. The change is otherwise fully revertible via git (the 4 code/doc commits).

---

## TDD test plan

This unit is **mostly un-automatable** — ANVIL cannot web-test a thermal print. The matrix is deliberately shaped to that reality:

| Layer | What | Status when done |
|-------|------|------------------|
| **Unit (oracle)** | `tests/unit/adapters/sunmi/Printer.test.ts` — `formatTempStatus` value-only (4 cases), `formatSpecies` unchanged (2), `isSunmiNative` unchanged (3); `formatBornLine` block deleted. The updated assertions ARE the spec for the TS helpers. | green |
| **Type-sync** | `npx tsc --noEmit` — the TS `MFSSunmiPrintBridge` interface decl + the `printDeliverySunmi` call must type-check against the new arg list. (Catches TS-side arg drift; does NOT catch Java-side drift — see Risks.) | clean |
| **Lint** | `npm run lint` (`next lint`) — no new violations; no adapter-boundary breach (the no-adapter-imports pin still passes — wiring/ports untouched). | clean |
| **Build** | `cd android && ./gradlew :app:assembleRelease` — Java compiles with the new signature; APK builds + is release-signed. | success |
| **On-device (the real gate)** | Manual iterative calibration (Step 6) against the 52×38mm roll until all 6 pass criteria hold. | human-verified |

**Explicitly NOT run (justified):** pgTAP, integration suite, PITR — no DB/RLS/data layer touched. E2E preview smoke / browser taps — the change is native-print-only; the web bundle behaviour for the delivery screen is unchanged except the flat strings passed to the bridge (covered by unit + tsc). No `@critical` regression needed for a native-bridge-only formatting change.

🗣 In plain English: The automated tests prove the web side hands the printer the right strings and that Java/TS still compile together. They CANNOT prove the label physically fits — only a human printing on the real roll can. So the certificate honestly rests on: a green build + Hakan confirming a correctly-fitted sticker.

---

## Acceptance criteria

1. `formatTempStatus` returns value-only (`"4°C"`, `"—"`) — no PASS/FAIL anywhere; unit tests green on the new assertions.
2. `formatBornLine` removed; adapter passes `born_in` and `reared_in` separately; Java renders them as two cells.
3. The Java `printDeliveryLabel` signature and the TS `MFSSunmiPrintBridge` decl have the **identical 10-arg list, same order** (bornIn, rearedIn split). `tsc` clean.
4. `SunmiPrintBridge.java` prints in **label mode** (setPrinterMode/labelLocate/labelOutput), header dropped, species+batch one row, barcode shortened, two-column body.
5. `./gradlew :app:assembleRelease` produces a release-signed APK; `versionCode`/`versionName` bumped.
6. On-device: all 6 Step-6 pass criteria hold (one sticker per print, in-bounds, scannable barcode, all fields legible, header gone, gap alignment holds across consecutive prints).
7. `lib/ports/Printer.ts`, `lib/wiring/printer.ts`, `lib/adapters/browser/Printer.ts`, `package.json`, all migrations, all `/api` routes, `MainActivity.java` are UNCHANGED in the diff.
8. ADR-0012 ratified to Accepted. No AI references in any commit/PR/code/comment.

---

## Risk Assessment

### 1. Business-logic / correctness — Java↔TS signature sync (TOP RISK)
**Severity: HIGH. MUST-FIX (verify, not block).**
The bridge is a `@JavascriptInterface` boundary with NO compile-time link between Java and TS. If the Java `printDeliveryLabel` arg list and the TS `MFSSunmiPrintBridge` decl disagree (count or order), the native call **fails silently at runtime** — wrong fields land in wrong cells, or the call no-ops, with no JS exception (only logcat). `tsc` checks the TS side against the TS decl but CANNOT see the Java side. The arg count changes 9→10 this pass, maximising the chance of drift.
**Mitigation:** (a) Make the TS decl + adapter call change (Step 1) and the Java signature change (Step 2) in lockstep, both to the exact 10-arg `bornIn, rearedIn` order specified above. (b) On-device cycle 0 (Step 6) MUST visually confirm each field prints in the right cell with a known test delivery (distinct born vs reared countries, a temp value) — this is the only end-to-end check of the boundary. (c) Acceptance criterion 3 makes the identical-list a gate.
**Must-fix flag:** the *verification* (cycle-0 field-placement check + identical arg lists) is mandatory; it does not block the plan but blocks the cert.

### 2. On-device label-mode uncertainty (SDK method names + gap calibration)
**Severity: HIGH (effort/iteration), LOW (safety). Not a Gate-2 blocker.**
The exact label-mode method names on `com.sunmi:printerlibrary:1.0.24` are taken from documentation, not verified against the bound jar in this environment (Bash inspection of the SDK was not available). The real method names, whether buffer-wrap conflicts with label mode, and whether the firmware needs a one-time gap-learning step are all **on-device unknowns**. Expect several calibration cycles; the barcode height (40 dots start) and column padding are guesses to be tuned.
**Mitigation:** Step 6 cycle 0 confirms the API names against the actual SDK first (logcat); ESC/POS `sendRAWData` is the documented ADR-0001 fallback if the high-level label API misbehaves on the V3. The iframe fallback (Browser adapter) is preserved throughout, so a misfit never blocks staff from printing (they get the iframe path). The prior APK backup is the hard rollback. This is *iteration cost*, not a safety risk — the plan is honest that the cert rests on the human on-device fit.

### 3. Concurrency / race conditions
**Severity: NONE.** Single-device, single-threaded print path; one print per button tap; no shared mutable state introduced. No material risks in this category.

### 4. Security
**Severity: NONE.** No new bridge method (ADR-0001 print-only rule honoured — only the existing print method's signature changes + print-mode SDK calls). No filesystem/credential/network/user-data exposure. No new dependency. Web-debugging stays release-gated (ADR-0011). No material new risk.

### 5. Data migration
**Severity: NONE.** No DB, no schema, no migration, no RLS. Not applicable.

### 6. Launch blockers
- **Wrong stock loaded / gap sensor not calibrated** → label mode misaligns. Mitigated by Step-6 calibration being the explicit gate and the iframe fallback always available. Not a code blocker.
- **Barcode too short to scan after shrinking** → caught by Step-6 pass criterion 3 (must scan). Tune up if it fails.
- **Released APK ships before on-device fit confirmed** → cert MUST NOT be issued until Step-6 criteria hold. The cert honestly depends on Hakan's physical confirmation.

**Headline:** Two HIGH-severity risks, both about the same fragile JS↔Java boundary and the on-device unknowns — neither *blocks* writing/approving the plan. The single **must-fix** is the Java↔TS signature-sync verification (identical 10-arg list + cycle-0 field-placement check); it gates the ANVIL cert, not Gate 2. No security/data/concurrency risks (native formatting change only).

---

## Rollback

- **Git:** revert the 4 code/doc commits — fully revertible (no DB/state change).
- **Device:** `adb uninstall com.mfsglobal.ops` → `adb install ~/mfs-apk-backups/<prior-release>.apk` (same release key → in-place reinstall works). Band-aid if needed: iframe fallback already serves the screen for any native failure.
