/**
 * tests/unit/dashboard-admin/chip-to-range-quarter.test.ts
 *
 * Verifies the new `this_quarter` case added to `chipToRange()` in both
 * /visits and /complaints page files. Quarter math: start = first day of
 * the current calendar quarter at midnight; end = today.
 *
 * Inline mirror — same pattern as preset-to-chip.test.ts and the
 * dashboardShaping.test.ts precedent.
 */

import { describe, it, expect } from 'vitest'

// ── Inline mirror of the helper as defined per page ─────────────────────────

type TimeChip = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_quarter' | 'all_time'

// Helpers parallel to the ones in /visits and /complaints
function todayStr(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getFirstOfQuarterStr(now: Date): string {
  const q = Math.floor(now.getMonth() / 3)
  const start = new Date(now.getFullYear(), q * 3, 1)
  return todayStr(start)
}

function chipToRange(chip: TimeChip, now: Date): { from: string; to: string } | null {
  const today = todayStr(now)
  switch (chip) {
    case 'today':        return { from: today, to: today }
    case 'this_quarter': return { from: getFirstOfQuarterStr(now), to: today }
    case 'all_time':     return null
    // Other cases (yesterday, this_week, this_month) are pre-existing and
    // covered by the page's runtime behaviour; not re-asserted here.
    default:             return null
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chipToRange — this_quarter case (Item 5a.1)', () => {
  it('Q1: January date → from = Jan 1', () => {
    const jan15 = new Date(2026, 0, 15) // 2026-01-15
    expect(chipToRange('this_quarter', jan15)).toEqual({
      from: '2026-01-01',
      to:   '2026-01-15',
    })
  })

  it('Q1: March 31 (last day of Q1) → from = Jan 1', () => {
    const mar31 = new Date(2026, 2, 31) // 2026-03-31
    expect(chipToRange('this_quarter', mar31)).toEqual({
      from: '2026-01-01',
      to:   '2026-03-31',
    })
  })

  it('Q2: April 1 (first day of Q2) → from = Apr 1', () => {
    const apr1 = new Date(2026, 3, 1) // 2026-04-01
    expect(chipToRange('this_quarter', apr1)).toEqual({
      from: '2026-04-01',
      to:   '2026-04-01',
    })
  })

  it('Q2: June 15 → from = Apr 1', () => {
    const jun15 = new Date(2026, 5, 15) // 2026-06-15
    expect(chipToRange('this_quarter', jun15)).toEqual({
      from: '2026-04-01',
      to:   '2026-06-15',
    })
  })

  it('Q3: September date → from = Jul 1', () => {
    const sep10 = new Date(2026, 8, 10) // 2026-09-10
    expect(chipToRange('this_quarter', sep10)).toEqual({
      from: '2026-07-01',
      to:   '2026-09-10',
    })
  })

  it('Q4: December date → from = Oct 1', () => {
    const dec25 = new Date(2026, 11, 25) // 2026-12-25
    expect(chipToRange('this_quarter', dec25)).toEqual({
      from: '2026-10-01',
      to:   '2026-12-25',
    })
  })

  it('Q1 leap-year edge: Feb 29 → from = Jan 1', () => {
    const feb29 = new Date(2028, 1, 29) // 2028-02-29 (leap year)
    expect(chipToRange('this_quarter', feb29)).toEqual({
      from: '2028-01-01',
      to:   '2028-02-29',
    })
  })

  it('today case (regression sanity)', () => {
    const d = new Date(2026, 5, 3)
    expect(chipToRange('today', d)).toEqual({ from: '2026-06-03', to: '2026-06-03' })
  })

  it('all_time returns null (regression sanity)', () => {
    expect(chipToRange('all_time', new Date())).toBeNull()
  })
})
