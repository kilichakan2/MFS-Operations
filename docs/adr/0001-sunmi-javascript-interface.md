# ADR-0001 — Use addJavascriptInterface for Sunmi V3 native bridge

## Status
Accepted — 2026-05-12

## Context
The MFS Operations PWA runs on iPad (via Safari/standalone) and on Sunmi V3 handhelds (via a Capacitor Android shell pointing at `https://mfsops.com`). The V3 has a built-in 58mm thermal printer; staff need to tap a print button on a delivery card and have the label print silently with no dialog.

The initial implementation (committed 2026-05-12 as `feat(sunmi): Capacitor silent printing for V3`) used Capacitor's plugin bridge with `@kduma-autoid/capacitor-sunmi-printer` to reach the Sunmi SDK. On the V3 it never worked — every tap silently fell through to the iPad iframe `window.print()` path.

Diagnosis via Chrome DevTools (chrome://inspect) attached to the V3 WebView:
- `window.Capacitor` is `undefined` on `https://mfsops.com`
- Therefore `Capacitor.isNativePlatform()` cannot be reached
- Therefore `@kduma-autoid/capacitor-sunmi-printer`, which lives behind `window.Capacitor`, is unreachable from JavaScript

Root cause: Capacitor 8's plugin bridge relies on `WebView.addDocumentStartJavaScript`, which requires WebView 102+ (the `DOCUMENT_START_SCRIPT` feature flag). The Sunmi V3's bundled WebView is older than this. Capacitor's documented fallback only injects into pages served by Capacitor itself (the local bundled HTML); it does **not** inject into remote URLs.

## Decision
Bypass Capacitor's plugin bridge for the Sunmi printer. In `MainActivity.java`, after Capacitor's `BridgeActivity.onCreate()` finishes, retrieve the WebView and call:

```java
webView.addJavascriptInterface(new SunmiPrintBridge(this), "MFSSunmiPrint")
```

This is Android's lower-level, platform-stable JS-bridge API. It works on every WebView version since API 17 and does not depend on Capacitor. The bridge is injected into every frame regardless of WebView version or page origin.

`SunmiPrintBridge.java` talks to `com.sunmi:printerlibrary:1.0.24` (Sunmi's own SDK) directly using the standard `InnerPrinterManager.getInstance().bindService(...)` pattern. The kduma Capacitor wrapper is removed entirely — both the npm package and any Java references.

The JS side detects the bridge by checking for `window.MFSSunmiPrint` (see `lib/printing/sunmi.ts` — `isSunmiNative()`). No Capacitor APIs are touched.

## Consequences

### Easier
- Works on the V3's older WebView immediately; no system update or APK-bundled WebView upgrade required
- Single, vendor-maintained dependency (`com.sunmi:printerlibrary:1.0.24`); no third-party Capacitor plugin to drag along
- `sendRAWData(byte[], InnerResultCallback)` is available on the same SDK as an ESC/POS escape hatch — no extra dependency if the high-level API misbehaves on V3 specifically
- JS detection collapses to one line: `!!window.MFSSunmiPrint`

### Harder
- We now own the Java code that other apps would inherit from a Capacitor plugin. Future printer methods (label mode, paper cut, image printing) require Java additions, not just `@SunmiPrinter.method()` calls.
- Capacitor's typed promise wrappers are gone — the JS side calls `void`-returning bridge methods and trusts they completed. Error reporting comes via Android logcat (`adb logcat -s MFSSunmiPrint:*`) rather than JS exceptions.

### Security
`addJavascriptInterface` exposes the bridge to every frame in the WebView, including iframes, with no origin-based access control. This is documented by Android: due to the asynchronous behaviour of WebView, it isn't possible to safely determine the URL of the frame calling the interface.

Mitigation:
- The bridge exposes **only** printing methods — no file access, no network calls, no auth tokens, no storage. The worst case if `mfsops.com` is XSS'd is a malicious actor spamming labels until the paper runs out.
- `MainActivity` restricts WebView navigation to `https://mfsops.com` and `https://www.mfsops.com` via `shouldOverrideUrlLoading`. Defence-in-depth — not a substitute for the above.

**Future Java methods on this bridge MUST be print-related only.** Adding any method that touches filesystem, credentials, arbitrary HTTP, or user data is forbidden without a new ADR superseding this one. This rule is the entire reason the bridge surface is safe at all.

### Neutral
- Capacitor stays as the Android shell — we still benefit from its lifecycle, `cap sync`, and project scaffolding. We just stop using its plugin bridge for the printer.
- The kduma plugin remains a valid choice for projects that bundle their web content into the APK (where Capacitor's bridge does inject). Our case — remote URL pointing at a deployed Next.js app — is what makes it unworkable.

## Follow-ups outside this ADR's scope
- If/when the V3 fleet is on a WebView that supports `WebMessageListener` (API 26+ with WebView 88+), reconsider migration: `WebMessageListener` has origin-bound access control and is the modern replacement for `addJavascriptInterface`. Not urgent — current bridge is single-purpose and on a controlled domain.
- ESC/POS via `sendRAWData` is documented as the fallback if the high-level Sunmi API misbehaves on V3 specifically. No code or tests for it until a real failure surfaces.
