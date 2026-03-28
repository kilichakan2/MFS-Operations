/**
 * tests/unit/ukDateAndHour.test.ts
 *
 * Unit tests for the 7 PM UK rollover logic.
 *
 * getUKDateAndHour() wraps Intl.DateTimeFormat — we test the rollover
 * decision (getEffectiveMinDate) which is the pure business rule.
 * We also test getUKDateAndHour() output shape on known UTC timestamps.
 */

import { describe, it, expect } from 'vitest'
import { getUKDateAndHour, getEffectiveMinDate } from '../../lib/utils/ukDateAndHour'

// ── getEffectiveMinDate (the 7 PM rollover rule) ─────────────────────────────

describe('getEffectiveMinDate — 7 PM rollover rule', () => {

  it('before 19:00 → returns the same date', () => {
    expect(getEffectiveMinDate('2026-03-28', 18)).toBe('2026-03-28')
  })

  it('at exactly 19:00 → rolls to tomorrow', () => {
    expect(getEffectiveMinDate('2026-03-28', 19)).toBe('2026-03-29')
  })

  it('at 20:00 → rolls to tomorrow', () => {
    expect(getEffectiveMinDate('2026-03-28', 20)).toBe('2026-03-29')
  })

  it('at 23:00 → rolls to tomorrow', () => {
    expect(getEffectiveMinDate('2026-03-28', 23)).toBe('2026-03-29')
  })

  it('at 00:00 (midnight) → stays today (not yet 19:00)', () => {
    expect(getEffectiveMinDate('2026-03-28', 0)).toBe('2026-03-28')
  })

  it('rolls month correctly — Mar 31 at 20:00 → Apr 1', () => {
    expect(getEffectiveMinDate('2026-03-31', 20)).toBe('2026-04-01')
  })

  it('rolls year correctly — Dec 31 at 19:00 → Jan 1', () => {
    expect(getEffectiveMinDate('2025-12-31', 19)).toBe('2026-01-01')
  })

  it('boundary: 18:59 → stays today', () => {
    // hour is an integer from Intl (no minutes), 18 = 18:xx
    expect(getEffectiveMinDate('2026-03-28', 18)).toBe('2026-03-28')
  })
})

// ── getUKDateAndHour (timezone conversion) ───────────────────────────────────

describe('getUKDateAndHour — Europe/London timezone conversion', () => {

  it('returns an object with dateStr (YYYY-MM-DD) and numeric hour', () => {
    const result = getUKDateAndHour(new Date())
    expect(result.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof result.hour).toBe('number')
    expect(result.hour).toBeGreaterThanOrEqual(0)
    expect(result.hour).toBeLessThanOrEqual(23)
  })

  it('converts a known UTC timestamp to correct UK GMT time (winter — no offset)', () => {
    // 2026-01-15 18:30:00 UTC → Europe/London is UTC+0 in January → 18:30 UK
    const utcDate = new Date('2026-01-15T18:30:00Z')
    const { dateStr, hour } = getUKDateAndHour(utcDate)
    expect(dateStr).toBe('2026-01-15')
    expect(hour).toBe(18)
  })

  it('converts a known UTC timestamp to correct UK BST time (summer — UTC+1)', () => {
    // 2026-07-15 18:30:00 UTC → Europe/London is UTC+1 in July → 19:30 UK
    // So hour should be 19, not 18
    const utcDate = new Date('2026-07-15T18:30:00Z')
    const { dateStr, hour } = getUKDateAndHour(utcDate)
    expect(dateStr).toBe('2026-07-15')
    expect(hour).toBe(19)  // BST = UTC+1
  })

  it('BST date rollover: 2026-07-15 23:30 UTC → 2026-07-16 00:30 UK', () => {
    // UTC 23:30 + BST +1 = 00:30 next day in UK
    const utcDate = new Date('2026-07-15T23:30:00Z')
    const { dateStr, hour } = getUKDateAndHour(utcDate)
    expect(dateStr).toBe('2026-07-16')
    expect(hour).toBe(0)
  })

  it('Vercel UTC server at 18:01 UTC in winter → UK hour 18, no rollover', () => {
    // Vercel runs in Washington DC (UTC). Winter: UK = UTC.
    // 18:01 UTC = 18:01 UK → hour 18 < 19 → no rollover
    const utcDate = new Date('2026-01-20T18:01:00Z')
    const { hour } = getUKDateAndHour(utcDate)
    expect(hour).toBe(18)
    expect(getEffectiveMinDate('2026-01-20', hour)).toBe('2026-01-20')
  })

  it('Vercel UTC server at 19:01 UTC in winter → UK hour 19, triggers rollover', () => {
    const utcDate = new Date('2026-01-20T19:01:00Z')
    const { dateStr, hour } = getUKDateAndHour(utcDate)
    expect(hour).toBe(19)
    expect(getEffectiveMinDate(dateStr, hour)).toBe('2026-01-21')
  })

  it('Vercel UTC server at 18:01 UTC in BST summer → UK hour 19, triggers rollover', () => {
    // This is the BST trap: 18:01 UTC looks like evening but UK is already past 7 PM
    const utcDate = new Date('2026-07-20T18:01:00Z')
    const { dateStr, hour } = getUKDateAndHour(utcDate)
    expect(hour).toBe(19)  // UTC 18 + BST +1 = 19 UK
    expect(getEffectiveMinDate(dateStr, hour)).toBe('2026-07-21')
  })
})
