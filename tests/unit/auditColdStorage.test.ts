/**
 * tests/unit/auditColdStorage.test.ts
 *
 * Tests for the audit page — Cold Storage section (CCP 2).
 *
 * Key differences from deliveries:
 * - temp_status values: 'pass' | 'amber' | 'critical'  (NOT pass/urgent/fail)
 * - Multiple units per session (Lamb Fridge, Dispatch Fridge, Dairy Fridge, Freezer)
 * - Heatmap has TWO rows: cold_am + cold_pm
 * - Gaps are RED (expected daily Mon–Fri) unlike deliveries (variable → grey)
 */

import { describe, it, expect } from 'vitest'

// ── Cold storage temp status ───────────────────────────────────────────────────
// Different from deliveries: uses 'pass' | 'amber' | 'critical'

type ColdTempStatus = 'pass' | 'amber' | 'critical'
type CA = { resolved: boolean } | null

function getColdRowColour(tempStatus: ColdTempStatus, ca: CA): 'red' | 'amber' | 'green' {
  if (tempStatus === 'critical')   return 'red'
  if (ca && !ca.resolved)          return 'red'
  if (tempStatus === 'amber')      return 'amber'
  return 'green'
}

function getColdTempStatusLabel(status: string): string {
  if (status === 'pass')     return 'Pass'
  if (status === 'amber')    return 'Amber'
  if (status === 'critical') return 'Critical'
  return status
}

function getColdTempStatusColour(status: string): string {
  if (status === 'pass')     return 'green'
  if (status === 'amber')    return 'amber'
  if (status === 'critical') return 'red'
  return 'grey'
}

describe('Cold Storage temp status values', () => {
  it('uses pass/amber/critical (NOT pass/urgent/fail like deliveries)', () => {
    const validStatuses = ['pass', 'amber', 'critical']
    expect(validStatuses).toContain('pass')
    expect(validStatuses).toContain('amber')
    expect(validStatuses).toContain('critical')
    expect(validStatuses).not.toContain('urgent')
    expect(validStatuses).not.toContain('fail')
  })

  it('pass → green', () => {
    expect(getColdTempStatusColour('pass')).toBe('green')
    expect(getColdTempStatusLabel('pass')).toBe('Pass')
  })

  it('amber → amber', () => {
    expect(getColdTempStatusColour('amber')).toBe('amber')
    expect(getColdTempStatusLabel('amber')).toBe('Amber')
  })

  it('critical → red', () => {
    expect(getColdTempStatusColour('critical')).toBe('red')
    expect(getColdTempStatusLabel('critical')).toBe('Critical')
  })
})

describe('Cold Storage row colour', () => {
  it('critical → red', () => {
    expect(getColdRowColour('critical', null)).toBe('red')
  })

  it('amber → amber', () => {
    expect(getColdRowColour('amber', null)).toBe('amber')
  })

  it('pass → green', () => {
    expect(getColdRowColour('pass', null)).toBe('green')
  })

  it('pass + unresolved CA → red', () => {
    expect(getColdRowColour('pass', { resolved: false })).toBe('red')
  })

  it('amber + unresolved CA → red (CA overrides)', () => {
    expect(getColdRowColour('amber', { resolved: false })).toBe('red')
  })

  it('critical + resolved CA → still red (temp status wins)', () => {
    expect(getColdRowColour('critical', { resolved: true })).toBe('red')
  })

  it('pass + resolved CA → green', () => {
    expect(getColdRowColour('pass', { resolved: true })).toBe('green')
  })
})

// ── Unit type labels ──────────────────────────────────────────────────────────

function unitTypeLabel(type: string): string {
  if (type === 'chiller') return 'Chiller'
  if (type === 'freezer') return 'Freezer'
  if (type === 'room')    return 'Room'
  return type
}

