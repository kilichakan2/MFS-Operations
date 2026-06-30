# F-PROD-04 — Sunmi V3 die-cut label sizing (52×38mm label mode, DELIVERY only) — REVISED

**Date:** 2026-06-30
**Unit:** F-PROD-04 Pass 3 — die-cut label sizing (Sunmi label mode), REVISED after on-device silent-print failure
**ADR:** ADR-0012 (`docs/adr/0012-sunmi-label-mode-diecut.md`) — already **Accepted** (label mode + layout). NEW: **ADR-0013** — version-tolerant JSON bridge for the Sunmi native print contract (this plan adds it).
**Scope:** DELIVERY label only. MINCE is explicitly OUT of scope (a later fast-follow reuses this format and the SAME JSON bridge).
**Supersedes:** the prior version of this file, which proposed a 9→10-arg **positional** bridge change. That approach caused a silent on-device print failure (see "Why this is a /reorder").

🗣 In plain English: This is the same job — make the printer fit the 52×38mm pre-cut stickers — but we are fixing HOW the web app and the printer's native code talk to each other, because the previous fix made them talk past each other and nothing printed.

---

## Why this is a /reorder (the on-device failure — critical context)

The app is a **Capacitor remote-URL shell**: the APK is a thin Android wrapper that loads the live website `https://mfsops.com` (set in `capacitor.config.ts` → `server.url`). 🗣 The phone app is basically a browser bookmark in a box — the screens come from the live website, not from inside the installed app.

That split is the trap. The print "doorway" has two halves that ship **independently**:

- The **JavaScript half** (`lib/adapters/sunmi/Printer.ts`) is served from the **deployed website** — currently `main`, which has the **old 9-argument** `printDeliveryLabel`.
- The **Java half** (`SunmiPrintBridge.java`) ships **inside the APK** installed on the device — the prior pass changed it to a **10-argument** method.

🗣 One half lives on the website, the other half lives in the installed app, and they can be different versions at the same time.

The bridge is positional (arguments matched by position/count). Android's `@JavascriptInterface` matches a call to a Java method **by exact name + argument count**. A 9-arg JS call into a 10-arg-only Java method finds **no matching method → the call silently does nothing**: no print, no JavaScript error, only a (missing) logcat line. 🗣 The website asked for a 9-key door and the app only had a 10-key door, so the key didn't fit — and instead of an error, the printer just sat there doing nothing.

**The fix:** stop matching by position/count. Pass a **single JSON string** and read fields **by name** on the Java side. Adding/removing a field later (mince, real allergens) changes JSON **keys**, never the **method signature** — so a website/APK version mismatch degrades gracefully (Java ignores unknown keys, defaults missing ones) instead of silently no-printing. 🗣 Instead of a rigid 10-pin key, we hand the printer a labelled checklist; if the website's checklist has an extra or missing line, the app just reads the lines it understands and prints anyway.

---

## Goal (unchanged from ADR-0012)

Make the Sunmi V3's built-in 58mm thermal printer print the silent native **delivery** label in **LABEL mode** sized to **52mm wide × 38mm high die-cut labels with gaps**, with the trimmed layout, so one print produces exactly one correctly-aligned sticker. What CHANGES vs the prior plan is the **transport contract** between JS and Java: positional → **version-tolerant JSON**.

---

## Domain terms (plain-English bridge)

- **Capacitor remote-URL shell** — the Android app loads a live website instead of bundled HTML. 🗣 A browser-in-a-box pointed at mfsops.com; the screens update when the website deploys, without reinstalling the app.
- **`@JavascriptInterface` bridge** — the named doorway (`MFSSunmiPrint`) the website's JS calls to reach native Java printer code. 🗣 The hatch between the web page and the printer hardware.
- **Positional contract** — arguments matched by order and count. 🗣 A rigid multi-pin key; one extra/missing pin and it won't turn.
- **JSON (string-payload) contract** — one text string of `{"key": value}` pairs, read by name. 🗣 A labelled checklist; reader picks the lines it knows, ignores the rest.
- **`org.json.JSONObject`** — the JSON parser **built into the Android platform** (not a library we add). 🗣 A free, already-installed tool for reading the checklist — zero new dependency.
- **Feature-detect** — JS checks `typeof bridge.printLabel === 'function'` before calling. 🗣 Knock to see which door exists before trying the key — so a website running against an old APK falls back instead of failing.
- **Receipt mode / Label mode** — endless-strip printing vs gap-sensor one-sticker-per-print. 🗣 Till roll vs sheet-of-stickers; label mode lines up to each pre-cut box.
- **Dots @ 203dpi** — ~8 dots/mm. 52mm ≈ ~384 printable dots wide, 38mm ≈ ~304 dots tall. 🗣 The box everything must fit, in the printer's own units.
- **Printer buffer** — `enterPrinterBuffer(true)…commit/exitPrinterBuffer(true)`: batch the content, then flush it as one job. 🗣 Write the whole label on a notepad, then hand the finished page over at once — the OLD receipt code did this and printed; the new code dropped it (a prime suspect if label mode emits nothing).
- **Port / adapter** — the `Printer` interface (`lib/ports/Printer.ts`) is the socket; the Sunmi adapter (`lib/adapters/sunmi/Printer.ts`) is one plug; the Browser/iframe adapter is the other. 🗣 We change what's INSIDE one plug; the socket and the other plug are untouched.

