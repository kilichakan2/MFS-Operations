/**
 * lib/printing/zpl.ts
 *
 * ZPL (Zebra Programming Language) generation for MFS Global labels.
 *
 * Label size: 100mm × 50mm at 203dpi = 800 × 400 dots
 *
 * Used in:
 * - Phase 1/2: generated but not directly sent (HTML render used instead)
 * - Phase 3: sent directly to Zebra via Cloud Connect WebSocket
 *
 * Both TSC TE310 and Zebra ZD421d accept this identical ZPL via TCP port 9100.
 */

import type { DeliveryLabelData, MinceLabelData } from './types'

// Label dimensions at 203dpi
const W = 800  // 100mm = 800 dots
const H = 400  // 50mm  = 400 dots

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitise(str: string | null | undefined, maxLen = 40): string {
  if (!str) return ''
  // ZPL special chars that need escaping
  return str
    .replace(/[&]/g, '+')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, maxLen)
}

// ── Batch code format helpers ─────────────────────────────────────────────────

const VALID_SPECIES = ['LAMB', 'BEEF', 'CHICKEN', 'PORK']

export function formatGoodsInBatchCode(ddmm: string, species: string, sequence: number): string {
  const sp  = VALID_SPECIES.includes(species.toUpperCase()) ? species.toUpperCase() : 'OTHER'
  const seq = String(sequence).padStart(3, '0')
  return `GI-${ddmm}-${sp}-${seq}`
}

export function formatMinceBatchCode(
  ddmm: string,
  species: string,
  sequence: number,
  mode: 'mince' | 'prep',
): string {
  const prefix = mode === 'prep' ? 'PREP' : 'MINCE'
  return `${prefix}-${ddmm}-${species.toUpperCase()}-${String(sequence).padStart(3, '0')}`
}

export function ddmmFromDate(dateStr: string): string {
  const d   = new Date(dateStr + 'T00:00:00')
  const day = String(d.getDate()).padStart(2, '0')
  const mon = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}${mon}`
}

// ── Use-by date helper ──────────────────────────────────────────────────────────
// use_by is passed from the print dialog (staff pick at print time).
// This helper calculates the date from a days param for the API route.

export function calculateUseByFromDays(productionDate: string, days: number): string {
  const d = new Date(productionDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

export function fmtDisplayDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── ZPL label generators ──────────────────────────────────────────────────────

export function generateDeliveryZPL(data: DeliveryLabelData, copies = 1): string {
  const batch    = sanitise(data.batch_code, 30)
  const tempLbl  = `${data.temperature_c}C ${data.temp_status === 'pass' ? '' : '(!)'}`

  // Born & reared
  const sameOrigin = data.born_in && data.reared_in && data.born_in === data.reared_in
  const bornLine   = sameOrigin
    ? `Born & reared in: ${sanitise(data.born_in!, 20)}`
    : data.born_in ? `Born in: ${sanitise(data.born_in, 20)}` : null
  const rearedLine = (!sameOrigin && data.reared_in) ? `Reared in: ${sanitise(data.reared_in, 20)}` : null

  // Slaughter / cut sites
  const sameSite   = data.slaughter_site && data.cut_site && data.slaughter_site === data.cut_site
  const slauxLine  = sameSite
    ? `Slaughtered & cut in: ${sanitise(data.slaughter_site!, 15)}`
    : data.slaughter_site ? `Slaughtered in: ${sanitise(data.slaughter_site, 15)}` : null
  const cutLine    = (!sameSite && data.cut_site) ? `Cut in: ${sanitise(data.cut_site, 15)}` : null

  // Build dynamic field list (y positions start at 196, step 26)
  const fields: string[] = [
    `${sanitise(data.supplier, 20)} — ${sanitise(data.product, 20)}`,
    `Date in: ${sanitise(data.date_received, 20)}`,
    `Temp: ${tempLbl}`,
    ...[bornLine, rearedLine, slauxLine, cutLine, `Further cut in: ${data.mfs_plant}`].filter((l): l is string => l !== null),
  ]

  const fieldZpl = fields.map((f, i) =>
    `^FO20,${196 + i * 24}^A0N,20,20^FD${f}^FS`
  )

  const lines = [
    '^XA',
    `^PQ${copies}`,
    `^FO20,20^A0N,28,28^FDMFS GLOBAL^FS`,
    `^FO460,20^A0N,20,20^FDGOODS IN · ${sanitise(data.species.toUpperCase(), 10)}^FS`,
    `^FO20,55^GB${W - 40},3,3^FS`,
    `^FO20,70^A0N,38,38^FD${batch}^FS`,
    `^FO20,120^BCN,55,Y,N,N^FD${batch}^FS`,
    ...fieldZpl,
    '^XZ',
  ]

  return lines.join('\n')
}

export function generateMinceZPL(data: MinceLabelData, copies = 1): string {
  const batch   = sanitise(data.batch_code, 30)
  const mode    = data.output_mode.toUpperCase()
  const sources = data.source_batch_numbers
    .slice(0, 3)
    .map(b => sanitise(b, 20))
    .join(', ')
  const killInfo = data.kill_date && data.days_from_kill !== null
    ? `Kill: ${data.kill_date} (${data.days_from_kill} days)`
    : null

  const lines = [
    '^XA',
    `^PQ${copies}`,
    // Header
    `^FO20,20^A0N,26,26^FDMFS GLOBAL^FS`,
    `^FO380,20^A0N,18,18^FDPRODUCTION / ${mode}^FS`,
    `^FO20,52^GB${W - 40},3,3^FS`,
    // Batch code text
    `^FO20,65^A0N,38,38^FD${batch}^FS`,
    // Code 128 barcode
    `^FO20,115^BCN,55,Y,N,N^FD${batch}^FS`,
    // Fields
    `^FO20,196^A0N,22,22^FDSpecies:   ${sanitise(data.product_species, 20)}^FS`,
    `^FO20,224^A0N,22,22^FDProd date: ${sanitise(data.date, 20)}^FS`,
    killInfo ? `^FO20,252^A0N,22,22^FD${sanitise(killInfo, 36)}^FS` : null,
    sources  ? `^FO20,280^A0N,18,18^FDSource: ${sources}^FS` : null,
    `^FO20,308^A0N,22,22^FDUse by:   ${sanitise(data.use_by, 20)}^FS`,
    // Footer
    '^XZ',
  ].filter((l): l is string => l !== null)

  return lines.join('\n')
}
