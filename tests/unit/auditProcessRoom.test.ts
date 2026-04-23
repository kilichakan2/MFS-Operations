/**
 * tests/unit/auditProcessRoom.test.ts
 *
 * Tests for the audit page — Process Room section (CCP 3 + SOP 1).
 *
 * Two sub-tabs:
 * 1. Temperatures — haccp_processing_temps
 *    Status derived from booleans: product_within_limit, room_within_limit, within_limits
 *    No temp_status text column like cold storage
 *
 * 2. Daily Diary — haccp_daily_diary
 *    Phases: opening (10 checks), operational (5 checks), closing (5 checks)
 *    check_results is JSONB — count true values vs total keys
 */

import { describe, it, expect } from 'vitest'

// ── Temperature status (derived from booleans) ────────────────────────────────

type CA = { resolved: boolean } | null

function getTempRowColour(
  withinLimits: boolean,
  ca: CA,
): 'red' | 'green' {
  if (!withinLimits)         return 'red'
  if (ca && !ca.resolved)    return 'red'
  return 'green'
}

function getTempOverallLabel(withinLimits: boolean): string {
  return withinLimits ? 'Pass' : 'Fail'
}

function getTempProductLabel(pass: boolean, tempC: number): string {
  if (pass) return `${tempC}°C ✓`
  return `${tempC}°C ✗ (limit ≤4°C)`
}

function getTempRoomLabel(pass: boolean, tempC: number): string {
  if (pass) return `${tempC}°C ✓`
  return `${tempC}°C ✗ (limit ≤12°C)`
}

describe('Process Room temperature row colour', () => {
  it('all within limits, no CA → green', () => {
    expect(getTempRowColour(true, null)).toBe('green')
  })

  it('within_limits = false → red', () => {
    expect(getTempRowColour(false, null)).toBe('red')
  })

  it('within limits + unresolved CA → red', () => {
    expect(getTempRowColour(true, { resolved: false })).toBe('red')
  })

  it('within limits + resolved CA → green', () => {
    expect(getTempRowColour(true, { resolved: true })).toBe('green')
  })

  it('not within limits + unresolved CA → red', () => {
    expect(getTempRowColour(false, { resolved: false })).toBe('red')
  })
})

describe('Process Room temperature labels', () => {
  it('within_limits true → Pass', () => {
    expect(getTempOverallLabel(true)).toBe('Pass')
  })

  it('within_limits false → Fail', () => {
    expect(getTempOverallLabel(false)).toBe('Fail')
  })

  it('product pass → shows temp with tick', () => {
    expect(getTempProductLabel(true, 3.5)).toBe('3.5°C ✓')
  })

  it('product fail → shows temp with cross and limit', () => {
    expect(getTempProductLabel(false, 5.2)).toBe('5.2°C ✗ (limit ≤4°C)')
  })

  it('room pass → shows temp with tick', () => {
    expect(getTempRoomLabel(true, 9)).toBe('9°C ✓')
  })

  it('room fail → shows temp with cross and limit', () => {
    expect(getTempRoomLabel(false, 14)).toBe('14°C ✗ (limit ≤12°C)')
  })
})

// ── Temperature summary ───────────────────────────────────────────────────────

interface TempRow {
  within_limits: boolean
  ca: CA
}

function summariseTempRows(rows: TempRow[]) {
  return {
    total:      rows.length,
    pass:       rows.filter((r) => r.within_limits).length,
    fail:       rows.filter((r) => !r.within_limits).length,
    ca_count:   rows.filter((r) => r.ca !== null).length,
    unresolved: rows.filter((r) => r.ca !== null && !r.ca.resolved).length,
  }
}

describe('Process Room temperature summary', () => {
  const rows: TempRow[] = [
    { within_limits: true,  ca: null },
    { within_limits: true,  ca: null },
    { within_limits: false, ca: { resolved: false } },
    { within_limits: false, ca: { resolved: true  } },
    { within_limits: true,  ca: null },
  ]

  it('total = 5', ()     => expect(summariseTempRows(rows).total).toBe(5))
  it('pass = 3', ()      => expect(summariseTempRows(rows).pass).toBe(3))
  it('fail = 2', ()      => expect(summariseTempRows(rows).fail).toBe(2))
  it('ca_count = 2', ()  => expect(summariseTempRows(rows).ca_count).toBe(2))
  it('unresolved = 1', ()=> expect(summariseTempRows(rows).unresolved).toBe(1))
  it('pass + fail = total', () => {
    const s = summariseTempRows(rows)
    expect(s.pass + s.fail).toBe(s.total)
  })
})

// ── Diary check_results ───────────────────────────────────────────────────────

