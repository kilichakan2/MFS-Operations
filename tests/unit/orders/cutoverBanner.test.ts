/**
 * tests/unit/orders/cutoverBanner.test.ts
 *
 * Unit tests for the cutover phase calculation behind
 * components/OrderCutoverBanner.tsx.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB6)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getCutoverPhase } from '../../../lib/orders/cutoverPhase'

describe('getCutoverPhase', () => {
  const START_KEY = 'NEXT_PUBLIC_ORDER_CUTOVER_START'
  const END_KEY   = 'NEXT_PUBLIC_ORDER_CUTOVER_END'

  let origStart: string | undefined
  let origEnd:   string | undefined

  beforeEach(() => {
    origStart = process.env[START_KEY]
    origEnd   = process.env[END_KEY]
    delete process.env[START_KEY]
    delete process.env[END_KEY]
  })

  afterEach(() => {
    if (origStart === undefined) delete process.env[START_KEY]
    else process.env[START_KEY] = origStart
    if (origEnd === undefined) delete process.env[END_KEY]
    else process.env[END_KEY] = origEnd
  })

  it('returns null when both env vars are unset', () => {
    expect(getCutoverPhase(new Date('2026-06-01T12:00:00Z'))).toBeNull()
  })

  it('returns null when only start is set', () => {
    process.env[START_KEY] = '2026-06-01'
    expect(getCutoverPhase(new Date('2026-06-01T12:00:00Z'))).toBeNull()
  })

  it('returns null when only end is set', () => {
    process.env[END_KEY] = '2026-06-30'
    expect(getCutoverPhase(new Date('2026-06-15T12:00:00Z'))).toBeNull()
  })

  it('returns null for dates before the cutover window', () => {
    process.env[START_KEY] = '2026-06-01'
    process.env[END_KEY]   = '2026-06-30'
    expect(getCutoverPhase(new Date('2026-05-31T23:00:00Z'))).toBeNull()
  })

  it('returns null for dates after the cutover window', () => {
    process.env[START_KEY] = '2026-06-01'
    process.env[END_KEY]   = '2026-06-30'
    expect(getCutoverPhase(new Date('2026-07-01T12:00:00Z'))).toBeNull()
  })

  it("returns 'parallel' for first half of the window", () => {
    process.env[START_KEY] = '2026-06-01'
    process.env[END_KEY]   = '2026-06-30'  // 30 days; halfway is ~June 15
    expect(getCutoverPhase(new Date('2026-06-05T12:00:00Z'))).toBe('parallel')
    expect(getCutoverPhase(new Date('2026-06-10T12:00:00Z'))).toBe('parallel')
  })

  it("returns 'fallback' for second half of the window", () => {
    process.env[START_KEY] = '2026-06-01'
    process.env[END_KEY]   = '2026-06-30'
    expect(getCutoverPhase(new Date('2026-06-20T12:00:00Z'))).toBe('fallback')
    expect(getCutoverPhase(new Date('2026-06-29T12:00:00Z'))).toBe('fallback')
  })

  it("returns 'parallel' on the exact start day", () => {
    process.env[START_KEY] = '2026-06-01'
    process.env[END_KEY]   = '2026-06-30'
    expect(getCutoverPhase(new Date('2026-06-01T00:00:00Z'))).toBe('parallel')
  })

  it("returns 'fallback' on the exact end day", () => {
    process.env[START_KEY] = '2026-06-01'
    process.env[END_KEY]   = '2026-06-30'
    expect(getCutoverPhase(new Date('2026-06-30T12:00:00Z'))).toBe('fallback')
  })

  it('returns null for malformed start date', () => {
    process.env[START_KEY] = 'not-a-date'
    process.env[END_KEY]   = '2026-06-30'
    expect(getCutoverPhase(new Date('2026-06-15T12:00:00Z'))).toBeNull()
  })

  it('returns null for malformed end date', () => {
    process.env[START_KEY] = '2026-06-01'
    process.env[END_KEY]   = 'nope'
    expect(getCutoverPhase(new Date('2026-06-15T12:00:00Z'))).toBeNull()
  })
})
