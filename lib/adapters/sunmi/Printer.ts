'use client'
/**
 * lib/adapters/sunmi/Printer.ts
 *
 * Sunmi V3 native transport adapter for the Printer port (F-PROD-04 Pass 2a,
 * ADR-0010). Relocated verbatim from lib/printing/sunmi.ts.
 *
 * Silent native printing for Sunmi V3 via the MFSSunmiPrint JavaScript
 * interface. The interface is injected by MainActivity using
 * webView.addJavascriptInterface — independent of Capacitor's plugin bridge,
 * which does not reach remote URLs on the V3's WebView (see ADR-0001).
 *
 * Only active inside the MFS Android shell. The native path serves 58mm delivery
 * labels ONLY; 100mm delivery, all mince, and any native failure delegate to an
 * INJECTED fallback Printer (the Browser adapter). This adapter never imports
 * lib/adapters/browser directly — the wiring injects it (no adapter reaches into
 * another adapter's internals).
 */

import type {
  Printer,
  DeliveryLabelInput,
  MinceLabelInput,
  PrintErrorKind,
} from '@/lib/ports'

// ── Bridge type declaration ───────────────────────────────────────────────────
// Mirrors the @JavascriptInterface methods on android/.../SunmiPrintBridge.java.

interface MFSSunmiPrintBridge {
  isReady(): boolean
  /** Preferred path: a single JSON string read by name on the Java side
   *  (ADR-0013). Version-tolerant — absent on an old APK. */
  printLabel?(json: string): void
  /** Legacy positional path — kept as a fallback so a new web build still
   *  prints against an old (positional-only) APK. May be absent on a future
   *  JSON-only APK; both methods are optional so feature detection is honest. */
  printDeliveryLabel?(
    batchCode:     string,
    supplierCode:  string,
    date:          string,
    tempLine:      string,
    bornLine:      string,
    slaughterSite: string,
    cutSite:       string,
    species:       string,
    allergens:     string,
  ): void
}

declare global {
  interface Window {
    MFSSunmiPrint?: MFSSunmiPrintBridge
  }
}

// ── Native bridge detection ────────────────────────────────────────────────────
// The MFS Android shell injects window.MFSSunmiPrint via
// webView.addJavascriptInterface in MainActivity. This works on every WebView
// version since API 17, regardless of whether Capacitor's own bridge was injected.
// Detection must be safe in SSR and on devices that lack the bridge.

export function isSunmiNative(): boolean {
  if (typeof window === 'undefined') return false
  return !!window.MFSSunmiPrint
}

// ── Pure label-content helpers ────────────────────────────────────────────────
// Extracted from the native print body so label-content logic is unit-testable
// and survives the bridge transport switch.

/**
 * Render the temperature line for the label — value only, NO PASS/FAIL (ADR-0012).
 * The pass/fail/conditional decision is captured in the daily diary, not stamped
 * on the sticker. The second param is retained (prefixed `_`) to avoid call-site
 * churn; it no longer affects the output.
 */
export function formatTempStatus(temperatureC: number | null, _tempStatus: string): string {
  return temperatureC != null ? `${temperatureC}°C` : '—'
}

/**
 * Render the product_category as a label header — uppercased, underscores → spaces.
 */
export function formatSpecies(productCategory: string): string {
  return productCategory.replace(/_/g, ' ').toUpperCase()
}

/**
 * Combine born/reared into ONE legacy string for the positional fallback branch
 * ONLY (an old, positional-only APK expects a single `bornLine` arg). The new
 * JSON path sends `bornIn`/`rearedIn` as SEPARATE keys and never uses this.
 * - Same value → "Born/Reared: GB"
 * - Different / one present → "Born: GB  Reared: IE" (empties dropped)
 */
function legacyBornLine(bornIn: string, rearedIn: string): string {
  if (bornIn && rearedIn && bornIn === rearedIn) return `Born/Reared: ${bornIn}`
  return [
    bornIn   ? `Born: ${bornIn}`     : '',
    rearedIn ? `Reared: ${rearedIn}` : '',
  ].filter(Boolean).join('  ')
}

// ── Supplier label code lookup ─────────────────────────────────────────────────

async function getSupplierCode(supplierName: string): Promise<string> {
  try {
    const res = await fetch(
      `/api/haccp/supplier-code?name=${encodeURIComponent(supplierName)}`
    )
    if (!res.ok) throw new Error(`${res.status}`)
    const data = await res.json()
    return data.label_code ?? supplierName.slice(0, 4).toUpperCase()
  } catch {
    return supplierName.slice(0, 4).toUpperCase()
  }
}

