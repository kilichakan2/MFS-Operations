/**
 * tests/unit/dashboard-admin/preset-to-chip.test.ts
 *
 * The dashboard's RangeTabs vocabulary is `today | week | month | quarter`
 * (locked from Item 5a's KPI tile hrefs at PR #10 C12). Destination
 * pages (/visits, /complaints) use a longer TimeChip vocabulary
 * (`today | yesterday | this_week | this_month | this_quarter | all_time`).
 * Each destination page owns a `presetToChip` helper that translates
 * the incoming URL preset to its internal chip value.
 *
 * Helpers are inline-mirrored here from the page-private copies in
 * app/visits/page.tsx and app/complaints/page.tsx, matching the
 * tests/unit/dashboardShaping.test.ts precedent. Drift between the
 * inline mirror and the real page helpers is caught by the
 * url-filter-init.spec.ts e2e suite at Render C6.
 */

import { describe, it, expect } from 'vitest'

// ── Inline mirror of the helper as defined per page ─────────────────────────

type TimeChip = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_quarter' | 'all_time'

function presetToChip(preset: string | null | undefined): TimeChip | null {
  switch (preset) {
    case 'today':   return 'today'
    case 'week':    return 'this_week'
    case 'month':   return 'this_month'
    case 'quarter': return 'this_quarter'
    default:        return null
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('presetToChip', () => {
  it('maps today → today (direct)', () => {
    expect(presetToChip('today')).toBe('today')
  })

  it('maps week → this_week', () => {
    expect(presetToChip('week')).toBe('this_week')
  })

  it('maps month → this_month', () => {
    expect(presetToChip('month')).toBe('this_month')
  })

  it('maps quarter → this_quarter (Item 5a.1 new chip)', () => {
    expect(presetToChip('quarter')).toBe('this_quarter')
  })

  it('returns null for null input (no ?range= param present)', () => {
    expect(presetToChip(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(presetToChip(undefined)).toBeNull()
  })

  it('returns null for an unknown string', () => {
    expect(presetToChip('yesterday')).toBeNull()
    expect(presetToChip('all_time')).toBeNull()
    expect(presetToChip('weekly')).toBeNull()
    expect(presetToChip('')).toBeNull()
  })

  it('returns null on case-sensitive mismatch (URL is case-sensitive)', () => {
    expect(presetToChip('Week')).toBeNull()
    expect(presetToChip('TODAY')).toBeNull()
  })
})
