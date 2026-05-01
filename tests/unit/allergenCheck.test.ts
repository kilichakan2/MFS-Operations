/**
 * tests/unit/allergenCheck.test.ts
 *
 * SALSA 1.4.2 — Allergen check at goods intake (Phase 1).
 *
 * Tests all pure logic extracted from:
 *   - app/haccp/delivery/page.tsx  (form validation, CA trigger, display)
 *   - app/api/haccp/delivery/route.ts (corrective_action_required, CA auto-generation)
 */

import { describe, it, expect } from 'vitest'

// ── Mirrors allergenValid from delivery page ──────────────────────────────────
// allergenTypes replaces allergenNotes as the required field
function allergenValid(identified: boolean, types: string[]): boolean {
  return !identified || types.length > 0
}

// ── Mirrors corrective_action_required from delivery route ────────────────────
function correctiveActionRequired(
  tempStatus:     'pass' | 'urgent' | 'fail',
  contamination:  string,
  allergensFound: boolean,
): boolean {
  return tempStatus !== 'pass' || contamination !== 'no' || allergensFound
}

// ── Mirrors needsCCA from delivery page (determines whether CCA popup shows) ──
function needsCCA(
  tempStatus:     'pass' | 'urgent' | 'fail',
  contamination:  string,
  allergensFound: boolean,
): boolean {
  return (tempStatus === 'urgent' || tempStatus === 'fail') ||
         (contamination === 'yes' || contamination === 'yes_actioned') ||
         allergensFound
}

// ── Mirrors allergen badge display logic from card ────────────────────────────
function allergenBadge(identified: boolean): { label: string; colour: 'green' | 'red' } {
  if (identified) return { label: '⚠️ ALLERGENS IDENTIFIED',        colour: 'red' }
  return              { label: '✓ No allergens — SALSA 1.4.2', colour: 'green' }
}

// ── Mirrors CA auto-generation logic from route ───────────────────────────────
interface AllergenCA {
  ccp_ref:                         string
  deviation_description:           string
  action_taken:                    string
  management_verification_required: boolean
  resolved:                        boolean
}

function buildAllergenCA(notes: string | undefined): AllergenCA {
  return {
    ccp_ref:    'CCP1',
    deviation_description:
      `Allergen identified in delivery — MFS is an allergen-free site. ${
        notes?.trim() ? `Details: ${notes.trim()}` : 'No further detail provided.'
      }`,
    action_taken:
      'Delivery quarantined pending management review. Do not process until CA resolved.',
    management_verification_required: true,
    resolved: false,
  }
}

// ── allergenValid — form submission gate ─────────────────────────────────────
describe('allergenValid — form submission gate', () => {
  it('no allergens identified, empty types → valid (normal delivery)', () => {
    expect(allergenValid(false, [])).toBe(true)
  })

  it('no allergens identified, types populated → valid (ignored when not identified)', () => {
    expect(allergenValid(false, ['Mustard'])).toBe(true)
  })

  it('allergens found, no types selected → INVALID (must select at least one)', () => {
    expect(allergenValid(true, [])).toBe(false)
  })

  it('allergens found, one type selected → valid', () => {
    expect(allergenValid(true, ['Milk/Dairy'])).toBe(true)
  })

  it('allergens found, multiple types selected → valid', () => {
    expect(allergenValid(true, ['Mustard', 'Celery', 'Gluten'])).toBe(true)
  })

  it('allergens found, all 14 selected → valid', () => {
    const all14 = ['Mustard','Celery','Sulphites','Gluten','Milk/Dairy','Soya','Eggs','Peanuts','Tree nuts','Crustaceans','Molluscs','Fish','Lupin','Sesame']
    expect(allergenValid(true, all14)).toBe(true)
  })
})

// ── correctiveActionRequired ─────────────────────────────────────────────────
describe('correctiveActionRequired — allergen contributes to CA flag', () => {
  it('pass temp, clean, no allergens → no CA', () => {
    expect(correctiveActionRequired('pass', 'no', false)).toBe(false)
  })

  it('pass temp, clean, allergens found → CA required', () => {
    expect(correctiveActionRequired('pass', 'no', true)).toBe(true)
  })

  it('fail temp, clean, no allergens → CA required (temp alone)', () => {
    expect(correctiveActionRequired('fail', 'no', false)).toBe(true)
  })

  it('urgent temp, clean, allergens → CA required (both triggers)', () => {
    expect(correctiveActionRequired('urgent', 'no', true)).toBe(true)
  })

  it('pass temp, contamination, no allergens → CA required', () => {
    expect(correctiveActionRequired('pass', 'yes', false)).toBe(true)
  })

  it('pass temp, contamination, allergens → CA required', () => {
    expect(correctiveActionRequired('pass', 'yes', true)).toBe(true)
  })

  it('fail temp, contamination, allergens → CA required (all three)', () => {
    expect(correctiveActionRequired('fail', 'yes', true)).toBe(true)
  })
})