// Check keys per phase — from actual DB data
const OPENING_CHECKS = ['ppe','health','no_food','hairnets','handwash','plasters','jewellery','room_temp','steriliser','handwashing']
const OPERATIONAL_CHECKS = ['hygiene','cleaning','equipment','temp_limits','contamination']
const CLOSING_CHECKS = ['waste','secured','equip_clean','product_chilled','steriliser_clean']

function countChecks(checkResults: Record<string, boolean>): { passed: number; total: number } {
  const vals = Object.values(checkResults)
  return {
    passed: vals.filter(Boolean).length,
    total:  vals.length,
  }
}

function getCheckLabel(key: string): string {
  const labels: Record<string, string> = {
    // Opening
    ppe:         'PPE worn correctly',
    health:      'Health declaration confirmed',
    no_food:     'No food or drink in area',
    hairnets:    'Hair nets in place',
    handwash:    'Hands washed before entry',
    plasters:    'All cuts covered with blue plasters',
    jewellery:   'No jewellery worn',
    room_temp:   'Room temperature checked',
    steriliser:  'Steriliser checked (≥82°C)',
    handwashing: 'Hand washing facilities available',
    // Operational
    hygiene:        'Personal hygiene maintained',
    cleaning:       'Equipment cleaned between products',
    equipment:      'Equipment in good condition',
    temp_limits:    'Temperature limits maintained',
    contamination:  'No cross-contamination observed',
    // Closing
    waste:           'Waste disposed correctly',
    secured:         'Area secured',
    equip_clean:     'All equipment cleaned',
    product_chilled: 'All products in cold storage',
    steriliser_clean:'Steriliser cleaned and stored',
  }
  return labels[key] ?? key
}

