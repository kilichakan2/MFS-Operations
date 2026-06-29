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
  printDeliveryLabel(
    batchCode:     string,
    supplierCode:  string,
    date:          string,
    tempLine:      string,
    bornIn:        string,
    rearedIn:      string,
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
 * Render the temperature line for the 52×38mm die-cut label (value only).
 * The PASS/FAIL word is dropped entirely (ADR-0012 §2) — even on a failed
 * delivery the label shows the bare value; the pass/fail outcome lives in the
 * daily diary, not on the sticker. Born/Reared are no longer combined here;
 * the Java bridge renders them as two separate cells.
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

// ── Delivery label (native) ─────────────────────────────────────────────────────
// All label-content formatting happens here. The native bridge receives flat
// primitive strings; it does no formatting of its own (see SunmiPrintBridge.java).
// Relocated verbatim from printDeliverySunmi — same arg order, same `?? ''`
// defaults, same 'None' allergens literal.

async function printDeliverySunmi(d: DeliveryLabelInput): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.MFSSunmiPrint : undefined
  if (!bridge) {
    throw new Error('printDeliverySunmi called without MFSSunmiPrint bridge')
  }

  const supplierCode = await getSupplierCode(d.supplier)
  const species   = formatSpecies(d.product_category)
  const tempLine  = formatTempStatus(d.temperature_c, d.temp_status)

  bridge.printDeliveryLabel(
    d.batch_number,
    supplierCode,
    d.date,
    tempLine,
    d.born_in   ?? '',
    d.reared_in ?? '',
    d.slaughter_site ?? '',
    d.cut_site       ?? '',
    species,
    'None',
  )
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
