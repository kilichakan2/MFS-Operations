# Sunmi V3 Silent Printing — Bridge Fix
**Created:** 2026-05-12
**Supersedes:** the Android-side of `2026-05-12-sunmi-capacitor-print.md` (JS-side label content kept; native plugin layer replaced)

## Goal
Tap the blue 58mm print button on a delivery card on the Sunmi V3 → label prints silently on the V3's built-in 58mm printer. No dialog, no card open. All other devices (iPad, browser) keep the existing `window.print()` → AirPrint path unchanged.

## Why this plan exists
The previous plan (`2026-05-12-sunmi-capacitor-print.md`) used Capacitor's bridge + `@kduma-autoid/capacitor-sunmi-printer` to call the Sunmi printer. The diagnosis from the previous session, confirmed via Chrome DevTools on the V3 WebView: **`window.Capacitor` is `undefined` on `https://mfsops.com`**. Capacitor 8's `addDocumentStartJavaScript` requires WebView 102+ (`DOCUMENT_START_SCRIPT` feature); the V3's WebView is older, and Capacitor's fallback only injects into locally-served pages, not remote URLs. Result: `isSunmiCapacitor()` always returns false → V3 silently fell through to `window.print()` instead of silent printing.

Fix: bypass Capacitor's bridge entirely with `webView.addJavascriptInterface(...)`, which injects into every frame regardless of WebView version or page origin. Drop the kduma plugin layer (it added compile-time complexity for no run-time value once Capacitor is out of the picture) and talk to Sunmi's own SDK `com.sunmi:printerlibrary:1.0.24` directly. Same SDK exposes `sendRAWData(byte[], InnerResultCallback)` as a documented escape hatch if the high-level API misbehaves on V3.

## Domain terms used
- **Goods In** — incoming delivery from supplier; label format `GI-DDMM-ORIGIN-NNN` (defined in `docs/LABEL_PRINTING_PLAN.md`)
- **58mm label** — short receipt-style label for per-package marking on V3 built-in printer (distinct from 100mm BLS-compliant goods-in label printed on AirPrint / TSC)
- **BLS** — Born, Reared, Slaughtered, Cut traceability fields (already defined elsewhere in the codebase)
- **Bridge** — Java object exposed to JavaScript via `addJavascriptInterface`, accessible at `window.MFSSunmiPrint` inside the V3 APK shell

