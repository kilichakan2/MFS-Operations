/**
 * lib/printing/html.ts
 *
 * Renders label data as styled HTML for browser/AirPrint printing (Phase 1/2).
 *
 * Label size: 100mm × 50mm — confirmed across all phases.
 *   Phase 1: custom paper size in iOS print dialog
 *   Phase 2: TSC TE310 (max 104mm width) ✓
 *   Phase 3: Zebra ZD421d (max 104mm width) ✓
 *
 * Layout (top to bottom):
 *   Header: MFS GLOBAL + label type
 *   Batch code: large bold monospace (primary human reference)
 *   Barcode: Code 128 bars + human-readable number underneath
 *   Divider
 *   Fields: larger text, fills remaining space
 */

import type { DeliveryLabelData, MinceLabelData } from './types'

// ── Code 128B barcode generator ───────────────────────────────────────────────

const CODE128B_START = 104
const CODE128_STOP   = 106

const CODE128B_PATTERNS: Record<number, string> = {
  32:'11011001100', 33:'11001101100', 34:'11001100110', 35:'10010011000',
  36:'10010001100', 37:'10001001100', 38:'10011001000', 39:'10011000100',
  40:'10001100100', 41:'11001001000', 42:'11001000100', 43:'11000100100',
  44:'10110011100', 45:'10011011100', 46:'10011001110', 47:'10111001100',
  48:'10011101100', 49:'10011100110', 50:'11001110010', 51:'11001011100',
  52:'11001001110', 53:'11011100100', 54:'11001110100', 55:'11101101110',
  56:'11101001100', 57:'11100101100', 58:'11100100110', 59:'11101100100',
  60:'11100110100', 61:'11100110010', 62:'11011011000', 63:'11011000110',
  64:'11000110110', 65:'10100011000', 66:'10001011000', 67:'10001000110',
  68:'10110001000', 69:'10001101000', 70:'10001100010', 71:'11010001000',
  72:'11000101000', 73:'11000100010', 74:'10110111000', 75:'10110001110',
  76:'10001101110', 77:'10111011000', 78:'10111000110', 79:'10001110110',
  80:'11101110110', 81:'11010001110', 82:'11000101110', 83:'11011101000',
  84:'11011100010', 85:'11011101110', 86:'11101011000', 87:'11101000110',
  88:'11100010110', 89:'11101101000', 90:'11101100010', 91:'11100011010',
  92:'11101111010', 93:'11001000010', 94:'11110001010', 95:'10100110000',
  96:'10100001100', 97:'10010110000', 98:'10010000110', 99:'10000101100',
  100:'10000100110', 101:'10110010000', 102:'10110000100', 103:'10011010000',
}

const SPECIAL: Record<number, string> = {
  [CODE128B_START]: '11010010000',
  [CODE128_STOP]:   '1100011101011',
}

function code128Pattern(code: number): string {
  return SPECIAL[code] ?? CODE128B_PATTERNS[code] ?? '10101010101'
}

/**
 * Generates an inline SVG Code 128B barcode with human-readable text below.
 *
 * @param text       String to encode (batch code)
 * @param barsWidth  Width of bar area in px
 * @param barsHeight Height of bars in px
 * @param fontSize   Font size for number below in px
 */
function generateBarcodeSVG(
  text:      string,
  barsWidth  = 260,
  barsHeight = 44,
  fontSize   = 9,
): string {
  const chars  = text.split('').map(c => c.charCodeAt(0))
  const values = [CODE128B_START, ...chars]

  let checksum = CODE128B_START
  chars.forEach((v, i) => { checksum += v * (i + 1) })
  checksum = checksum % 103
  values.push(checksum, CODE128_STOP)

  const pattern = values.map(code128Pattern).join('')
  const barW    = barsWidth / pattern.length

  const bars = pattern.split('').map((bit, i) =>
    bit === '1'
      ? `<rect x="${(i * barW).toFixed(2)}" y="0" width="${barW.toFixed(2)}" height="${barsHeight}" fill="black"/>`
      : ''
  ).filter(Boolean).join('')

  const textGap = 2
  const textY   = barsHeight + textGap + fontSize  // SVG text y = baseline
  const svgH    = barsHeight + textGap + fontSize + 1

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${barsWidth}" height="${svgH}" viewBox="0 0 ${barsWidth} ${svgH}">` +
    bars +
    `<text x="${barsWidth / 2}" y="${textY}" text-anchor="middle" ` +
    `font-family="Courier New,Courier,monospace" font-size="${fontSize}" letter-spacing="1.5" fill="black">` +
    text +
    `</text></svg>`
  )
}

