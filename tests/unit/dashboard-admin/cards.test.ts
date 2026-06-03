/**
 * tests/unit/dashboard-admin/cards.test.ts
 *
 * Pure-data assertions for the helpers exported alongside the
 * /dashboard/admin card components. Component rendering is verified
 * at the chrome-matrix + restyle-spec e2e layers — these tests
 * cover the pure mappings only.
 */

import { describe, it, expect } from 'vitest'
import {
  pickStageColor,
  sortRepsByCountDesc,
  categoryColorCycle,
} from '@/app/dashboard/admin/_components/cards'

describe('pickStageColor', () => {
  it('Quoted → orange dot', () => {
    expect(pickStageColor('Quoted')).toBe('bg-mfs-orange')
  })

  it('Sampling → sand dot', () => {
    expect(pickStageColor('Sampling')).toBe('bg-mfs-sand')
  })

  it('Contacted → navy dot', () => {
    expect(pickStageColor('Contacted')).toBe('bg-mfs-navy')
  })

  it('unknown stage → navy fallback', () => {
    expect(pickStageColor('Won')).toBe('bg-mfs-navy')
    expect(pickStageColor('')).toBe('bg-mfs-navy')
  })

  it('never returns a raw hex literal', () => {
    const samples = ['Quoted', 'Sampling', 'Contacted', 'Won', 'Lost', ''].map(pickStageColor)
    expect(samples.every(c => !/#[0-9A-Fa-f]{3,8}/.test(c))).toBe(true)
  })
})

describe('sortRepsByCountDesc', () => {
  it('orders descending by total', () => {
    const input = [
      { rep: 'A', total: 5 }, { rep: 'B', total: 12 }, { rep: 'C', total: 8 },
    ]
    expect(sortRepsByCountDesc(input)).toEqual([
      { rep: 'B', total: 12 }, { rep: 'C', total: 8 }, { rep: 'A', total: 5 },
    ])
  })

  it('preserves input array (no mutation)', () => {
    const input = [{ rep: 'A', total: 1 }, { rep: 'B', total: 9 }]
    const copy  = [...input]
    sortRepsByCountDesc(input)
    expect(input).toEqual(copy)
  })

  it('empty input returns empty array', () => {
    expect(sortRepsByCountDesc([])).toEqual([])
  })

  it('preserves additional fields on the rep object', () => {
    const input = [{ rep: 'A', total: 1, types: { routine: 1 } }]
    expect(sortRepsByCountDesc(input)).toEqual(input)
  })
})

describe('categoryColorCycle', () => {
  it('returns the 5-colour mfs-* brand cycle', () => {
    expect(categoryColorCycle).toEqual([
      'var(--mfs-maroon)',
      'var(--mfs-orange)',
      'var(--mfs-navy)',
      'var(--mfs-sand)',
      'var(--mfs-red)',
    ])
  })

  it('contains no raw hex literals', () => {
    expect(categoryColorCycle.every(c => !/#[0-9A-Fa-f]{3,8}/.test(c))).toBe(true)
  })

  it('every colour references a CSS variable, not a Tailwind class', () => {
    // Recharts fills only accept CSS colour strings (not Tailwind class
    // names) — so the cycle has to use var(--mfs-*) directly.
    expect(categoryColorCycle.every(c => c.startsWith('var(--mfs-'))).toBe(true)
  })
})
