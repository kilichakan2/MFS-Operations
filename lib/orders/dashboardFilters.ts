/**
 * lib/orders/dashboardFilters.ts
 *
 * Pure filter logic for the order dashboard at /orders.
 *
 * Extracted so unit tests can verify combinator behaviour (date + state
 * + customer + search applied together) without rendering the page or
 * mocking fetch. The component imports applyDashboardFilters and the
 * test imports the same.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB3)
 */

import type { OrderState } from '@/lib/domain/Order'

export type DashboardDateFilter  = 'today' | 'tomorrow' | 'today_tomorrow' | 'this_week' | 'all'

/** State filter: 'active' = everything except completed; 'all' = everything; or a specific state */
export type DashboardStateFilter = 'active' | 'all' | OrderState

export interface DashboardFilterableOrder {
  delivery_date: string                                      // YYYY-MM-DD
  state:         OrderState
  reference:     string
  customer:      { id: string; name: string } | null
  creator:       { id: string; name: string } | null
}

export interface DashboardFilterOptions {
  dateFilter:  DashboardDateFilter
  stateFilter: DashboardStateFilter
  customerId:  string | null
  search:      string
  /** Reference "now" for date calculations. Default new Date(). Overridable for tests. */
  now?:        Date
}

/**
 * Format a Date as a YYYY-MM-DD string using LOCAL date components.
 *
 * Previously used d.toISOString().slice(0, 10), which converts to UTC
 * — incorrect for any user in a non-UTC timezone (including the UK
 * during BST = UTC+1, which is most of the year). Local midnight in
 * BST is 23:00 the previous day in UTC, so toISOString() would shift
 * the date back one day, and every order with a "tomorrow" delivery
 * would silently fall outside the dashboard's "today + tomorrow"
 * default filter.
 *
 * Caught by ANVIL E2E Layer 4 on 2026-06-01.
 */
function ymd(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns [from, to] inclusive YYYY-MM-DD bounds for a date filter; null = open-ended on that side. */
export function dateRangeFromFilter(
  filter: DashboardDateFilter,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const weekEnd  = new Date(today); weekEnd.setDate(today.getDate() + 7)

  switch (filter) {
    case 'today':          return { from: ymd(today),    to: ymd(today)    }
    case 'tomorrow':       return { from: ymd(tomorrow), to: ymd(tomorrow) }
    case 'today_tomorrow': return { from: ymd(today),    to: ymd(tomorrow) }
    case 'this_week':      return { from: ymd(today),    to: ymd(weekEnd)  }
    case 'all':            return { from: null,          to: null          }
  }
}

export function applyDashboardFilters<T extends DashboardFilterableOrder>(
  rows: T[],
  opts: DashboardFilterOptions,
): T[] {
  const { from, to } = dateRangeFromFilter(opts.dateFilter, opts.now)
  const searchLower  = opts.search.trim().toLowerCase()

  return rows.filter(r => {
    if (from && r.delivery_date < from) return false
    if (to   && r.delivery_date > to)   return false

    if (opts.stateFilter === 'active' && r.state === 'completed') return false
    if (opts.stateFilter !== 'all' && opts.stateFilter !== 'active' && r.state !== opts.stateFilter) return false

    if (opts.customerId && r.customer?.id !== opts.customerId) return false

    if (searchLower) {
      const hay = [r.reference, r.customer?.name ?? '', r.creator?.name ?? '']
        .join(' ')
        .toLowerCase()
      if (!hay.includes(searchLower)) return false
    }

    return true
  })
}
