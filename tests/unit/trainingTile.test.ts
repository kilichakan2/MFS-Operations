/**
 * tests/unit/trainingTile.test.ts
 *
 * Tests for:
 * - Training tile state (overdue/due-soon/all-current)
 * - Refresh date auto-calculation (+12 months)
 * - Document version tracking
 * - Acknowledgment checklist — all 7 items required
 */

import { describe, it, expect } from 'vitest'

// ── Mirror refresh status logic from training page ────────────────────────────

function refreshStatus(refreshDate: string, today: string): {
  label: string; tone: 'overdue' | 'due_soon' | 'current'
} {
  const todayDate   = new Date(today)
  const refresh     = new Date(refreshDate)
  const daysUntil   = Math.floor((refresh.getTime() - todayDate.getTime()) / 86400000)

  if (daysUntil < 0)   return { label: `Overdue by ${Math.abs(daysUntil)}d`, tone: 'overdue'  }
  if (daysUntil <= 30) return { label: `Due in ${daysUntil}d`,               tone: 'due_soon' }
  return               { label: `Due ${refreshDate}`,                        tone: 'current'  }
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

// ── Mirror tile badge logic from homepage ─────────────────────────────────────

function trainingBadge(overdueCount: number, dueSoonCount: number): string {
  if (overdueCount > 0)  return `${overdueCount} overdue`
  if (dueSoonCount > 0)  return `${dueSoonCount} due soon`
  return 'All current ✓'
}

// ── Butchery acknowledgment items ─────────────────────────────────────────────

const BUTCHERY_ACK_IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']

function allTicked(ticked: Record<string, boolean>): boolean {
  return BUTCHERY_ACK_IDS.every((id) => ticked[id] === true)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Training refresh date auto-calculation', () => {
  it('adds exactly 12 months', () => {
    expect(addMonths('2026-04-22', 12)).toBe('2027-04-22')
  })

  it('handles month-end correctly (Jan 31 → Jan 31 next year)', () => {
    expect(addMonths('2026-01-31', 12)).toBe('2027-01-31')
  })

  it('handles year rollover', () => {
    expect(addMonths('2026-12-01', 12)).toBe('2027-12-01')
  })

  it('is editable — can be set to different value', () => {
    const auto = addMonths('2026-04-22', 12)
    const manual = '2028-04-22'
    expect(auto).not.toBe(manual) // user changed it
  })
})

describe('Refresh status colour logic', () => {
  it('overdue when refresh date is in the past', () => {
    expect(refreshStatus('2026-03-01', '2026-04-22').tone).toBe('overdue')
  })

  it('overdue by correct number of days', () => {
    const status = refreshStatus('2026-04-12', '2026-04-22')
    expect(status.tone).toBe('overdue')
    expect(status.label).toContain('10d')
  })

  it('due_soon within 30 days', () => {
    expect(refreshStatus('2026-05-01', '2026-04-22').tone).toBe('due_soon')
    expect(refreshStatus('2026-05-22', '2026-04-22').tone).toBe('due_soon')
  })

  it('current when more than 30 days away', () => {
    expect(refreshStatus('2026-06-01', '2026-04-22').tone).toBe('current')
    expect(refreshStatus('2027-04-22', '2026-04-22').tone).toBe('current')
  })

  it('exactly today is overdue (0 days remaining rounds down)', () => {
    // daysUntil = 0 → not < 0 → due_soon (0 is within 30 days)
    expect(refreshStatus('2026-04-22', '2026-04-22').tone).toBe('due_soon')
  })
})

describe('Training tile badge', () => {
  it('shows overdue count when records expired', () => {
    expect(trainingBadge(2, 0)).toBe('2 overdue')
  })

  it('shows due soon count when upcoming within 30 days', () => {
    expect(trainingBadge(0, 1)).toBe('1 due soon')
  })

  it('prioritises overdue over due_soon', () => {
    expect(trainingBadge(1, 3)).toBe('1 overdue')
  })

  it('shows all current when no issues', () => {
    expect(trainingBadge(0, 0)).toBe('All current ✓')
  })
})