⚠️ No new business terms introduced. No `CONTEXT.md` to update (repo doesn't have one).

## Compliance
**NO** — this is a print transport mechanism. Label content, batch code formats, BLS fields, allergen text, FSA/SALSA-required information are all unchanged. No HACCP form, training document version, temperature limit, or legislation reference is touched.

`DOCUMENT_CONTROL.md` **does not** need updating for this work.

## ADR conflicts
**None exist to conflict with** — `docs/adr/` doesn't yet exist.

This plan **proposes ADR-0001** documenting the architectural decision to use `addJavascriptInterface` rather than Capacitor's plugin bridge. The ADR is created as Step 11 of this plan. Future Sunmi/native-bridge work must read it.

## Files to change

### JS / Next.js side (committed from sandbox)
| File | Change |
|---|---|
| `package.json` | Remove `@kduma-autoid/capacitor-sunmi-printer`. Keep `@capacitor/{core,cli,android}` (Capacitor Android shell stays — only its plugin bridge is bypassed) |
| `capacitor.config.ts` | Remove `plugins.SunmiPrinter` block (kduma-specific). Keep `appId`, `appName`, `server.url`, `android.allowMixedContent` |
| `lib/printing/sunmi.ts` | Full rewrite. Drop kduma dynamic import. Add `window.MFSSunmiPrint` global type. Rename `isSunmiCapacitor()` → `isSunmiNative()`. Rewrite `printDeliverySunmi()` to call `window.MFSSunmiPrint.printDeliveryLabel(...)` with primitive args |
| `app/haccp/delivery/page.tsx` | Update import: `isSunmiCapacitor` → `isSunmiNative`. Update both call-sites in `handlePrint58()` |
| `tests/unit/labelPrinting.test.ts` | Add tests for `isSunmiNative()` detection, supplier-code fallback, born/reared formatter (extracted as pure helpers from `sunmi.ts`) |

### Android side (Hakan pastes on Mac, builds, sideloads)
| File | Change |
|---|---|
| `android/app/build.gradle` | Add `implementation 'com.sunmi:printerlibrary:1.0.24'`. Remove any kduma plugin module reference if it was added previously |
| `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java` | **New file.** Uses `com.sunmi.peripheral.printer.*` directly. Binds service in constructor; exposes `@JavascriptInterface` methods `isReady()` and `printDeliveryLabel(...)`; cleans up in `unregister()` |
| `android/app/src/main/java/com/mfsglobal/ops/MainActivity.java` | **Rewrite.** Extends `BridgeActivity`. In `onCreate`: enable WebView debugging, instantiate bridge, call `webView.addJavascriptInterface(bridge, "MFSSunmiPrint")`, install `BridgeWebViewClient` that restricts navigation to `mfsops.com`. In `onDestroy`: call `bridge.unregister()` |

### Git / repo hygiene
| File | Change |
|---|---|
| `.gitignore` | Add Android build-artifact patterns: `android/.gradle/`, `android/app/build/`, `android/build/`, `android/local.properties`, `android/captures/`, `android/.idea/`, `android/app/release/` |
| `android/` directory | Commit the Capacitor-generated Android project (currently Mac-only — handover-flagged risk) |

## Steps

Vertical slices. Each slice ends with green tests and a clean commit. Slices 1–3 happen in this sandbox; slices 4–8 happen on Hakan's Mac.

### Phase A — JS side (sandbox-driven, atomic commits)

- [x] **1. Write test for `isSunmiNative()` detection in `tests/unit/labelPrinting.test.ts`.** Three cases: window undefined (SSR) → false, window without `MFSSunmiPrint` → false, window with `MFSSunmiPrint` object present → true. Stub `globalThis.window`.
- [x] **2. Write test for born/reared formatter** — extract `formatBornLine(bornIn, rearedIn)` from current `printDeliverySunmi` body as a pure helper. Cases: both null → null; same value → `"Born/Reared: GB"`; different values → `"Born: GB  Reared: IE"`; born only → `"Born: GB"`; reared only → `"Reared: IE"`.
- [x] **3. Write test for `formatTempStatus(c, status)`** — pure helper. Cases: `temperature_c = 3.2, status = 'pass'` → `"3.2°C  PASS"`; null temp → `"—  PASS"`; status `'fail'` → `"FAIL"`; status `'conditional'` → `"PASS"`.
- [x] **4. Rewrite `lib/printing/sunmi.ts`** to make tests pass. New shape: pure helpers (`formatBornLine`, `formatTempStatus`, `formatSpecies`), `getSupplierCode()` (unchanged), `isSunmiNative()`, `printDeliverySunmi()` that calls `window.MFSSunmiPrint.printDeliveryLabel(...)`. Drop dynamic import of kduma. Add TS declaration for `window.MFSSunmiPrint` shape.
- [x] **5. Update `app/haccp/delivery/page.tsx`** — change import `isSunmiCapacitor` → `isSunmiNative`. Both call-sites (top-level guard + error fallback) updated.
- [x] **6. Run `npm run test`** — must stay at 975 passing baseline plus the 3 new tests added in steps 1–3.
- [x] **7. Run `npx tsc --noEmit`** — clean on `lib/printing/sunmi.ts`, `app/haccp/delivery/page.tsx`, `tests/unit/labelPrinting.test.ts`. The 59 pre-existing errors in other files (per handover) are acceptable; flag if any new ones appear.
- [x] **8. Update `package.json`** — remove `@kduma-autoid/capacitor-sunmi-printer` dependency. Run `npm install` to update lockfile.
- [x] **9. Update `capacitor.config.ts`** — remove `plugins.SunmiPrinter` block.
- [x] **10. Commit Phase A** — single conventional-commits commit: `refactor(sunmi): replace Capacitor plugin bridge with native JS interface`. Push to `main` (auto-deploys via Vercel; existing window.print() path unchanged, no user-visible regression on iPad).

### Phase B — Android side (Hakan-driven, on Mac)

- [x] **11. Create `docs/adr/0001-sunmi-javascript-interface.md`** documenting the architectural decision (see ADR content in §"Proposed ADR-0001 content" below). Commit from sandbox alongside Phase A or as step 11 in Hakan's first Mac commit — either works.
- [ ] **12. On Mac: update `android/app/build.gradle`** — add `implementation 'com.sunmi:printerlibrary:1.0.24'`. Remove any kduma project reference. Run `cd android && ./gradlew --refresh-dependencies` to verify the dep resolves.
- [ ] **13. On Mac: create `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java`** using Sunmi SDK direct (template in §"Reference: SunmiPrintBridge.java skeleton"). Implements `@JavascriptInterface boolean isReady()` and `@JavascriptInterface void printDeliveryLabel(String, String, String, String, String, String, String, String, String)`.
- [ ] **14. On Mac: rewrite `android/app/src/main/java/com/mfsglobal/ops/MainActivity.java`** to wire the bridge (template in §"Reference: MainActivity.java skeleton").
- [x] **15. On Mac: update root `.gitignore`** with Android build-artifact patterns listed in "Files to change".
- [ ] **16. On Mac: `git add android/ .gitignore`** — commit the Capacitor Android shell. Conventional commit: `feat(android): commit Capacitor shell for V3 silent printing`.
- [ ] **17. On Mac: `cd android && ./gradlew assembleDebug`**. If build fails, paste full gradle error log back to sandbox for next iteration. If it succeeds: APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.
- [ ] **18. On Mac: `adb uninstall com.mfsglobal.ops; adb install android/app/build/outputs/apk/debug/app-debug.apk`** — sideload onto V3 (serial `VA94262640290`).
- [ ] **19. Manual smoke tests on V3** — see Acceptance criteria below. If any fail, capture logcat (`adb logcat -s MFSSunmiPrint:* AndroidRuntime:E`) and report back.
- [ ] **20. Commit `feat(sunmi): silent printing live on V3 via JS bridge`** — empty marker commit on Mac confirming end-to-end works, or amend step 16 if the same session.

## Test plan (TDD-first, vertical slices)

Three new unit tests in `tests/unit/labelPrinting.test.ts`. Each tests the **public** behaviour, not implementation details. All extracted as pure helpers from `sunmi.ts` so they're trivially unit-testable without a DOM, network, or device.

| Behaviour | Test file | Slice |
|---|---|---|
| `isSunmiNative()` returns true only when `window.MFSSunmiPrint` is present | `tests/unit/labelPrinting.test.ts` | 1 |
| `formatBornLine()` combines or splits born/reared according to BLS rules | `tests/unit/labelPrinting.test.ts` | 2 |
| `formatTempStatus()` renders temperature + PASS/FAIL string for label | `tests/unit/labelPrinting.test.ts` | 3 |

**What is NOT unit-tested** (no test infrastructure for either, and value is low):
- The actual bridge call `window.MFSSunmiPrint.printDeliveryLabel(...)` — covered by manual on-device test in step 19. Wrapping it in a mock would test the mock, not the bridge.
- Any Java code — no Android test harness in repo; manual on-device validation via step 19.

## Acceptance criteria

### Phase A complete when:
- [ ] `npm run test` shows 978 passing (975 existing + 3 new).
- [ ] `npx tsc --noEmit` shows no new errors in `sunmi.ts`, delivery page, or the test file.
- [ ] Code compiles and Vercel deploy goes green at `mfsops.com`.
- [ ] On iPad / Chrome / Safari, tapping the 58mm print button still shows the existing in-app iframe print sheet (no regression — `isSunmiNative()` returns false off-device).
- [ ] `lib/printing/sunmi.ts` contains zero references to `@kduma-autoid/capacitor-sunmi-printer`, `Capacitor`, or `isNativePlatform`.

### Phase B complete when (manual on V3):
- [ ] Open Goods In tile in the APK on the V3. Card list renders.
- [ ] Tap blue 58mm print button on any delivery card. **Label prints on V3 built-in printer.** No dialog appears at any point.
- [ ] Card does NOT open (the existing `onClick={e => e.stopPropagation()}` fix is preserved).
- [ ] Printed label contains: `MFS GLOBAL  GOODS IN` header, species, batch code (large, bold), Code 128 barcode of batch code, supplier code, date, temp + PASS/FAIL, BLS lines, `Allergens: None`.
- [ ] Tap the SAME button again — second copy prints. No state corruption.
- [ ] Tap a delivery with `temperature_c = null`: prints `Temp:     —  PASS` (or FAIL per status), no crash.
- [ ] Tap a delivery with both born and reared in different countries: prints `Born: GB  Reared: IE`.
- [ ] Tap a delivery with no born/reared data: skips that line entirely, no blank "Born: " row.
- [ ] On non-Sunmi devices (iPad open to mfsops.com directly): existing in-app iframe print works unchanged.

## Proposed ADR-0001 content

`docs/adr/0001-sunmi-javascript-interface.md`:

```markdown
# ADR-0001 — Use addJavascriptInterface for Sunmi V3 native bridge

## Status
Accepted — 2026-05-12

## Context
The MFS Operations PWA runs on iPad (via Safari/standalone) and on Sunmi V3 handhelds (via a Capacitor Android shell pointing at https://mfsops.com). The V3 has a built-in 58mm thermal printer; staff need to tap a print button and have the label print silently with no dialog.

Capacitor 8's plugin bridge relies on `WebView.addDocumentStartJavaScript`, which requires WebView 102+ (the `DOCUMENT_START_SCRIPT` feature flag). The Sunmi V3's bundled WebView is older than this. Capacitor's documented fallback only injects into pages served by Capacitor itself (the local bundled HTML); it does NOT inject into remote URLs.

Result observed via Chrome DevTools (chrome://inspect) attached to the V3 WebView: `window.Capacitor === undefined` on mfsops.com. Every Capacitor plugin, including `@kduma-autoid/capacitor-sunmi-printer`, is unreachable from JavaScript on the V3.

## Decision
Bypass Capacitor's plugin bridge for the Sunmi printer. In `MainActivity.java`, after Capacitor's `BridgeActivity.onCreate()` finishes, retrieve the WebView and call `webView.addJavascriptInterface(new SunmiPrintBridge(this), "MFSSunmiPrint")`. This is Android's lower-level, platform-stable JS-bridge API that works on every WebView version since API 17 and does not depend on Capacitor.

`SunmiPrintBridge.java` talks to `com.sunmi:printerlibrary` (Sunmi's own SDK) directly using the standard `InnerPrinterManager.getInstance().bindService(...)` pattern. The kduma Capacitor wrapper is removed.

## Consequences

### Easier
- Works on the V3's older WebView immediately; no system update or APK-bundled WebView upgrade required
- Single, vendor-maintained dependency (`com.sunmi:printerlibrary:1.0.24`); no third-party Capacitor plugin to drag along
- `sendRAWData(byte[], InnerResultCallback)` is available on the same SDK as an ESC/POS escape hatch — no extra dependency if the high-level API misbehaves on V3 specifically
- JS detection collapses to one line: `!!(window as any).MFSSunmiPrint`

### Harder
- We now own the Java code that other apps would inherit from a Capacitor plugin. Future printer methods (label mode, paper cut, image printing) require Java additions, not just `@SunmiPrinter.method()` calls
- Capacitor's typed promise wrappers are gone — the JS side calls `void`-returning bridge methods and trusts they completed. Error reporting comes via Android logcat (`adb logcat -s MFSSunmiPrint:*`) rather than JS exceptions
- Security: `addJavascriptInterface` exposes the bridge to every frame in the WebView, including iframes, with no origin-based access control (per Android developer documentation). Mitigation: bridge methods only print — no file, network, or auth-token access. `MainActivity` also restricts WebView navigation to `mfsops.com` via `shouldOverrideUrlLoading`. **Future Java methods on this bridge MUST be print-related only.** Adding anything that touches filesystem, credentials, or arbitrary HTTP is forbidden without a new ADR

### Neutral
- Capacitor stays as the Android shell — we still benefit from its lifecycle, `cap sync`, and project scaffolding. We just stop using its plugin bridge for the printer.
```

## Reference: SunmiPrintBridge.java skeleton

Drop into `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java`. Uses `com.sunmi:printerlibrary:1.0.24` directly — no kduma.

```java
package com.mfsglobal.ops;

import android.content.Context;
import android.util.Log;
import android.webkit.JavascriptInterface;

import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterException;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.SunmiPrinterService;

public class SunmiPrintBridge {
    private static final String TAG = "MFSSunmiPrint";
    private final Context context;
    private SunmiPrinterService printerService;

    private final InnerPrinterCallback innerCallback = new InnerPrinterCallback() {
        @Override
        protected void onConnected(SunmiPrinterService service) {
            printerService = service;
            Log.d(TAG, "Sunmi printer service connected");
        }
        @Override
        protected void onDisconnected() {
            printerService = null;
            Log.d(TAG, "Sunmi printer service disconnected");
        }
    };

    public SunmiPrintBridge(Context context) {
        this.context = context;
        try {
            InnerPrinterManager.getInstance().bindService(context, innerCallback);
        } catch (InnerPrinterException e) {
            Log.e(TAG, "bindService failed: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public boolean isReady() {
        return printerService != null;
    }

    @JavascriptInterface
    public void printDeliveryLabel(
        String batchCode, String supplierCode, String date,
        String tempLine, String bornLine, String slLine,
        String cutLine, String species, String allergens
    ) {
        if (printerService == null) {
            Log.w(TAG, "printDeliveryLabel called but service not bound");
            return;
        }
        try {
            printerService.printerInit(null);
            printerService.enterPrinterBuffer(true);

            printerService.setAlignment(0, null);              // left
            printerService.setFontSize(18, null);
            printerService.setPrinterStyle(1000, 1);            // ENABLE_BOLD
            printerService.printText("MFS GLOBAL  GOODS IN\n", null);
            printerService.setFontSize(22, null);
            printerService.printText(species.toUpperCase() + "\n", null);
            printerService.setPrinterStyle(1000, 0);            // DISABLE_BOLD

            printerService.setFontSize(26, null);
            printerService.setPrinterStyle(1000, 1);
            printerService.printText(batchCode + "\n", null);
            printerService.setPrinterStyle(1000, 0);

            printerService.setAlignment(1, null);              // center
            printerService.printBarCode(batchCode, 8, 80, 2, 2, null); // CODE128
            printerService.lineWrap(1, null);

            printerService.setAlignment(0, null);
            printerService.setFontSize(20, null);
            printerService.printText("--------------------------------\n", null);
            printerService.printText("Supplier: " + supplierCode + "\n", null);
            printerService.printText("Date:     " + date + "\n", null);
            printerService.printText("Temp:     " + tempLine + "\n", null);
            if (bornLine != null && !bornLine.isEmpty()) printerService.printText(bornLine + "\n", null);
            if (slLine   != null && !slLine.isEmpty())   printerService.printText("Sl:       " + slLine + "\n", null);
            if (cutLine  != null && !cutLine.isEmpty())  printerService.printText("Cut:      " + cutLine + "\n", null);
            printerService.printText("Allergens: " + (allergens == null || allergens.isEmpty() ? "None" : allergens) + "\n", null);
            printerService.lineWrap(3, null);

            printerService.exitPrinterBuffer(true);
            Log.d(TAG, "Printed: " + batchCode);
        } catch (Exception e) {
            Log.e(TAG, "Print error: " + e.getMessage(), e);
        }
    }

    public void unregister() {
        try {
            if (printerService != null) {
                InnerPrinterManager.getInstance().unBindService(context, innerCallback);
            }
        } catch (InnerPrinterException e) {
            Log.e(TAG, "unBindService failed: " + e.getMessage());
        }
    }
}
```

## Reference: MainActivity.java skeleton

```java
package com.mfsglobal.ops;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private SunmiPrintBridge sunmiBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);

        WebView webView = this.bridge.getWebView();
        sunmiBridge = new SunmiPrintBridge(this);
        webView.addJavascriptInterface(sunmiBridge, "MFSSunmiPrint");

        // Restrict navigation to mfsops.com — defence-in-depth against
        // accidental redirects exposing the bridge to other origins.
        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://mfsops.com") ||
                    url.startsWith("https://www.mfsops.com")) {
                    view.loadUrl(url);
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (sunmiBridge != null) sunmiBridge.unregister();
    }
}
```

## Risks and open questions

- **`setPrinterStyle(1000, 1)` literal:** The `1000` and `1` are the `WoyouConsts.ENABLE_BOLD` constant values. We're inlining the numeric literal to avoid importing `WoyouConsts` in this skeleton; production code SHOULD import and use `WoyouConsts.ENABLE_BOLD` / `WoyouConsts.ENABLE`. Trivial — implementer to confirm correct constant import on first build.
- **Asynchronous binding:** `bindService` returns immediately; `onConnected` fires later. If the user taps print **before** the service is bound, `printerService` is still null. Current bridge handles this by logging and returning (no print). Acceptable on cold start (<1s window); user can re-tap. If it becomes a complaint, add a JS-side `isReady()` check + 200ms retry loop. **Not** building that pre-emptively.
- **WoyouConsts.ENABLE_BOLD value:** Confirmed in Sunmi SDK docs as numeric `1000` for the key and `1`/`0` for value. If the import-and-use approach is preferred, swap `printerService.setPrinterStyle(1000, 1)` → `printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.ENABLE)` after adding `import com.sunmi.peripheral.printer.WoyouConsts;`.
- **Shallow modules (deletion test):** `formatBornLine`, `formatTempStatus`, `formatSpecies` are pure helpers extracted only to enable unit testing. If deleted, complexity reappears inline in `printDeliverySunmi`. They earn their keep through test coverage — not pass-through. ✅
- **Sunmi SDK version:** 1.0.24 (May 2025) is latest on Maven Central. If gradle fails to resolve it on Hakan's Mac (e.g. mirror lag), fall back to `1.0.23` (April 2024) or `1.0.22` (the version originally noted in handover). API surface is identical across these patch versions.
- **kduma plugin npm uninstall side-effects:** `@kduma-autoid/capacitor-sunmi-printer` is the ONLY consumer of `@kduma-autoid/*` in `package.json`. Removing it shouldn't affect anything else. Confirm via `grep "kduma" package*.json` after removal — should return zero matches.
- **Manual on-device testing only:** Java code and bridge wiring are not unit-tested. If a regression slips in, it'll only surface when staff use the V3. **Mitigation:** keep `console.error('[handlePrint58]')` logging in delivery page so any thrown JS error from a malformed bridge call appears in `adb logcat` and can be triaged remotely.
- **Capacitor stays in `package.json`:** `@capacitor/{core,cli,android}` are still needed for the Android shell (project scaffolding, `cap sync`, lifecycle). Removing them would mean writing a vanilla Android app — more work for limited benefit. Capacitor's plugin bridge is what we're bypassing, not Capacitor itself.

## Follow-ups (NOT in this plan's scope)

- Mince/Prep page silent printing on V3 — same pattern, separate plan once delivery is proven working.
- ESC/POS escape hatch (`sendRAWData`) — only build if step 19 surfaces a high-level-API issue specific to V3.
- Print queueing / offline buffering on V3 — currently every print attempts the printer in real time. Acceptable for now; revisit if staff report failures during weak WiFi.
- Replace `addJavascriptInterface` with `WebMessageListener` once the V3 fleet is on a WebView that supports it — better security model (origin-bound). Not urgent; current bridge is single-purpose and on a controlled domain.