describe('Unit type labels', () => {
  it('chiller → Chiller', () => { expect(unitTypeLabel('chiller')).toBe('Chiller') })
  it('freezer → Freezer', () => { expect(unitTypeLabel('freezer')).toBe('Freezer') })
  it('room → Room',       () => { expect(unitTypeLabel('room')).toBe('Room') })
})

// ── Heatmap — two rows (AM + PM) ──────────────────────────────────────────────

type HeatCellState = 'green' | 'amber' | 'red' | 'grey' | 'none'

function coldHeatCell(
  hasRecords: boolean,
  hasDeviations: boolean,
  isWeekend: boolean,
): HeatCellState {
  if (isWeekend)    return 'grey'
  if (!hasRecords)  return 'red'    // gap — cold storage is expected daily
  if (hasDeviations) return 'amber'
  return 'green'
}

describe('Cold Storage heatmap — gaps are RED (expected daily)', () => {
  it('weekend → grey regardless', () => {
    expect(coldHeatCell(false, false, true)).toBe('grey')
    expect(coldHeatCell(true,  true,  true)).toBe('grey')
  })

  it('no records on weekday → RED (gap — expected daily, unlike deliveries)', () => {
    expect(coldHeatCell(false, false, false)).toBe('red')
  })

  it('records with deviation → amber', () => {
    expect(coldHeatCell(true, true, false)).toBe('amber')
  })

  it('records, all pass → green', () => {
    expect(coldHeatCell(true, false, false)).toBe('green')
  })
})

describe('Cold Storage heatmap — two separate rows', () => {
  // Each day can have both AM and PM readings
  // Both rows must be tracked independently

  const dayData = {
    cold_am: {
      '2026-04-23': { has_records: true,  has_deviations: false },
      '2026-04-22': { has_records: false, has_deviations: false },
    },
    cold_pm: {
      '2026-04-23': { has_records: true,  has_deviations: true  },
      '2026-04-22': { has_records: true,  has_deviations: false },
    },
  }

  it('AM and PM are tracked independently', () => {
    expect(dayData.cold_am['2026-04-23'].has_records).toBe(true)
    expect(dayData.cold_pm['2026-04-23'].has_records).toBe(true)
  })

  it('AM can be missing while PM has records', () => {
    expect(dayData.cold_am['2026-04-22'].has_records).toBe(false)
    expect(dayData.cold_pm['2026-04-22'].has_records).toBe(true)
  })

  it('AM missing on weekday → red gap', () => {
    const { has_records, has_deviations } = dayData.cold_am['2026-04-22']
    expect(coldHeatCell(has_records, has_deviations, false)).toBe('red')
  })

  it('PM with deviation → amber', () => {
    const { has_records, has_deviations } = dayData.cold_pm['2026-04-23']
    expect(coldHeatCell(has_records, has_deviations, false)).toBe('amber')
  })
})

// ── Heatmap callback pattern ───────────────────────────────────────────────────
// All sections use the same generic callback: updates merged into parent state

describe('Generic heatmap callback pattern', () => {
  // Simulates the parent setHeatmapData merge
  function mergeHeatmapUpdates(
    prev: Record<string, Record<string, { has_records: boolean; has_deviations: boolean }>>,
    updates: Record<string, Record<string, { has_records: boolean; has_deviations: boolean }>>
  ) {
    return { ...prev, ...updates }
  }

  it('deliveries update only affects deliveries key', () => {
    const prev = { cold_am: { '2026-04-22': { has_records: true, has_deviations: false } } }
    const update = { deliveries: { '2026-04-23': { has_records: true, has_deviations: false } } }
    const result = mergeHeatmapUpdates(prev, update)
    expect(result.cold_am).toBeDefined()
    expect(result.deliveries).toBeDefined()
  })

  it('cold storage updates both cold_am and cold_pm', () => {
    const prev = { deliveries: {} }
    const update = {
      cold_am: { '2026-04-23': { has_records: true, has_deviations: false } },
      cold_pm: { '2026-04-23': { has_records: true, has_deviations: true } },
    }
    const result = mergeHeatmapUpdates(prev, update)
    expect(result.cold_am).toBeDefined()
    expect(result.cold_pm).toBeDefined()
    expect(result.deliveries).toBeDefined() // not overwritten
  })

  it('updates do not overwrite other section keys', () => {
    const prev = {
      deliveries: { '2026-04-22': { has_records: true, has_deviations: false } },
      cold_am:    { '2026-04-22': { has_records: true, has_deviations: false } },
    }
    const update = {
      cold_pm: { '2026-04-23': { has_records: false, has_deviations: false } },
    }
    const result = mergeHeatmapUpdates(prev, update)
    expect(result.deliveries).toBeDefined()
    expect(result.cold_am).toBeDefined()
    expect(result.cold_pm).toBeDefined()
  })
})

