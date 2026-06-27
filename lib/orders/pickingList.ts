/**
 * lib/orders/pickingList.ts
 *
 * Renders the A4 picking sheet for an order. Matches the BarcodeX
 * layout from the photo Hakan provided on 30 May 2026 — same columns,
 * same fields, with per-line notes printed inline and order-level
 * notes at the foot.
 *
 * Output is a complete HTML document ready to inject into a browser
 * iframe and trigger window.print(). Print-CSS sized for A4.
 *
 * Includes a Code 128 barcode encoding the order reference, bottom-
 * right of the page — the office scans this when typing weights into
 * BarcodeX, ensuring they invoice against the right order.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB4)
 */

import type { OrderUom } from '@/lib/domain/Order'

// ─── Input shape ──────────────────────────────────────────────

export interface PickingListLine {
  line_number:        number
  /** Catalogue code from products.code if catalogued, else empty string */
  product_code:       string
  /** Display name — catalogued name OR ad_hoc_description */
  description:        string
  quantity:           number
  uom:                OrderUom
  /** Pack size from products.box_size (catalogued) or null (ad-hoc) */
  pack:               string | null
  notes:              string | null
}

export interface PickingListData {
  reference:           string
  customer_name:       string
  customer_postcode:   string | null
  /** ISO date e.g. 2026-05-30 — when the order was created */
  order_date:          string
  /** ISO date e.g. 2026-05-31 — when the customer wants it */
  delivery_date:       string
  /** Username of sales rep who placed the order */
  sales_rep:           string
  /** When this sheet is being printed (ISO timestamp) */
  printed_at:          string
  /** Username of office staff doing the printing */
  printed_by:          string
  /** Line items in the order */
  lines:               PickingListLine[]
  /** Order-level notes (delivery + general), printed at the foot */
  delivery_notes:      string | null
  order_notes:         string | null
}

// ─── Helpers ──────────────────────────────────────────────────

function fmtDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtUom(uom: OrderUom): string {
  return uom === 'kg' ? 'KG' : 'UNIT'
}

function fmtQty(qty: number): string {
  // Strip trailing zeros: 10.50 → 10.5, 10.000 → 10
  return Number(qty).toString()
}

// ─── Renderer ─────────────────────────────────────────────────

