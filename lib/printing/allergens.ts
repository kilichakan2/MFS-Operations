// lib/printing/allergens.ts
//
// Delivery-label allergen display logic — single source of truth for the
// None / notes / FLAGGED branching used by every delivery transport
// (renderDeliveryHTML, renderDeliveryHTML58, generateDeliveryZPL,
// buildDeliveryPayload). F-PROD-04 Pass 3.
//
// IMPORTANT semantic: `flagged` is a NON-CONFORMANCE warning flag
// (allergens_identified), NOT a product "contains" allergen list. When true the
// label surfaces the note as a warning; when false the site is allergen-free.
//
// Pure TypeScript: no imports, no framework, no vendor.

export interface DeliveryAllergenDisplay {
  /** The text to print on the "Allergens:" line. */
  text:    string
  /** True when this is a non-conformance warning (renderers colour it red). */
  flagged: boolean
}

export function formatDeliveryAllergens(
  flagged: boolean,
  notes:   string | null,
): DeliveryAllergenDisplay {
  if (!flagged) return { text: 'None', flagged: false }
  const trimmed = (notes ?? '').trim()
  // ASCII hyphen (not an em-dash) so every transport — HTML, ZPL (sanitise strips
  // non-ASCII), native — emits the identical placeholder string.
  return trimmed !== ''
    ? { text: trimmed,                 flagged: true }
    : { text: 'FLAGGED - see record',  flagged: true }
}
