/**
 * lib/allergen/monthlyReviewUtils.ts
 *
 * Pure functions for monthly allergen review logic.
 * Shared between the API route and unit tests.
 */

/** Parse 'YYYY-MM' → { start: 'YYYY-MM-01', end: 'YYYY-MM-DD' } */
export function monthDateRange(monthYear: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) return null
  const [y, m] = monthYear.split('-').map(Number)
  if (m < 1 || m > 12) return null
  const start   = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()  // day 0 of next month = last day of this month
  const end     = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Determine review site status from delivery counts */
export function deriveSiteStatus(
  totalDeliveries: number,
  allergenDetections: number,
): 'confirmed_nil' | 'detections_found' | 'no_deliveries' {
  if (totalDeliveries === 0)   return 'no_deliveries'
  if (allergenDetections > 0)  return 'detections_found'
  return 'confirmed_nil'
}

/** Aggregate delivery rows into category counts { lamb: 5, dairy: 3, ... } */
export function buildCategoryBreakdown(
  deliveries: Array<{ product_category: string }>,
): Record<string, number> {
  const breakdown: Record<string, number> = {}
  for (const d of deliveries) {
    breakdown[d.product_category] = (breakdown[d.product_category] ?? 0) + 1
  }
  return breakdown
}