// ── Summary counts ────────────────────────────────────────────────────────────

interface ColdRow {
  temp_status: ColdTempStatus
  ca: CA
}

function summariseCold(rows: ColdRow[], weekdayCount: number) {
  const amDates  = new Set<string>()
  const pmDates  = new Set<string>()
  return {
    total:      rows.length,
    pass:       rows.filter((r) => r.temp_status === 'pass').length,
    amber:      rows.filter((r) => r.temp_status === 'amber').length,
    critical:   rows.filter((r) => r.temp_status === 'critical').length,
    ca_count:   rows.filter((r) => r.ca !== null).length,
    unresolved: rows.filter((r) => r.ca !== null && !r.ca.resolved).length,
  }
}

describe('Cold Storage summary counts', () => {
  const rows: ColdRow[] = [
    { temp_status: 'pass',     ca: null },
    { temp_status: 'pass',     ca: null },
    { temp_status: 'amber',    ca: null },
    { temp_status: 'critical', ca: { resolved: false } },
    { temp_status: 'pass',     ca: { resolved: true  } },
  ]

  it('total = 5', ()     => expect(summariseCold(rows, 10).total).toBe(5))
  it('pass = 3', ()      => expect(summariseCold(rows, 10).pass).toBe(3))
  it('amber = 1', ()     => expect(summariseCold(rows, 10).amber).toBe(1))
  it('critical = 1', ()  => expect(summariseCold(rows, 10).critical).toBe(1))
  it('ca_count = 2', ()  => expect(summariseCold(rows, 10).ca_count).toBe(2))
  it('unresolved = 1', ()=> expect(summariseCold(rows, 10).unresolved).toBe(1))

  it('pass + amber + critical = total', () => {
    const s = summariseCold(rows, 10)
    expect(s.pass + s.amber + s.critical).toBe(s.total)
  })
})

// ── CSV headers ───────────────────────────────────────────────────────────────

const COLD_CSV_HEADERS = [
  'Date', 'Session', 'Unit', 'Unit Type', 'Target Temp °C', 'Max Temp °C',
  'Temp °C', 'Status', 'Comments', 'Submitted by',
  'CA logged', 'CA resolved', 'CA deviation', 'CA action taken', 'CA disposition',
]

describe('Cold Storage CSV headers', () => {
  it('has 15 columns', () => {
    expect(COLD_CSV_HEADERS).toHaveLength(15)
  })

  it('includes key audit fields', () => {
    expect(COLD_CSV_HEADERS).toContain('Date')
    expect(COLD_CSV_HEADERS).toContain('Session')
    expect(COLD_CSV_HEADERS).toContain('Unit')
    expect(COLD_CSV_HEADERS).toContain('Temp °C')
    expect(COLD_CSV_HEADERS).toContain('Status')
    expect(COLD_CSV_HEADERS).toContain('CA logged')
    expect(COLD_CSV_HEADERS).toContain('CA resolved')
    expect(COLD_CSV_HEADERS).toContain('Target Temp °C')
    expect(COLD_CSV_HEADERS).toContain('Max Temp °C')
  })
})
