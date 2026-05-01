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
// Allergen CA only for meat/poultry — dairy/dry_goods/frozen record only
const ALLERGEN_CA_CATEGORIES = new Set(['lamb','beef','red_meat','offal','frozen_beef_lamb','poultry'])

function correctiveActionRequired(
  tempStatus:     'pass' | 'urgent' | 'fail',
  contamination:  string,
  allergensFound: boolean,
  category = 'lamb',  // default to meat for backwards compat with existing tests
): boolean {
  const allergenDeviation = allergensFound && ALLERGEN_CA_CATEGORIES.has(category)
  return tempStatus !== 'pass' || contamination !== 'no' || allergenDeviation
}

// ── Mirrors needsCCA from delivery page (determines whether CCA popup shows) ──
function needsCCA(
  tempStatus:     'pass' | 'urgent' | 'fail',
  contamination:  string,
  allergensFound: boolean,
  category = 'lamb',
): boolean {
  const allergenDeviation = allergensFound && ALLERGEN_CA_CATEGORIES.has(category)
  return (tempStatus === 'urgent' || tempStatus === 'fail') ||
         (contamination === 'yes' || contamination === 'yes_actioned') ||
         allergenDeviation
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
describe('correctiveActionRequired — allergen CA scoped to meat/poultry only', () => {
  it('pass temp, clean, no allergens → no CA', () => {
    expect(correctiveActionRequired('pass', 'no', false, 'lamb')).toBe(false)
  })

  it('lamb + allergens → CA required', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'lamb')).toBe(true)
  })

  it('beef + allergens → CA required', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'beef')).toBe(true)
  })

  it('offal + allergens → CA required', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'offal')).toBe(true)
  })

  it('poultry + allergens → CA required (pure chicken should not have allergens)', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'poultry')).toBe(true)
  })

  it('dairy + allergens → NO CA (milk allergen is expected in dairy products)', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'dairy')).toBe(false)
  })

  it('dry_goods + allergens → NO CA (allergens expected in many dry goods)', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'dry_goods')).toBe(false)
  })

  it('frozen + allergens → NO CA (frozen chicken/fish etc.)', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'frozen')).toBe(false)
  })

  it('chilled_other + allergens → NO CA', () => {
    expect(correctiveActionRequired('pass', 'no', true, 'chilled_other')).toBe(false)
  })

  it('dairy + fail temp → CA required (temp deviation still triggers)', () => {
    expect(correctiveActionRequired('fail', 'no', true, 'dairy')).toBe(true)
  })
})

describe('needsCCA — allergen popup scoped to meat/poultry', () => {
  it('pass, clean, no allergens → no CCA popup', () => {
    expect(needsCCA('pass', 'no', false, 'lamb')).toBe(false)
  })

  it('lamb allergens → CCA popup required', () => {
    expect(needsCCA('pass', 'no', true, 'lamb')).toBe(true)
  })

  it('dairy allergens → NO CCA popup (expected)', () => {
    expect(needsCCA('pass', 'no', true, 'dairy')).toBe(false)
  })

  it('dry_goods allergens → NO CCA popup', () => {
    expect(needsCCA('pass', 'no', true, 'dry_goods')).toBe(false)
  })

  it('urgent temp → CCA popup regardless of category', () => {
    expect(needsCCA('urgent', 'no', false, 'dairy')).toBe(true)
  })

  it('contamination yes → CCA popup', () => {
    expect(needsCCA('pass', 'yes', false, 'dry_goods')).toBe(true)
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

  it('default state does not trigger CA for lamb', () => {
    expect(correctiveActionRequired('pass', 'no', false, 'lamb')).toBe(false)
  })

  it('default state does not require CCA popup', () => {
    expect(needsCCA('pass', 'no', false, 'lamb')).toBe(false)
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
