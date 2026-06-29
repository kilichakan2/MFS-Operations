# 0011 — Android release signing, keystore custody, and versioning

## Status

Accepted (ratified by planner 2026-06-29, F-PROD-04 Pass 2b)

## Context

F-PROD-04 Pass 2b replaces the fragile DEBUG build of the MFS Operations Sunmi V3
Android app with a proper RELEASE-SIGNED APK. Verified current state of
`android/app/build.gradle`: `versionCode 1`, `versionName "1.0"`, **no `signingConfig`**
(a release build would be unsigned), `minifyEnabled false` (no R8/proguard — safe for the
Capacitor WebView + the native Sunmi bridge). `MainActivity.java:13` calls
`WebView.setWebContentsDebuggingEnabled(true)` unconditionally (on in every build). The app
is a Capacitor remote-URL shell (`capacitor.config.ts` → `https://mfsops.com`,
`cleartext: false`) with the native print bridge `window.MFSSunmiPrint` injected in
`MainActivity` (ADR-0001). No keystore exists anywhere in the repo or machine.

A signing key is the permanent identity of the app: an installed app can only be updated
by an APK signed with the **same** key, and that key can **never be rotated**. Losing it
means you can never ship an update to the same app — every device must uninstall and
reinstall a freshly-keyed build. This makes keystore custody a hard-to-reverse decision.

The current install is debug-signed; the release APK uses a different key, so the V3 must
**uninstall then install** (Android refuses an in-place update across a key change). That
one-time wipe clears the device's offline cache + saved login (staff re-login once) — which
also clears the original stale-cookie break that started F-PROD-04.

## Decision

1. **Generate a fresh release keystore.** Hakan runs `keytool` himself (via the `!` prompt)
   and types the passwords — they never enter the agent transcript or git. The `.jks` is
   stored **outside the repository** and backed up, with its passwords, in Hakan's password
   manager. Validity ≥ 25 years.
2. **`build.gradle` reads signing secrets from a gitignored `android/keystore.properties`**
   (keystore path, store password, key alias, key password). The properties file and any
   `*.jks` / `*.keystore` are gitignored; the secret-scan hook is expected to block any
   attempt to commit them.
3. **`signingConfig` applied to the `release` buildType only**; `minifyEnabled` stays
   `false`. If `keystore.properties` is absent, the release signingConfig is skipped (so a
   fresh checkout without the secret still configures/builds debug).
4. **Web-contents debugging gated to debug builds** — `if (BuildConfig.DEBUG)
   WebView.setWebContentsDebuggingEnabled(true);` — off in release.
5. **Versioning:** `versionCode 1 → 2`, `versionName "1.0" → "1.1"`; thereafter `versionCode`
   increments by 1 per release.
6. **Sideload-first.** Build a release-signed APK and `adb install` it on the V3 (after
   `adb uninstall com.mfsglobal.ops`). Google Play publishing is deferred to a separate
   follow-up (account exists).
7. **This ADR file contains no passwords.**

## Consequences

### Easier
- A trustworthy, signed production app instead of a debug build; web-debugging off in release.
- A documented, repeatable "how to cut a new signed build" path (the gradle wiring + the
  keystore.properties contract).
- Future signed updates install in-place on the V3 with no wipe.

### Harder
- The keystore is now a critical, unrotatable secret — its loss means no future updates to
  the installed app. Custody (outside git + password-manager backup) is load-bearing.
- A one-time uninstall+reinstall on the V3 (loses offline cache + login → staff re-login
  once) because the signing key changes from debug to release.
- A fresh checkout cannot produce a release-signed build without obtaining the keystore +
  `keystore.properties` out of band (by design).

### Neutral
- Build environment present (JDK 21, `gradlew`, `adb`, `ANDROID_HOME`, SDK 36); no new tooling.
- ANVIL cannot web-test an APK — verification is build/static checks + the manual on-device
  print test. Not a regression-suite concern.
