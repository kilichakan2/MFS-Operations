'use client'
/**
 * lib/printing/sunmi.ts
 *
 * Silent native printing for Sunmi V3 via Capacitor bridge.
 * Only active when running inside the MFS Capacitor Android shell.
 * Falls back gracefully on all other platforms.
 */

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

// ── Capacitor detection ────────────────────────────────────────────────────────
// Returns true only inside the MFS Android APK shell, not in Chrome/Safari.

export function isSunmiCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!(cap?.isNativePlatform?.())
}

// ── Lazy plugin loader ─────────────────────────────────────────────────────────
// Dynamic import avoids SSR issues — module only loaded client-side in Capacitor.

type SunmiPlugin = typeof import('@kduma-autoid/capacitor-sunmi-printer')
let _plugin: SunmiPlugin | null = null

async function getPlugin(): Promise<SunmiPlugin> {
  if (!_plugin) {
    _plugin = await import('@kduma-autoid/capacitor-sunmi-printer')
  }
  return _plugin
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

export async function printDeliverySunmi(d: DeliveryForPrint): Promise<void> {
  const {
    SunmiPrinter,
    AlignmentModeEnum,
    BarcodeSymbologyEnum,
    BarcodeTextPositionEnum,
  } = await getPlugin()

  const supplierCode = await getSupplierCode(d.supplier)
  const species      = d.product_category.replace(/_/g, ' ').toUpperCase()
  const tempPass     = d.temp_status === 'pass' || d.temp_status === 'conditional'
  const tempStr      = d.temperature_c != null ? `${d.temperature_c}\u00b0C` : '—'

  // BLS: born/reared combined if same country
  const bornLine = (() => {
    if (!d.born_in && !d.reared_in) return null
    if (d.born_in && d.reared_in && d.born_in === d.reared_in) {
      return `Born/Reared: ${d.born_in}`
    }
    return [
      d.born_in   ? `Born: ${d.born_in}`    : null,
      d.reared_in ? `Reared: ${d.reared_in}` : null,
    ].filter(Boolean).join('  ')
  })()

  await SunmiPrinter.printerInit()
  await SunmiPrinter.enterPrinterBuffer({ clean: true })

  // ── Header ─────────────────────────────────────────────────────
  await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.LEFT })
  await SunmiPrinter.setFontSize({ size: 18 })
  await SunmiPrinter.setBold({ enable: true })
  await SunmiPrinter.printText({ text: `MFS GLOBAL  GOODS IN\n` })
  await SunmiPrinter.setFontSize({ size: 22 })
  await SunmiPrinter.printText({ text: `${species}\n` })
  await SunmiPrinter.setBold({ enable: false })

  // ── Batch code ─────────────────────────────────────────────────
  await SunmiPrinter.setFontSize({ size: 26 })
  await SunmiPrinter.setBold({ enable: true })
  await SunmiPrinter.printText({ text: `${d.batch_number}\n` })
  await SunmiPrinter.setBold({ enable: false })

  // ── Barcode (native — no SVG) ──────────────────────────────────
  await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.CENTER })
  await SunmiPrinter.printBarCode({
    content:       d.batch_number,
    symbology:     BarcodeSymbologyEnum.CODE_128,
    height:        80,
    width:         2,
    text_position: BarcodeTextPositionEnum.BELOW,
  })

  // ── Fields ─────────────────────────────────────────────────────
  await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.LEFT })
  await SunmiPrinter.setFontSize({ size: 20 })
  await SunmiPrinter.printText({ text: '--------------------------------\n' })
  await SunmiPrinter.printText({ text: `Supplier: ${supplierCode}\n` })
  await SunmiPrinter.printText({ text: `Date:     ${d.date}\n` })
  await SunmiPrinter.printText({
    text: `Temp:     ${tempStr}  ${tempPass ? 'PASS' : 'FAIL'}\n`,
  })
  if (bornLine)        await SunmiPrinter.printText({ text: `${bornLine}\n` })
  if (d.slaughter_site) await SunmiPrinter.printText({ text: `Sl:       ${d.slaughter_site}\n` })
  if (d.cut_site)       await SunmiPrinter.printText({ text: `Cut:      ${d.cut_site}\n` })
  await SunmiPrinter.printText({ text: `Allergens: None\n` })

  // ── Feed and print ─────────────────────────────────────────────
  await SunmiPrinter.lineWrap({ lines: 3 })
  await SunmiPrinter.exitPrinterBuffer({ commit: true })
}