// ── Version-tolerant JSON payload (ADR-0013) ──────────────────────────────────
// The new contract between the web (this adapter) and the native bridge: a single
// JSON object read BY NAME on the Java side. Key names here MUST match the
// `optString` keys in SunmiPrintBridge.java#printLabel. Born/reared are SEPARATE
// keys; temp is value-only (no PASS/FAIL). Pure + exported so the key set is
// pinned by a unit test (the oracle that replaces the lost compile-time link).

/** The exact JSON shape `printLabel` consumes. All values are strings; empty
 *  means "omit this cell" (Java's non-empty guards mirror today's behaviour). */
export interface DeliveryLabelPayload {
  type:          'delivery'
  batch:         string
  supplier:      string
  date:          string
  temp:          string
  bornIn:        string
  rearedIn:      string
  slaughterSite: string
  cutSite:       string
  species:       string
  allergens:     string
}

export function buildDeliveryPayload(
  d: DeliveryLabelInput,
  supplierCode: string,
): DeliveryLabelPayload {
  return {
    type:          'delivery',
    batch:         d.batch_number,
    supplier:      supplierCode,
    date:          d.date,
    temp:          formatTempStatus(d.temperature_c, d.temp_status),
    bornIn:        d.born_in        ?? '',
    rearedIn:      d.reared_in      ?? '',
    slaughterSite: d.slaughter_site ?? '',
    cutSite:       d.cut_site       ?? '',
    species:       formatSpecies(d.product_category),
    allergens:     'None',
  }
}

// ── Delivery label (native) ─────────────────────────────────────────────────────
// Builds the JSON payload, then feature-detects which bridge method exists:
//   1. printLabel(json)         — preferred, version-tolerant (ADR-0013).
//   2. printDeliveryLabel(...)  — legacy positional fallback (old APK still
//                                 installed) so printing never silently dies.
//   3. neither → throw          — the adapter's caller falls back to the
//                                 injected iframe Browser adapter.

async function printDeliverySunmi(d: DeliveryLabelInput): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.MFSSunmiPrint : undefined
  if (!bridge) {
    throw new Error('printDeliverySunmi called without MFSSunmiPrint bridge')
  }

  const supplierCode = await getSupplierCode(d.supplier)
  const payload = buildDeliveryPayload(d, supplierCode)

  if (typeof bridge.printLabel === 'function') {
    bridge.printLabel(JSON.stringify(payload))
  } else if (typeof bridge.printDeliveryLabel === 'function') {
    // Old APK still installed → use the legacy positional path so printing
    // still works. Born/reared collapse into the single `bornLine` the old
    // 9-arg method expects.
    bridge.printDeliveryLabel(
      payload.batch,
      payload.supplier,
      payload.date,
      payload.temp,
      legacyBornLine(payload.bornIn, payload.rearedIn),
      payload.slaughterSite,
      payload.cutSite,
      payload.species,
      payload.allergens,
    )
  } else {
    throw new Error('printDeliverySunmi: no usable MFSSunmiPrint print method')
  }
}

/**
 * The Sunmi native transport adapter. Native silent print for 58mm delivery only;
 * everything else (100mm delivery, all mince) and any native throw delegate to the
 * INJECTED fallback Printer. Preserves the exact "try native, fall back on throw"
 * sequence the delivery page held inline before Pass 2a.
 */
export function createSunmiPrinter(fallback: Printer): Printer {
  return {
    async printDeliveryLabel(
      input: DeliveryLabelInput,
      onError: (kind: PrintErrorKind) => void,
    ): Promise<void> {
      if (input.width === '58mm' && isSunmiNative()) {
        try {
          await printDeliverySunmi(input)
        } catch (err) {
          console.error('[handlePrint58] Sunmi error — falling back', err)
          return fallback.printDeliveryLabel(input, onError)
        }
        return
      }
      // 100mm delivery, OR not running natively → iframe fallback.
      return fallback.printDeliveryLabel(input, onError)
    },
    printMinceLabel(
      input: MinceLabelInput,
      onError: (kind: PrintErrorKind) => void,
    ): Promise<void> {
      // No native mince, ever.
      return fallback.printMinceLabel(input, onError)
    },
  }
}
