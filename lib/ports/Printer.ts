/**
 * lib/ports/Printer.ts — the Printer transport port (F-PROD-04 Pass 2a, ADR-0010)
 *
 * The client-side "get this label onto paper" seam. Abstracts TRANSPORT only —
 * how rendered label bytes reach a printer on the device. The renderer
 * (lib/printing/{index,html,zpl,types}.ts) is deliberately port-less: it is a
 * pure server-side function with no vendor to swap (ADR-0010 §2).
 *
 * Pure TypeScript: NO vendor import, NO React import, NO `window` access. Carries
 * enough to build the `/api/labels` URL for both label types AND the flat-string
 * delivery payload the Sunmi native bridge formats from.
 */

export type PrintErrorKind = 'auth-bounce' | 'error'

export type LabelWidth = '58mm' | '100mm'

/** Flat delivery payload — exactly the fields the native bridge formats from.
 *  Moved verbatim from lib/printing/sunmi.ts (DeliveryForPrint), plus width/copies
 *  for URL fidelity on the iframe fallback path. */
export interface DeliveryLabelInput {
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
  allergens_flagged: boolean       // intake allergen non-conformance flag (native path mirror of DeliveryLabelData)
  allergen_notes:    string | null // free-text describing flagged allergen(s); null/blank when not flagged
  width:            LabelWidth   // 58mm → native eligible; 100mm → always iframe
  copies:           number       // currently always 1; carried for URL fidelity
}

export interface MinceLabelInput {
  /** Which production template to print: 'mince' (country-only BLS) or 'prep'
   *  (country+plant BLS). Drives the `type=` query param + the native payload. */
  kind:      'mince' | 'prep'
  id:        string
  usebydays: number
  width:     LabelWidth
  copies:    number              // currently always 1
}

export interface Printer {
  /** Print a delivery label. onError surfaces a dead-session/failure to the caller's submitErr. */
  printDeliveryLabel(input: DeliveryLabelInput, onError: (kind: PrintErrorKind) => void): Promise<void>
  /** Print a mince or prep production label (input.kind selects the template).
   *  Native on the Sunmi V3 for 58mm; iframe/AirPrint fallback otherwise. */
  printMinceLabel(input: MinceLabelInput, onError: (kind: PrintErrorKind) => void): Promise<void>
}
