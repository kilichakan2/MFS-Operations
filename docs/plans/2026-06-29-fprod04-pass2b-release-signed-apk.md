# F-PROD-04 Pass 2b — Release-signed APK (Android build/release engineering)

**Date:** 2026-06-29
**Type:** Android build config + signing + one MainActivity hardening line. NO web/app code.
**ADR:** `docs/adr/0011-android-release-signing.md` (status Proposed → ratifies to **Accepted** on approval of this plan).
**No-AI-references rule:** This unit OVERRIDES the global git-trailer instruction. NO Claude/AI references in any commit message, PR body, code, or comment.

```
F-PROD-04 Pass 2b · "release-signed APK"
  USER prereq ○ → build.gradle signing ○ → MainActivity gate ○ → build+verify ○ → device cutover ○ → on-device print test ○
  touching: android/app/build.gradle · MainActivity.java · android/.gitignore (verify) · android/keystore.properties (USER, gitignored)
  🗣 swapping the app's "ID card" from a throwaway debug key to a real release key — one-time device wipe, then in-place updates forever
```

🗣 **Plain English for the whole unit:** Right now the Android app on the Sunmi V3 is built in "debug" mode — like shipping a building with the contractor's temporary lock still on the door. This unit installs the real, permanent lock (a release signing key that Hakan owns and backs up), turns off the developer's debug peephole in the shipping build, and bumps the version number. Because the lock changes, the V3 must be unlocked-and-relocked once (uninstall + reinstall, staff re-login once), after which all future updates slot in without a wipe.

---

## Goal

Replace the unsigned/debug release build with a **release-signed APK** for `com.mfsglobal.ops`, built locally and sideloaded onto the connected Sunmi V3. Signing secrets live in a gitignored `android/keystore.properties`; the keystore lives outside the repo. Web-contents debugging is gated to debug builds only. Version bumps to `2` / `"1.1"`.

🗣 We end with one trustworthy installable file, signed with a key only Hakan holds, with the dev backdoor closed in the shipped version.

---

## Domain terms

- **Keystore (`.jks`)** — the file holding the app's permanent signing key. 🗣 The master key that proves "this update really came from us"; Android refuses any update not signed by it, and it can never be changed once you've shipped with it. Lose it = you can never update the installed app again.
- **`signingConfig`** — the gradle block that tells the build which key to sign with. 🗣 The instruction "use this key to stamp the package."
- **`keystore.properties`** — a gitignored text file with the keystore path + passwords that `build.gradle` reads at build time. 🗣 The sealed envelope holding the key's location and passwords; it stays on Hakan's machine and never goes into git.
- **`BuildConfig.DEBUG`** — a generated boolean that is `true` in a debug build and `false` in a release build. 🗣 A flag the app can read to ask "am I the throwaway dev build or the real one?" — used to keep the debug peephole open only in dev.
- **`versionCode` / `versionName`** — an integer Android compares to allow updates, and a human-readable label. 🗣 The internal build counter (must always go up) and the friendly "1.1" sticker.
- **Sideload (`adb install`)** — installing an APK directly over USB instead of via an app store. 🗣 Handing the file straight to the device by cable, no store involved.
- **`apksigner verify`** — a tool that reports which key an APK was signed with. 🗣 The receipt-checker that proves the package carries the real release stamp, not the debug one.

---

## Compliance / scope flags

- **NO migration / RLS / DB surface.** Nothing touches Postgres, Supabase, or any data layer.
- **ZERO new npm deps; ZERO new Gradle deps.** No `package.json` or gradle dependency changes.
- **No web/app-code change** except the single `MainActivity.java` gating line (+ its import) and the gradle `buildConfig` enablement that backs it.
- **Secrets never committed.** The keystore and `keystore.properties` stay gitignored and are NEVER staged. The secret-scan PreToolUse hook is EXPECTED to block any commit that includes them — that block is correct behaviour, not an error to work around.

## Hex / architecture check

