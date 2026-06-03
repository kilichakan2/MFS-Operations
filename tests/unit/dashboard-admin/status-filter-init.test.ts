/**
 * tests/unit/dashboard-admin/status-filter-init.test.ts
 *
 * Item 5a.1 PR A — symmetry with preset-to-chip.test.ts. The
 * /complaints AllComplaintsTab inits its statusFilter from the URL
 * `?status=` param; this fixture covers the unknown-value fall-
 * through so an invalid param defaults to 'all' (parallel to
 * presetToChip's null return on unknown ?range= values).
 *
 * Inline mirror of the page-private guard at app/complaints/page.tsx
 * matching the dashboardShaping.test.ts precedent. Drift is caught
 * by tests/e2e/url-filter-init.spec.ts.
 */

import { describe, it, expect } from 'vitest'

type StatusFilterValue = 'all' | 'open' | 'resolved'

function readStatusFilter(raw: string | null | undefined): StatusFilterValue {
  return (raw === 'open' || raw === 'resolved') ? raw : 'all'
}

describe('readStatusFilter', () => {
  it('valid open → open', () => {
    expect(readStatusFilter('open')).toBe('open')
  })

  it('valid resolved → resolved', () => {
    expect(readStatusFilter('resolved')).toBe('resolved')
  })

  it('unknown value (banana) → all (fall-through symmetry with presetToChip)', () => {
    expect(readStatusFilter('banana')).toBe('all')
  })
})
