# ANVIL Clearance Certificate

Date: 2026-06-30
App: MFS-Operations (MFS Global Ltd — internal operations / HACCP app)
Branch: fprod04-diecut-label-sizing
PR: #101 (base `main`)
Unit: F-PROD-04 die-cut label sizing — Sunmi label mode @ 52×38mm + version-tolerant JSON bridge (DELIVERY)

## Scope
Switch the Sunmi V3 silent native DELIVERY print from receipt mode to label mode sized for
52×38mm die-cut stock, with a trimmed layout, AND convert the native bridge to a
version-tolerant JSON payload (printLabel(json) read by name) so the APK and the
remote-loaded web JS can be out of sync without silently no-printing. Existing Printer port,
no new port. Mince out of scope. No DB/web-API change, no new deps.

## What this certificate CLEARS (pre-merge)
The CODE + BUILD are cleared for production merge. The PHYSICAL label fit is NOT claimed here
— it is Hakan's chosen "publish then calibrate" on-device loop (see below).

| Layer | Result | Detail |
|---|---|---|
| Unit (Vitest) | ✅ 24/24 | Sunmi adapter + wiring; value-only temp, born/reared split, `buildDeliveryPayload` key-set PIN (Object.keys) |
| TypeScript (tsc) | ✅ clean | |
| ESLint (next lint) | ✅ clean | vendor-fence / adapter-import rules not breached |
| JSON contract | ✅ 11/11 match | JS `buildDeliveryPayload` keys == Java `printLabel` `optString` keys (type/batch/supplier/date/temp/bornIn/rearedIn/slaughterSite/cutSite/species/allergens); TS key-set pinned by test |
| Build (assembleRelease) | ✅ BUILD SUCCESSFUL | the real Java compile — `org.json.JSONObject` + `printLabel(json)` + kept positional `printDeliveryLabel` + label-mode symbols all resolve |
| Signature / version | ✅ | `app-release.apk` signed with the release key (CN=Hakan Kilic), versionCode 4, versionName 1.3, NOT debuggable |
| Secrets-in-git (Guard) | ✅ none | keystore + keystore.properties gitignored; not in diff |
| code-critic Guard | ✅ SHIP, no blockers | revert superseded; both Java entry points → one shared renderer; feature-detect+fallback chain intact; ports/wiring/browser untouched |
| Web suite / pgTAP / PITR | n/a | no DB/web-behaviour change (on preview/browser the print path is the unaffected iframe fallback) |

## What this certificate does NOT claim — POST-PUBLISH calibration (Hakan's choice)
The physical print is verified on the V3 AFTER publish (Hakan chose "publish then calibrate"):
1. **Ink emit:** first print — logcat must show `Printed:`/no `Print error:`, and ink must
   physically emit. If logged-but-no-ink → restore the `enterPrinterBuffer(true)…exitPrinterBuffer(true)`
   wrap (the flagged cycle-0 contingency), rebuild, reinstall.
2. **Field parity:** distinct born/reared + a temp value land in the correct cells (the
   Java-side key-name check the TS-only pin can't cover).
3. **Physical fit:** layout tuned (font/barcode height/column width) until one delivery label
   fits a single 52×38mm sticker with no overflow. APK-only iterations (no further web deploy).

## Ship sequence (publish then calibrate)
- No migration. Merge PR #101 → mfsops.com serves the new JSON-calling web (feature-detects
  printLabel; old positional + iframe fallbacks retained). Install the vc4 APK on the V3 so
  both halves are JSON. Then run the post-publish calibration above.

## Rollback
No DB. Code rollback = `git revert` the merge commit (the web reverts to positional; the kept
legacy Java method means a reverted web still prints). Device rollback = reinstall the backed-up
prior APK (`~/mfs-apk-backups/`), or reinstall the previous signed build.

## Accepted risk (carried from Pass 2b, logged)
The release signing password was exposed in the session transcript and kept; bounded (the .jks
never left the local machine). Rotate via `keytool -storepasswd`/`-keypasswd` if the .jks is
ever shared.

## POST-PUBLISH CALIBRATION — CONFIRMED (2026-06-30)
The publish-then-calibrate loop completed successfully on the physical Sunmi V3:
- Published: PR #101 merged (`84e886a`) → mfsops.com serves the new JSON web; vc4 APK installed.
- Ink + fields: prints; born/reared land in separate cells (confirmed live).
- **Gap alignment: required a DEVICE-SIDE label-learning calibration** — the Sunmi SDK has NO
  software "set label mode"/"learn gap" call (only `labelLocate`/`labelOutput`/`getPrinterMode`/
  `getPrinterPaper`). Hakan set the V3 printer to Label/Gap paper + ran its label-learning in the
  device printer settings; the prints then stopped cleanly at each 52×38mm sticker.
- Layout: the initial `twoCol` space-pad overflowed (batch wrapped, date overlapped) at the large
  font. Fixed by switching to the Sunmi `printColumnsString` column API (commit `816455c`,
  on-device verified) — species left / batch right-aligned, paired body columns, date column
  widened. **Confirmed fitting one 52×38mm sticker, data-heavy delivery included.**

## Verdict

✅ CLEARED FOR PRODUCTION — and POST-PUBLISH FIT CONFIRMED on the V3.

(Code + build cleared: unit 24/24, tsc/lint clean, JSON contract 11/11, signed release build
compiles + not-debuggable, Guard SHIP no-blockers. The physical 52×38mm fit was Hakan's
publish-then-calibrate loop and is now CONFIRMED on-device — see the section above.)