describe('Diary check phases', () => {
  it('opening has 10 checks', () => {
    expect(OPENING_CHECKS).toHaveLength(10)
  })

  it('operational has 5 checks', () => {
    expect(OPERATIONAL_CHECKS).toHaveLength(5)
  })

  it('closing has 5 checks', () => {
    expect(CLOSING_CHECKS).toHaveLength(5)
  })

  it('total checks across all phases = 20', () => {
    expect(OPENING_CHECKS.length + OPERATIONAL_CHECKS.length + CLOSING_CHECKS.length).toBe(20)
  })

  it('no check key appears in multiple phases', () => {
    const all = [...OPENING_CHECKS, ...OPERATIONAL_CHECKS, ...CLOSING_CHECKS]
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('countChecks from JSONB', () => {
  it('all pass → passed = total', () => {
    const result = { ppe: true, health: true, no_food: true }
    expect(countChecks(result)).toEqual({ passed: 3, total: 3 })
  })

  it('one fail → passed = total - 1', () => {
    const result = { ppe: true, health: false, no_food: true }
    expect(countChecks(result)).toEqual({ passed: 2, total: 3 })
  })

  it('all fail → passed = 0', () => {
    const result = { ppe: false, health: false }
    expect(countChecks(result)).toEqual({ passed: 0, total: 2 })
  })

  it('real opening data — 9/10 (one fail)', () => {
    const openingResult = {
      ppe: true, health: true, no_food: true, hairnets: false,
      handwash: true, plasters: true, jewellery: true,
      room_temp: true, steriliser: true, handwashing: true,
    }
    expect(countChecks(openingResult)).toEqual({ passed: 9, total: 10 })
  })

  it('real operational data — 5/5', () => {
    const opResult = { hygiene: true, cleaning: true, equipment: true, temp_limits: true, contamination: true }
    expect(countChecks(opResult)).toEqual({ passed: 5, total: 5 })
  })

  it('real closing data — 5/5', () => {
    const closeResult = { waste: true, secured: true, equip_clean: true, product_chilled: true, steriliser_clean: true }
    expect(countChecks(closeResult)).toEqual({ passed: 5, total: 5 })
  })
})

describe('Check key labels', () => {
  it('all 20 check keys have human-readable labels', () => {
    const allKeys = [...OPENING_CHECKS, ...OPERATIONAL_CHECKS, ...CLOSING_CHECKS]
    for (const key of allKeys) {
      const label = getCheckLabel(key)
      expect(label).not.toBe(key) // should return a real label, not just the key
      expect(label.length).toBeGreaterThan(3)
    }
  })

  it('ppe → PPE worn correctly', () => {
    expect(getCheckLabel('ppe')).toBe('PPE worn correctly')
  })

  it('steriliser → Steriliser checked (≥82°C)', () => {
    expect(getCheckLabel('steriliser')).toBe('Steriliser checked (≥82°C)')
  })

  it('product_chilled → All products in cold storage', () => {
    expect(getCheckLabel('product_chilled')).toBe('All products in cold storage')
  })
})

// ── Diary row colour ──────────────────────────────────────────────────────────

function getDiaryRowColour(issues: boolean, actionTaken: string | null): 'red' | 'amber' | 'green' {
  if (!issues) return 'green'
  if (actionTaken?.trim()) return 'amber' // issue flagged but action recorded
  return 'red'                             // issue flagged, no action recorded
}

describe('Diary row colour', () => {
  it('no issues → green', () => {
    expect(getDiaryRowColour(false, null)).toBe('green')
  })

  it('issues + action taken → amber', () => {
    expect(getDiaryRowColour(true, 'Told off staff')).toBe('amber')
  })

  it('issues + no action → red', () => {
    expect(getDiaryRowColour(true, null)).toBe('red')
  })

  it('issues + empty action string → red', () => {
    expect(getDiaryRowColour(true, '')).toBe('red')
  })

  it('issues + whitespace only action → red', () => {
    expect(getDiaryRowColour(true, '   ')).toBe('red')
  })
})

// ── Diary summary ─────────────────────────────────────────────────────────────

interface DiaryRow {
  phase: string
  issues: boolean
}

function summariseDiary(rows: DiaryRow[]) {
  return {
    total:       rows.length,
    with_issues: rows.filter((r) => r.issues).length,
    opening:     rows.filter((r) => r.phase === 'opening').length,
    operational: rows.filter((r) => r.phase === 'operational').length,
    closing:     rows.filter((r) => r.phase === 'closing').length,
  }
}

describe('Diary summary', () => {
  const rows: DiaryRow[] = [
    { phase: 'opening',     issues: true  },
    { phase: 'operational', issues: false },
    { phase: 'closing',     issues: false },
    { phase: 'opening',     issues: false },
    { phase: 'operational', issues: false },
    { phase: 'closing',     issues: false },
  ]

  it('total = 6', ()       => expect(summariseDiary(rows).total).toBe(6))
  it('with_issues = 1', () => expect(summariseDiary(rows).with_issues).toBe(1))
  it('opening = 2', ()     => expect(summariseDiary(rows).opening).toBe(2))
  it('operational = 2', () => expect(summariseDiary(rows).operational).toBe(2))
  it('closing = 2', ()     => expect(summariseDiary(rows).closing).toBe(2))
  it('opening + operational + closing = total', () => {
    const s = summariseDiary(rows)
    expect(s.opening + s.operational + s.closing).toBe(s.total)
  })
})

// ── Phase labels ──────────────────────────────────────────────────────────────

function phaseLabel(phase: string): string {
  if (phase === 'opening')     return 'Opening'
  if (phase === 'operational') return 'Operational'
  if (phase === 'closing')     return 'Closing'
  return phase
}

describe('Phase labels', () => {
  it('opening → Opening', ()     => expect(phaseLabel('opening')).toBe('Opening'))
  it('operational → Operational', () => expect(phaseLabel('operational')).toBe('Operational'))
  it('closing → Closing', ()     => expect(phaseLabel('closing')).toBe('Closing'))
})

// ── CSV headers ───────────────────────────────────────────────────────────────

const TEMP_CSV_HEADERS = [
  'Date', 'Session', 'Product Temp °C', 'Room Temp °C',
  'Product Pass', 'Room Pass', 'Overall',
  'CA logged', 'CA resolved', 'CA deviation', 'CA action taken', 'CA disposition',
  'Submitted by',
]

const DIARY_CSV_HEADERS = [
  'Date', 'Phase', 'Checks Passed', 'Total Checks', 'Issues', 'Action Taken', 'Submitted by',
]

describe('Process Room CSV headers', () => {
  it('temperature CSV has 13 columns', () => {
    expect(TEMP_CSV_HEADERS).toHaveLength(13)
  })

  it('diary CSV has 7 columns', () => {
    expect(DIARY_CSV_HEADERS).toHaveLength(7)
  })

  it('temperature headers include key audit fields', () => {
    expect(TEMP_CSV_HEADERS).toContain('Product Temp °C')
    expect(TEMP_CSV_HEADERS).toContain('Room Temp °C')
    expect(TEMP_CSV_HEADERS).toContain('Product Pass')
    expect(TEMP_CSV_HEADERS).toContain('Room Pass')
    expect(TEMP_CSV_HEADERS).toContain('CA logged')
  })

  it('diary headers include key audit fields', () => {
    expect(DIARY_CSV_HEADERS).toContain('Phase')
    expect(DIARY_CSV_HEADERS).toContain('Checks Passed')
    expect(DIARY_CSV_HEADERS).toContain('Issues')
    expect(DIARY_CSV_HEADERS).toContain('Action Taken')
  })
})
