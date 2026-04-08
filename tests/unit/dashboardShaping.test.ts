/**
 * tests/unit/dashboardShaping.test.ts
 *
 * Tests for dashboard data shaping helpers — the functions that transform
 * raw Supabase rows into the shape the frontend expects.
 */
import { describe, it, expect } from 'vitest'

// ── Helpers mirrored from app/api/dashboard/route.ts ─────────────────────────

function computeHoursAgo(createdAt: string, now: Date): number {
  return Math.round((now.getTime() - new Date(createdAt).getTime()) / 3_600_000)
}

function isOpenComplaintStale(createdAt: string, now: Date, thresholdHours = 48): boolean {
  return computeHoursAgo(createdAt, now) > thresholdHours
}

function computePricingSnapshot(
  rows: { status: string; valid_until: string | null }[],
  today: string
) {
  const active  = rows.filter(p => p.status === 'active' && !(p.valid_until && p.valid_until < today)).length
  const draft   = rows.filter(p => p.status === 'draft').length
  const expired = rows.filter(p => p.status === 'active' && p.valid_until != null && p.valid_until < today).length
  return { active, draft, expired }
}

function buildHunterFarmerSplit(
  visits: { customer_id: string | null; prospect_name: string | null }[]
) {
  const existing  = visits.filter(v => v.customer_id != null).length
  const prospects = visits.filter(v => v.customer_id == null && v.prospect_name != null).length
  return { existing, prospects }
}

function capResolutionHours(raw: number | null): number | null {
  if (raw === null) return null
  return Math.round(raw)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-08T12:00:00Z')

describe('computeHoursAgo', () => {
  it('returns 0 for just now', () => {
    expect(computeHoursAgo('2026-04-08T12:00:00Z', NOW)).toBe(0)
  })
  it('returns 48 for exactly 48h ago', () => {
    expect(computeHoursAgo('2026-04-06T12:00:00Z', NOW)).toBe(48)
  })
  it('returns 72 for 3 days ago', () => {
    expect(computeHoursAgo('2026-04-05T12:00:00Z', NOW)).toBe(72)
  })
})

describe('isOpenComplaintStale', () => {
  it('47h ago = not stale', () => {
    expect(isOpenComplaintStale('2026-04-06T13:00:00Z', NOW)).toBe(false)
  })
  it('49h ago = stale', () => {
    expect(isOpenComplaintStale('2026-04-06T11:00:00Z', NOW)).toBe(true)
  })
  it('exactly 48h ago = not stale (> not >=)', () => {
    expect(isOpenComplaintStale('2026-04-06T12:00:00Z', NOW)).toBe(false)
  })
})

describe('computePricingSnapshot', () => {
  const TODAY = '2026-04-08'

  it('counts active agreements correctly', () => {
    const rows = [
      { status: 'active', valid_until: null },
      { status: 'active', valid_until: '2026-12-31' },
      { status: 'draft',  valid_until: null },
    ]
    expect(computePricingSnapshot(rows, TODAY).active).toBe(2)
  })

  it('counts drafts correctly', () => {
    const rows = [
      { status: 'draft', valid_until: null },
      { status: 'draft', valid_until: null },
      { status: 'active', valid_until: null },
    ]
    expect(computePricingSnapshot(rows, TODAY).draft).toBe(2)
  })

  it('counts expired agreements (active but past valid_until)', () => {
    const rows = [
      { status: 'active', valid_until: '2026-01-01' },  // past
      { status: 'active', valid_until: '2026-12-31' },  // future
      { status: 'active', valid_until: null },           // ongoing
    ]
    const snap = computePricingSnapshot(rows, TODAY)
    expect(snap.expired).toBe(1)
    expect(snap.active).toBe(2)
  })

  it('returns zeros for empty array', () => {
    expect(computePricingSnapshot([], TODAY)).toEqual({ active: 0, draft: 0, expired: 0 })
  })
})

describe('buildHunterFarmerSplit', () => {
  it('splits existing vs prospect visits', () => {
    const visits = [
      { customer_id: 'abc', prospect_name: null },
      { customer_id: null, prospect_name: 'New Cafe' },
      { customer_id: 'def', prospect_name: null },
    ]
    expect(buildHunterFarmerSplit(visits)).toEqual({ existing: 2, prospects: 1 })
  })

  it('returns zeros for empty', () => {
    expect(buildHunterFarmerSplit([])).toEqual({ existing: 0, prospects: 0 })
  })

  it('ignores rows with no customer_id and no prospect_name', () => {
    const visits = [{ customer_id: null, prospect_name: null }]
    expect(buildHunterFarmerSplit(visits)).toEqual({ existing: 0, prospects: 0 })
  })
})

describe('capResolutionHours', () => {
  it('rounds decimals', () => {
    expect(capResolutionHours(2.7)).toBe(3)
    expect(capResolutionHours(2.3)).toBe(2)
  })
  it('passes through null', () => {
    expect(capResolutionHours(null)).toBeNull()
  })
  it('handles zero', () => {
    expect(capResolutionHours(0)).toBe(0)
  })
})
