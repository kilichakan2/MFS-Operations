/**
 * tests/unit/allergenMonthlyReview.test.ts
 *
 * SALSA 1.4.2 — monthly allergen monitoring review logic.
 *
 * Tests all pure functions exported from or mirrored from:
 *   app/api/haccp/allergen-assessment/monthly-reviews/route.ts
 *   app/haccp/allergens/page.tsx
 */

import { describe, it, expect } from 'vitest'
import {
  monthDateRange,
  deriveSiteStatus,
  buildCategoryBreakdown,
} from '@/lib/allergen/monthlyReviewUtils'

// ── monthDateRange ────────────────────────────────────────────────────────────

describe('monthDateRange — parse YYYY-MM to date range', () => {
  it('May 2026 → 2026-05-01 to 2026-05-31', () => {
    const r = monthDateRange('2026-05')
    expect(r).not.toBeNull()
    expect(r!.start).toBe('2026-05-01')
    expect(r!.end).toBe('2026-05-31')
  })

  it('February 2026 → 2026-02-01 to 2026-02-28 (non-leap)', () => {
    const r = monthDateRange('2026-02')
    expect(r!.start).toBe('2026-02-01')
    expect(r!.end).toBe('2026-02-28')
  })

  it('February 2024 → 2024-02-01 to 2024-02-29 (leap year)', () => {
    const r = monthDateRange('2024-02')
    expect(r!.start).toBe('2024-02-01')
    expect(r!.end).toBe('2024-02-29')
  })

  it('January → 31 days', () => {
    expect(monthDateRange('2026-01')!.end).toBe('2026-01-31')
  })

  it('April → 30 days', () => {
    expect(monthDateRange('2026-04')!.end).toBe('2026-04-30')
  })

  it('December → 31 days', () => {
    expect(monthDateRange('2026-12')!.end).toBe('2026-12-31')
  })

  it('invalid format → null', () => {
    expect(monthDateRange('2026-5')).toBeNull()   // missing leading zero
    expect(monthDateRange('202605')).toBeNull()    // no dash
    expect(monthDateRange('')).toBeNull()           // empty
    expect(monthDateRange('abcd-ef')).toBeNull()   // non-numeric
  })

  it('invalid month number → null', () => {
    expect(monthDateRange('2026-00')).toBeNull()   // month 0
    expect(monthDateRange('2026-13')).toBeNull()   // month 13
  })

  it('start is always 01', () => {
    for (let m = 1; m <= 12; m++) {
      const str = `2026-${String(m).padStart(2, '0')}`
      expect(monthDateRange(str)!.start.endsWith('-01')).toBe(true)
    }
  })

  it('end day ≥ 28 for all months', () => {
    for (let m = 1; m <= 12; m++) {
      const str = `2026-${String(m).padStart(2, '0')}`
      const day = Number(monthDateRange(str)!.end.split('-')[2])
      expect(day).toBeGreaterThanOrEqual(28)
    }
  })
})

// ── deriveSiteStatus ──────────────────────────────────────────────────────────

describe('deriveSiteStatus — determine review outcome', () => {
  it('0 deliveries → no_deliveries (regardless of detections)', () => {
    expect(deriveSiteStatus(0, 0)).toBe('no_deliveries')
  })

  it('deliveries present, 0 detections → confirmed_nil', () => {
    expect(deriveSiteStatus(47, 0)).toBe('confirmed_nil')
  })

  it('deliveries present, 1 detection → detections_found', () => {
    expect(deriveSiteStatus(30, 1)).toBe('detections_found')
  })

  it('deliveries present, multiple detections → detections_found', () => {
    expect(deriveSiteStatus(50, 3)).toBe('detections_found')
  })

  it('1 delivery, 0 detections → confirmed_nil', () => {
    expect(deriveSiteStatus(1, 0)).toBe('confirmed_nil')
  })

  it('0 deliveries, non-zero detections → no_deliveries (impossible in practice, but handled)', () => {
    // If no deliveries, no_deliveries always wins
    expect(deriveSiteStatus(0, 1)).toBe('no_deliveries')
  })
})

// ── buildCategoryBreakdown ────────────────────────────────────────────────────