// ── needsCCA — determines whether CCA popup appears ─────────────────────────
describe('needsCCA — allergen triggers CCA popup', () => {
  it('pass, clean, no allergens → no CCA popup', () => {
    expect(needsCCA('pass', 'no', false)).toBe(false)
  })

  it('allergens found → CCA popup required even with pass temp and clean', () => {
    expect(needsCCA('pass', 'no', true)).toBe(true)
  })

  it('urgent temp → CCA popup', () => {
    expect(needsCCA('urgent', 'no', false)).toBe(true)
  })

  it('fail temp → CCA popup', () => {
    expect(needsCCA('fail', 'no', false)).toBe(true)
  })

  it('contamination yes → CCA popup', () => {
    expect(needsCCA('pass', 'yes', false)).toBe(true)
  })

  it('contamination yes_actioned → CCA popup', () => {
    expect(needsCCA('pass', 'yes_actioned', false)).toBe(true)
  })

  it('all three triggers → CCA popup', () => {
    expect(needsCCA('fail', 'yes', true)).toBe(true)
  })
})

// ── allergenBadge — card display ─────────────────────────────────────────────
describe('allergenBadge — delivery card display', () => {
  it('no allergens → green badge with SALSA reference', () => {
    const badge = allergenBadge(false)
    expect(badge.colour).toBe('green')
    expect(badge.label).toContain('No allergens')
    expect(badge.label).toContain('SALSA 1.4.2')
  })

  it('allergens found → red badge with warning', () => {
    const badge = allergenBadge(true)
    expect(badge.colour).toBe('red')
    expect(badge.label).toContain('ALLERGENS IDENTIFIED')
  })

  it('nil-allergen badge references SALSA clause', () => {
    expect(allergenBadge(false).label).toMatch(/SALSA 1\.4\.2/)
  })
})

// ── buildAllergenCA — automatic CA on allergen detection ──────────────────────
describe('buildAllergenCA — auto-generated corrective action', () => {
  it('always targets CCP1 (Goods In CCP)', () => {
    expect(buildAllergenCA(undefined).ccp_ref).toBe('CCP1')
  })

  it('always requires management verification', () => {
    expect(buildAllergenCA('Milk in product').management_verification_required).toBe(true)
  })

  it('always starts unresolved', () => {
    expect(buildAllergenCA('Milk in product').resolved).toBe(false)
  })

  it('includes allergen types in deviation description when provided', () => {
    const ca = buildAllergenCA('Milk/Dairy, Mustard')
    expect(ca.deviation_description).toContain('Milk/Dairy, Mustard')
  })

  it('handles missing notes gracefully', () => {
    const ca = buildAllergenCA(undefined)
    expect(ca.deviation_description).toContain('No further detail provided')
    expect(ca.deviation_description).not.toContain('undefined')
  })

  it('handles empty string notes gracefully', () => {
    const ca = buildAllergenCA('')
    expect(ca.deviation_description).toContain('No further detail provided')
  })

  it('action_taken instructs quarantine', () => {
    expect(buildAllergenCA(undefined).action_taken).toContain('quarantine')
  })

  it('action_taken prevents processing until CA resolved', () => {
    expect(buildAllergenCA(undefined).action_taken).toContain('Do not process')
  })

  it('deviation_description identifies MFS as allergen-free site', () => {
    expect(buildAllergenCA(undefined).deviation_description).toContain('allergen-free site')
  })
})

// ── Default form state ────────────────────────────────────────────────────────
describe('allergen check default state', () => {
  it('default allergensIdentified is false (no allergens)', () => {
    const defaultState = { allergensIdentified: false, allergenTypes: [] as string[], allergenNotes: '' }
    expect(defaultState.allergensIdentified).toBe(false)
  })

  it('default state is valid for form submission', () => {
    expect(allergenValid(false, [])).toBe(true)
  })

  it('default state does not trigger CA', () => {
    expect(correctiveActionRequired('pass', 'no', false)).toBe(false)
  })

  it('default state does not require CCA popup', () => {
    expect(needsCCA('pass', 'no', false)).toBe(false)
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────
describe('allergen check edge cases', () => {
  it('allergens_identified false — types not sent in payload', () => {
    const allergensIdentified = false
    const allergenTypes       = ['Milk/Dairy']
    // Mirrors: allergen_notes: allergensIdentified ? ... : undefined
    const sent = allergensIdentified
      ? [allergenTypes.join(', ')].filter(Boolean).join(' — ')
      : undefined
    expect(sent).toBeUndefined()
  })

  it('allergens_identified true — selected types sent in payload', () => {
    const allergensIdentified = true
    const allergenTypes       = ['Milk/Dairy', 'Mustard']
    const allergenNotes       = ''
    const sent = allergensIdentified
      ? [allergenTypes.join(', '), allergenNotes.trim()].filter(Boolean).join(' — ')
      : undefined
    expect(sent).toBe('Milk/Dairy, Mustard')
  })

  it('allergens_identified true — types + notes combined with em dash separator', () => {
    const allergensIdentified = true
    const allergenTypes       = ['Milk/Dairy']
    const allergenNotes       = 'Product code MK-001'
    const sent = allergensIdentified
      ? [allergenTypes.join(', '), allergenNotes.trim()].filter(Boolean).join(' — ')
      : undefined
    expect(sent).toBe('Milk/Dairy — Product code MK-001')
  })

  it('allergens_identified true with no notes — no trailing separator', () => {
    const allergensIdentified = true
    const allergenTypes       = ['Sesame']
    const allergenNotes       = '   '
    const sent = allergensIdentified
      ? [allergenTypes.join(', '), allergenNotes.trim()].filter(Boolean).join(' — ')
      : undefined
    expect(sent).toBe('Sesame')
  })
})
