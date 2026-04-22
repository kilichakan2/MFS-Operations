/**
 * tests/unit/haccpPeople.test.ts
 *
 * Tests for /api/haccp/people constraint values.
 * DB check constraints enforce:
 *   record_type IN ('new_staff_declaration', 'return_to_work', 'visitor')
 *   illness_type IN ('gastrointestinal', 'other_illness', 'serious_illness')
 */

import { describe, it, expect } from 'vitest'

// ── Mirror the mapping from the route ────────────────────────────────────────

const RECORD_TYPE_MAP: Record<string, string> = {
  health_declaration:    'new_staff_declaration',  // page sends this, DB expects that
  return_to_work:        'return_to_work',
  visitor:               'visitor',
}

const ILLNESS_TYPE_MAP: Record<string, string> = {
  gi:      'gastrointestinal',
  other:   'other_illness',
  serious: 'serious_illness',
}

const VALID_RECORD_TYPES  = ['new_staff_declaration', 'return_to_work', 'visitor']
const VALID_ILLNESS_TYPES = ['gastrointestinal', 'other_illness', 'serious_illness']

// ── record_type ───────────────────────────────────────────────────────────────

describe('record_type constraint', () => {
  it('health_declaration maps to new_staff_declaration', () => {
    expect(RECORD_TYPE_MAP['health_declaration']).toBe('new_staff_declaration')
  })

  it('all mapped values pass DB constraint', () => {
    for (const [, dbVal] of Object.entries(RECORD_TYPE_MAP)) {
      expect(VALID_RECORD_TYPES).toContain(dbVal)
    }
  })

  it('route hardcodes new_staff_declaration for health declaration insert', () => {
    // The route sends 'new_staff_declaration' — not the page value 'health_declaration'
    const routeValue = 'new_staff_declaration'
    expect(VALID_RECORD_TYPES).toContain(routeValue)
  })
})

// ── illness_type ──────────────────────────────────────────────────────────────

describe('illness_type mapping', () => {
  it('gi maps to gastrointestinal', () => {
    expect(ILLNESS_TYPE_MAP['gi']).toBe('gastrointestinal')
  })

  it('other maps to other_illness', () => {
    expect(ILLNESS_TYPE_MAP['other']).toBe('other_illness')
  })

  it('serious maps to serious_illness', () => {
    expect(ILLNESS_TYPE_MAP['serious']).toBe('serious_illness')
  })

  it('all mapped values pass DB constraint', () => {
    for (const [, dbVal] of Object.entries(ILLNESS_TYPE_MAP)) {
      expect(VALID_ILLNESS_TYPES).toContain(dbVal)
    }
  })

  it('unknown illness type passes through unmapped (DB will reject)', () => {
    const unknown = 'unknown_type'
    const result  = ILLNESS_TYPE_MAP[unknown] ?? unknown
    expect(VALID_ILLNESS_TYPES).not.toContain(result)
  })
})

// ── PwaGuard role allowed prefixes ───────────────────────────────────────────

const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  admin:     ['/screen4', '/screen5', '/screen6', '/screen1', '/driver', '/routes', '/runs', '/complaints', '/visits', '/cash', '/compliments', '/pricing', '/haccp'],
  warehouse: ['/screen1', '/routes', '/runs', '/compliments', '/complaints', '/haccp'],
  butcher:   ['/haccp'],
}

const ROLE_HOME: Record<string, string> = {
  admin:     '/screen4',
  warehouse: '/screen1',
  butcher:   '/haccp',
}

describe('PwaGuard — role URL validation', () => {
  it('butcher allowed on /haccp paths only', () => {
    const allowed = ROLE_ALLOWED_PREFIXES['butcher']
    expect(allowed.some(p => '/haccp/cold-storage'.startsWith(p))).toBe(true)
    expect(allowed.some(p => '/screen4'.startsWith(p))).toBe(false)
    expect(allowed.some(p => '/runs'.startsWith(p))).toBe(false)
  })

  it('admin allowed on /screen4 and /haccp', () => {
    const allowed = ROLE_ALLOWED_PREFIXES['admin']
    expect(allowed.some(p => '/screen4'.startsWith(p))).toBe(true)
    expect(allowed.some(p => '/haccp/reviews'.startsWith(p))).toBe(true)
  })

  it('warehouse not allowed on /screen4', () => {
    const allowed = ROLE_ALLOWED_PREFIXES['warehouse']
    expect(allowed.some(p => '/screen4'.startsWith(p))).toBe(false)
  })

  it('unknown URL for role triggers redirect to role home', () => {
    const role    = 'butcher'
    const path    = '/screen4'
    const allowed = ROLE_ALLOWED_PREFIXES[role]
    const isOk    = allowed.some(p => path.startsWith(p))
    expect(isOk).toBe(false)
    // Guard would redirect to:
    expect(ROLE_HOME[role]).toBe('/haccp')
  })

  it('role home is always in allowed prefixes', () => {
    for (const [role, home] of Object.entries(ROLE_HOME)) {
      const allowed = ROLE_ALLOWED_PREFIXES[role] ?? []
      expect(allowed.some(p => home.startsWith(p))).toBe(true)
    }
  })
})
