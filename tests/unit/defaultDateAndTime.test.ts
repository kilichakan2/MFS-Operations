/**
 * tests/unit/defaultDateAndTime.test.ts
 *
 * Unit tests for the 10 AM dispatcher default rule.
 * All inputs are constructed dates — no system clock dependency.
 */

import { describe, it, expect } from 'vitest'
import { getDefaultDateAndTime } from '../../lib/utils/defaultDateAndTime'

// Helper: build a Date at a specific local hour on a known date
function makeDate(isoDate: string, hours: number, minutes = 0): Date {
  const d = new Date(`${isoDate}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`)
  return d
}

describe('getDefaultDateAndTime — 10 AM dispatcher rule', () => {

  it('returns TODAY when called at 09:59 (just before cutoff)', () => {
    const now = makeDate('2026-03-28', 9, 59)
    const { date, time } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-03-28')
    expect(time).toBe('10:00')
  })

  it('returns TODAY when called at 09:00', () => {
    const now = makeDate('2026-03-28', 9, 0)
    const { date, time } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-03-28')
    expect(time).toBe('10:00')
  })

  it('returns TODAY when called at 00:00 (midnight)', () => {
    const now = makeDate('2026-03-28', 0, 0)
    const { date, time } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-03-28')
    expect(time).toBe('10:00')
  })

  it('returns TOMORROW when called at 10:00 exactly (at the cutoff)', () => {
    const now = makeDate('2026-03-28', 10, 0)
    const { date, time } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-03-29')
    expect(time).toBe('10:00')
  })

  it('returns TOMORROW when called at 10:01 (just past cutoff)', () => {
    const now = makeDate('2026-03-28', 10, 1)
    const { date, time } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-03-29')
    expect(time).toBe('10:00')
  })

  it('returns TOMORROW when called at 14:30 (mid-afternoon)', () => {
    const now = makeDate('2026-03-28', 14, 30)
    const { date, time } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-03-29')
    expect(time).toBe('10:00')
  })

  it('returns TOMORROW when called at 23:59 (end of day)', () => {
    const now = makeDate('2026-03-28', 23, 59)
    const { date, time } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-03-29')
    expect(time).toBe('10:00')
  })

  it('rolls month correctly at end of month (Mar 31 → Apr 1)', () => {
    const now = makeDate('2026-03-31', 11, 0)
    const { date } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-04-01')
  })

  it('rolls year correctly at Dec 31 → Jan 1', () => {
    const now = makeDate('2025-12-31', 15, 0)
    const { date } = getDefaultDateAndTime(now)
    expect(date).toBe('2026-01-01')
  })

  it('always returns time as 10:00 regardless of input time', () => {
    const cases = [0, 6, 9, 10, 14, 22, 23]
    for (const h of cases) {
      const { time } = getDefaultDateAndTime(makeDate('2026-03-28', h))
      expect(time).toBe('10:00')
    }
  })
})
