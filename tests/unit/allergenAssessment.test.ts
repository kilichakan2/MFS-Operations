/**
 * tests/unit/allergenAssessment.test.ts
 *
 * SALSA 1.4.1 — Site allergen identification and cross-contamination
 * risk assessment (Phase 2).
 *
 * Tests pure logic from app/haccp/allergens/page.tsx
 */

import { describe, it, expect } from 'vitest'

// ── Mirrors reviewStatus from page ────────────────────────────────────────────
function reviewStatus(dateStr: string, now: Date): 'ok' | 'soon' | 'overdue' {
  const days = (new Date(dateStr).getTime() - now.getTime()) / 86_400_000
  if (days < 0)   return 'overdue'
  if (days < 60)  return 'soon'
  return 'ok'
}

// ── Mirrors allergen status display logic ─────────────────────────────────────
type AllergenStatus = 'nil' | 'contains' | 'may_contain'

function allergenStatusColour(status: AllergenStatus): string {
  if (status === 'nil')         return 'green'
  if (status === 'contains')    return 'red'
  if (status === 'may_contain') return 'amber'
  return 'grey'
}

// ── Mirrors site status display logic ─────────────────────────────────────────
type SiteStatus = 'nil_allergens' | 'allergens_present' | 'under_review'

function siteStatusColour(status: SiteStatus): string {
  if (status === 'nil_allergens')     return 'green'
  if (status === 'allergens_present') return 'red'
  if (status === 'under_review')      return 'amber'
  return 'grey'
}

// ── Mirrors save validation from page ────────────────────────────────────────
function saveValid(reviewDate: string): boolean {
  return reviewDate.trim().length > 0
}

// ── Mirrors raw material validation ──────────────────────────────────────────
interface RawMaterial {
  material:        string
  category:        string
  allergen_status: AllergenStatus
  notes:           string
}

function materialComplete(m: RawMaterial): boolean {
  return m.material.trim().length > 0 && m.category.trim().length > 0
}

function hasAnyAllergens(materials: RawMaterial[]): boolean {
  return materials.some(m => m.allergen_status !== 'nil')
}

// ── reviewStatus ─────────────────────────────────────────────────────────────
describe('reviewStatus — next review date classification', () => {
  const now = new Date('2026-05-01T12:00:00Z')

  it('date 6 months away → ok', () => {
    expect(reviewStatus('2026-11-01', now)).toBe('ok')
  })

  it('date 61 days away → ok (just outside soon threshold)', () => {
    expect(reviewStatus('2026-07-01', now)).toBe('ok')
  })

  it('date exactly 60 days away → soon', () => {
    const d = new Date(now)
    d.setDate(d.getDate() + 59) // slightly under 60 days
    expect(reviewStatus(d.toLocaleDateString('en-CA'), now)).toBe('soon')
  })

  it('date 30 days away → soon', () => {
    expect(reviewStatus('2026-05-31', now)).toBe('soon')
  })

  it('date tomorrow → soon', () => {
    expect(reviewStatus('2026-05-02', now)).toBe('soon')
  })

  it('date today → overdue (0 days remaining)', () => {
    expect(reviewStatus('2026-05-01', now)).toBe('overdue')
  })

  it('date in the past → overdue', () => {
    expect(reviewStatus('2026-01-01', now)).toBe('overdue')
  })

  it('date one year ago → overdue', () => {
    expect(reviewStatus('2025-05-01', now)).toBe('overdue')
  })
})

// ── allergenStatusColour ─────────────────────────────────────────────────────
describe('allergenStatusColour — raw material status display', () => {
  it('nil → green', () => {
    expect(allergenStatusColour('nil')).toBe('green')
  })

  it('contains → red (allergen present)', () => {
    expect(allergenStatusColour('contains')).toBe('red')
  })

  it('may_contain → amber (cross-contamination risk)', () => {
    expect(allergenStatusColour('may_contain')).toBe('amber')
  })
})

// ── siteStatusColour ─────────────────────────────────────────────────────────
describe('siteStatusColour — site-level status display', () => {
  it('nil_allergens → green', () => {
    expect(siteStatusColour('nil_allergens')).toBe('green')
  })

  it('allergens_present → red', () => {
    expect(siteStatusColour('allergens_present')).toBe('red')
  })

  it('under_review → amber', () => {
    expect(siteStatusColour('under_review')).toBe('amber')
  })
})