// ── Shared print CSS ──────────────────────────────────────────────────────────

function labelCSS(): string {
  return (
    `@page{size:100mm 50mm;margin:0}` +
    `*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `body{background:white}` +
    `.label{width:100mm;height:50mm;padding:1.5mm 3mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}` +
    `.label:last-child{page-break-after:auto}` +
    `.hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:0.8mm;border-bottom:0.5mm solid #000;margin-bottom:0.8mm;flex-shrink:0}` +
    `.co{font-size:9pt;font-weight:bold}` +
    `.tp{font-size:8pt;font-weight:bold;color:#333}` +
    `.bc{font-size:14pt;font-weight:bold;font-family:'Courier New',Courier,monospace;letter-spacing:1px;line-height:1;margin-bottom:0.8mm;flex-shrink:0}` +
    `.br{flex-shrink:0;margin-bottom:1mm;line-height:0}` +
    `.br svg{display:block;max-width:100%}` +
    `.dv{border-top:0.3mm solid #aaa;margin:0.8mm 0;flex-shrink:0}` +
    `.fl{font-size:8pt;line-height:1.35;flex-grow:1}` +
    `.fw{display:flex;gap:2mm}` +
    `.fk{color:#444;min-width:15mm;flex-shrink:0;font-size:7.5pt}` +
    `.fv{font-size:8pt}`
  )
}

// ── Delivery label ────────────────────────────────────────────────────────────

export function renderDeliveryHTML(data: DeliveryLabelData, copies = 1): string {
  const origin     = [data.born_in, data.slaughter_site].filter(Boolean).join(' / ')
  const tempColour = data.temp_status === 'pass' ? '#166534' : '#991b1b'
  const barcode    = generateBarcodeSVG(data.batch_code, 260, 42, 8)

  const lbl = [
    `<div class="label">`,
    `<div class="hdr"><span class="co">MFS GLOBAL</span><span class="tp">GOODS IN</span></div>`,
    `<div class="bc">${data.batch_code}</div>`,
    `<div class="br">${barcode}</div>`,
    `<div class="dv"></div>`,
    `<div class="fl">`,
    `<div class="fw"><span class="fk">Supplier:</span><span class="fv">${data.supplier}</span></div>`,
    `<div class="fw"><span class="fk">Product:</span><span class="fv">${data.product} (${data.species})</span></div>`,
    `<div class="fw"><span class="fk">Date in:</span><span class="fv">${data.date_received}</span></div>`,
    origin ? `<div class="fw"><span class="fk">Origin:</span><span class="fv">${origin}</span></div>` : '',
    `<div class="fw"><span class="fk">Temp:</span><span class="fv" style="color:${tempColour};font-weight:bold">${data.temperature_c}°C</span></div>`,
    `</div>`,
    `</div>`,
  ].filter(Boolean).join('')

  const body = Array.from({ length: copies }, () => lbl).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${labelCSS()}</style></head><body>${body}</body></html>`
}

// ── Mince / Prep production label ─────────────────────────────────────────────

export function renderMinceHTML(data: MinceLabelData, copies = 1): string {
  const mode    = data.output_mode.toUpperCase()
  const sources = data.source_batch_numbers.slice(0, 3).join(', ')
  const killStr = (data.kill_date && data.days_from_kill !== null)
    ? `${data.kill_date} (${data.days_from_kill} days)`
    : null
  const barcode = generateBarcodeSVG(data.batch_code, 260, 42, 8)

  const lbl = [
    `<div class="label">`,
    `<div class="hdr"><span class="co">MFS GLOBAL</span><span class="tp">PRODUCTION · ${mode}</span></div>`,
    `<div class="bc">${data.batch_code}</div>`,
    `<div class="br">${barcode}</div>`,
    `<div class="dv"></div>`,
    `<div class="fl">`,
    `<div class="fw"><span class="fk">Species:</span><span class="fv">${data.product_species}</span></div>`,
    `<div class="fw"><span class="fk">Prod date:</span><span class="fv">${data.date}</span></div>`,
    killStr ? `<div class="fw"><span class="fk">Kill date:</span><span class="fv">${killStr}</span></div>` : '',
    sources ? `<div class="fw"><span class="fk">Source:</span><span class="fv" style="font-family:'Courier New',monospace;font-size:7pt">${sources}</span></div>` : '',
    `<div class="fw"><span class="fk">Use by:</span><span class="fv" style="font-weight:bold">${data.use_by}</span></div>`,
    `</div>`,
    `</div>`,
  ].filter(Boolean).join('')

  const body = Array.from({ length: copies }, () => lbl).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${labelCSS()}</style></head><body>${body}</body></html>`
}