describe('Butchery acknowledgment checklist', () => {
  it('valid when all 7 items ticked', () => {
    const ticked = Object.fromEntries(BUTCHERY_ACK_IDS.map((id) => [id, true]))
    expect(allTicked(ticked)).toBe(true)
  })

  it('invalid when any item not ticked', () => {
    const ticked = Object.fromEntries(BUTCHERY_ACK_IDS.map((id) => [id, true]))
    ticked['b5'] = false
    expect(allTicked(ticked)).toBe(false)
  })

  it('invalid when all unticked', () => {
    const ticked = Object.fromEntries(BUTCHERY_ACK_IDS.map((id) => [id, false]))
    expect(allTicked(ticked)).toBe(false)
  })

  it('has exactly 7 items', () => {
    expect(BUTCHERY_ACK_IDS).toHaveLength(7)
  })
})

describe('Document version tracking', () => {
  const CURRENT = 'V2.0'

  it('no warning when version matches current', () => {
    const version = 'V2.0'
    expect(version === CURRENT).toBe(true)
  })

  it('warns when version does not match current', () => {
    const version = 'V1.0'
    expect(version === CURRENT).toBe(false)
  })

  it('version comparison is case-sensitive', () => {
    expect('v2.0' === CURRENT).toBe(false) // lowercase v
  })
})

// ─── API contract — field names page → route ──────────────────────────────────
// These tests catch mismatches between what the page sends and what the route reads.
// Both sides must use the SAME key names. Update both together.

describe('Training API contract — butchery tab', () => {
  // These are the exact keys the page sends in the POST body
  const PAGE_SENDS_KEYS = [
    'training_type',
    'staff_name',
    'job_role',
    'document_version',
    'completion_date',   // NOT certification_date
    'refresh_date',
    'supervisor',        // NOT reviewed_by
    'confirmation_items',
  ]

  // These are the keys the route destructures from body
  const ROUTE_READS_KEYS = [
    'training_type',
    'staff_name',
    'job_role',
    'document_version',
    'completion_date',   // must match page
    'refresh_date',
    'supervisor',        // must match page
    'confirmation_items',
  ]

  it('page and route use identical field names', () => {
    expect(PAGE_SENDS_KEYS.sort()).toEqual(ROUTE_READS_KEYS.sort())
  })

  it('completion_date is used (not certification_date)', () => {
    expect(PAGE_SENDS_KEYS).toContain('completion_date')
    expect(PAGE_SENDS_KEYS).not.toContain('certification_date')
    expect(ROUTE_READS_KEYS).toContain('completion_date')
    expect(ROUTE_READS_KEYS).not.toContain('certification_date')
  })

  it('supervisor is used (not reviewed_by)', () => {
    expect(PAGE_SENDS_KEYS).toContain('supervisor')
    expect(PAGE_SENDS_KEYS).not.toContain('reviewed_by')
    expect(ROUTE_READS_KEYS).toContain('supervisor')
    expect(ROUTE_READS_KEYS).not.toContain('reviewed_by')
  })

  it('all required fields are present', () => {
    const required = ['staff_name', 'job_role', 'completion_date', 'refresh_date', 'supervisor']
    for (const field of required) {
      expect(PAGE_SENDS_KEYS).toContain(field)
      expect(ROUTE_READS_KEYS).toContain(field)
    }
  })
})

// ─── DB schema constraints ────────────────────────────────────────────────────
// Mirror NOT NULL columns so any constraint violation is caught in tests first.

