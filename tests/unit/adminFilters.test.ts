/**
 * tests/unit/adminFilters.test.ts
 *
 * Item 5a.1 PR B C11 — validation contract for the /api/admin/visits
 * query params. Each validator exported from lib/adminFilters.ts
 * accepts the absent case (no filter active) plus its enum / UUID
 * shape and rejects malformed input. The admin /visits route hands
 * a 400 back instead of letting Supabase 500 on a bad value.
 */

import { describe, it, expect } from 'vitest'
import {
  isValidRepId, isValidVisitType, isValidOutcome,
  VISIT_TYPES, OUTCOMES,
  parseRangePreset,
} from '@/lib/adminFilters'

describe('isValidRepId', () => {
  it('accepts a lowercase UUID v4-shaped string', () => {
    expect(isValidRepId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
  })

  it('accepts an uppercase UUID', () => {
    expect(isValidRepId('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true)
  })

  it('accepts null and empty string (absent param is always valid)', () => {
    expect(isValidRepId(null)).toBe(true)
    expect(isValidRepId(undefined)).toBe(true)
    expect(isValidRepId('')).toBe(true)
  })

  it('rejects malformed UUIDs', () => {
    expect(isValidRepId('not-a-uuid')).toBe(false)
    expect(isValidRepId('a1b2c3d4-e5f6-7890-abcd')).toBe(false) // too short
    expect(isValidRepId('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toBe(false) // non-hex
    expect(isValidRepId('123')).toBe(false)
  })
})

describe('isValidVisitType', () => {
  it('accepts every value in the canonical VISIT_TYPES set', () => {
    for (const t of VISIT_TYPES) expect(isValidVisitType(t)).toBe(true)
  })

  it('accepts null and empty string', () => {
    expect(isValidVisitType(null)).toBe(true)
    expect(isValidVisitType('')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isValidVisitType('banana')).toBe(false)
    expect(isValidVisitType('ROUTINE')).toBe(false) // case-sensitive
    expect(isValidVisitType('routine ')).toBe(false) // whitespace
  })
})

describe('isValidOutcome', () => {
  it('accepts every value in the canonical OUTCOMES set', () => {
    for (const o of OUTCOMES) expect(isValidOutcome(o)).toBe(true)
  })

  it('accepts null and empty string', () => {
    expect(isValidOutcome(null)).toBe(true)
    expect(isValidOutcome('')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isValidOutcome('happy')).toBe(false)
    expect(isValidOutcome('Positive')).toBe(false) // case-sensitive
  })
})

describe('parseRangePreset', () => {
  it('accepts the four locked range values', () => {
    expect(parseRangePreset('today')).toBe('today')
    expect(parseRangePreset('week')).toBe('week')
    expect(parseRangePreset('month')).toBe('month')
    expect(parseRangePreset('quarter')).toBe('quarter')
  })

  it('falls through to today on absent input', () => {
    expect(parseRangePreset(null)).toBe('today')
    expect(parseRangePreset(undefined)).toBe('today')
    expect(parseRangePreset('')).toBe('today')
  })

  it('falls through to today on unknown values', () => {
    expect(parseRangePreset('banana')).toBe('today')
    expect(parseRangePreset('Today')).toBe('today') // case-sensitive
    expect(parseRangePreset('this_week')).toBe('today') // dashboard preset vocabulary, not TimeChip
  })
})