---

## Compliance flags

- **No DB / RLS / web-API change** — nothing touches Supabase, auth, migrations, or any `/api` route. No PITR gate, no pgTAP, no integration suite (no data layer involved). (The `getSupplierCode` fetch to `/api/haccp/supplier-code` is unchanged.)
- **No new dependency** — `org.json` is in the Android platform; the Sunmi SDK (`com.sunmi:printerlibrary:1.0.24`) and the release-signing pipeline (ADR-0011) are already present. `package.json` is untouched.
- **No-AI-references rule** — commits, PR body, code, and comments for this unit must contain **NO AI/assistant references**. This **OVERRIDES** the global git-trailer convention. (The ANVIL cert later needs a BARE `Branch:` line + `CLEARED FOR PRODUCTION` for the merge-lock hook — that is ANVIL's job, not this plan's.)
- **Label-content reduction is deliberate** — dropping the PASS/FAIL word and the header is Hakan-approved (ADR-0012 §2), separate from the deferred beef-labelling regulatory review.

🗣 In plain English: a printer-formatting + device-bridge change, not a data change. The heavy database/security machinery does not apply — but the real proof (a label that physically fits) is done by hand on the device, post-publish.

---

## ADR conflicts / alignment

- **ADR-0001 (Sunmi JS bridge, print-only rule):** ALIGNED. §"Future Java methods" (line 50) forbids only **non-print** methods (filesystem, credentials, HTTP, user data). A JSON-payload **print** method is print-related — no new forbidden capability. Adding `printLabel(String json)` is a print method, so no superseding ADR is needed for ADR-0001; ADR-0013 documents the **contract shape** decision, not a new capability.
- **ADR-0010 (Printer transport port):** ALIGNED. The Sunmi adapter still implements the existing `printDeliveryLabel` **port** method with the same `(DeliveryLabelInput, onError)` signature. The port (`lib/ports/Printer.ts`) does NOT change. Only the adapter's **internal** bridge call changes. Rip-out test unaffected.
- **ADR-0011 (Android release signing):** ALIGNED. Signing config + `keystore.properties` already in place. This plan bumps `versionCode`/`versionName` per ADR-0011 §5.
- **ADR-0012 (label mode + layout):** ALREADY **Accepted** (ratified 2026-06-30). This plan keeps its label-mode call sequence + layout verbatim; only the bridge transport changes. No re-ratification needed.
- **ADR-0013 (NEW — version-tolerant JSON bridge):** this plan introduces it. Write it as **Proposed**; ANVIL/Hakan ratify at ship. Decision below.

No conflicts found.

---

## NEW: ADR-0013 — version-tolerant JSON bridge for the Sunmi native print contract

**Write `docs/adr/0013-version-tolerant-json-bridge.md` as part of this unit (Step 5), Status: Proposed.** The implementer writes it from the skeleton below; ratify to Accepted at ship.

- **Title:** Version-tolerant JSON bridge for the Sunmi native print contract (APK↔remote-web deploy skew).
- **Status:** Proposed (2026-06-30, F-PROD-04). Governs the **shape** of `MFSSunmiPrint` print methods. ADR-0012 still governs **label mode + layout**; ADR-0001 still governs the **bridge mechanism** + print-only rule.
- **Context:** The APK is a remote-URL Capacitor shell (`capacitor.config.ts` → `server.url = https://mfsops.com`). The bridge JS ships from the deployed website; the bridge Java ships in the APK; they version-skew freely. A **positional** `@JavascriptInterface` method matched by name+arg-count fails **silently** when the two halves disagree on count (observed: 9-arg web JS × 10-arg APK Java → no matching method → no print, no error). The mince + real-allergens passes would each add fields and re-trigger this trap.
- **Decision:** Native print methods on `MFSSunmiPrint` take a **single JSON string** payload (`printLabel(String json)`), parsed by name with `org.json` (platform-bundled, no dep). The JS builds the JSON; Java reads each field by name with a default for missing keys and ignores unknown keys. Field **add/remove** changes JSON **keys only** — never the method signature — so version skew degrades gracefully.
- **Backward-compat clause:** during switchover the APK **keeps the old positional `printDeliveryLabel(...9 args...)` working** (delegating to the same label renderer) so the currently-deployed (old) web still prints against the new APK. The new web **feature-detects** `printLabel` and calls it; it falls back to the old positional method if `printLabel` is absent (old APK + new web). Both directions print.
- **Consequences — easier:** future fields are JSON-key edits; APK↔web skew no longer silently kills printing; one method serves delivery now and mince later.
- **Consequences — harder:** Java now parses JSON (small, platform-standard); the contract's "shape" lives in two places (a JSON key list in TS + the parse in Java) with no compile-time link — mitigated by an unknown-key/missing-key-tolerant parser and an on-device round-trip check.
- **Print-only invariant preserved (ADR-0001):** `printLabel` is a print method; no filesystem/credential/HTTP/user-data capability is added.

