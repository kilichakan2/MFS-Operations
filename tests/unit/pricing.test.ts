/**
 * tests/unit/pricing.test.ts
 * Unit tests for pricing business logic.
 */
import { describe, it, expect } from 'vitest'

// ─── Helpers (mirrored from page.tsx for testing) ─────────────────────────────

type AgreementStatus = 'draft' | 'active' | 'cancelled'
type PriceUnit       = 'per_kg' | 'per_box'

function computeIsExpired(status: AgreementStatus, validUntil: string | null, today: string): boolean {
  return status === 'active' && validUntil != null && validUntil < today
}

function fmtPrice(price: number, unit: PriceUnit): string {
  return `£${price.toFixed(2)} ${unit === 'per_kg' ? '/ kg' : '/ box'}`
}

function isValidStatus(s: string): boolean {
  return ['draft', 'active', 'cancelled'].includes(s)
}

function canDelete(role: string, ownerId: string, userId: string, status: AgreementStatus): boolean {
  if (role === 'admin') return true
  return ownerId === userId && status === 'draft'
}

function canEdit(role: string, ownerId: string, userId: string): boolean {
  return role === 'admin' || role === 'office' || ownerId === userId
}

function generateRefNumber(seq: number, year: number): string {
  return `MFS-${year}-${String(seq).padStart(4, '0')}`
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeIsExpired', () => {
  it('active with past valid_until = expired', () => {
    expect(computeIsExpired('active', '2026-01-01', '2026-04-06')).toBe(true)
  })
  it('active with future valid_until = not expired', () => {
    expect(computeIsExpired('active', '2026-12-31', '2026-04-06')).toBe(false)
  })
  it('active with no valid_until = not expired (ongoing)', () => {
    expect(computeIsExpired('active', null, '2026-04-06')).toBe(false)
  })
  it('draft status = never expired regardless of date', () => {
    expect(computeIsExpired('draft', '2020-01-01', '2026-04-06')).toBe(false)
  })
  it('cancelled status = never expired', () => {
    expect(computeIsExpired('cancelled', '2020-01-01', '2026-04-06')).toBe(false)
  })
  it('valid_until same as today = not yet expired (< not <=)', () => {
    expect(computeIsExpired('active', '2026-04-06', '2026-04-06')).toBe(false)
  })
})

describe('fmtPrice', () => {
  it('formats per_kg correctly', () => {
    expect(fmtPrice(8.5, 'per_kg')).toBe('£8.50 / kg')
  })
  it('formats per_box correctly', () => {
    expect(fmtPrice(18, 'per_box')).toBe('£18.00 / box')
  })
  it('always shows 2 decimal places', () => {
    expect(fmtPrice(10, 'per_kg')).toBe('£10.00 / kg')
    expect(fmtPrice(9.9, 'per_box')).toBe('£9.90 / box')
  })
})

describe('isValidStatus', () => {
  it('accepts draft, active, cancelled', () => {
    expect(isValidStatus('draft')).toBe(true)
    expect(isValidStatus('active')).toBe(true)
    expect(isValidStatus('cancelled')).toBe(true)
  })
  it('rejects expired — must never be set via API', () => {
    expect(isValidStatus('expired')).toBe(false)
  })
  it('rejects arbitrary strings', () => {
    expect(isValidStatus('pending')).toBe(false)
    expect(isValidStatus('')).toBe(false)
  })
})

describe('canDelete', () => {
  const ADMIN  = 'admin'
  const SALES  = 'sales'
  const OFFICE = 'office'
  const OWNER  = 'user-1'
  const OTHER  = 'user-2'

  it('admin can delete any agreement regardless of status or ownership', () => {
    expect(canDelete(ADMIN, OWNER, OTHER, 'active')).toBe(true)
    expect(canDelete(ADMIN, OWNER, OTHER, 'draft')).toBe(true)
    expect(canDelete(ADMIN, OWNER, OTHER, 'cancelled')).toBe(true)
  })
  it('sales can delete own draft', () => {
    expect(canDelete(SALES, OWNER, OWNER, 'draft')).toBe(true)
  })
  it('sales cannot delete own active agreement', () => {
    expect(canDelete(SALES, OWNER, OWNER, 'active')).toBe(false)
  })
  it('sales cannot delete another reps draft', () => {
    expect(canDelete(SALES, OWNER, OTHER, 'draft')).toBe(false)
  })
  it('office cannot delete (not admin, not owner check)', () => {
    expect(canDelete(OFFICE, OWNER, OTHER, 'draft')).toBe(false)
  })
})

describe('canEdit', () => {
  it('admin can edit any', () => {
    expect(canEdit('admin', 'user-1', 'user-2')).toBe(true)
  })
  it('office can edit any', () => {
    expect(canEdit('office', 'user-1', 'user-2')).toBe(true)
  })
  it('sales can edit own', () => {
    expect(canEdit('sales', 'user-1', 'user-1')).toBe(true)
  })
  it('sales cannot edit others', () => {
    expect(canEdit('sales', 'user-1', 'user-2')).toBe(false)
  })
})

describe('generateRefNumber', () => {
  it('pads sequence to 4 digits', () => {
    expect(generateRefNumber(1, 2026)).toBe('MFS-2026-0001')
    expect(generateRefNumber(42, 2026)).toBe('MFS-2026-0042')
    expect(generateRefNumber(1000, 2026)).toBe('MFS-2026-1000')
  })
  it('uses correct year', () => {
    expect(generateRefNumber(1, 2027)).toBe('MFS-2027-0001')
  })
})

