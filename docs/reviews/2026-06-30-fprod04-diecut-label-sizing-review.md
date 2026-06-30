# Code review — F-PROD-04 die-cut label sizing (version-tolerant JSON bridge, delivery)

- **Date:** 2026-06-30
- **Branch / PR:** `fprod04-diecut-label-sizing` / PR #101 (base `main`)
- **Reviewer:** code-critic (FORGE Guard) — REVISED audit (JSON bridge; supersedes the earlier positional-version review)
- **Verdict:** **SHIP — no blockers** (on-device gates → ANVIL/publish)

## #1 check — the 11-key JSON contract: 11/11 EXACT match
JS `buildDeliveryPayload` (Printer.ts:147-157) ↔ Java `printLabel` `optString` (SunmiPrintBridge.java:69-80):
`type · batch · supplier · date · temp · bornIn · rearedIn · slaughterSite · cutSite · species · allergens` — all match, no spelling/case drift. `type` read + discarded (forward-compat for a future mince layout). Key set pinned by `Printer.test.ts:162-170` (`Object.keys` assertion) — the tripwire replacing the lost compile-time link.
- Honest gap (not a blocker): the test pins the TS side only; a Java-side `optString` rename would still pass CI. ADR-0013:63-66 assigns this to the on-device round-trip check.

## Confirmations (no defects)
- **Net Printer.ts is the JSON version — the `4902dce` revert is fully superseded** (`b5290f5`). No combined `bornLine` emit, no PASS/FAIL temp, no unconditional 9-arg call; only the intentional non-exported `legacyBornLine` + the positional fallback branch remain. `setPrinterMode`/`PASS`/`FAIL` appear only in comments.
- **Two Java entry points → one renderer:** `printLabel(json)` (57-85) + legacy positional `printDeliveryLabel(...)` (94-109) both delegate to shared `renderDeliveryLabel(...)` (117-191); legacy maps `bornLine→bornIn, rearedIn=""`. No layout drift.
- **Graceful skew:** `printLabel` uses `optString(key,"")`, reads only known keys, ignores unknown.
- **`org.json.JSONObject` platform-bundled** — imported, no Gradle dep added (dependencies block unchanged).
- **JS feature-detect order:** `printLabel` → legacy positional → throw → injected iframe fallback. Interface declares both methods optional.
- **Helpers/tests:** `formatTempStatus` value-only ("—" null); exported `formatBornLine` deleted (non-exported `legacyBornLine` fallback-only); `index.ts` drops only the dead re-export; tests are a real oracle + key/value assertions.
- **Label-mode body:** no header, species+batch via twoCol, barcode height 40, born/reared separate guarded cells, temp value-only, sl/cut/allergens, labelLocate→content→labelOutput. No enterPrinterBuffer wrap — intentional cycle-0 contingency.
- **Untouched:** `lib/ports/Printer.ts`, `lib/wiring/printer.ts`, `lib/adapters/browser/Printer.ts`, `MainActivity.java`, `/api`, migrations, package.json — none in net diff. build.gradle = versionCode 2→4 / versionName 1.1→1.3 only (intermediate 1.2 bump on-branch). No secrets.
- **ADR-0013** present, Status: Proposed, no AI refs; consistent with ADR-0001 (print-only) + ADR-0012 (Accepted).

## 🟢 Non-blocking
- `formatSpecies` already uppercases; Java `species.toUpperCase()` re-does it (idempotent, redundant; latent two-owners-of-one-rule). Consider dropping the Java side later.
- Java entry-point parity is untested at unit level (no Java unit harness) — structurally safe via shared renderer; confirm on-device that the legacy path renders identically.

## 🔵 Architecture
- No new shallowness; rip-out PASS (existing Printer port, no new port). The diff *strengthens* depth (positional coupling → name-tolerant).

## Tests / type / lint
- `npx tsc --noEmit` clean. `tests/unit/adapters/sunmi/Printer.test.ts` + `tests/unit/wiring/printer.test.ts` 24/24 pass (incl. the buildDeliveryPayload key-set pin + the native/fallback delegation matrix). `next lint` clean. Vendor-fence/adapter-import rules not breached. Java/gradle build = ANVIL (sandbox-blocked).

## On-device gates → ANVIL / publish-then-calibrate (not blockers)
1. Label-mode ink emit without the enterPrinterBuffer wrap — cycle-0 contingency (restore wrap if logs `Printed:` but no ink).
2. Java compile + Sunmi SDK symbols — the Gradle build is the gate.
3. Java-side key-name parity — field-by-field on-device round-trip (right value in each cell).

## Loop-back
None. No blockers → ANVIL.
