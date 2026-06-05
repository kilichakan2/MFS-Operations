/**
 * tests/unit/dates.test.ts
 *
 * Boundary-case assertions for londonToday() — the date helper that
 * replaces the UTC-leaking `now.toISOString().split('T')[0]` pattern
 * across the dashboard and pricing APIs.
 *
 * Bug shape: a Date in UTC can be a day ahead of the same instant in
 * Europe/London during BST (when UK local is just after midnight but
 * UTC is still 23:xx of the prior date). The helper takes the Date
 * as a parameter so tests pass explicit timestamps — no fake timers
 * needed.
 */

import { describe, it, expect } from 'vitest'
import { londonToday } from '@/lib/dates'

describe('londonToday', () => {
  it('winter midday UTC — no divergence, returns the same date', () => {
    // 2026-01-15 is GMT (UTC+0). UK local clock matches UTC.
    expect(londonToday(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01-15')
  })

  it('BST midnight rollover — UTC says prior day, UK local is next day', () => {
    // 2026-06-14T23:30:00Z is BST (UTC+1) → 00:30 on 2026-06-15
    // local. The old buggy `toISOString().split('T')[0]` returned
    // '2026-06-14' here, which is what made late-evening UK data
    // disappear from "today" filters. The fix returns the UK-local
    // date.
    expect(londonToday(new Date('2026-06-14T23:30:00Z'))).toBe('2026-06-15')
  })

  it('BST midday — returns the local date (UTC and local agree)', () => {
    // 2026-06-15T12:00:00Z → 13:00 BST same date. No divergence.
    expect(londonToday(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06-15')
  })

  it('winter midnight UTC — GMT == UTC, no divergence', () => {
    // 2026-01-15T00:00:00Z is 00:00 GMT 2026-01-15 local. The bug
    // never triggers in winter because GMT and UTC are aligned.
    expect(londonToday(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15')
  })

  it('GMT→BST transition day — handles the 01:00 forward jump cleanly', () => {
    // Last Sunday of March 2026 is 2026-03-29. At 01:00 UTC clocks
    // jump 01:00 GMT → 02:00 BST. Just before the jump (00:30 UTC)
    // is 00:30 GMT 2026-03-29 local; just after (02:30 UTC) is
    // 03:30 BST 2026-03-29 local. Both are the same UK-local date,
    // which is what the helper must report.
    expect(londonToday(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29')
    expect(londonToday(new Date('2026-03-29T02:30:00Z'))).toBe('2026-03-29')
  })

  it('default arg — returns a valid YYYY-MM-DD string from "now"', () => {
    // Doesn't assert a specific value (clock-dependent); just
    // verifies the default-arg path works and produces the
    // expected shape. The Intl.DateTimeFormat en-CA locale is
    // contractually YYYY-MM-DD.
    const result = londonToday()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