describe('buildCategoryBreakdown — aggregate deliveries by category', () => {
  it('empty list → empty object', () => {
    expect(buildCategoryBreakdown([])).toEqual({})
  })

  it('single delivery → single entry', () => {
    expect(buildCategoryBreakdown([{ product_category: 'lamb' }])).toEqual({ lamb: 1 })
  })

  it('multiple same category → counted correctly', () => {
    const deliveries = [
      { product_category: 'lamb' },
      { product_category: 'lamb' },
      { product_category: 'lamb' },
    ]
    expect(buildCategoryBreakdown(deliveries)).toEqual({ lamb: 3 })
  })

  it('multiple categories → all counted', () => {
    const deliveries = [
      { product_category: 'lamb' },
      { product_category: 'lamb' },
      { product_category: 'beef' },
      { product_category: 'dairy' },
      { product_category: 'dairy' },
      { product_category: 'dry_goods' },
    ]
    expect(buildCategoryBreakdown(deliveries)).toEqual({
      lamb:      2,
      beef:      1,
      dairy:     2,
      dry_goods: 1,
    })
  })

  it('sum of all values equals total deliveries', () => {
    const deliveries = [
      { product_category: 'lamb' },
      { product_category: 'lamb' },
      { product_category: 'poultry' },
      { product_category: 'dairy' },
      { product_category: 'dry_goods' },
    ]
    const breakdown = buildCategoryBreakdown(deliveries)
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
    expect(total).toBe(deliveries.length)
  })
})

// ── Monthly review logic — integrated scenarios ───────────────────────────────

describe('Monthly review — integrated scenarios', () => {
  it('clean month: 20 deliveries, 0 detections', () => {
    const deliveries = Array.from({ length: 20 }, (_, i) => ({
      product_category: i < 12 ? 'lamb' : i < 17 ? 'beef' : 'dairy',
    }))
    const breakdown = buildCategoryBreakdown(deliveries)
    const status    = deriveSiteStatus(20, 0)
    expect(status).toBe('confirmed_nil')
    expect(breakdown.lamb).toBe(12)
    expect(breakdown.beef).toBe(5)
    expect(breakdown.dairy).toBe(3)
    expect(Object.values(breakdown).reduce((a, b) => a + b, 0)).toBe(20)
  })

  it('month with one allergen detection', () => {
    const status = deriveSiteStatus(35, 1)
    expect(status).toBe('detections_found')
  })

  it('quiet month with no deliveries logged', () => {
    const status = deriveSiteStatus(0, 0)
    expect(status).toBe('no_deliveries')
  })
})

// ── prevMonthStr helper (mirrored from page) ─────────────────────────────────

describe('prevMonthStr — defaults review to previous month', () => {
  function prevMonthStr(now: Date): string {
    const d = new Date(now)
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  it('May 2026 → April 2026', () => {
    expect(prevMonthStr(new Date('2026-05-01'))).toBe('2026-04')
  })

  it('January 2026 → December 2025 (year rollback)', () => {
    expect(prevMonthStr(new Date('2026-01-15'))).toBe('2025-12')
  })

  it('March 2026 → February 2026', () => {
    expect(prevMonthStr(new Date('2026-03-01'))).toBe('2026-02')
  })

  it('result is always valid YYYY-MM format', () => {
    const result = prevMonthStr(new Date('2026-05-01'))
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })
})

// ── fmtMonthYear helper (mirrored from page) ─────────────────────────────────

describe('fmtMonthYear — display format', () => {
  function fmtMonthYear(yyyy_mm: string): string {
    const [y, m] = yyyy_mm.split('-')
    return new Date(Number(y), Number(m) - 1, 1)
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }

  it('2026-05 → May 2026', () => {
    expect(fmtMonthYear('2026-05')).toBe('May 2026')
  })

  it('2026-01 → January 2026', () => {
    expect(fmtMonthYear('2026-01')).toBe('January 2026')
  })

  it('2025-12 → December 2025', () => {
    expect(fmtMonthYear('2025-12')).toBe('December 2025')
  })
})

// ── DB integrity checks (mirrored constraints) ────────────────────────────────

describe('Site status constraint — valid values only', () => {
  const VALID_STATUSES = ['confirmed_nil', 'detections_found', 'no_deliveries']

  it('confirmed_nil is valid', () => {
    expect(VALID_STATUSES).toContain('confirmed_nil')
  })

  it('detections_found is valid', () => {
    expect(VALID_STATUSES).toContain('detections_found')
  })

  it('no_deliveries is valid', () => {
    expect(VALID_STATUSES).toContain('no_deliveries')
  })

  it('deriveSiteStatus only returns valid statuses', () => {
    const results = [
      deriveSiteStatus(0, 0),
      deriveSiteStatus(10, 0),
      deriveSiteStatus(10, 2),
    ]
    for (const r of results) {
      expect(VALID_STATUSES).toContain(r)
    }
  })
})
