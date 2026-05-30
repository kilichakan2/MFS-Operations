/**
 * tests/unit/orders/dashboardFilters.test.ts
 *
 * Unit tests for lib/orders/dashboardFilters.ts — the pure filter
 * combinator behind the order dashboard at /orders.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB3)
 */

import { describe, it, expect } from 'vitest'
import {
  applyDashboardFilters,
  dateRangeFromFilter,
  type DashboardFilterableOrder,
} from '../../../lib/orders/dashboardFilters'

// ── Fixed "now" so date tests are deterministic ──────────────
const NOW = new Date('2026-05-30T12:00:00Z')  // a Saturday

function makeOrder(overrides: Partial<DashboardFilterableOrder> = {}): DashboardFilterableOrder {
  return {
    delivery_date: '2026-05-30',
    state:         'placed',
    reference:     'MFS-2026-0001',
    customer:      { id: 'cust-1', name: 'Yakut Restaurant' },
    creator:       { id: 'user-1', name: 'Mehmet' },
    ...overrides,
  }
}

// ── dateRangeFromFilter ──────────────────────────────────────

describe('dateRangeFromFilter', () => {
  it("today gives a single-day range", () => {
    expect(dateRangeFromFilter('today', NOW)).toEqual({ from: '2026-05-30', to: '2026-05-30' })
  })

  it("tomorrow gives the next day only", () => {
    expect(dateRangeFromFilter('tomorrow', NOW)).toEqual({ from: '2026-05-31', to: '2026-05-31' })
  })

  it("today_tomorrow spans two days", () => {
    expect(dateRangeFromFilter('today_tomorrow', NOW)).toEqual({ from: '2026-05-30', to: '2026-05-31' })
  })

  it("this_week spans 7 days from today inclusive", () => {
    expect(dateRangeFromFilter('this_week', NOW)).toEqual({ from: '2026-05-30', to: '2026-06-06' })
  })

  it("all is open-ended on both sides", () => {
    expect(dateRangeFromFilter('all', NOW)).toEqual({ from: null, to: null })
  })
})

// ── applyDashboardFilters: state filter ──────────────────────

describe('applyDashboardFilters — state', () => {
  const ORDERS = [
    makeOrder({ state: 'placed',    reference: 'A' }),
    makeOrder({ state: 'printed',   reference: 'B' }),
    makeOrder({ state: 'completed', reference: 'C' }),
  ]

  it("active filter excludes completed only", () => {
    const out = applyDashboardFilters(ORDERS, {
      dateFilter: 'all', stateFilter: 'active', customerId: null, search: '', now: NOW,
    })
    expect(out.map(o => o.reference)).toEqual(['A', 'B'])
  })

  it("all filter includes everything", () => {
    const out = applyDashboardFilters(ORDERS, {
      dateFilter: 'all', stateFilter: 'all', customerId: null, search: '', now: NOW,
    })
    expect(out.map(o => o.reference)).toEqual(['A', 'B', 'C'])
  })

  it("specific state filter returns only that state", () => {
    const out = applyDashboardFilters(ORDERS, {
      dateFilter: 'all', stateFilter: 'printed', customerId: null, search: '', now: NOW,
    })
    expect(out.map(o => o.reference)).toEqual(['B'])
  })
})

// ── applyDashboardFilters: date filter ───────────────────────

describe('applyDashboardFilters — date', () => {
  const ORDERS = [
    makeOrder({ delivery_date: '2026-05-29', reference: 'YESTERDAY' }),
    makeOrder({ delivery_date: '2026-05-30', reference: 'TODAY' }),
    makeOrder({ delivery_date: '2026-05-31', reference: 'TOMORROW' }),
    makeOrder({ delivery_date: '2026-06-15', reference: 'FAR_FUTURE' }),
  ]
  const baseOpts = { stateFilter: 'all' as const, customerId: null, search: '', now: NOW }

  it("today shows only today", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, dateFilter: 'today' })
    expect(out.map(o => o.reference)).toEqual(['TODAY'])
  })

  it("today_tomorrow shows today + tomorrow only", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, dateFilter: 'today_tomorrow' })
    expect(out.map(o => o.reference)).toEqual(['TODAY', 'TOMORROW'])
  })

  it("this_week excludes far-future and yesterday", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, dateFilter: 'this_week' })
    expect(out.map(o => o.reference)).toEqual(['TODAY', 'TOMORROW'])
  })

  it("all includes everything regardless of date", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, dateFilter: 'all' })
    expect(out.map(o => o.reference)).toEqual(['YESTERDAY', 'TODAY', 'TOMORROW', 'FAR_FUTURE'])
  })
})

