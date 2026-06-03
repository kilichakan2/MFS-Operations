/**
 * tests/unit/dashboard-admin/stat-blocks.test.ts
 *
 * Pure-data assertions for the helpers exported alongside the
 * /dashboard/admin stat block component. Visual correctness is
 * verified at the chrome-matrix + restyle-spec e2e layers.
 */

import { describe, it, expect } from 'vitest'
import {
  computeHunterFarmerSplit,
  formatStatValue,
} from '@/app/dashboard/admin/_components/stat-blocks'

describe('computeHunterFarmerSplit', () => {
  it('rounds shares to whole percent + sums to 100', () => {
    const split = computeHunterFarmerSplit({ existing: 62, prospects: 38 })
    expect(split.farmer + split.hunter).toBe(100)
    expect(split.farmer).toBe(62)
    expect(split.hunter).toBe(38)
  })

  it('zero total returns 0/0 (renders empty bar)', () => {
    expect(computeHunterFarmerSplit({ existing: 0, prospects: 0 })).toEqual({
      farmer: 0, hunter: 0,
    })
  })

  it('all-prospects = 100% hunter', () => {
    expect(computeHunterFarmerSplit({ existing: 0, prospects: 10 })).toEqual({
      farmer: 0, hunter: 100,
    })
  })

  it('all-existing = 100% farmer', () => {
    expect(computeHunterFarmerSplit({ existing: 10, prospects: 0 })).toEqual({
      farmer: 100, hunter: 0,
    })
  })
})

describe('formatStatValue', () => {
  it('renders null as em-dash placeholder', () => {
    expect(formatStatValue(null)).toBe('—')
  })

  it('renders zero as "0", not em-dash', () => {
    expect(formatStatValue(0)).toBe('0')
  })

  it('renders positive integers verbatim', () => {
    expect(formatStatValue(22)).toBe('22')
    expect(formatStatValue(41)).toBe('41')
  })
})