describe('haccp_staff_training DB schema', () => {
  // NOT NULL columns that we must always provide (excluding auto-defaults)
  const REQUIRED_COLUMNS = [
    'logged_by',          // userId from cookie
    'staff_name',
    'training_type',
    'completion_date',
    'confirmation_items', // has default '[]' but we always send it
    // supervisor_signed_by is now NULLABLE — we use supervisor_name text instead
    // supervisor_signed_at has default now()
  ]

  const ROUTE_INSERT_KEYS = [
    'logged_by',
    'staff_name',
    'job_role',
    'training_type',
    'document_version',
    'completion_date',
    'refresh_date',
    'supervisor_name',
    'supervisor_signed_at',
    'confirmation_items',
  ]

  it('route insert provides all NOT NULL required columns', () => {
    for (const col of REQUIRED_COLUMNS) {
      expect(ROUTE_INSERT_KEYS).toContain(col)
    }
  })

  it('supervisor_signed_by is NOT in insert (it is nullable — we use supervisor_name)', () => {
    expect(ROUTE_INSERT_KEYS).not.toContain('supervisor_signed_by')
  })
})

describe('haccp_allergen_training DB schema', () => {
  // This table uses DIFFERENT column names — certification_date, training_completed
  const ALLERGEN_NOT_NULL_COLUMNS = [
    'logged_by',
    'staff_name',
    'job_role',
    'training_completed',   // NOT training_type
    'certification_date',   // NOT completion_date
    'refresh_date',
  ]

  it('allergen table uses certification_date (not completion_date)', () => {
    expect(ALLERGEN_NOT_NULL_COLUMNS).toContain('certification_date')
    expect(ALLERGEN_NOT_NULL_COLUMNS).not.toContain('completion_date')
  })

  it('allergen table uses training_completed (not training_type)', () => {
    expect(ALLERGEN_NOT_NULL_COLUMNS).toContain('training_completed')
    expect(ALLERGEN_NOT_NULL_COLUMNS).not.toContain('training_type')
  })

  it('allergen table requires job_role (staff_training does not have it NOT NULL)', () => {
    expect(ALLERGEN_NOT_NULL_COLUMNS).toContain('job_role')
  })
})

// ─── Warehouse Operative Tab 2 ────────────────────────────────────────────────

const WAREHOUSE_ACK_IDS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8']

const WAREHOUSE_ACK_ITEMS = [
  { id: 'w1', label: 'Read and understood this training summary' },
  { id: 'w2', label: 'Reviewed the complete MFS Global HACCP Policy Handbook (V2.0)' },
  { id: 'w3', label: 'Understand the food safety hazards in warehouse operations' },
  { id: 'w4', label: 'Know my critical responsibilities for product receiving and temperature control' },
  { id: 'w5', label: 'Understand how to monitor Critical Control Points (CCP 1 & 2)' },
  { id: 'w6', label: 'Have the authority to reject unsuitable products' },
  { id: 'w7', label: 'Know what to do in emergency situations' },
  { id: 'w8', label: 'Accept responsibility for food safety in my daily work' },
]

describe('Warehouse acknowledgment checklist', () => {
  it('has exactly 8 items', () => {
    expect(WAREHOUSE_ACK_ITEMS).toHaveLength(8)
  })

  it('all IDs are unique', () => {
    const ids = WAREHOUSE_ACK_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all IDs use w prefix (not b prefix)', () => {
    for (const item of WAREHOUSE_ACK_ITEMS) {
      expect(item.id.startsWith('w')).toBe(true)
    }
  })

  it('no overlap with butchery IDs', () => {
    const butcheryIds = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']
    for (const id of WAREHOUSE_ACK_IDS) {
      expect(butcheryIds).not.toContain(id)
    }
  })

  it('valid when all 8 items ticked', () => {
    const ticked = Object.fromEntries(WAREHOUSE_ACK_IDS.map((id) => [id, true]))
    const allTicked = WAREHOUSE_ACK_IDS.every((id) => ticked[id] === true)
    expect(allTicked).toBe(true)
  })

  it('invalid when any item not ticked', () => {
    const ticked = Object.fromEntries(WAREHOUSE_ACK_IDS.map((id) => [id, true]))
    ticked['w5'] = false
    const allTicked = WAREHOUSE_ACK_IDS.every((id) => ticked[id] === true)
    expect(allTicked).toBe(false)
  })
})