// ── applyDashboardFilters: customer filter ───────────────────

describe('applyDashboardFilters — customer', () => {
  const ORDERS = [
    makeOrder({ reference: 'A', customer: { id: 'cust-1', name: 'Yakut' } }),
    makeOrder({ reference: 'B', customer: { id: 'cust-2', name: 'Tugra' } }),
    makeOrder({ reference: 'C', customer: { id: 'cust-1', name: 'Yakut' } }),
    makeOrder({ reference: 'D', customer: null }),
  ]
  const baseOpts = { dateFilter: 'all' as const, stateFilter: 'all' as const, search: '', now: NOW }

  it("customer filter returns matching customer only", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, customerId: 'cust-1' })
    expect(out.map(o => o.reference)).toEqual(['A', 'C'])
  })

  it("null customer filter passes all through", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, customerId: null })
    expect(out.map(o => o.reference)).toEqual(['A', 'B', 'C', 'D'])
  })

  it("customer filter excludes orders with no customer", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, customerId: 'cust-1' })
    expect(out.find(o => o.reference === 'D')).toBeUndefined()
  })
})

// ── applyDashboardFilters: search filter ─────────────────────

describe('applyDashboardFilters — search', () => {
  const ORDERS = [
    makeOrder({ reference: 'MFS-2026-0001', customer: { id: '1', name: 'Yakut Restaurant' }, creator: { id: 'u1', name: 'Mehmet' } }),
    makeOrder({ reference: 'MFS-2026-0002', customer: { id: '2', name: 'Tugra Meathouse' }, creator: { id: 'u2', name: 'Omer' } }),
    makeOrder({ reference: 'MFS-2026-0003', customer: null,                                 creator: { id: 'u1', name: 'Mehmet' } }),
  ]
  const baseOpts = { dateFilter: 'all' as const, stateFilter: 'all' as const, customerId: null, now: NOW }

  it("search matches reference", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, search: '0002' })
    expect(out.map(o => o.reference)).toEqual(['MFS-2026-0002'])
  })

  it("search matches customer name case-insensitively", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, search: 'yakut' })
    expect(out.map(o => o.reference)).toEqual(['MFS-2026-0001'])
  })

  it("search matches sales rep name", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, search: 'mehmet' })
    expect(out.map(o => o.reference)).toEqual(['MFS-2026-0001', 'MFS-2026-0003'])
  })

  it("search trims whitespace", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, search: '  Omer  ' })
    expect(out.map(o => o.reference)).toEqual(['MFS-2026-0002'])
  })

  it("empty search returns all", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, search: '' })
    expect(out.length).toBe(3)
  })

  it("non-matching search returns empty", () => {
    const out = applyDashboardFilters(ORDERS, { ...baseOpts, search: 'nonexistent' })
    expect(out).toEqual([])
  })
})

// ── applyDashboardFilters: combinator ────────────────────────

describe('applyDashboardFilters — combined filters', () => {
  const ORDERS = [
    makeOrder({ reference: 'A', state: 'placed',    delivery_date: '2026-05-30', customer: { id: 'c1', name: 'Yakut' } }),
    makeOrder({ reference: 'B', state: 'completed', delivery_date: '2026-05-30', customer: { id: 'c1', name: 'Yakut' } }),
    makeOrder({ reference: 'C', state: 'placed',    delivery_date: '2026-05-31', customer: { id: 'c1', name: 'Yakut' } }),
    makeOrder({ reference: 'D', state: 'placed',    delivery_date: '2026-05-30', customer: { id: 'c2', name: 'Tugra' } }),
  ]

  it("today + active + customer cust1 returns only A", () => {
    const out = applyDashboardFilters(ORDERS, {
      dateFilter: 'today',
      stateFilter: 'active',
      customerId: 'c1',
      search: '',
      now: NOW,
    })
    expect(out.map(o => o.reference)).toEqual(['A'])
  })

  it("today_tomorrow + active + no customer returns A, C, D", () => {
    const out = applyDashboardFilters(ORDERS, {
      dateFilter: 'today_tomorrow',
      stateFilter: 'active',
      customerId: null,
      search: '',
      now: NOW,
    })
    expect(out.map(o => o.reference)).toEqual(['A', 'C', 'D'])
  })

  it("today + all states + customer cust1 + search 'yakut' returns A + B", () => {
    const out = applyDashboardFilters(ORDERS, {
      dateFilter: 'today',
      stateFilter: 'all',
      customerId: 'c1',
      search: 'yakut',
      now: NOW,
    })
    expect(out.map(o => o.reference)).toEqual(['A', 'B'])
  })
})
