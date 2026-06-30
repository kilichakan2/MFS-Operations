/**
 * lib/printing/index.ts
 *
 * Abstraction layer for label printing.
 *
 * Phase 1/2: returns HTML for browser print
 * Phase 3:   returns ZPL for Zebra Cloud Connect (future)
 *
 * The same ZPL templates work on TSC TE310 and Zebra ZD421d over TCP port 9100.
 * Upgrade from Phase 2 → 3 = change PrintConfig.format from 'html' to 'zpl'.
 */

import type { LabelType, LabelData, PrintConfig, DeliveryLabelData, MinceLabelData, PrepLabelData } from './types'
import { generateDeliveryZPL, generateMinceZPL, generatePrepZPL } from './zpl'
import {
  renderDeliveryHTML, renderMinceHTML, renderPrepHTML,
  renderDeliveryHTML58, renderMinceHTML58, renderPrepHTML58,
} from './html'

export { formatGoodsInBatchCode, formatMinceBatchCode, ddmmFromDate, calculateUseByFromDays, fmtDisplayDate } from './zpl'
export { MFS_PLANT_CODE } from './types'
export type { LabelType, LabelData, PrintConfig, DeliveryLabelData, MinceLabelData, PrepLabelData } from './types'
// Re-export renderers so the BLS compliance oracle (tests) and the Sunmi adapter
// can import them from the single printing entry point.
export {
  renderDeliveryHTML, renderMinceHTML, renderPrepHTML,
  renderDeliveryHTML58, renderMinceHTML58, renderPrepHTML58,
} from './html'
export { generateDeliveryZPL, generateMinceZPL, generatePrepZPL } from './zpl'

export interface LabelOutput {
  content:     string
  contentType: string  // 'text/html' | 'text/plain'
  filename:    string
}

/**
 * Generate label output for a given label type and data.
 *
 * Phase 1/2: config.format = 'html' → returns HTML for AirPrint
 * Phase 3:   config.format = 'zpl'  → returns ZPL for Zebra Cloud Connect
 */
export function generateLabel(
  type:   LabelType,
  data:   LabelData,
  config: PrintConfig,
): LabelOutput {
  const { format, copies } = config

  if (format === 'zpl') {
    let zpl: string
    if (type === 'delivery')      zpl = generateDeliveryZPL(data as DeliveryLabelData, copies)
    else if (type === 'prep')     zpl = generatePrepZPL(data as PrepLabelData, copies)
    else                          zpl = generateMinceZPL(data as MinceLabelData, copies)

    const batchCode = (data as DeliveryLabelData | MinceLabelData | PrepLabelData).batch_code

    return {
      content:     zpl,
      contentType: 'text/plain',
      filename:    `${batchCode}.zpl`,
    }
  }

  // Default: HTML for browser/AirPrint
  const is58mm = config.width === '58mm'

  if (type === 'delivery') {
    const html = is58mm
      ? renderDeliveryHTML58(data as DeliveryLabelData, copies, (config as PrintConfig & { supplierCode?: string }).supplierCode)
      : renderDeliveryHTML(data as DeliveryLabelData, copies)

    const batchCode = (data as DeliveryLabelData).batch_code
    return { content: html, contentType: 'text/html', filename: `label-${batchCode}.html` }
  }

  if (type === 'prep') {
    const html = is58mm
      ? renderPrepHTML58(data as PrepLabelData, copies)
      : renderPrepHTML(data as PrepLabelData, copies)

    const batchCode = (data as PrepLabelData).batch_code
    return { content: html, contentType: 'text/html', filename: `label-${batchCode}.html` }
  }

  const html = is58mm
    ? renderMinceHTML58(data as MinceLabelData, copies)
    : renderMinceHTML(data as MinceLabelData, copies)

  const batchCode = (data as MinceLabelData).batch_code
  return { content: html, contentType: 'text/html', filename: `label-${batchCode}.html` }
}
