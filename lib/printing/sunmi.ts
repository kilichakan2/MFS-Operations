'use client'
/**
 * lib/printing/sunmi.ts
 *
 * Silent native printing for Sunmi V3 via the MFSSunmiPrint JavaScript
 * interface. The interface is injected by MainActivity using
 * webView.addJavascriptInterface — independent of Capacitor's plugin bridge,
 * which does not reach remote URLs on the V3's WebView (see ADR-0001).
 *
 * Only active inside the MFS Android shell. Falls back gracefully on iPad
 * and browsers via the existing window.print() iframe path.
 */

// ── Bridge type declaration ───────────────────────────────────────────────────
// Mirrors the @JavascriptInterface methods on android/.../SunmiPrintBridge.java.

interface MFSSunmiPrintBridge {
  isReady(): boolean
  printDeliveryLabel(
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

export interface DeliveryForPrint {
  id:               string
  batch_number:     string
  supplier:         string
  product_category: string
  date:             string
  temperature_c:    number | null
  temp_status:      string
  born_in:          string | null
  reared_in:        string | null
  slaughter_site:   string | null
  cut_site:         string | null
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
// Extracted from printDeliverySunmi so label-content logic is unit-testable
// and survives the bridge transport switch.

/**
 * Render the BLS born/reared line for the 58mm label.
 * - Both null → null (caller omits the line entirely)
 * - Same value → single combined "Born/Reared: GB" line
 * - Different values → "Born: GB  Reared: IE" (two spaces between fields)
 * - One present → just that field
 */
export function formatBornLine(bornIn: string | null, rearedIn: string | null): string | null {
  if (!bornIn && !rearedIn) return null
  if (bornIn && rearedIn && bornIn === rearedIn) {
    return `Born/Reared: ${bornIn}`
  }
  return [
    bornIn   ? `Born: ${bornIn}`     : null,
    rearedIn ? `Reared: ${rearedIn}` : null,
  ].filter(Boolean).join('  ')
}

/**
 * Render the temperature + status line for the 58mm label.
 * Both 'pass' and 'conditional' print as PASS — the conditional flag is
 * captured separately in the daily diary, not on the label.
 */
export function formatTempStatus(temperatureC: number | null, tempStatus: string): string {
  const tempStr = temperatureC != null ? `${temperatureC}\u00b0C` : '\u2014'
  const tempPass = tempStatus === 'pass' || tempStatus === 'conditional'
  return `${tempStr}  ${tempPass ? 'PASS' : 'FAIL'}`
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

// ── Delivery label ─────────────────────────────────────────────────────────────
// All label-content formatting happens here. The native bridge receives flat
// primitive strings; it does no formatting of its own (see SunmiPrintBridge.java).

export async function printDeliverySunmi(d: DeliveryForPrint): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.MFSSunmiPrint : undefined
  if (!bridge) {
    throw new Error('printDeliverySunmi called without MFSSunmiPrint bridge')
  }

  const supplierCode = await getSupplierCode(d.supplier)
  const species   = formatSpecies(d.product_category)
  const tempLine  = formatTempStatus(d.temperature_c, d.temp_status)
  const bornLine  = formatBornLine(d.born_in, d.reared_in) ?? ''

  bridge.printDeliveryLabel(
    d.batch_number,
    supplierCode,
    d.date,
    tempLine,
    bornLine,
    d.slaughter_site ?? '',
    d.cut_site       ?? '',
    species,
    'None',
  )
}