🗣 In plain English: write down WHY we switched to the labelled-checklist doorway, so a future change doesn't quietly revert to the brittle multi-pin key and re-break printing.

---

## The JSON contract — the exact key set, method name, and call direction

### Method name (justified)

Use a **NEW** method name **`printLabel(String json)`** (NOT a JSON-overload of `printDeliveryLabel`).

**Justification:** (a) feature-detection (`typeof bridge.printLabel === 'function'`) only works if the new method has a **distinct name** — overloading `printDeliveryLabel` with a 1-string variant would make detection ambiguous and Android overload resolution by arg-count is exactly the fragility we are removing; (b) a generic `printLabel` cleanly serves the future mince label too (one method, `type` key selects the layout); (c) the old positional `printDeliveryLabel` stays exactly as-is for backward compat, untouched in name/shape.

🗣 In plain English: a brand-new, clearly-named door (`printLabel`) the website can knock on to check it exists — and which will also serve the future mince label — while the old door stays open as a safety net.

### The JSON key set (delivery `type`)

The JS builds and `JSON.stringify`s this object, then calls `bridge.printLabel(json)`:

```jsonc
{
  "type":          "delivery",   // selects the layout; future "mince"
  "batch":         "<batch_number>",
  "supplier":      "<supplier label code>",
  "date":          "<date>",
  "temp":          "<value-only, e.g. '4°C' or '—'>",   // NO PASS/FAIL ever
  "bornIn":        "<country or ''>",
  "rearedIn":      "<country or ''>",
  "slaughterSite": "<site or ''>",
  "cutSite":       "<site or ''>",
  "species":       "<UPPERCASED species>",
  "allergens":     "None"
}
```