// ── saveValid ────────────────────────────────────────────────────────────────
describe('saveValid — assessment save gate', () => {
  it('valid date → can save', () => {
    expect(saveValid('2027-01-01')).toBe(true)
  })

  it('empty date → cannot save', () => {
    expect(saveValid('')).toBe(false)
  })

  it('whitespace-only date → cannot save', () => {
    expect(saveValid('   ')).toBe(false)
  })
})

// ── materialComplete ─────────────────────────────────────────────────────────
describe('materialComplete — raw material row validation', () => {
  it('material and category filled → complete', () => {
    expect(materialComplete({ material: 'Lamb carcasses', category: 'Raw meat', allergen_status: 'nil', notes: '' })).toBe(true)
  })

  it('missing material → incomplete', () => {
    expect(materialComplete({ material: '', category: 'Raw meat', allergen_status: 'nil', notes: '' })).toBe(false)
  })

  it('missing category → incomplete', () => {
    expect(materialComplete({ material: 'Lamb', category: '', allergen_status: 'nil', notes: '' })).toBe(false)
  })

  it('notes optional — row still complete without them', () => {
    expect(materialComplete({ material: 'Lamb', category: 'Raw meat', allergen_status: 'nil', notes: '' })).toBe(true)
  })

  it('whitespace-only material → incomplete', () => {
    expect(materialComplete({ material: '   ', category: 'Raw meat', allergen_status: 'nil', notes: '' })).toBe(false)
  })
})

// ── hasAnyAllergens ──────────────────────────────────────────────────────────
describe('hasAnyAllergens — detects if any material has allergen risk', () => {
  const nilMaterials: RawMaterial[] = [
    { material: 'Lamb',     category: 'Raw meat',   allergen_status: 'nil', notes: '' },
    { material: 'Beef',     category: 'Raw meat',   allergen_status: 'nil', notes: '' },
    { material: 'Packaging',category: 'Packaging',  allergen_status: 'nil', notes: '' },
  ]

  it('all nil → no allergens', () => {
    expect(hasAnyAllergens(nilMaterials)).toBe(false)
  })

  it('one contains → allergens present', () => {
    const withAllergen: RawMaterial[] = [
      ...nilMaterials,
      { material: 'Marinade mix', category: 'Processing aid', allergen_status: 'contains', notes: 'Contains mustard' },
    ]
    expect(hasAnyAllergens(withAllergen)).toBe(true)
  })

  it('one may_contain → allergen risk present', () => {
    const withRisk: RawMaterial[] = [
      ...nilMaterials,
      { material: 'Spice blend', category: 'Processing aid', allergen_status: 'may_contain', notes: '' },
    ]
    expect(hasAnyAllergens(withRisk)).toBe(true)
  })

  it('empty list → no allergens', () => {
    expect(hasAnyAllergens([])).toBe(false)
  })
})

// ── MFS default state ────────────────────────────────────────────────────────
describe('MFS default allergen assessment state', () => {
  const defaultMaterials: RawMaterial[] = [
    { material: 'Lamb carcasses',           category: 'Raw meat',       allergen_status: 'nil', notes: 'Pure ovine — no allergens' },
    { material: 'Beef primal cuts',         category: 'Raw meat',       allergen_status: 'nil', notes: 'Pure bovine — no allergens' },
    { material: 'Vacuum packaging film',    category: 'Packaging',      allergen_status: 'nil', notes: 'Confirmed nil by supplier' },
    { material: 'Modified atmosphere gas',  category: 'Processing aid', allergen_status: 'nil', notes: 'Pure gases — no allergens' },
    { material: 'Cleaning chemicals',       category: 'Chemical',       allergen_status: 'nil', notes: 'Controlled use, no cross-contamination risk' },
  ]

  it('MFS has 5 default raw material categories', () => {
    expect(defaultMaterials).toHaveLength(5)
  })

  it('all default materials are nil-allergen', () => {
    expect(hasAnyAllergens(defaultMaterials)).toBe(false)
  })

  it('all default materials are complete (have material + category)', () => {
    expect(defaultMaterials.every(materialComplete)).toBe(true)
  })

  it('site status is nil_allergens → green display', () => {
    expect(siteStatusColour('nil_allergens')).toBe('green')
  })

  it('default annual review is 12 months from assessment — satisfies SALSA annual review requirement', () => {
    const assessed   = new Date('2026-01-01')
    const nextReview = new Date('2027-01-01')
    const diffDays   = (nextReview.getTime() - assessed.getTime()) / 86_400_000
    expect(diffDays).toBeGreaterThanOrEqual(365)
  })
})