export function renderPickingListHtml(data: PickingListData): string {
  const lines = data.lines
    .slice()
    .sort((a, b) => a.line_number - b.line_number)

  const linesHtml = lines.map(line => {
    const noteRow = line.notes
      ? `<tr class="note-row"><td colspan="6">↳ ${escapeHtml(line.notes)}</td></tr>`
      : ''
    return `
      <tr class="line-row">
        <td class="code">${escapeHtml(line.product_code)}</td>
        <td class="uom">${escapeHtml(fmtUom(line.uom))}</td>
        <td class="qty">${escapeHtml(fmtQty(line.quantity))}</td>
        <td class="description">${escapeHtml(line.description)}</td>
        <td class="pack">${escapeHtml(line.pack ?? '')}</td>
        <td class="line-num">${line.line_number}</td>
      </tr>
      ${noteRow}
    `
  }).join('')

  const orderNotesBlock = (data.delivery_notes || data.order_notes) ? `
    <div class="notes-block">
      ${data.delivery_notes ? `<p class="notes-line"><strong>Delivery:</strong> ${escapeHtml(data.delivery_notes)}</p>` : ''}
      ${data.order_notes    ? `<p class="notes-line"><strong>Order:</strong> ${escapeHtml(data.order_notes)}</p>`    : ''}
    </div>
  ` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.reference)} — Picking Form</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color: #111; }
  body { font-size: 11pt; line-height: 1.35; }

  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8mm; border-bottom: 2pt solid #000; }
  .header .customer { flex: 1; min-width: 0; padding-right: 8mm; }
  .header h1 { margin: 0 0 2mm; font-size: 20pt; font-weight: 700; }
  .header .address { font-size: 10pt; line-height: 1.4; color: #333; white-space: pre-line; }
  .header .meta { text-align: right; font-size: 10pt; min-width: 60mm; }
  .header .meta h2 { margin: 0 0 4mm; font-size: 14pt; font-weight: 700; letter-spacing: 1pt; }
  .header .meta .field { margin: 1mm 0; }
  .header .meta .label { display: inline-block; min-width: 26mm; color: #666; text-align: right; padding-right: 3mm; }
  .header .meta .value { font-weight: 700; }

  /* ── Body table ── */
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6mm; }
  table.lines th { text-align: left; padding: 2mm 3mm; border-bottom: 1.5pt solid #000; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #555; }
  table.lines td { padding: 2.5mm 3mm; border-bottom: 0.5pt solid #ddd; vertical-align: top; }
  table.lines .code { width: 16mm; font-family: 'Courier New', monospace; font-weight: 700; }
  table.lines .uom { width: 14mm; text-align: center; font-size: 9pt; font-weight: 700; color: #555; }
  table.lines .qty { width: 16mm; text-align: right; font-weight: 700; font-size: 12pt; }
  table.lines .description { font-weight: 500; }
  table.lines .pack { width: 22mm; text-align: center; font-size: 9pt; color: #555; }
  table.lines .line-num { width: 8mm; text-align: right; color: #999; font-size: 9pt; }
  table.lines tr.note-row td { border-bottom: 0.5pt solid #ddd; padding: 0 3mm 2mm 22mm; font-size: 9pt; font-style: italic; color: #444; }

  /* ── Order-level notes block ── */
  .notes-block { margin-top: 8mm; padding: 4mm; border: 1pt dashed #999; background: #fafafa; }
  .notes-block .notes-line { margin: 1mm 0; font-size: 10pt; }

  /* ── Footer ── */
  .footer { margin-top: 12mm; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 4mm; border-top: 1pt solid #ccc; font-size: 9pt; color: #555; }
  .footer .pallets-box { border: 0.75pt solid #888; padding: 2mm 5mm; min-width: 50mm; }
  .footer .pallets-box .label { display: block; font-size: 8pt; text-transform: uppercase; color: #666; }
  .footer .pallets-box .value { display: block; font-size: 14pt; font-weight: 700; color: #111; min-height: 10mm; }
  .footer .printed { font-size: 8pt; color: #888; }
  .footer .barcode { text-align: right; }
  .footer .barcode .ref { font-family: 'Courier New', monospace; font-weight: 700; font-size: 11pt; margin-bottom: 1mm; }
  .footer .barcode svg { display: block; }
</style>
</head>
<body>

<header class="header">
  <div class="customer">
    <h1>${escapeHtml(data.customer_name)}</h1>
    ${data.customer_postcode ? `<div class="address">${escapeHtml(data.customer_postcode)}</div>` : ''}
  </div>
  <div class="meta">
    <h2>PICKING FORM</h2>
    <div class="field"><span class="label">Order No:</span><span class="value">${escapeHtml(data.reference)}</span></div>
    <div class="field"><span class="label">Order date:</span><span class="value">${escapeHtml(fmtDate(data.order_date))}</span></div>
    <div class="field"><span class="label">Delivery:</span><span class="value">${escapeHtml(fmtDate(data.delivery_date))}</span></div>
    <div class="field"><span class="label">Sales rep:</span><span class="value">${escapeHtml(data.sales_rep)}</span></div>
  </div>
</header>

<table class="lines">
  <thead>
    <tr>
      <th>Code</th>
      <th>UOM</th>
      <th>Qty</th>
      <th>Description</th>
      <th>Pack</th>
      <th>#</th>
    </tr>
  </thead>
  <tbody>${linesHtml}</tbody>
</table>

${orderNotesBlock}

<footer class="footer">
  <div class="pallets-box">
    <span class="label">No. of pallets</span>
    <span class="value">&nbsp;</span>
  </div>
  <div class="printed">
    Printed ${escapeHtml(fmtTimestamp(data.printed_at))} by ${escapeHtml(data.printed_by)}
  </div>
  <div class="barcode">
    <div class="ref">${escapeHtml(data.reference)}</div>
    ${renderCode128Svg(data.reference)}
  </div>
</footer>

<script>
  // Auto-trigger print when loaded in an iframe. Won't fire on direct
  // /api fetches — only when the office page injects this into an iframe
  // and the iframe's window.onload fires.
  if (window !== window.parent) {
    window.onload = () => { setTimeout(() => window.print(), 100); }
  }
</script>

</body>
</html>`
}

// ─── Code 128 barcode renderer (SVG) ─────────────────────────
//
// Minimal Code 128B implementation — encodes printable ASCII into an
// SVG barcode without external libraries. Enough for an order reference
// like 'MFS-2026-0001'. Standard Code 128 patterns + checksum.

const CODE128_PATTERNS: string[] = [
  '11011001100','11001101100','11001100110','10010011000','10010001100',
  '10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110',
  '10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100',
  '11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000',
  '10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110',
  '10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000',
  '11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100',
  '10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010',
  '11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100',
  '10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110',
  '10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000',
  '11010011100','11000111010',
]
const CODE128_START_B = 104
const CODE128_STOP    = 106

function renderCode128Svg(text: string): string {
  // Code 128B: encode each char's ASCII - 32 as the value (0-95)
  const values: number[] = []
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 127) {
      // Skip out-of-range chars; for MFS-YYYY-NNNN this never trips
      continue
    }
    values.push(code - 32)
  }

  // Checksum: (start + sum(value_i * (i+1))) mod 103
  let checksum = CODE128_START_B
  values.forEach((v, i) => { checksum += v * (i + 1) })
  checksum = checksum % 103

  // Pattern sequence: START_B | values | checksum | STOP
  const sequence = [CODE128_START_B, ...values, checksum, CODE128_STOP]
  const bits = sequence.map(v => CODE128_PATTERNS[v]).join('') + '11'  // termination bar

  // Render as SVG — each bit = 1mm wide, height fixed
  const moduleWidth = 0.5   // mm per bit
  const height      = 12    // mm
  const totalWidth  = bits.length * moduleWidth

  let rects = ''
  let cursor = 0
  let i = 0
  while (i < bits.length) {
    const bit = bits[i]
    let runLen = 1
    while (i + runLen < bits.length && bits[i + runLen] === bit) runLen++
    if (bit === '1') {
      rects += `<rect x="${cursor}" y="0" width="${runLen * moduleWidth}" height="${height}" fill="#000"/>`
    }
    cursor += runLen * moduleWidth
    i += runLen
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}mm" height="${height}mm" viewBox="0 0 ${totalWidth} ${height}">${rects}</svg>`
}
