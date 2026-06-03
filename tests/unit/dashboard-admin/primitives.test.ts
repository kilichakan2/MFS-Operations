/**
 * tests/unit/dashboard-admin/primitives.test.ts
 *
 * Pure-data assertions for the helpers exported alongside the
 * /dashboard/admin primitive components. Component rendering is
 * verified at the chrome-matrix + restyle-spec e2e layers — these
 * tests cover the pure mappings only.
 */

import { describe, it, expect } from 'vitest'
import {
  accentClassFor,
  formatOrdersSubLabel,
} from '@/app/dashboard/admin/_components/primitives'

describe('accentClassFor', () => {
  it('success → mfs-success Tailwind utilities', () => {
    expect(accentClassFor('success')).toEqual({
      stripe: 'bg-mfs-success',
      value:  'text-mfs-success',
    })
  })

  it('warning → mfs-warning Tailwind utilities', () => {
    expect(accentClassFor('warning')).toEqual({
      stripe: 'bg-mfs-warning',
      value:  'text-mfs-warning',
    })
  })

  it('danger → mfs-danger Tailwind utilities', () => {
    expect(accentClassFor('danger')).toEqual({
      stripe: 'bg-mfs-danger',
      value:  'text-mfs-danger',
    })
  })

  it('navy → mfs-navy Tailwind utilities', () => {
    expect(accentClassFor('navy')).toEqual({
      stripe: 'bg-mfs-navy',
      value:  'text-mfs-navy',
    })
  })

  it('never returns raw hex literals', () => {
    const all = (['success', 'warning', 'danger', 'navy'] as const)
      .flatMap(a => Object.values(accentClassFor(a)))
    expect(all.every(c => !/#[0-9A-Fa-f]{3,8}/.test(c))).toBe(true)
  })
})

describe('formatOrdersSubLabel', () => {
  it('renders three counts slash-separated, single line', () => {
    expect(formatOrdersSubLabel({ placed: 12, printed: 8, completed: 4 }))
      .toBe('12 placed / 8 printed / 4 completed')
  })

  it('zero state renders zeros not blank', () => {
    expect(formatOrdersSubLabel({ placed: 0, printed: 0, completed: 0 }))
      .toBe('0 placed / 0 printed / 0 completed')
  })

  it('three-digit counts do not break the format', () => {
    expect(formatOrdersSubLabel({ placed: 100, printed: 80, completed: 40 }))
      .toBe('100 placed / 80 printed / 40 completed')
  })
})
