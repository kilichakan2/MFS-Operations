/**
 * tests/unit/orders/types.test.ts
 *
 * Unit tests for the order pipeline type helpers.
 *
 * Covers the pure logic in lib/domain/orderReference.ts — reference
 * format parsing/formatting and state transition validation. Database
 * behaviour (CHECK constraints, RLS, triggers) is verified directly
 * against Supabase during the migration; not retested here.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB1)
 */

import { describe, it, expect } from 'vitest'
import {
  parseOrderReference,
  formatOrderReference,
  isValidStateTransition,
  ORDER_REFERENCE_REGEX,
} from '../../../lib/domain/orderReference'
import type { OrderState } from '../../../lib/domain/Order'

describe('ORDER_REFERENCE_REGEX', () => {
  it('matches the canonical format', () => {
    expect(ORDER_REFERENCE_REGEX.test('MFS-2026-0001')).toBe(true)
    expect(ORDER_REFERENCE_REGEX.test('MFS-2026-9999')).toBe(true)
    expect(ORDER_REFERENCE_REGEX.test('MFS-2030-4172')).toBe(true)
  })

  it('rejects malformed inputs', () => {
    expect(ORDER_REFERENCE_REGEX.test('MFS-2026')).toBe(false)
    expect(ORDER_REFERENCE_REGEX.test('mfs-2026-0001')).toBe(false)        // lowercase
    expect(ORDER_REFERENCE_REGEX.test('MFS-26-0001')).toBe(false)          // 2-digit year
    expect(ORDER_REFERENCE_REGEX.test('MFS-2026-1')).toBe(false)           // unpadded seq
    expect(ORDER_REFERENCE_REGEX.test('MFS-2026-00001')).toBe(false)       // 5-digit seq
    expect(ORDER_REFERENCE_REGEX.test('MFS-2026-0001 ')).toBe(false)       // trailing space
    expect(ORDER_REFERENCE_REGEX.test(' MFS-2026-0001')).toBe(false)       // leading space
    expect(ORDER_REFERENCE_REGEX.test('SO-008218')).toBe(false)            // BarcodeX format
    expect(ORDER_REFERENCE_REGEX.test('')).toBe(false)
  })
})

describe('parseOrderReference', () => {
  it('parses a valid reference into year and sequence', () => {
    expect(parseOrderReference('MFS-2026-0001')).toEqual({ year: 2026, sequence: 1 })
    expect(parseOrderReference('MFS-2026-9999')).toEqual({ year: 2026, sequence: 9999 })
    expect(parseOrderReference('MFS-2030-0042')).toEqual({ year: 2030, sequence: 42 })
  })

  it('returns null for malformed input', () => {
    expect(parseOrderReference('garbage')).toBeNull()
    expect(parseOrderReference('MFS-2026')).toBeNull()
    expect(parseOrderReference('mfs-2026-0001')).toBeNull()
    expect(parseOrderReference('')).toBeNull()
  })
})

describe('formatOrderReference', () => {
  it('formats a year + sequence into MFS-YYYY-NNNN', () => {
    expect(formatOrderReference(2026, 1)).toBe('MFS-2026-0001')
    expect(formatOrderReference(2026, 42)).toBe('MFS-2026-0042')
    expect(formatOrderReference(2026, 9999)).toBe('MFS-2026-9999')
  })

  it('pads sequences below 1000 to 4 digits', () => {
    expect(formatOrderReference(2026, 0)).toBe('MFS-2026-0000')
    expect(formatOrderReference(2026, 5)).toBe('MFS-2026-0005')
    expect(formatOrderReference(2026, 99)).toBe('MFS-2026-0099')
  })

  it('does not truncate sequences over 9999', () => {
    // 5-digit overflow is intentional — the regex won't match it, but the
    // function shouldn't lose data. The database sequence is bigint so
    // this is theoretically reachable.
    expect(formatOrderReference(2026, 10000)).toBe('MFS-2026-10000')
  })

  it('round-trips with parseOrderReference', () => {
    const tests: Array<[number, number]> = [
      [2026, 1], [2026, 100], [2026, 9999], [2030, 42],
    ]
    for (const [year, seq] of tests) {
      const formatted = formatOrderReference(year, seq)
      const parsed = parseOrderReference(formatted)
      expect(parsed).toEqual({ year, sequence: seq })
    }
  })
})

describe('isValidStateTransition', () => {
  it('allows placed -> printed', () => {
    expect(isValidStateTransition('placed', 'printed')).toBe(true)
  })

  it('allows printed -> completed', () => {
    expect(isValidStateTransition('printed', 'completed')).toBe(true)
  })

  it('rejects no-op transitions', () => {
    const states: OrderState[] = ['placed', 'printed', 'completed']
    for (const s of states) {
      expect(isValidStateTransition(s, s)).toBe(false)
    }
  })

  it('rejects skip-ahead transitions', () => {
    // placed -> completed is not allowed; must go via printed
    expect(isValidStateTransition('placed', 'completed')).toBe(false)
  })

  it('rejects all backward transitions', () => {
    expect(isValidStateTransition('printed',   'placed')).toBe(false)
    expect(isValidStateTransition('completed', 'placed')).toBe(false)
    expect(isValidStateTransition('completed', 'printed')).toBe(false)
  })
})