- Every value is a **string**; missing/empty fields are `""` (Java treats `""` as "omit this cell", mirroring today's non-empty guards).
- Java reads each with `obj.optString("key", "")` → tolerant of missing keys (returns `""`).
- Java reads `obj.optString("type", "delivery")` and renders the delivery layout for `"delivery"` (or unknown → default to delivery for now).
- **Unknown keys are ignored** (we never enumerate the JSON; we only `optString` the keys we know). This is the forward-compat guarantee.

🗣 In plain English: the website fills in a labelled form; the printer reads the lines it knows, treats blanks as "skip", ignores anything new, and never stamps PASS/FAIL.

### Which method the new JS calls + the feature-detect decision

**Decision: feature-detect, YES.** In `printDeliverySunmi`:

```ts
const bridge = window.MFSSunmiPrint
if (bridge && typeof bridge.printLabel === 'function') {
  bridge.printLabel(JSON.stringify(payload))        // new JSON path
} else if (bridge && typeof bridge.printDeliveryLabel === 'function') {
  // old APK still installed → use the legacy positional path so printing still works
  bridge.printDeliveryLabel(
    payload.batch, payload.supplier, payload.date, payload.temp,
    /* legacy bornLine: combine born/reared as the OLD APK expects */ legacyBornLine,
    payload.slaughterSite, payload.cutSite, payload.species, payload.allergens,
  )
} else {
  throw new Error('printDeliverySunmi: no usable MFSSunmiPrint print method')
}
```

- **Why feature-detect even though the ship plan is "publish then calibrate together":** belt-and-braces. If, after publishing the new web, a device is somehow still on an OLD APK (not yet reinstalled, or a second device missed), the new web **still prints** via the legacy positional method instead of silently no-printing. This is the exact failure we are eliminating — never trust that both halves are in sync.
- `legacyBornLine` is built by the **old combining rule** (born/reared into one string) ONLY for the legacy fallback branch — so the old APK's 9-arg method still gets what it expects. Keep a tiny local combiner for this; it is NOT the new path. (See helper note below.)
- The `throw` keeps the adapter's existing "try native, fall back to iframe on throw" behaviour intact (the iframe Browser adapter still serves on any throw).

🗣 In plain English: the website first tries the new labelled-checklist door; if the device is still on an old app, it uses the old door so printing still happens; only if neither door exists does it hand off to the iframe fallback — three layers, never a silent dead end.

---

## Backward-compatibility during the switchover (confirmed sound)

The currently-deployed web (`main`) calls the **old 9-arg positional** `printDeliveryLabel(batchCode, supplierCode, date, tempLine, bornLine, slaughterSite, cutSite, species, allergens)`. To avoid a dead window, the **APK keeps the old 9-arg positional method working** AND adds `printLabel(String json)`. Both delegate to the **same** label-mode renderer.

Resulting matrix (all four print — no silent dead window):

| | OLD web (positional 9-arg) | NEW web (JSON + feature-detect) |
|---|---|---|
| **OLD APK** (positional only) | prints (positional) — today | prints (web feature-detects → positional fallback) |
| **NEW APK** (positional + JSON) | prints (old positional kept) | prints (JSON) ✅ target |

🗣 In plain English: whatever combination of old/new website and old/new app is on a device, a label still comes out. That's the whole point of the fix.

**Sound? Yes.** The only requirement is that the kept positional method and the new JSON method route to **one shared renderer** so the layout is identical regardless of entry path (no drift). Step 2 enforces this by extracting a private `renderDeliveryLabel(...)` Java helper both call.

---

## Exact files to change

| # | File | Change |
|---|------|--------|
| 1 | `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java` | Extract the existing label-mode body into a private `renderDeliveryLabel(...)` helper. Add `@JavascriptInterface printLabel(String json)` → parse with `org.json` → call `renderDeliveryLabel`. KEEP a `@JavascriptInterface printDeliveryLabel(...9 positional args...)` that builds a combined `bornLine` and calls the same `renderDeliveryLabel`. Keep the label-mode sequence + `twoCol` as-is. |
| 2 | `lib/adapters/sunmi/Printer.ts` | MUST-FIX revert artifact (see below). Change `MFSSunmiPrintBridge` TS interface to declare BOTH `printLabel(json: string): void` AND the legacy `printDeliveryLabel(...9 args...): void` (for the fallback branch). Rewrite `printDeliverySunmi` to build the JSON payload + feature-detect + legacy fallback. `formatTempStatus` → value-only (drop PASS/FAIL). DELETE `formatBornLine` from the public helpers; add a small local `legacyBornLine` combiner used ONLY by the fallback branch. |
| 3 | `lib/adapters/sunmi/index.ts` | Remove `formatBornLine` from the re-export (it's deleted). |
| 4 | `tests/unit/adapters/sunmi/Printer.test.ts` | Update `formatTempStatus` assertions (value-only); DELETE the `formatBornLine` block + its import; ADD a test that the built JSON payload contains the right keys/values (value-only temp; born/reared as separate `bornIn`/`rearedIn` keys; `type:"delivery"`). |
| 5 | `docs/adr/0013-version-tolerant-json-bridge.md` | NEW ADR, Status: Proposed (skeleton above). |
| 6 | `android/app/build.gradle` | `versionCode 3 → 4`, `versionName "1.2" → "1.3"` (ADR-0011 §5). |

**Files that MUST NOT change (verify untouched in the diff):**
`lib/ports/Printer.ts`, `lib/wiring/printer.ts`, `lib/adapters/browser/Printer.ts`, `package.json`, any migration, any `/api` route, `MainActivity.java`, `capacitor.config.ts`, `docs/adr/0012-*.md` (already Accepted).

🗣 In plain English: four code files + one new ADR + a version bump. The web "socket", the wiring, the iframe plug, and the bridge-injection in MainActivity all stay exactly as they are — that's what keeps the architecture clean and the rip-out test passing.

---

## MUST-FIX: the `lib/adapters/sunmi/Printer.ts` revert artifact

Commit `4902dce` accidentally **reverted** `Printer.ts` to the OLD shape: `formatBornLine` combines born/reared, `formatTempStatus` still emits `PASS`/`FAIL`, and `printDeliverySunmi` calls the **old 9-arg** positional bridge with a combined `bornLine`. (Confirmed: the file currently on the branch is the pre-`ba69d34` shape.) Meanwhile `SunmiPrintBridge.java` on the branch is the NEW 10-arg positional shape. **So right now the branch's JS and Java already disagree (9 vs 10) — this branch as-is would not print.** The Step-2 rewrite supersedes both: JS builds JSON + feature-detects; Java exposes `printLabel(json)` + a kept positional method.

🗣 In plain English: the branch is currently mid-surgery and broken (the two halves don't match). The plan's TS step rebuilds the web half cleanly onto the JSON contract, so we don't just patch the old positional code back together.

---

## Java: the bridge after this unit (shape, not full source)

`SunmiPrintBridge.java` keeps everything it has (label-mode init/locate/output, `twoCol`, the non-empty-guarded cells) but restructured so two entry points share one renderer:

```java
// NEW — version-tolerant entry point (the new web calls this)
@JavascriptInterface
public void printLabel(String json) {
    if (printerService == null) { Log.w(TAG, "printLabel: service not bound"); return; }
    try {
        org.json.JSONObject o = new org.json.JSONObject(json);
        // type selects layout; default delivery (forward-compat for future "mince")
        // unknown keys ignored — we only read the keys we know, each with a default
        renderDeliveryLabel(
            o.optString("batch", ""),
            o.optString("supplier", ""),
            o.optString("date", ""),
            o.optString("temp", ""),
            o.optString("bornIn", ""),
            o.optString("rearedIn", ""),
            o.optString("slaughterSite", ""),
            o.optString("cutSite", ""),
            o.optString("species", ""),
            o.optString("allergens", "")
        );
    } catch (Exception e) {
        Log.e(TAG, "printLabel error: " + e.getMessage(), e);
    }
}

// KEPT — legacy positional entry point (old deployed web calls this; safety net)
@JavascriptInterface
public void printDeliveryLabel(
        String batchCode, String supplierCode, String date, String tempLine,
        String bornLine, String slaughterSite, String cutSite,
        String species, String allergens) {
    // old web sends a single combined bornLine; pass it as bornIn, rearedIn ""
    renderDeliveryLabel(batchCode, supplierCode, date, tempLine,
        bornLine, "", slaughterSite, cutSite, species, allergens);
}

// SHARED renderer — the existing label-mode body (init→labelLocate→content→labelOutput,
// twoCol, non-empty cell guards). Both entry points route here so layout never drifts.
private void renderDeliveryLabel(String batch, String supplier, String date,
        String temp, String bornIn, String rearedIn, String slaughterSite,
        String cutSite, String species, String allergens) { /* existing body */ }
```

- `org.json` is referenced fully-qualified (`org.json.JSONObject`) — no new import line strictly needed, but an `import org.json.JSONObject;` is fine. **No Gradle dependency** (platform-bundled).
- The legacy method maps the old combined `bornLine` into the `bornIn` slot with `rearedIn=""` — the renderer's non-empty guard already handles that (prints one combined cell), so the old web's labels look as they did.

🗣 In plain English: one printing routine, reached either by the new labelled-checklist door or the old multi-pin door, so both produce the same sticker and we can't drift them apart.

---

## TypeScript: the adapter after this unit

`lib/adapters/sunmi/Printer.ts`:

```ts
interface MFSSunmiPrintBridge {
  isReady(): boolean
  printLabel?(json: string): void                 // NEW — preferred path
  printDeliveryLabel?(                             // LEGACY — fallback only
    batchCode: string, supplierCode: string, date: string, tempLine: string,
    bornLine: string, slaughterSite: string, cutSite: string,
    species: string, allergens: string,
  ): void
}
```

- Both methods are **optional (`?`)** on the interface so `typeof bridge.x === 'function'` is the honest gate (an old APK lacks `printLabel`; in theory a future APK could drop the legacy one).

`formatTempStatus` — value only, drop PASS/FAIL:
```ts
export function formatTempStatus(temperatureC: number | null, _tempStatus: string): string {
  return temperatureC != null ? `${temperatureC}°C` : '—'
}
```
Keep the `_tempStatus` param (prefixed `_`) to avoid call-site churn.

`formatBornLine` — **DELETE** the exported helper. Born/reared go as separate JSON keys (`bornIn`, `rearedIn`). For the legacy fallback branch ONLY, add a tiny local (non-exported) combiner so the old APK's single `bornLine` arg still gets a sensible value:
```ts
function legacyBornLine(bornIn: string, rearedIn: string): string {
  if (bornIn && rearedIn && bornIn === rearedIn) return `Born/Reared: ${bornIn}`
  return [bornIn ? `Born: ${bornIn}` : '', rearedIn ? `Reared: ${rearedIn}` : '']
    .filter(Boolean).join('  ')
}
```

`printDeliverySunmi` — build JSON, feature-detect, fallback (the block shown in "Which method the new JS calls", with `payload` assembled from `d` using `formatSpecies`, `formatTempStatus`, `d.born_in ?? ''`, `d.reared_in ?? ''`, `d.slaughter_site ?? ''`, `d.cut_site ?? ''`, `'None'`).

🗣 In plain English: the web side stops gluing Born/Reared together and stops stamping PASS/FAIL; it hands over a labelled form. It keeps a tiny old-style combiner used only when talking to an old app.

---

## Unit-test assertions (the oracle) — `tests/unit/adapters/sunmi/Printer.test.ts`

- **`formatTempStatus` block** — replace with value-only assertions: `formatTempStatus(3.2,'pass') === '3.2°C'`, `(8.1,'fail') === '8.1°C'`, `(5.5,'conditional') === '5.5°C'`, `(null,'pass') === '—'`.
- **`formatBornLine` block** — **DELETE entirely**; remove `formatBornLine` from the import line.
- **`formatSpecies` block** — UNCHANGED.
- **`isSunmiNative` block** — UNCHANGED (the mock bridge stub still satisfies the now-optional methods).
- **NEW — JSON payload block:** export a small pure `buildDeliveryPayload(d: DeliveryLabelInput, supplierCode: string)` from `Printer.ts` that returns the JSON **object** (so `printDeliverySunmi` does `JSON.stringify(buildDeliveryPayload(...))`). Test it directly: asserts `type==='delivery'`, `temp` is value-only (no `PASS`), `bornIn`/`rearedIn` are SEPARATE keys carrying the raw inputs, `species` uppercased, `allergens==='None'`, empty inputs map to `''`. This is the oracle for the new contract and is fully unit-testable (no native bridge needed).

🗣 In plain English: we add a tiny pure function that builds the checklist, and test THAT — so the contract (right keys, value-only temp, separate born/reared) is proven in CI even though the actual printing can't be.

---

## Numbered steps (atomic; one commit per code change)

> Stay ON branch `fprod04-diecut-label-sizing` (tip `4902dce`). Do not branch off main.

**Step 0 — Pre-flight grep (no commit).**
Confirm `formatBornLine` / `formatTempStatus` have NO callers outside `lib/adapters/sunmi/Printer.ts`, `lib/adapters/sunmi/index.ts`, and `tests/unit/adapters/sunmi/Printer.test.ts`. Grep BOTH alias (`@/lib/adapters/sunmi`) AND relative forms (lesson F-TD-12). VERIFIED at plan time: no external callers exist — proceed. If new ones appeared, STOP and report.

**Step 1 — TS adapter + helpers + interface + tests (one commit).**
In `lib/adapters/sunmi/Printer.ts`: declare the two-method (both optional) `MFSSunmiPrintBridge` interface; `formatTempStatus` → value-only (`_tempStatus`); DELETE exported `formatBornLine`; add non-exported `legacyBornLine`; add exported `buildDeliveryPayload`; rewrite `printDeliverySunmi` to JSON + feature-detect + legacy fallback + `throw` on neither.
In `lib/adapters/sunmi/index.ts`: drop `formatBornLine` from the re-export.
In `tests/unit/adapters/sunmi/Printer.test.ts`: value-only temp assertions; delete `formatBornLine` block + import; add the `buildDeliveryPayload` block.
**Gate:** `npm run test -- tests/unit/adapters/sunmi/Printer.test.ts` green; `npx tsc --noEmit` clean; `npm run lint` clean.
**Commit (NO AI refs):** `fix(fprod04): version-tolerant JSON payload in Sunmi adapter + value-only temp`.

**Step 2 — Java bridge: shared renderer + JSON method + kept positional method (one commit).**
In `SunmiPrintBridge.java`: extract the existing label-mode body into private `renderDeliveryLabel(...10 params...)`; add `@JavascriptInterface printLabel(String json)` parsing with `org.json.JSONObject` (each field `optString(key,"")`, unknown keys ignored, `type` default `"delivery"`); KEEP `@JavascriptInterface printDeliveryLabel(...9 positional args...)` mapping `bornLine→bornIn, rearedIn=""` and delegating to the renderer. Leave the label-mode sequence + `twoCol` unchanged.
**Gate:** Java compiles (proven by Step 4 build).
**Commit:** `feat(fprod04): version-tolerant printLabel(json) bridge + keep legacy positional`.

**Step 3 — ADR-0013 (one commit).**
Write `docs/adr/0013-version-tolerant-json-bridge.md` (Status: Proposed) from the skeleton above.
**Commit:** `docs(fprod04): ADR-0013 version-tolerant JSON bridge (proposed)`.

**Step 4 — Version bump (one commit).**
`android/app/build.gradle`: `versionCode 3 → 4`, `versionName "1.2" → "1.3"` (ADR-0011 §5). (VERIFIED current = 3 / "1.2".)
**Commit:** `chore(fprod04): bump Android version to 1.3 (versionCode 4)`.

**Step 5 — Build the signed release APK (no commit; artifact).**
`cd android && ./gradlew :app:assembleRelease`. **Pass:** build SUCCEEDS; output `android/app/build/outputs/apk/release/app-release.apk` is RELEASE-signed (`apksigner verify --print-certs` shows the release key, NOT debug). If it fails on the bridge, fix the bridge — do NOT improvise.

**Step 6 — Back up the current installed APK BEFORE sideloading.**
Confirm the prior signed APK is in `~/mfs-apk-backups/` (rollback artifact, Step 9). Do not overwrite it with the new build.

**Step 7 — Bridge-correctness verification (the PRE-merge ANVIL gate).**
This is what the cert clears on (NOT the physical fit — see Step 8). On the device, sideload `adb install -r .../app-release.apk` and print ONE real delivery label, while watching `adb logcat -s MFSSunmiPrint:*`. **Cycle 0 must confirm:**
1. The JSON path is taken: a `Printed: <batch>` log appears (NOT silence, NOT `printLabel error`). 🗣 Proves the labelled-checklist door now opens — the exact thing that silently failed before.
2. **Label-mode emit check (TOP on-device risk):** the prior no-print was the signature mismatch; whether label mode ALONE emits ink is NOT yet confirmed. If `Printed:` logs but NO ink appears, the most likely fix is to wrap the renderer body in the printer **buffer** — `enterPrinterBuffer(true) … commitPrinterBuffer() / exitPrinterBuffer(true)` around the content (the OLD receipt code used this and DID print; the new code dropped it). Add it, rebuild (Step 5), reinstall, reprint. If buffer-wrap conflicts with `labelLocate/labelOutput`, fall back to ESC/POS `sendRAWData` per ADR-0001.
3. Fields land in the right cells with a known test delivery (distinct born vs reared countries; a temp value) — proves the JSON round-trips field-by-field.
**Gate to issue the cert:** JSON path taken (log) + ink emitted + fields correct + `tsc`/unit/lint green + signed build. NOTHING about physical 52×38mm fit is claimed here.

**Step 8 — Publish, then calibrate the physical fit (Hakan's chosen strategy).**
1. Merge to `main` → deploys the new JSON-calling web to mfsops.com.
2. Install the new APK on the V3 (the backward-compat net means order doesn't strictly matter, but install together).
3. **THEN** calibrate the physical 52×38mm FIT live on the till by iterating the **APK only** (Java layout tweaks — font sizes, barcode height, `twoCol` column width, margins → rebuild → `adb install -r` → reprint). **No further web deploys are needed** because the layout lives entirely in Java. Expect several cycles. Physical pass criteria: one sticker per print; in-bounds (no clip, no content in the gap); barcode SCANS; all fields legible; header absent; gap alignment holds across 2–3 consecutive prints. Fold final Java tuning into a follow-up `fix(fprod04): on-device label calibration` commit so committed Java matches the APK that fit.

**The cert MUST state honestly:** clearance rests on build + bridge-correctness (JSON round-trips, label mode emits) PRE-merge; the physical FIT is a known POST-publish on-device tuning loop Hakan chose ("publish then calibrate"). The cert must NOT claim the fit is proven.

**Step 9 — Rollback (documented, not executed unless needed).**
- **Web:** revert the merge commit on `main` → mfsops.com serves the prior web (which calls the old positional method; the kept positional method in any installed APK still prints). Fully revertible (no DB/state change).
- **Device:** `adb uninstall com.mfsglobal.ops` → `adb install ~/mfs-apk-backups/<prior-release>.apk` (same release key → in-place reinstall works).
- **Always-available net:** the iframe Browser adapter still serves the delivery screen for any native throw.

---

## TDD test plan

| Layer | What | Done state |
|-------|------|-----------|
| **Unit (oracle)** | `Printer.test.ts` — `buildDeliveryPayload` keys/values (NEW); `formatTempStatus` value-only (4); `formatSpecies` (2); `isSunmiNative` (3); `formatBornLine` block deleted. The new `buildDeliveryPayload` test is the oracle for the JSON contract. | green |
| **Type-sync** | `npx tsc --noEmit` — the two-method `MFSSunmiPrintBridge` decl + `printDeliverySunmi` type-check. (Catches TS-side drift; CANNOT see Java — see Risk 1.) | clean |
| **Lint** | `npm run lint` — no new violations; no adapter-boundary breach (wiring/ports untouched). | clean |
| **Build** | `cd android && ./gradlew :app:assembleRelease` — Java compiles (JSON method + kept positional + shared renderer); APK release-signed. | success |
| **On-device bridge-correctness (PRE-merge cert gate)** | Step 7: JSON path taken (`Printed:` log), ink emitted (buffer-wrap if needed), fields correct. | human-verified |
| **On-device physical fit (POST-publish, NOT a cert claim)** | Step 8 calibration loop until physical criteria hold. | post-publish tuning |

**Explicitly NOT run (justified):** pgTAP, integration, PITR — no DB/RLS/data layer. E2E preview smoke / browser taps — native-bridge-only change; the web delivery-screen behaviour is unchanged except the strings handed to the bridge (covered by unit + tsc). No `@critical` regression for a native-bridge formatting change.

🗣 In plain English: automated tests prove the web builds the right checklist and that JS/Java compile; a human on the device proves the doorway opens and ink comes out (pre-merge) and that the sticker physically fits (after publishing). The cert is honest about which is which.

---

## Acceptance criteria

1. `buildDeliveryPayload` produces `type:"delivery"`, value-only `temp` (no PASS/FAIL), SEPARATE `bornIn`/`rearedIn`, uppercased `species`, `allergens:"None"`, `''` for empty inputs; unit tests green.
2. `formatTempStatus` value-only; exported `formatBornLine` removed (and dropped from `index.ts`); a local `legacyBornLine` exists for the fallback branch only.
3. The web feature-detects: calls `printLabel(json)` when present, else legacy positional, else throws (→ iframe fallback).
4. `SunmiPrintBridge.java` exposes `@JavascriptInterface printLabel(String json)` (org.json, optString defaults, unknown keys ignored) AND a KEPT positional `printDeliveryLabel(...9 args...)`, both delegating to one shared `renderDeliveryLabel` (label-mode + reduced layout from ADR-0012). No new Gradle dependency.
5. `./gradlew :app:assembleRelease` produces a release-signed APK; `versionCode 4` / `versionName "1.3"`.
6. On-device (Step 7, pre-merge): JSON path taken (logcat `Printed:`), ink emitted, fields in correct cells.
7. ADR-0013 written (Proposed). ADR-0012 left Accepted/untouched.
8. `lib/ports/Printer.ts`, `lib/wiring/printer.ts`, `lib/adapters/browser/Printer.ts`, `package.json`, all migrations, all `/api` routes, `MainActivity.java`, `capacitor.config.ts` UNCHANGED in the diff.
9. No AI references in any commit/PR/code/comment.
10. The cert states the physical 52×38mm fit is a post-publish tuning loop, NOT proven at clearance.

---

## Risk Assessment

### 1. On-device label-mode EMIT — does ink come out at all? (TOP RISK)
**Severity: HIGH (the unknown that actually matters). Not a Gate-2 blocker; gates the cert.**
The prior no-print is now understood to be the **signature mismatch**, which the JSON bridge fixes. But that means **label mode emitting ink** was NEVER actually proven on this SDK build — the call never reached the printer. It is possible that `printerInit → labelLocate → content → labelOutput` **without** a printer-buffer wrap emits nothing on this firmware (the OLD receipt code wrapped content in `enterPrinterBuffer(true)…exitPrinterBuffer(true)` and DID print; the new code dropped it).
**Mitigation:** Step 7 cycle-0 watches logcat for `Printed: <batch>` (proves the path) THEN checks for ink. If the log prints but no ink, restore the buffer wrap around the renderer body (rebuild/reinstall/reprint); if buffer conflicts with locate/output, fall back to ESC/POS `sendRAWData` (ADR-0001). The iframe fallback always serves staff meanwhile. **Most-likely fix is flagged up front: restore the buffer wrap.**

### 2. Business-logic / correctness — JS↔Java contract drift (the bug we are fixing)
**Severity: HIGH (history). MITIGATED by design.**
A `@JavascriptInterface` boundary has no compile-time link. The OLD positional design failed silently on version skew. The JSON design removes count/order coupling: Java reads by name with defaults and ignores unknown keys, so skew degrades gracefully; the web feature-detects and falls back to the kept positional method. The remaining drift surface is **key-name spelling** between `buildDeliveryPayload` (TS) and the `optString` keys (Java) — caught by Step 7 cycle-0 field-placement check (a misspelled key prints `""` in that cell, visibly wrong) and the new unit test pinning the TS key set.
**Mitigation:** the `buildDeliveryPayload` unit test (TS key set) + cycle-0 field-by-field on-device check (distinct born vs reared, a temp value) + the kept-positional safety net. The whole redesign IS the mitigation for the silent-failure class.

### 3. Backward-compat correctness — both entry points must render identically
**Severity: MEDIUM. MITIGATED.**
If the kept positional method and the JSON method diverged, an old-web device and a new-web device would print different labels.
**Mitigation:** both delegate to ONE private `renderDeliveryLabel` — layout cannot drift. The positional method only maps `bornLine→bornIn, rearedIn=""` (renders one combined cell, exactly as the old web intends).

### 4. Concurrency / race conditions
**Severity: NONE.** Single-device, single-threaded print path; one print per tap; no shared mutable state added. No material risk.

### 5. Security
**Severity: NONE.** No new bridge *capability* — `printLabel` is print-only (ADR-0001 §line-50 honoured). No filesystem/credential/network/user-data exposure. JSON is parsed locally and only its known string fields are printed. No new dependency. No material new risk.

### 6. Data migration
**Severity: NONE.** No DB, schema, migration, or RLS. Not applicable.

### 7. Launch blockers
- **Released APK ships before bridge-correctness confirmed** → cert MUST NOT issue until Step-7 (JSON path + ink + fields) holds. Honest about post-publish fit.
- **Physical fit not yet tuned at publish** → Hakan's explicit "publish then calibrate"; iframe fallback + the working native path (correct fields, maybe imperfect sizing) mean staff are never blocked.
- **A device left on the OLD APK after web publish** → handled by web feature-detect → legacy positional (kept) → still prints. Not a blocker.

**Headline:** One genuine HIGH unknown — **does label mode emit ink without the printer-buffer wrap** (the thing never actually tested because the old call never arrived); flagged with its likely fix (restore the buffer wrap). The historical silent-failure risk (JS↔Java skew) is **designed out** by the JSON contract + feature-detect + kept positional method. The single **must-fix** is the Step-7 bridge-correctness verification (JSON path taken + ink emitted + fields correct) — it gates the ANVIL cert, NOT Gate 2. No security/data/concurrency risks.

---

## Hexagonal verdict (computed)

- **Port used:** existing `Printer` (`lib/ports/Printer.ts`) — `printDeliveryLabel(DeliveryLabelInput, onError)`. UNCHANGED. No new port.
- **Adapter changed:** `lib/adapters/sunmi/Printer.ts` (Sunmi plug) — internal bridge transport only. The Browser/iframe adapter and `lib/wiring/printer.ts` are untouched.
- **New dependency:** NONE. `org.json` is platform-bundled (not a Gradle/npm entry); Sunmi SDK + signing already present; `package.json` unchanged. (Nothing to wrap — no new vendor.)
- **Rip-out test:** **PASS.** Replacing the Sunmi printer vendor = one new adapter under `lib/adapters/<vendor>/` + one wiring line in `lib/wiring/printer.ts`. This unit touches one adapter's internals + native bridge; the port, wiring, and other adapter are untouched.

🗣 In plain English: we re-wired the inside of one plug (the Sunmi printer) — the socket and the spare plug are untouched, and we added zero new vendors. Swapping the printer tomorrow is still one adapter + one wiring line.
