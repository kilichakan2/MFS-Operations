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

import type { LabelType, LabelData, PrintConfig, DeliveryLabelData, MinceLabelData } from './types'
import { generateDeliveryZPL, generateMinceZPL } from './zpl'
import { renderDeliveryHTML, renderMinceHTML, renderDeliveryHTML58, renderMinceHTML58 } from './html'

export { formatGoodsInBatchCode, formatMinceBatchCode, ddmmFromDate, calculateUseByFromDays, fmtDisplayDate } from './zpl'
export type { LabelType, LabelData, PrintConfig, DeliveryLabelData, MinceLabelData } from './types'

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
    const zpl = type === 'delivery'
      ? generateDeliveryZPL(data as DeliveryLabelData, copies)
      : generateMinceZPL(data as MinceLabelData, copies)

    const batchCode = type === 'delivery'
      ? (data as DeliveryLabelData).batch_code
      : (data as MinceLabelData).batch_code

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

  const html = is58mm
    ? renderMinceHTML58(data as MinceLabelData, copies)
    : renderMinceHTML(data as MinceLabelData, copies)

  const batchCode = (data as MinceLabelData).batch_code
  return { content: html, contentType: 'text/html', filename: `label-${batchCode}.html` }
}
