/**
 * lib/printing/countries.ts
 *
 * Single source of the country-code → display-name map for beef-labelling
 * origin lines. Previously duplicated inline in app/api/labels/route.ts and
 * lib/printing/html.ts; extracted here (F-PROD-04 prep label) to avoid a third
 * copy. Covers the main beef origin countries seen in UK trade. Falls back to
 * the raw uppercased code when not found.
 */

export const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom', UK: 'United Kingdom',
  IE: 'Ireland',        AU: 'Australia',
  NZ: 'New Zealand',    FR: 'France',
  DE: 'Germany',        NL: 'Netherlands',
  BE: 'Belgium',        ES: 'Spain',
  IT: 'Italy',          PL: 'Poland',
  BR: 'Brazil',         AR: 'Argentina',
  UY: 'Uruguay',        US: 'United States',
  CA: 'Canada',         ZA: 'South Africa',
  NA: 'Namibia',        BW: 'Botswana',
  IN: 'India',          PK: 'Pakistan',
}

/** Map a single ISO country code to its display name; '—' for null/empty. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '—'
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase()
}
