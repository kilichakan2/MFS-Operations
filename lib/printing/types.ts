/**
 * lib/printing/types.ts
 *
 * Shared types for the label printing module.
 * Phase 1/2: html render → browser print
 * Phase 3: zpl → Zebra Cloud Connect WebSocket
 */

export type LabelType   = 'delivery' | 'mince' | 'prep'
export type PrintFormat = 'html' | 'zpl'
export type OutputMode  = 'chilled' | 'frozen' | 'prep'
export type LabelWidth  = '100mm' | '58mm'

/**
 * MFS's own cutting-plant code in the Compulsory Beef Labelling Scheme (BLS) form.
 * Prefix is `GB` (the BLS scheme prefix), NOT the oval health-mark `UK 2946 EC`.
 * Same plant number 2946 — different official prefix for this scheme. Domain
 * constant (not a vendor). Printed verbatim as "Further cut in GB2946" on the
 * delivery + prep dispatch labels. (F-PROD-04 — RPA digest, decision locked
 * 2026-06-30.)
 */
export const MFS_PLANT_CODE = 'GB2946'

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
  mfs_plant:      string         // MFS BLS cutting-plant code — always "GB2946" (MFS_PLANT_CODE)
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

/**
 * PREP (meat-prep) dispatch label data — Compulsory Beef Labelling Scheme.
 *
 * Kept SEPARATE from MinceLabelData (NOT a shared/extended type) because the BLS
 * rules differ by template: prep's `slaughtered_in` is COUNTRY+PLANT (e.g.
 * "GB1234") and prep carries `cut_in` (primary cut site, country+plant) +
 * `further_cut_in` (MFS, GB2946) — fields mince does not have. Mince's
 * `slaughtered_in` is COUNTRY-ONLY ("GB") and there is no cut line. A shared type
 * would carry misleading optional fields; two honest types pass the deletion test.
 */
export interface PrepLabelData {
  batch_code:           string
  product_name:         string   // prep uses product_name (not product_species)
  product_species:      string   // optional traceability hint — '' if not captured
  output_mode:          OutputMode
  date:                 string   // human-readable
  kill_date:            string | null
  days_from_kill:       number | null
  source_batch_numbers: string[]
  use_by:               string   // human-readable — passed from print dialog
  // BLS fields — aggregated from source delivery records
  origins:              string[] // born-in country NAMES e.g. ["United Kingdom", "Ireland"]
  reared_in:            string[] // reared-in country NAMES (distinct)
  slaughtered_in:       string[] // COUNTRY+PLANT codes e.g. ["GB1234","IE5678"] — raw, digits kept
  cut_in:               string[] // PRIMARY cut site(s), country+plant e.g. ["GB5678"] — raw
  further_cut_in:       string   // MFS plant — MFS_PLANT_CODE = "GB2946"
  allergens_present:    string[] // allergens from CCP-MP2 check — empty = none
}

export type LabelData = DeliveryLabelData | MinceLabelData | PrepLabelData

// ── Print config ──────────────────────────────────────────────────────────────

export interface PrintConfig {
  format:  PrintFormat  // 'html' (Phase 1/2) | 'zpl' (Phase 3)
  copies:  number       // 1–50
  width:   LabelWidth   // '100mm' (Zebra) | '58mm' (Sunmi V3)
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  format: 'html',
  copies: 1,
  width:  '100mm',
}