**Hexagonal ports/adapters check = N/A (build config).** 🗣 The Lego "one plug per socket" rule is about swapping web vendors (DB, auth, payments) behind app-owned interfaces. This unit changes Android build/signing config and one Java line — there is no port, no adapter, no vendor SDK swap, no `lib/**` file touched. Nothing to verify against the hex rules; forcing a port/adapter verdict here would be noise. The Printer transport port already shipped in Pass 2a (PR #99) and is untouched here.

## ADR conflicts

None. This plan IS the implementation of ADR-0011, which is consistent with ADR-0001 (the Sunmi bridge via `window.MFSSunmiPrint`, left untouched). No other ADR governs Android build/signing.

---

## Exact files to change (committed)

| File | Change |
|------|--------|
| `android/app/build.gradle` | Load `keystore.properties` (conditional), add `release` `signingConfig`, bump version, enable `buildConfig` feature |
| `android/app/src/main/java/com/mfsglobal/ops/MainActivity.java` | Gate `setWebContentsDebuggingEnabled(true)` behind `BuildConfig.DEBUG` + add import |
| `android/.gitignore` | **VERIFY ONLY — already done** (lines 55–58 cover `*.jks`, `*.keystore`, `keystore.properties`). Add only if missing. |
| `docs/adr/0011-android-release-signing.md` | Status `Proposed` → `Accepted` |

## Files the USER creates (NEVER committed, gitignored)

- `~/keys/mfs-ops-release.jks` (or Hakan's chosen path outside the repo) — the keystore.
- `android/keystore.properties` — the signing secrets envelope.

---

## CRITICAL pre-flight finding (read before Step 2)

**AGP 8.13.0 (confirmed in `android/build.gradle:10`) ships with `BuildConfig` generation OFF by default.** Since AGP 8.0, the `buildConfig` build feature must be explicitly enabled, and `android/gradle.properties` does NOT set `android.defaults.buildfeatures.buildconfig=true`. Therefore `BuildConfig.DEBUG` in MainActivity (Step 3) **will not compile** unless the `buildConfig` feature is turned on.

🗣 The flag the app wants to read ("am I a debug build?") isn't even generated by default in this build-tool version. We must switch on its generation, or the new code won't compile. This is the single most likely thing to break the build — Step 2 handles it explicitly.

**Mitigation built into the plan:** Step 2 enables `android.buildFeatures.buildConfig = true` in `android/app/build.gradle` as part of the same commit, and Step 4's build is the proof it compiles.

---

## Numbered steps

### Step 0 — USER-DONE PREREQUISITE: generate the keystore (NOT committed, NOT run by implementer)

Hakan runs this himself in his own terminal (passwords typed interactively, never pasted into any agent transcript):

```
keytool -genkeypair -v \
  -keystore ~/keys/mfs-ops-release.jks \
  -alias mfs-ops \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storetype JKS
```

🗣 This mints the permanent master key. `-validity 10000` ≈ 27 years (ADR-0011 requires ≥ 25). `keytool` will prompt for a store password, the key (alias) password, and a name/org — type them by hand. **Back up the `.jks` file AND both passwords in the password manager immediately** — if this file is lost, the app can never be updated again (every device would need a wipe + reinstall).

**Acceptance:** the file `~/keys/mfs-ops-release.jks` exists and Hakan has recorded both passwords + the alias `mfs-ops` in his password manager.

### Step 0b — USER-DONE PREREQUISITE: create `android/keystore.properties` (gitignored, NEVER staged)

Hakan creates `android/keystore.properties` with exactly these four keys (no quotes, real values):

```
storeFile=/Users/hakankilic/keys/mfs-ops-release.jks
storePassword=<the store password he typed>
keyAlias=mfs-ops
keyPassword=<the key password he typed>
```

🗣 The sealed envelope `build.gradle` opens at build time to find the key and its passwords. It MUST stay out of git — the secret-scan hook will (correctly) block any attempt to commit it. Use an absolute path for `storeFile` so it resolves regardless of build directory.

**Acceptance:** `android/keystore.properties` exists with all four keys; `git status` does NOT list it (it is gitignored).

### Step 1 — VERIFY `.gitignore` protection (likely already done; add only if missing)

Open `android/.gitignore`. Confirm these three lines exist (they currently do — lines 55–58 from the conductor's pre-work):

```
*.jks
*.keystore
keystore.properties
```

🗣 The locked spec says the conductor added these BEFORE Hakan created the secret file. This step is idempotent: if all three are present, change nothing. If any is missing, append it under a clearly-labelled keystore section. Also confirm `*.apk` / `*.aab` are present (lines 4 & 7 — they are).

**If no change is needed, Step 1 produces no commit.** If a line was missing, commit message: `chore(android): ignore release keystore + signing secrets`.

**Acceptance:** all three keystore patterns present in `android/.gitignore`; no keystore/secret file is git-trackable.

### Step 2 — wire conditional release signing + enable buildConfig + bump version in `android/app/build.gradle` (ONE commit)

Edit `android/app/build.gradle`. Make these edits:

**(a) Top of file** — after `apply plugin: 'com.android.application'` (line 1), add the Properties load:

```gradle
// Release signing secrets are read from a gitignored android/keystore.properties.
// Absent on a fresh checkout / CI -> release signingConfig is skipped (debug still builds).
def keystorePropsFile = rootProject.file("keystore.properties")
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) {
    keystoreProps.load(new FileInputStream(keystorePropsFile))
}
```

Note: `rootProject.file("keystore.properties")` resolves to `android/keystore.properties` because `android/` is the Gradle root project here. 🗣 Looks for the envelope; if it's not there (a clone without the secret), it just carries on and the release-signing wiring below is skipped.

**(b) Inside `android { ... }`** — add the `buildConfig` feature (REQUIRED — see CRITICAL pre-flight finding) and the `signingConfigs` block. Add a `buildFeatures` block:

```gradle
    buildFeatures {
        buildConfig = true
    }
    signingConfigs {
        release {
            if (keystorePropsFile.exists()) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
```

**(c) `defaultConfig`** — bump version (lines 10–11):

```gradle
        versionCode 2
        versionName "1.1"
```

**(d) `buildTypes.release`** (lines 19–24) — conditionally attach the signingConfig, KEEP `minifyEnabled false`:

```gradle
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            if (keystorePropsFile.exists()) {
                signingConfig signingConfigs.release
            }
        }
    }
```

🗣 The `if (keystorePropsFile.exists())` guard appears twice on purpose: once so a secret-less clone doesn't try to read missing passwords, once so it doesn't attach an empty signingConfig. With the secret present, the release build gets stamped with the real key. `buildConfig = true` is what makes `BuildConfig.DEBUG` exist for Step 3.

**Versioning scheme to document (in the commit body and already in ADR-0011):** every future release bumps `versionCode` by exactly +1 (`2 → 3 → 4 …`); `versionName` is a human label bumped at the team's discretion. 🗣 The internal counter must only ever go up or Android refuses the update.

**Commit message:** `build(android): release signing via gitignored keystore.properties + version 1.1 (code 2)`

**Acceptance:** gradle config parses; with `keystore.properties` present the release build is signed; with it absent the project still configures and debug builds (proven structurally — CI/clone safety).

### Step 3 — gate web-debugging to debug builds in `MainActivity.java` (same or adjacent commit)

Edit `android/app/src/main/java/com/mfsglobal/ops/MainActivity.java`:

**(a)** Add the import alongside the existing imports (after line 7):

```java
import com.mfsglobal.ops.BuildConfig;
```

**(b)** Replace line 15:

```java
        WebView.setWebContentsDebuggingEnabled(true);
```

with:

```java
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
```

Leave everything else (the Sunmi bridge injection, `addJavascriptInterface(... "MFSSunmiPrint")`, the mfsops.com navigation guard, `onDestroy`) BYTE-IDENTICAL.

🗣 The dev peephole (Chrome remote-inspect of the WebView) now opens only in debug builds and is off in the release the staff run. Nothing about printing or navigation changes.

**Commit message:** `fix(android): disable WebView debugging in release builds`

**Acceptance:** release build compiles (proves `BuildConfig` is generated — Step 2(b) worked); debug build still enables debugging.

### Step 4 — build + verify the APK is release-signed and not debuggable (build checks)

From the repo root:

```
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk` (gitignored via `*.apk`).

**Verify it is signed with the RELEASE key** (use whichever is on PATH; `apksigner` lives under `$ANDROID_HOME/build-tools/<ver>/`):

```
apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

Expected: prints a certificate whose SHA-256 matches the `mfs-ops` release key (NOT the Android debug cert, whose CN is `CN=Android Debug,O=Android,C=US`). Cross-check against the keystore's own cert:

```
keytool -list -v -keystore ~/keys/mfs-ops-release.jks -alias mfs-ops
```

The SHA-256 fingerprints must match.

**Verify it is NOT debuggable:**

```
aapt dump badging android/app/build/outputs/apk/release/app-release.apk | grep -i debuggable
```

Expected: NO `application-debuggable` line (release builds are non-debuggable unless `android:debuggable` is forced, which the manifest does not do).

🗣 Two receipts: (1) the package carries Hakan's real stamp, not the throwaway debug stamp; (2) the shipped app can't be remote-inspected. If `apksigner` isn't found, locate it under `$ANDROID_HOME/build-tools/`.

**Acceptance:** `assembleRelease` succeeds; APK cert SHA-256 == keystore cert SHA-256; not debuggable; `versionCode 2` / `versionName 1.1` shown by `aapt dump badging`.

### Step 5 — device cutover on the connected V3 (one-time, key change forces uninstall)

The V3 is connected + authorized (`adb devices` → `VA94262640290 device product:V3 model:V3`).

**(a) BACK UP the current installed (debug) APK first** — rollback artifact, stored OUTSIDE the repo (or a gitignored path):

```
adb shell pm path com.mfsglobal.ops
# → package:/data/app/.../base.apk
adb pull /data/app/.../base.apk ~/keys/mfs-ops-debug-backup.apk
```

🗣 Grab a copy of what's currently on the device so we can put it back if the signed build misbehaves.

**(b) Uninstall the current install** (REQUIRED — Android refuses an in-place update across a key change; Hakan approved the wipe):

```
adb uninstall com.mfsglobal.ops
```

🗣 This clears the device's offline cache + saved login. That's the approved one-time cost — and it also wipes the original stale-cookie break that started F-PROD-04. Staff re-login once afterward.

**(c) Install the release-signed APK:**

```
adb install android/app/build/outputs/apk/release/app-release.apk
```

🗣 From now on, future release-signed updates install in-place with `adb install -r` — no more wipes, because the key no longer changes.

**Acceptance:** `adb install` reports `Success`; the app launches on the V3; backup APK saved outside the repo.

### Step 6 — on-device print verification checklist (THE final proof — ANVIL can't web-test an APK)

**Precondition:** staff (or Hakan) re-login on the device first (the uninstall cleared the old session; a fresh signed cookie is needed — this is also the fix the whole F-PROD-04 line was about).

With the V3 connected and the release app open, navigate to `/haccp/delivery` and run each case. Pass criteria are explicit:

| # | Action | Expected (PASS criterion) |
|---|--------|---------------------------|
| 1 | Tap a **58mm delivery** print | **SILENT NATIVE print** via the Sunmi bridge — paper feeds, NO browser/AirPrint dialog appears |
| 2 | Trigger the **iframe / AirPrint fallback** path (the non-native print route) | The HTML print preview / iframe path renders and prints (or shows the system print sheet) — proves the fallback still works |
| 3 | Tap a **100mm delivery** print | **iframe** path (100mm is not the native 58mm bridge path) — renders via the print iframe |
| 4 | Do a **mince** print | **iframe** path — renders via the print iframe |

🗣 Case 1 proves the native Sunmi printer still works through the release build (the whole point — the bridge must survive signing/build changes). Cases 2–4 prove the non-native fallback printing is unaffected. If case 1 prints silently and 2–4 show the iframe/print path, the build is good.

**Acceptance:** all four cases meet their PASS criterion. The clearance cert rests on **(a) the Step-4 build-signed + not-debuggable check** and **(b) this human on-device print test** — there is no automated web test that can prove an APK.

### Step 7 — ratify ADR-0011

Edit `docs/adr/0011-android-release-signing.md`: change the Status line from `Proposed (...)` to `Accepted (2026-06-29)`.

**Commit message:** `docs(adr): accept ADR-0011 android release signing`

---

## TDD / test plan (right-sized — there is NO web test that proves an APK)

🗣 Normally we'd write a failing test first. Here the "tests" are build/static checks and a human print test, because nothing in an automated web suite can exercise an Android APK.

1. **Build check (static):** `./gradlew assembleRelease` succeeds (proves the gradle wiring + `buildConfig` enablement + `BuildConfig.DEBUG` compile). RED before Step 2/3 would be a compile failure on `BuildConfig`; GREEN after.
2. **Signed-with-release-key check:** `apksigner verify --print-certs` cert SHA-256 == keystore cert SHA-256 (NOT the debug cert).
3. **Not-debuggable check:** `aapt dump badging | grep debuggable` returns nothing.
4. **Conditional-skip check (clone safety):** reasoning/structural — with `keystore.properties` absent, the two `if (keystorePropsFile.exists())` guards skip release signing so the project still configures + builds debug. (No need to physically delete the secret; the guards make this self-evident.)
5. **On-device print checklist (Step 6):** the four-case manual matrix — the only proof the printing path survives the new build.
6. **Web suite UNAFFECTED (no-op confirmation):** this unit changes ZERO web code, so the existing unit / `@critical` suites are logically unaffected. **No re-run is required** — note this explicitly; do NOT propose pgTAP / integration / PITR.

---

## Acceptance criteria (whole unit)

- `android/app/build.gradle`: conditional release `signingConfig` reading from gitignored `keystore.properties`; `buildConfig = true`; `minifyEnabled false` retained; `versionCode 2` / `versionName "1.1"`.
- `MainActivity.java`: `setWebContentsDebuggingEnabled(true)` gated behind `BuildConfig.DEBUG` + `BuildConfig` import; everything else byte-identical.
- `android/.gitignore` protects `*.jks`, `*.keystore`, `keystore.properties` (verified; no secret committable).
- `assembleRelease` produces an APK signed with the release key (cert SHA-256 matches keystore) and NOT debuggable, version 2 / 1.1.
- V3 cutover done: prior APK backed up outside repo → uninstall → install signed APK → staff re-login → all four on-device print cases PASS.
- ADR-0011 status = Accepted. NO passwords in any committed file. NO AI references in any commit/PR/comment.

---

## Risk Assessment (mandatory)

### Build / launch blockers

- **`BuildConfig` not generated under AGP 8.13.0 → MainActivity won't compile.** — **Severity: HIGH. MUST-FIX (already designed in).** Since AGP 8.0, `buildConfig` is OFF by default and `gradle.properties` does not enable it. Without Step 2(b)'s `buildFeatures { buildConfig = true }`, `BuildConfig.DEBUG` in Step 3 fails to compile and `assembleRelease` errors. **Mitigation:** Step 2(b) enables it in the same commit; Step 4's build is the proof. 🗣 The flag the new code reads doesn't exist by default in this build-tool version — we switch on its generation, or the build dies.
- **`keystore.properties` `storeFile` path wrong / relative → gradle can't find the keystore.** — Severity: MEDIUM. **Mitigation:** Step 0b mandates an ABSOLUTE path; Step 4's signed-cert check catches it immediately (build fails or signs with no/wrong key). 🗣 If the envelope points at the wrong drawer, the build can't find the key — caught instantly at verify.
- **`apksigner` / `aapt` not on PATH.** — Severity: LOW. **Mitigation:** they live under `$ANDROID_HOME/build-tools/<ver>/` (ANDROID_HOME is set); invoke by full path if needed.

### Security

- **Keystore or passwords leaking into git.** — **Severity: CRITICAL. MUST-FIX (mitigated).** A committed signing key is an irrevocable secret leak. **Mitigation:** `.gitignore` covers `*.jks` / `*.keystore` / `keystore.properties` (Step 1 verifies); the secret-scan PreToolUse hook is a second wall and is EXPECTED to block any such commit; ADR + plan forbid passwords in committed files; Step 0/0b are USER-DONE and the implementer never sees passwords. 🗣 Three walls (gitignore, the scan hook, never-staged discipline) keep the master key out of history — where it could never be fully scrubbed.
- **Debug peephole left on in release.** — Severity: MEDIUM (now mitigated). The current unconditional `setWebContentsDebuggingEnabled(true)` lets anyone remote-inspect the production WebView. **Mitigation:** Step 3 gates it to `BuildConfig.DEBUG`; Step 4's `aapt dump badging` + a release run confirm it's off. 🗣 This unit's whole security win — the production app can no longer be cracked open with a debugger.

### Data migration

- **No material risks in this category.** No DB, no schema, no migration, no RLS. The only "data" event is the one-time device cache + login wipe in Step 5, which is approved and intentional (and clears the original stale-cookie bug).

### Business-logic flaws

- **Printing path silently regresses after the build change.** — **Severity: HIGH. MUST-FIX gate = the on-device test.** The Sunmi native bridge and the iframe fallback are the app's reason to exist; a build/signing change must not break them. There is no automated proof. **Mitigation:** Step 6's four-case on-device matrix with explicit PASS criteria is the mandatory clearance gate; rollback (Step 5a backup) is available if any case fails. 🗣 We can't unit-test an APK's printer — the human print test IS the test, and it's required before clearance.
- **`versionCode` collision / regression.** — Severity: LOW. Going `1 → 2` is a strict increase; documented +1 scheme prevents future "can't update" errors. 🗣 The counter only ever goes up, so updates never get refused.

### Concurrency / race conditions

- **No material risks in this category.** No concurrent code paths added; build + install are sequential single-operator steps.

### Operational / irreversibility

- **Permanent, unrotatable keystore — loss = no future updates.** — **Severity: HIGH (inherent, mitigated by custody).** Once shipped, the app can ONLY be updated by an APK signed with this exact key; the key can never be rotated. **Mitigation:** Step 0 mandates immediate backup of the `.jks` + passwords in the password manager, stored outside the repo (ADR-0011 §Consequences). This is custody, not code — flag it to Hakan plainly. 🗣 This file is now the app's permanent identity card; lose it and every device needs a full wipe-and-reinstall to ever update again. Back it up the moment it's created.

### MUST-FIX summary (Gate 2 blockers — all resolved within this plan)

1. **`buildConfig` must be enabled** (Step 2b) — else the build won't compile. Designed in.
2. **Keystore/passwords must never reach git** (Step 1 + hook + never-staged) — designed in.
3. **On-device print test must PASS** (Step 6) — the mandatory clearance gate; no automated substitute.
4. **Keystore backup custody** (Step 0) — USER-DONE, irreversible if skipped; flagged to Hakan.

None of these block the plan from proceeding — they are all addressed by the plan's own steps — but #3 (on-device print test) and #4 (keystore backup) are human-action gates the conductor must surface before clearance.

## Out of scope (BACKLOG pointers)

- **Google Play publishing** — deferred to a separate follow-up (the account exists). Sideload-only here. Add/keep a BACKLOG entry: `F-PROD-04 Pass 3+ — Google Play release track for the signed APK`.
- Real allergens on the delivery label (existing F-PROD-04 Pass 3) — unrelated, untouched.

## Rollback

If the signed build misbehaves on the V3:

```
adb uninstall com.mfsglobal.ops
adb install ~/keys/mfs-ops-debug-backup.apk
```

🗣 Put the old build back from the Step-5a backup. (Note: the old build still carries the stale-cookie weakness — rollback is a stopgap, not a destination.)
