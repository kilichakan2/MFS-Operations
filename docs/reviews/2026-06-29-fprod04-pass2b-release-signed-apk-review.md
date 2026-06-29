# Code review — F-PROD-04 Pass 2b — release-signed APK

- **Date:** 2026-06-29
- **Branch / PR:** `fprod04-pass2b-release-signed-apk` / PR #100 (base `main`)
- **Reviewer:** code-critic (FORGE Guard)
- **Verdict:** **SHIP — no blockers** (hand to ANVIL for the `assembleRelease` compile/sign proof + on-device print test)

## Scope
Android build/release engineering: turn the fragile DEBUG build into a release-signed APK.
Not app code, not hexagonal. 5 files changed (3 build/native, 2 docs).

## Required-check results
1. **No secrets in git — PASS (headline check).** `git diff main...branch` and
   `git log -p main..branch` contain NO real password, NO key material, NO
   `*.jks`/`*.keystore`/`keystore.properties` file. Only hits are doc placeholders
   (`storePassword=<the store password he typed>`, `docs/plans/...md:195,197`).
   `android/.gitignore:56-58` ignores `*.jks`/`*.keystore`/`keystore.properties`;
   `git ls-files` tracks none. (The session-transcript password exposure is a separate
   accepted-risk Hakan owns; it did NOT reach git.)
2. **`buildConfig = true` present — PASS.** `android/app/build.gradle:24-26`, inside
   `android { }`. Required because AGP 8.13.0 has BuildConfig OFF by default — without it
   `BuildConfig.DEBUG` in MainActivity wouldn't compile. The top correctness risk; handled.
3. **signingConfig conditional — PASS.** `build.gradle:1-7` loads props guarded by
   `if (keystorePropsFile.exists())`; `signingConfigs.release` (28-37) reads
   storeFile/storePassword/keyAlias/keyPassword; `buildTypes.release` attaches it only inside
   a second `.exists()` guard (42-44). Keystore-less clone/CI builds debug without NPE.
   `minifyEnabled false` retained; `versionCode 2`, `versionName "1.1"`. `rootProject.file`
   resolves to `android/keystore.properties` correctly.
4. **MainActivity gating — PASS.** `setWebContentsDebuggingEnabled(true)` now wrapped in
   `if (BuildConfig.DEBUG)`, `import com.mfsglobal.ops.BuildConfig;` added (package matches
   `namespace`). Sunmi bridge injection, navigation guard, onDestroy byte-identical.
5. **No web-code/deps/DB changes — PASS.** `git diff -- 'app/**' 'lib/**' 'components/**'`
   empty; no package.json/lock change; no gradle dep change; no migration/RLS/DB.

## 🟢 Good
- Double `.exists()` guard for clone/CI safety (genuinely correct).
- BuildConfig import package matches `namespace` — avoids the common silent failure.
- ADR-0011 flipped to Accepted; states (truthfully) it contains no passwords.
- `keystore.properties` gitignored — the realistic accidental-commit vector is covered.

## 🔵 Nice-to-have (non-blocking)
- `signingConfigs.release { if (...) {...} }` yields a syntactically-empty release signing
  config on a keystore-less clone — harmless (never attached, guard at line 42), but a
  one-line comment or hoisting the block behind `.exists()` would read clearer.
  (`build.gradle:28-37`)
- The on-device 4-case print matrix is the real clearance gate (no automated APK proof) —
  ANVIL/conductor must surface this human gate, not skip it.

## Build / test status
- Gradle build **sandbox-DENIED** (`./gradlew :app:assembleDebug` blocked by environment, not
  a failure). Compile/sign proof deferred to ANVIL: `assembleRelease` + `apksigner verify
  --print-certs` (cert == keystore) + `aapt dump badging | grep debuggable` (expect none) +
  on-device print matrix.
- Web suite not run — correctly (zero web-code/dep changes by inspection).

## Hex / depth
- **N/A** — Android build config + one Java gating line; no port/adapter/`lib/**`. Pass-2a
  Printer port untouched. No new module to grade.

## Loop-back
None. No blockers → ANVIL.