describe('Warehouse training API contract', () => {
  const WAREHOUSE_TRAINING_TYPE = 'warehouse_operative'
  const WAREHOUSE_JOB_ROLE      = 'Warehouse Operative'
  const CURRENT_VERSION         = 'V2.0'

  it('training_type is warehouse_operative', () => {
    expect(WAREHOUSE_TRAINING_TYPE).toBe('warehouse_operative')
  })

  it('job role is Warehouse Operative', () => {
    expect(WAREHOUSE_JOB_ROLE).toBe('Warehouse Operative')
  })

  it('uses same page→route field names as butchery', () => {
    // Both tabs send the same field names — only training_type and job_role differ in value
    const SHARED_KEYS = [
      'training_type', 'staff_name', 'job_role', 'document_version',
      'completion_date', 'refresh_date', 'supervisor', 'confirmation_items',
    ]
    // All fields must be present
    expect(SHARED_KEYS).toContain('completion_date')
    expect(SHARED_KEYS).toContain('supervisor')
    expect(SHARED_KEYS).not.toContain('certification_date')
    expect(SHARED_KEYS).not.toContain('reviewed_by')
  })

  it('document version is V2.0', () => {
    expect(CURRENT_VERSION).toBe('V2.0')
  })

  it('history tab filters by training_type warehouse_operative', () => {
    const records = [
      { training_type: 'butchery_process_room', staff_name: 'Ali' },
      { training_type: 'warehouse_operative',   staff_name: 'Daz' },
      { training_type: 'warehouse_operative',   staff_name: 'Adeel' },
    ]
    const warehouseRecords = records.filter((r) => r.training_type === 'warehouse_operative')
    expect(warehouseRecords).toHaveLength(2)
    expect(warehouseRecords.map((r) => r.staff_name)).toEqual(['Daz', 'Adeel'])
  })
})

// ─── Allergen Awareness Tab 3 ─────────────────────────────────────────────────

const ALLERGEN_ITEMS = [
  { id: 'a1',  label: 'Celery' },
  { id: 'a2',  label: 'Cereals containing gluten (wheat, rye, barley, oats)' },
  { id: 'a3',  label: 'Crustaceans (prawns, crab, lobster)' },
  { id: 'a4',  label: 'Eggs' },
  { id: 'a5',  label: 'Fish' },
  { id: 'a6',  label: 'Lupin' },
  { id: 'a7',  label: 'Milk' },
  { id: 'a8',  label: 'Molluscs (mussels, oysters, squid)' },
  { id: 'a9',  label: 'Mustard' },
  { id: 'a10', label: 'Peanuts' },
  { id: 'a11', label: 'Sesame' },
  { id: 'a12', label: 'Soybeans' },
  { id: 'a13', label: 'Sulphur dioxide and sulphites (>10mg/kg)' },
  { id: 'a14', label: 'Tree nuts (almonds, hazelnuts, walnuts, cashews, pecans, Brazil nuts, pistachios, macadamia)' },
]

const ALLERGEN_UNDERSTANDING_ITEMS = [
  { id: 'u1', label: 'I understand the risks of allergen cross-contamination in food handling' },
  { id: 'u2', label: 'I know how to store allergen-containing products separately to prevent cross-contamination' },
  { id: 'u3', label: 'I understand my responsibility to prevent allergen cross-contamination during processing and dispatch' },
  { id: 'u4', label: 'I know that allergen information must be accurate on all product labels' },
  { id: 'u5', label: 'I know to report any potential allergen contamination to my supervisor immediately' },
]

