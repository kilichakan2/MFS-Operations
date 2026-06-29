# ANVIL Clearance Certificate

Date: 2026-06-30
App: MFS-Operations (MFS Global Ltd — internal operations / HACCP app)
Branch: fprod04-pass2b-release-signed-apk
PR: #100 (base `main`)
Unit: F-PROD-04 Pass 2b — release-signed APK + MFS launcher icon

## Scope
Android build/release engineering: replace the fragile DEBUG build with a proper
RELEASE-SIGNED APK, harden web-debugging out of release, bump version, and replace the
generic Capacitor launcher icon with the MFS branded icon. No web/app code change, no DB,
no new dependencies. Verification is build/static checks + a manual on-device test (no
automated test can prove an APK).

## Per-layer results

| Layer | Result | Detail |
|---|---|---|
| Build (`gradlew :app:assembleRelease`) | ✅ BUILD SUCCESSFUL (18s) | `app-release.apk` 3.2 MB produced |
| Signature (`apksigner verify --print-certs`) | ✅ signed with release key | `CN=Hakan Kilic, OU/O=MFS Global LTD, L=Sheffield, C=GB`; SHA-256 `c6bf8ecf…faec` (NOT the debug key) |
| Version + hardening (`aapt dump badging`) | ✅ | `versionCode=2`, `versionName=1.1`; NO `application-debuggable` (web-debug gated to `BuildConfig.DEBUG`); `buildConfig=true` compiled |
| Secrets-in-git (Guard) | ✅ none | keystore + `keystore.properties` gitignored; zero secrets in diff/history |
| Device cutover | ✅ | previous APK backed up (`~/mfs-apk-backups/mfs-ops-PREVIOUS-debug-backup.apk`); `adb uninstall` → `adb install` Success |
| On-device login | ✅ | staff logged in on the V3 (fresh signed session; also clears the original stale-cookie break) |
| On-device print (fires) | ✅ | a label physically prints from the V3 |
| MFS launcher icon | ✅ | V3 home screen shows the MFS icon (navy + orange mark), not the generic placeholder; full-bleed adaptive verified by render-simulation pre-commit + confirmed on device |
| Web suite / pgTAP / PITR | n/a | zero web-code/DB surface (correct for this unit) |

## Known issue — NOT a Pass-2b blocker (deferred to next pass)
- **Die-cut label sizing.** The physical stock is 52mm×38mm die-cut labels (with gaps). The
  silent native print uses Sunmi **receipt mode** (`printText`/`lineWrap`), not **label mode**
  (gap-sensor feed), so content overflows across label boundaries. This is PRE-EXISTING (the
  debug build did the same) and out of Pass 2b's scope. Next unit: "die-cut label sizing /
  Sunmi label mode" — fit delivery + mince to 52×38mm; needs native label-mode in
  `SunmiPrintBridge.java` + on-device calibration. (See BACKLOG §F-PROD-04.)

## Accepted risk (Hakan, logged — no secret written here)
- The release signing password was exposed in the session transcript and Hakan chose to keep
  it. Residual risk is bounded: the keystore (`.jks`) file never left the local machine
  (gitignored, never printed), so the password alone cannot sign anything. **Mitigation if the
  `.jks` is ever shared/backed up to a less-private location: rotate via `keytool -storepasswd`
  / `-keypasswd` (the private key — and thus app update identity — is preserved).**

## Rollback
No DB. Code rollback = `git revert` the merge commit. Device rollback = reinstall the backed-up
previous APK (`adb uninstall com.mfsglobal.ops` → `adb install ~/mfs-apk-backups/mfs-ops-PREVIOUS-debug-backup.apk`).
Note: reverting to the debug-signed backup requires an uninstall (different key).

## Verdict

✅ CLEARED FOR PRODUCTION

(Build-signed + not-debuggable static checks pass; on-device install, login, print-fires, and
MFS-icon confirmed by Hakan on the physical V3. The die-cut label-sizing fit is a separate,
pre-existing follow-up, not a blocker for the signed-build goal.)
