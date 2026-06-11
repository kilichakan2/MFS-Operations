# Sunmi V3 Silent Printing via Capacitor
**Created:** 2026-05-12

## Goal
1. Fix delivery card opening when print button is tapped (event bubbling bug)
2. Wrap mfsops.com in a Capacitor Android shell app
3. Use @kduma-autoid/capacitor-sunmi-printer for direct silent printing
4. Tap print → label prints immediately, no dialog, no card opening

## Scope
- Sunmi V3 + 58mm format only
- All other devices keep existing window.print() path
- Mince page: same pattern after delivery is working

## Codebase findings (full grill)

### Bug 1 — Card opens when print button tapped
Card: <button onClick={() => setSelectedDelivery(d)}>
Print: <button onPointerDown={e => { e.stopPropagation(); e.preventDefault(); printLabelInApp(...) }}>

Problem: e.stopPropagation() on pointerdown does NOT stop the click event.
Android tap = pointerdown + pointerup + click, all three fire.
stopPropagation on pointerdown stops pointerdown bubbling only.
The click event still bubbles to the card's onClick → card opens.

Fix: add onClick={e => e.stopPropagation()} to both print buttons.
(One line per button — minimal change.)

### Capacitor architecture
- mfsops.com is server-rendered Next.js (API routes, cookie auth) — cannot static export
- Must use Capacitor "remote URL" mode: WebView loads https://mfsops.com
- Capacitor bridge is injected into the WebView by the native Android shell
- @kduma-autoid/capacitor-sunmi-printer talks to Sunmi AIDL service directly
- No dialog ever — tap → print

### Data available at print time
Delivery object `d` already in page state — no refetch needed:
  d.id, d.batch_number, d.supplier, d.product, d.product_category
  d.born_in, d.reared_in, d.slaughter_site, d.cut_site
  d.temperature_c, d.temp_status, d.date

supplier label_code: NOT in Delivery interface — needs one fetch.
  Option: quick GET /api/haccp/supplier-code?name=X (new lightweight endpoint)
  OR: pass supplier name to sunmi.ts and fetch label_code inline
  Chosen: inline fetch in sunmi.ts (keeps delivery page clean)

### Plugin import safety
@kduma-autoid/capacitor-sunmi-printer includes native Android code (Java)
but the npm package JS interface is safe to import in Next.js.
Vercel only bundles the JS — ignores Android-specific code.
Must use dynamic import (lazy-load) to avoid SSR issues.

## Files to create/change
1. `capacitor.config.ts` — new, root level
2. `package.json` — add Capacitor + Sunmi printer plugin deps
3. `lib/printing/sunmi.ts` — new Sunmi print module
4. `app/api/haccp/supplier-code/route.ts` — new lightweight endpoint
5. `app/haccp/delivery/page.tsx` — fix bug + Sunmi print integration
6. `.gitignore` — add Android build artifacts
7. Android platform added via CLI (npx cap add android)

## Steps
- [ ] 0. Prerequisites: install Android build tools on Mac (see below)
- [ ] 1. npm install @capacitor/core @capacitor/cli @capacitor/android @kduma-autoid/capacitor-sunmi-printer
- [ ] 2. Create capacitor.config.ts
- [ ] 3. npx cap add android
- [ ] 4. Create lib/printing/sunmi.ts
- [ ] 5. Create app/api/haccp/supplier-code/route.ts
- [ ] 6. Fix delivery page card bug + integrate Sunmi print
- [ ] 7. Update .gitignore
- [ ] 8. npm run test + npx tsc --noEmit
- [ ] 9. npx cap sync
- [ ] 10. Build APK (./gradlew assembleDebug)
- [ ] 11. Sideload onto V3 (adb install)

## Prerequisites (Mac)

### Option A — Android Studio (recommended, one-time)
Download free from developer.android.com/studio
Open it once → it auto-installs JDK + Android SDK
Set ANDROID_HOME in ~/.zshrc:
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
Never need to open Android Studio again after setup.

### Option B — Homebrew (no Android Studio)
brew install --cask android-commandlinetools
brew install openjdk@17
sdkmanager "platforms;android-33" "build-tools;33.0.2"
Set ANDROID_HOME manually
More steps, more things that can go wrong — not recommended first time.

## capacitor.config.ts
```typescript
import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'com.mfsglobal.ops',
  appName: 'MFS Operations',
  webDir:  'out',           // not used — remote URL mode
  server: {
    url:       'https://mfsops.com',
    cleartext: false,       // HTTPS only
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SunmiPrinter: {
      bindOnLoad: true,     // bind printer service when app loads
    },
  },
}
export default config
```

