/**
 * tests/unit/nav/desktop-sidebar-items.test.ts
 *
 * L1 unit tests for `buildSidebarItems(role, t)` — the per-role flat
 * item list rendered by the desktop chrome's left sidebar (Item 3).
 *
 * Pure data assertions only — NO DOM, NO jsdom, NO @testing-library.
 *
 * NOTE: `buildSidebarItems` itself does NOT take a pathname (active
 * state is computed inside `<DesktopSidebar>` from `usePathname()`).
 * Active detection is asserted in `tests/e2e/desktop-chrome.spec.ts`.
 */

import { describe, it, expect } from 'vitest'
import { buildSidebarItems } from '@/components/RoleNav'

const id = (k: string) => k

describe('buildSidebarItems per-role shape', () => {
  it('sales — 7 items in order', () => {
    const items = buildSidebarItems('sales', id)
    expect(items.length).toBe(7)
    expect(items[0]).toMatchObject({ href: '/orders',      label: 'Orders' })
    expect(items[1]).toMatchObject({ href: '/visits',      label: 'navVisits' })
    expect(items[2]).toMatchObject({ href: '/complaints',  label: 'navComplaints' })
    expect(items[3]).toMatchObject({ href: '/pricing',     label: 'navPricing' })
    expect(items[4]).toMatchObject({ href: '/compliments', label: 'navCompliments' })
    expect(items[5]).toMatchObject({ href: '/routes',      label: 'navRoutes' })
    expect(items[6]).toMatchObject({ href: '/runs',        label: 'navRuns' })
  })

  it('office — 8 items in order', () => {
    const items = buildSidebarItems('office', id)
    expect(items.length).toBe(8)
    expect(items[0]).toMatchObject({ href: '/screen1',     label: 'navDispatch' })
    expect(items[1]).toMatchObject({ href: '/cash',        label: 'navCash' })
    expect(items[2]).toMatchObject({ href: '/complaints',  label: 'navComplaints' })
    expect(items[3]).toMatchObject({ href: '/pricing',     label: 'navPricing' })
    expect(items[4]).toMatchObject({ href: '/compliments', label: 'navCompliments' })
    expect(items[5]).toMatchObject({ href: '/routes',      label: 'navRoutes' })
    expect(items[6]).toMatchObject({ href: '/runs',        label: 'navRuns' })
    expect(items[7]).toMatchObject({ href: '/screen4',     label: 'navDashboard' })
  })

  it('warehouse — 6 items in order', () => {
    const items = buildSidebarItems('warehouse', id)
    expect(items.length).toBe(6)
    expect(items[0]).toMatchObject({ href: '/screen1',     label: 'navDispatch' })
    expect(items[1]).toMatchObject({ href: '/complaints',  label: 'navComplaints' })
    expect(items[2]).toMatchObject({ href: '/routes',      label: 'navRoutes' })
    expect(items[3]).toMatchObject({ href: '/compliments', label: 'navCompliments' })
    expect(items[4]).toMatchObject({ href: '/runs',        label: 'navRuns' })
    expect(items[5]).toMatchObject({ href: '/screen4',     label: 'navDashboard' })
  })

  it('driver — 3 items in order, hardcoded literals for My Route and Kudos', () => {
    const items = buildSidebarItems('driver', id)
    expect(items.length).toBe(3)
    expect(items[0]).toMatchObject({ href: '/driver',      label: 'My Route' })
    expect(items[1]).toMatchObject({ href: '/complaints',  label: 'navComplaints' })
    expect(items[2]).toMatchObject({ href: '/compliments', label: 'Kudos' })
  })

  it('admin — 9 items in order', () => {
    const items = buildSidebarItems('admin', id)
    expect(items.length).toBe(9)
    expect(items[0]).toMatchObject({ href: '/screen4',     label: 'navDashboard' })
    expect(items[1]).toMatchObject({ href: '/complaints',  label: 'navComplaints' })
    expect(items[2]).toMatchObject({ href: '/pricing',     label: 'navPricing' })
    expect(items[3]).toMatchObject({ href: '/cash',        label: 'navCash' })
    expect(items[4]).toMatchObject({ href: '/compliments', label: 'navCompliments' })
    expect(items[5]).toMatchObject({ href: '/routes',      label: 'navRoutes' })
    expect(items[6]).toMatchObject({ href: '/runs',        label: 'navRuns' })
    expect(items[7]).toMatchObject({ href: '/screen5',     label: 'navAdmin' })
    expect(items[8]).toMatchObject({ href: '/screen6',     label: 'navMap' })
  })

  it('empty role returns []', () => {
    const items = buildSidebarItems('', id)
    expect(items).toEqual([])
  })
})
