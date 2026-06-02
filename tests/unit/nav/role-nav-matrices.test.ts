/**
 * tests/unit/nav/role-nav-matrices.test.ts
 *
 * L1 unit tests for the per-role nav matrix builder + translation
 * dictionary entries that the bottom nav depends on.
 *
 * No jsdom — pure data assertions.
 */

import { describe, it, expect } from 'vitest'
import t from '@/lib/translations'
import type { NavMatrix } from '@/components/BottomNav'
import { buildMatrix } from '@/components/RoleNav'

describe('navCompliments translation', () => {
  it('navCompliments EN is "Compliments"', () => {
    expect(t.navCompliments.en).toBe('Compliments')
  })

  it('navCompliments TR is "Övgüler"', () => {
    expect(t.navCompliments.tr).toBe('Övgüler')
  })
})

describe('NavMatrix contract', () => {
  it('NavMatrix type is importable from BottomNav', () => {
    const m: NavMatrix = { visible: [], overflow: undefined }
    expect(m).toBeDefined()
  })
})

describe('buildMatrix per-role shape', () => {
  // identity translator — returns the key unchanged so we can assert by label
  const id = (k: string) => k

  it('sales matrix shape', () => {
    const m = buildMatrix('sales', id)
    expect(m.visible.length).toBe(3)
    expect(m.overflow?.length).toBe(4)
    expect(m.overflow?.find(i => i.href === '/routes')?.desktopOnly).toBe(true)
  })

  it('office matrix shape', () => {
    const m = buildMatrix('office', id)
    expect(m.visible.length).toBe(3)
    expect(m.overflow?.length).toBe(5)
    expect(m.overflow?.find(i => i.href === '/routes')?.desktopOnly).toBe(true)
  })

  it('warehouse matrix shape', () => {
    const m = buildMatrix('warehouse', id)
    expect(m.visible.length).toBe(3)
    expect(m.overflow?.length).toBe(3)
  })

  it('driver matrix shape — 3 tabs, no overflow, hardcoded "Kudos"', () => {
    const m = buildMatrix('driver', id)
    expect(m.visible.length).toBe(3)
    expect(m.overflow).toBeUndefined()
    // Driver Kudos label is the literal 'Kudos', NOT t('navCompliments')
    expect(m.visible[2].label).toBe('Kudos')
  })

  it('admin matrix shape', () => {
    const m = buildMatrix('admin', id)
    expect(m.visible.length).toBe(3)
    expect(m.overflow?.length).toBe(6)
  })

  it('empty role returns empty matrix', () => {
    const m = buildMatrix('', id)
    expect(m.visible.length).toBe(0)
    expect(m.overflow).toBeUndefined()
  })
})