## lib/printing/sunmi.ts
```typescript
'use client'

// Detects if running inside the MFS Capacitor Android shell
export function isSunmiCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as any).Capacitor
  return !!(cap && cap.isNativePlatform && cap.isNativePlatform())
}

// Lazy-loaded plugin reference — safe for SSR
let _plugin: typeof import('@kduma-autoid/capacitor-sunmi-printer') | null = null
async function getPlugin() {
  if (!_plugin) _plugin = await import('@kduma-autoid/capacitor-sunmi-printer')
  return _plugin
}

// Fetch supplier label_code from DB
async function getSupplierCode(supplierName: string): Promise<string> {
  try {
    const res = await fetch(`/api/haccp/supplier-code?name=${encodeURIComponent(supplierName)}`)
    const data = await res.json()
    return data.label_code ?? supplierName.slice(0, 4).toUpperCase()
  } catch {
    return supplierName.slice(0, 4).toUpperCase()
  }
}

// Sunmi delivery label print
export async function printDeliverySunmi(d: DeliveryForPrint): Promise<void> {
  const { SunmiPrinter, AlignmentModeEnum, BarcodeSymbologyEnum, BarcodeTextPositionEnum } = await getPlugin()
  const supplierCode = await getSupplierCode(d.supplier)
  const species = d.product_category.toUpperCase().replace('_', ' ')
  const tempOk = d.temp_status === 'pass' || d.temp_status === 'conditional'

  // Born/reared combined if same
  const bornLine = d.born_in && d.reared_in && d.born_in === d.reared_in
    ? `Born/Reared: ${d.born_in}`
    : [d.born_in && `Born: ${d.born_in}`, d.reared_in && `Reared: ${d.reared_in}`]
        .filter(Boolean).join(' · ')

  await SunmiPrinter.printerInit()
  await SunmiPrinter.enterPrinterBuffer({ clean: true })

  // Header
  await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.LEFT })
  await SunmiPrinter.setFontSize({ size: 18 })
  await SunmiPrinter.setBold({ enable: true })
  await SunmiPrinter.printText({ text: `MFS GLOBAL  GOODS IN\n` })
  await SunmiPrinter.setFontSize({ size: 22 })
  await SunmiPrinter.printText({ text: `${species}\n` })
  await SunmiPrinter.setBold({ enable: false })

  // Batch code
  await SunmiPrinter.setFontSize({ size: 26 })
  await SunmiPrinter.setBold({ enable: true })
  await SunmiPrinter.printText({ text: `${d.batch_number}\n` })
  await SunmiPrinter.setBold({ enable: false })

  // Barcode (native — no SVG needed)
  await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.CENTER })
  await SunmiPrinter.printBarCode({
    content:       d.batch_number,
    symbology:     BarcodeSymbologyEnum.CODE_128,
    height:        80,
    width:         2,
    text_position: BarcodeTextPositionEnum.BELOW,
  })

  // Fields
  await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.LEFT })
  await SunmiPrinter.setFontSize({ size: 20 })
  await SunmiPrinter.printText({ text: '--------------------------------\n' })
  await SunmiPrinter.printText({ text: `Supplier: ${supplierCode}\n` })
  await SunmiPrinter.printText({ text: `Date:     ${d.date}\n` })
  await SunmiPrinter.printText({ text: `Temp:     ${d.temperature_c ?? '—'}°C  ${tempOk ? 'PASS' : 'FAIL'}\n` })
  if (bornLine) await SunmiPrinter.printText({ text: `${bornLine}\n` })
  if (d.slaughter_site) await SunmiPrinter.printText({ text: `Sl:       ${d.slaughter_site}\n` })
  if (d.cut_site) await SunmiPrinter.printText({ text: `Cut:      ${d.cut_site}\n` })
  await SunmiPrinter.printText({ text: `Allergens: None\n` })

  // Feed and commit
  await SunmiPrinter.lineWrap({ lines: 3 })
  await SunmiPrinter.exitPrinterBuffer({ commit: true })
}
```

## DeliveryForPrint interface (in sunmi.ts)
```typescript
export interface DeliveryForPrint {
  id:            string
  batch_number:  string
  supplier:      string
  product_category: string
  date:          string
  temperature_c: number | null
  temp_status:   string
  born_in:       string | null
  reared_in:     string | null
  slaughter_site: string | null
  cut_site:      string | null
}
```

## API: /api/haccp/supplier-code
GET ?name=Euro Quality Lambs
Returns: { label_code: 'EQL' } or { label_code: 'EURO' } (fallback)
Auth: same HACCP role check as other endpoints
Query: SELECT label_code FROM haccp_suppliers WHERE name ILIKE $name LIMIT 1

## Delivery page print button fix
Current:
  onPointerDown={e => { e.stopPropagation(); e.preventDefault(); printLabelInApp(...) }}

Add (one line):
  onClick={e => e.stopPropagation()}

And update printLabelInApp call to use Sunmi when available:
  async function handlePrint58(d: Delivery) {
    if (isSunmiCapacitor()) {
      await printDeliverySunmi(d).catch(console.error)
    } else {
      printLabelInApp(`/api/labels?type=delivery&id=${d.id}&format=html&copies=1&width=58mm`)
    }
  }

## .gitignore additions
# Android build artifacts
android/.gradle/
android/app/build/
android/build/
android/local.properties
# Keep: android/ folder itself (Capacitor project) — must be committed

## APK build command (from repo root, after Android Studio/SDK installed)
cd android && ./gradlew assembleDebug
Output: android/app/build/outputs/apk/debug/app-debug.apk

## Sideload onto V3
adb install android/app/build/outputs/apk/debug/app-debug.apk

## Tests
- npm run test 975 must still pass
- npx tsc --noEmit clean on touched files
- Manual: tap print on V3 → label prints, card does NOT open
- Manual: tap print on iPad → Android print dialog (unchanged)

## Risks
- Dynamic import of Capacitor plugin: must be client-side only
  lib/printing/sunmi.ts is 'use client' guarded
  isSunmiCapacitor() checks window !== undefined
- Vercel build: Capacitor plugin imports must not break SSR
  Mitigation: dynamic import + typeof window guard
- bindOnLoad: true — if Sunmi print service isn't available on boot,
  getServiceStatus() will return NO_PRINTER. Handle gracefully with
  try/catch in printDeliverySunmi → falls back to window.print()
- Remote URL requires internet on the V3
  (already the case for the PWA in Chrome — no change)
- APK signing: debug APK (assembleDebug) is fine for internal use
  No Google Play publishing needed — sideloading only