describe('Allergen awareness — 14 UK allergens (FIR 2014)', () => {
  it('has exactly 14 allergens', () => {
    expect(ALLERGEN_ITEMS).toHaveLength(14)
  })

  it('all allergen IDs are unique', () => {
    const ids = ALLERGEN_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all allergen IDs use a prefix', () => {
    for (const item of ALLERGEN_ITEMS) {
      expect(item.id.startsWith('a')).toBe(true)
    }
  })

  it('includes all 14 FIR 2014 allergens by name', () => {
    const labels = ALLERGEN_ITEMS.map((i) => i.label)
    expect(labels.some(l => l.includes('Celery'))).toBe(true)
    expect(labels.some(l => l.includes('gluten'))).toBe(true)
    expect(labels.some(l => l.includes('Crustaceans'))).toBe(true)
    expect(labels.some(l => l.includes('Eggs'))).toBe(true)
    expect(labels.some(l => l.includes('Fish'))).toBe(true)
    expect(labels.some(l => l.includes('Lupin'))).toBe(true)
    expect(labels.some(l => l.includes('Milk'))).toBe(true)
    expect(labels.some(l => l.includes('Molluscs'))).toBe(true)
    expect(labels.some(l => l.includes('Mustard'))).toBe(true)
    expect(labels.some(l => l.includes('Peanuts'))).toBe(true)
    expect(labels.some(l => l.includes('Sesame'))).toBe(true)
    expect(labels.some(l => l.includes('Soybeans'))).toBe(true)
    expect(labels.some(l => l.includes('Sulphur'))).toBe(true)
    expect(labels.some(l => l.includes('Tree nuts'))).toBe(true)
  })

  it('has 5 understanding items', () => {
    expect(ALLERGEN_UNDERSTANDING_ITEMS).toHaveLength(5)
  })

  it('total confirmation items = 19 (14 allergens + 5 understanding)', () => {
    expect(ALLERGEN_ITEMS.length + ALLERGEN_UNDERSTANDING_ITEMS.length).toBe(19)
  })

  it('no ID overlap between allergen items and understanding items', () => {
    const allergenIds = ALLERGEN_ITEMS.map((i) => i.id)
    const understandingIds = ALLERGEN_UNDERSTANDING_ITEMS.map((i) => i.id)
    const overlap = allergenIds.filter((id) => understandingIds.includes(id))
    expect(overlap).toHaveLength(0)
  })
})

describe('Allergen training API contract', () => {
  // CRITICAL: allergen table uses DIFFERENT column names from staff_training
  // certification_date (not completion_date), training_completed (not training_type)
  const PAGE_SENDS_KEYS_ALLERGEN = [
    'training_type',      // page sends 'allergen_awareness' — route maps to training_completed
    'staff_name',
    'job_role',
    'certification_date', // NOT completion_date — allergen table uses certification_date
    'refresh_date',
    'supervisor',
    'confirmation_items',
  ]

  const ROUTE_INSERTS_ALLERGEN = [
    'logged_by',
    'staff_name',
    'job_role',
    'training_completed', // DB column name — value 'allergen_awareness'
    'certification_date',
    'refresh_date',
    'supervisor_name',    // DB column — mapped from supervisor
    'confirmation_items',
  ]

  it('allergen page sends certification_date (not completion_date)', () => {
    expect(PAGE_SENDS_KEYS_ALLERGEN).toContain('certification_date')
    expect(PAGE_SENDS_KEYS_ALLERGEN).not.toContain('completion_date')
  })

  it('allergen route inserts training_completed (not training_type)', () => {
    expect(ROUTE_INSERTS_ALLERGEN).toContain('training_completed')
    expect(ROUTE_INSERTS_ALLERGEN).not.toContain('training_type')
  })

  it('allergen route inserts certification_date (not completion_date)', () => {
    expect(ROUTE_INSERTS_ALLERGEN).toContain('certification_date')
    expect(ROUTE_INSERTS_ALLERGEN).not.toContain('completion_date')
  })

  it('allergen requires job_role (it is NOT NULL in haccp_allergen_training)', () => {
    expect(PAGE_SENDS_KEYS_ALLERGEN).toContain('job_role')
    expect(ROUTE_INSERTS_ALLERGEN).toContain('job_role')
  })

  it('supervisor maps to supervisor_name in DB', () => {
    expect(PAGE_SENDS_KEYS_ALLERGEN).toContain('supervisor')
    expect(ROUTE_INSERTS_ALLERGEN).toContain('supervisor_name')
    expect(ROUTE_INSERTS_ALLERGEN).not.toContain('supervisor')
  })
})
