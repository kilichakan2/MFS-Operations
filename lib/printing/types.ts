/**
 * lib/printing/types.ts
 *
 * Shared types for the label printing module.
 * Phase 1/2: html render → browser print
 * Phase 3: zpl → Zebra Cloud Connect WebSocket
 */

export type LabelType = 'delivery' | 'mince'
export type PrintFormat = 'html' | 'zpl'
export type OutputMode = 'chilled' | 'frozen' | 'prep'

// ── Label data shapes (mapped from DB records) ────────────────────────────────

export interface DeliveryLabelData {
  batch_code:     string
  supplier:       string
  product:        string
  species:        string
  date_received:  string  // human-readable e.g. "21 Apr 2026"
  born_in:        string | null  // ISO country code e.g. "GB"
  reared_in:      string | null  // ISO country code — null if same as born_in
  slaughter_site: string | null  // plant code e.g. "GB1234"
  cut_site:       string | null  // plant code — null if same as slaughter_site
  mfs_plant:      string         // MFS FSA approval number — always "UK2946"
  temperature_c:  number
  temp_status:    string  // 'pass' | 'urgent' | 'fail'
}

export interface MinceLabelData {
  batch_code:           string
  product_species:      string
  output_mode:          OutputMode
  date:                 string   // human-readable
  kill_date:            string | null
  days_from_kill:       number | null
  source_batch_numbers: string[]
  use_by:               string   // human-readable — passed from print dialog (staff pick at print time)
  // BLS fields — aggregated from source delivery records
  origins:              string[] // country names e.g. ["United Kingdom", "Ireland"]
  slaughtered_in:       string[] // country codes e.g. ["GB"] — country only per Danny, not plant number
  minced_in:            string   // always "GB" — MFS is Sheffield
  allergens_present:    string[] // allergens from CCP-MP2 check — empty = none
}

export type LabelData = DeliveryLabelData | MinceLabelData

// ── Print config ──────────────────────────────────────────────────────────────

export interface PrintConfig {
  format:  PrintFormat  // 'html' (Phase 1/2) | 'zpl' (Phase 3)
  copies:  number       // 1–50
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  format: 'html',
  copies: 1,
}
