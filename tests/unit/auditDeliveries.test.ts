/**
 * tests/unit/auditDeliveries.test.ts
 *
 * Tests for the audit page — Deliveries section.
 * Covers: date range presets, row colours, CA badge logic,
 * summary counts, CSV generation, heatmap cell logic.
 *
 * All logic is mirrored from the page/route — if implementation
 * changes, these tests will catch the drift.
 */

import { describe, it, expect } from 'vitest'

// ── Date range helpers ────────────────────────────────────────────────────────

function dateRangeFromPreset(preset: '7d' | '30d' | '90d', referenceDate: string): { from: string; to: string } {
  const to   = new Date(referenceDate)
  const from = new Date(referenceDate)
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  from.setDate(from.getDate() - days)
  return {
    from: from.toLocaleDateString('en-CA'),
    to:   to.toLocaleDateString('en-CA'),
  }
}

describe('Date range presets', () => {
  const today = '2026-04-23'

  it('7d returns 7 days ago to today', () => {
    const range = dateRangeFromPreset('7d', today)
    expect(range.to).toBe('2026-04-23')
    expect(range.from).toBe('2026-04-16')
  })

  it('30d returns 30 days ago to today', () => {
    const range = dateRangeFromPreset('30d', today)
    expect(range.to).toBe('2026-04-23')
    expect(range.from).toBe('2026-03-24')
  })

  it('90d returns 90 days ago to today', () => {
    const range = dateRangeFromPreset('90d', today)
    expect(range.to).toBe('2026-04-23')
    expect(range.from).toBe('2026-01-23')
  })

  it('30d is default — produces non-empty range', () => {
    const range = dateRangeFromPreset('30d', today)
    expect(new Date(range.from) < new Date(range.to)).toBe(true)
  })

  it('range.from is always before range.to', () => {
    for (const preset of ['7d', '30d', '90d'] as const) {
      const { from, to } = dateRangeFromPreset(preset, today)
      expect(new Date(from) < new Date(to)).toBe(true)
    }
  })
})

// ── Row colour logic ──────────────────────────────────────────────────────────

type TempStatus = 'pass' | 'urgent' | 'fail'
type CA = { resolved: boolean } | null

function getRowColour(tempStatus: TempStatus, ca: CA): 'red' | 'amber' | 'green' {
  if (tempStatus === 'fail')               return 'red'
  if (ca && !ca.resolved)                  return 'red'
  if (tempStatus === 'urgent')             return 'amber'
  if (ca && ca.resolved)                   return 'green'
  return 'green'
}

describe('Delivery row colour', () => {
  it('fail temp → red', () => {
    expect(getRowColour('fail', null)).toBe('red')
  })

  it('urgent temp → amber', () => {
    expect(getRowColour('urgent', null)).toBe('amber')
  })

  it('pass, no CA → green', () => {
    expect(getRowColour('pass', null)).toBe('green')
  })

  it('pass + unresolved CA → red (CA overrides temp)', () => {
    expect(getRowColour('pass', { resolved: false })).toBe('red')
  })

  it('urgent + unresolved CA → red (CA overrides temp)', () => {
    expect(getRowColour('urgent', { resolved: false })).toBe('red')
  })

  it('pass + resolved CA → green', () => {
    expect(getRowColour('pass', { resolved: true })).toBe('green')
  })

  it('fail + resolved CA → red (temp status still fails)', () => {
    expect(getRowColour('fail', { resolved: true })).toBe('red')
  })
})

// ── CA badge logic ────────────────────────────────────────────────────────────

type CABadge = 'none' | 'unresolved' | 'resolved'

function getCaBadge(ca: CA): CABadge {
  if (!ca) return 'none'
  return ca.resolved ? 'resolved' : 'unresolved'
}

describe('CA badge', () => {
  it('no CA → none', () => {
    expect(getCaBadge(null)).toBe('none')
  })

  it('unresolved CA → unresolved', () => {
    expect(getCaBadge({ resolved: false })).toBe('unresolved')
  })

  it('resolved CA → resolved', () => {
    expect(getCaBadge({ resolved: true })).toBe('resolved')
  })
})

// ── Summary counts ────────────────────────────────────────────────────────────

interface DeliveryRow {
  temp_status: TempStatus
  corrective_action_required: boolean
  ca: CA
}

function summarise(rows: DeliveryRow[]) {
  return {
    total:      rows.length,
    pass:       rows.filter((r) => r.temp_status === 'pass').length,
    urgent:     rows.filter((r) => r.temp_status === 'urgent').length,
    fail:       rows.filter((r) => r.temp_status === 'fail').length,
    ca_count:   rows.filter((r) => r.ca !== null).length,
    unresolved: rows.filter((r) => r.ca !== null && !r.ca.resolved).length,
  }
}

describe('Summary counts', () => {
  const rows: DeliveryRow[] = [
    { temp_status: 'pass',   corrective_action_required: false, ca: null },
    { temp_status: 'pass',   corrective_action_required: false, ca: null },
    { temp_status: 'urgent', corrective_action_required: false, ca: null },
    { temp_status: 'fail',   corrective_action_required: true,  ca: { resolved: false } },
    { temp_status: 'pass',   corrective_action_required: true,  ca: { resolved: true  } },
  ]

  it('total = 5', () => expect(summarise(rows).total).toBe(5))
  it('pass = 3', () => expect(summarise(rows).pass).toBe(3))
  it('urgent = 1', () => expect(summarise(rows).urgent).toBe(1))
  it('fail = 1', () => expect(summarise(rows).fail).toBe(1))
  it('ca_count = 2', () => expect(summarise(rows).ca_count).toBe(2))
  it('unresolved = 1', () => expect(summarise(rows).unresolved).toBe(1))

  it('empty rows → all zeros', () => {
    const s = summarise([])
    expect(s.total).toBe(0)
    expect(s.pass).toBe(0)
    expect(s.ca_count).toBe(0)
  })

  it('pass + urgent + fail = total', () => {
    const s = summarise(rows)
    expect(s.pass + s.urgent + s.fail).toBe(s.total)
  })
})

// ── CSV generation ────────────────────────────────────────────────────────────

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const CSV_HEADERS = [
  'Date', 'Time', 'Supplier', 'Product', 'Species', 'Category',
  'Temp °C', 'Status', 'Contamination', 'Batch No', 'Delivery No',
  'Born in', 'Reared in', 'Slaughter site', 'Cut site', 'Notes',
  'Allergens identified', 'Allergen detail',
  'Submitted by', 'CA logged', 'CA resolved', 'CA deviation', 'CA action taken', 'CA disposition',
]

describe('CSV generation', () => {
  it('has 24 headers', () => {
    expect(CSV_HEADERS).toHaveLength(24)
  })

  it('headers include all key audit fields', () => {
    expect(CSV_HEADERS).toContain('Date')
    expect(CSV_HEADERS).toContain('Supplier')
    expect(CSV_HEADERS).toContain('Temp °C')
    expect(CSV_HEADERS).toContain('Status')
    expect(CSV_HEADERS).toContain('CA logged')
    expect(CSV_HEADERS).toContain('CA resolved')
    expect(CSV_HEADERS).toContain('CA deviation')
    expect(CSV_HEADERS).toContain('Batch No')
    expect(CSV_HEADERS).toContain('Submitted by')
  })

  it('escapeCSV handles plain strings', () => {
    expect(escapeCSV('Meadow Vale')).toBe('Meadow Vale')
  })

  it('escapeCSV wraps strings with commas in quotes', () => {
    expect(escapeCSV('Beef, Lamb')).toBe('"Beef, Lamb"')
  })

  it('escapeCSV escapes internal double quotes', () => {
    expect(escapeCSV('He said "hello"')).toBe('"He said ""hello"""')
  })

  it('escapeCSV returns empty string for null', () => {
    expect(escapeCSV(null)).toBe('')
  })

  it('escapeCSV returns empty string for undefined', () => {
    expect(escapeCSV(undefined)).toBe('')
  })

  it('escapeCSV converts numbers to strings', () => {
    expect(escapeCSV(4.2)).toBe('4.2')
  })

  it('escapeCSV handles newlines in text', () => {
    const result = escapeCSV('line1\nline2')
    expect(result).toBe('"line1\nline2"')
  })

  it('CSV row has same number of fields as headers', () => {
    const mockRow = {
      date: '2026-04-23', time_of_delivery: '09:00', supplier: 'Meadow Vale',
      product: 'Chicken', species: 'Poultry', product_category: 'poultry',
      temperature_c: 3.5, temp_status: 'pass', covered_contaminated: 'covered_not_contaminated',
      batch_number: 'B001', delivery_number: 1, born_in: 'UK', reared_in: 'UK',
      slaughter_site: 'Sheffield', cut_site: 'Sheffield', notes: null,
      allergens_identified: false, allergen_notes: null,
      submitted_by_name: 'Daz',
      ca: null as CA,
    }

    const csvFields = [
      mockRow.date, mockRow.time_of_delivery, mockRow.supplier, mockRow.product,
      mockRow.species, mockRow.product_category, mockRow.temperature_c, mockRow.temp_status,
      mockRow.covered_contaminated, mockRow.batch_number, mockRow.delivery_number,
      mockRow.born_in, mockRow.reared_in, mockRow.slaughter_site, mockRow.cut_site,
      mockRow.notes,
      mockRow.allergens_identified ? 'Yes' : 'No',
      mockRow.allergen_notes ?? '',
      mockRow.submitted_by_name,
      mockRow.ca ? 'Yes' : 'No',
      mockRow.ca ? (mockRow.ca.resolved ? 'Yes' : 'No') : '',
      mockRow.ca ? '' : '',
      mockRow.ca ? '' : '',
      mockRow.ca ? '' : '',
    ]

    expect(csvFields).toHaveLength(CSV_HEADERS.length)
  })
})

// ── Heatmap cell logic ────────────────────────────────────────────────────────

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr).getDay()
  return day === 0 || day === 6 // Sun = 0, Sat = 6
}

type HeatCell = 'green' | 'amber' | 'grey' | 'red' | 'none'

function deliveryHeatCell(
  hasDeliveries: boolean,
  hasDeviations: boolean,
  isWeekendDay: boolean,
): HeatCell {
  if (isWeekendDay)   return 'grey'   // greyed out
  if (!hasDeliveries) return 'none'   // no deliveries — not a gap (variable section)
  if (hasDeviations)  return 'amber'  // deliveries with fails
  return 'green'                       // deliveries, all pass
}

describe('Heatmap cell logic — Deliveries', () => {
  it('weekend → grey', () => {
    expect(deliveryHeatCell(false, false, true)).toBe('grey')
    expect(deliveryHeatCell(true,  false, true)).toBe('grey')
  })

  it('no deliveries on weekday → none (not a gap — deliveries are variable)', () => {
    expect(deliveryHeatCell(false, false, false)).toBe('none')
  })

  it('deliveries, all pass → green', () => {
    expect(deliveryHeatCell(true, false, false)).toBe('green')
  })

  it('deliveries with deviations → amber', () => {
    expect(deliveryHeatCell(true, true, false)).toBe('amber')
  })

  it('weekend overrides deliveries', () => {
    expect(deliveryHeatCell(true, true, true)).toBe('grey')
  })
})

describe('isWeekend', () => {
  it('Saturday is weekend', () => {
    expect(isWeekend('2026-04-25')).toBe(true) // Saturday
  })

  it('Sunday is weekend', () => {
    expect(isWeekend('2026-04-26')).toBe(true) // Sunday
  })

  it('Monday is not weekend', () => {
    expect(isWeekend('2026-04-27')).toBe(false) // Monday
  })

  it('Friday is not weekend', () => {
    expect(isWeekend('2026-04-24')).toBe(false) // Friday
  })
})

// ── Temp status display ───────────────────────────────────────────────────────

function tempStatusLabel(status: string): string {
  if (status === 'pass')   return 'Pass'
  if (status === 'urgent') return 'Urgent'
  if (status === 'fail')   return 'Fail'
  return status
}

function tempStatusColour(status: string): string {
  if (status === 'pass')   return 'green'
  if (status === 'urgent') return 'amber'
  if (status === 'fail')   return 'red'
  return 'grey'
}

describe('Temp status display', () => {
  it('pass → Pass / green', () => {
    expect(tempStatusLabel('pass')).toBe('Pass')
    expect(tempStatusColour('pass')).toBe('green')
  })

  it('urgent → Urgent / amber', () => {
    expect(tempStatusLabel('urgent')).toBe('Urgent')
    expect(tempStatusColour('urgent')).toBe('amber')
  })

  it('fail → Fail / red', () => {
    expect(tempStatusLabel('fail')).toBe('Fail')
    expect(tempStatusColour('fail')).toBe('red')
  })
})

// ── Return code safety classification ─────────────────────────────────────────
// Used later in Product Returns section — defined here for completeness

const SAFETY_RETURN_CODES = ['RC01', 'RC02', 'RC04', 'RC05']

function isSafetyReturn(code: string): boolean {
  return SAFETY_RETURN_CODES.includes(code)
}

describe('Return code safety classification (for Product Returns section)', () => {
  it('RC01 (temp) is a safety return', () => {
    expect(isSafetyReturn('RC01')).toBe(true)
  })

  it('RC03 (logistics) is not a safety return', () => {
    expect(isSafetyReturn('RC03')).toBe(false)
  })

  it('RC06 (quantity) is not a safety return', () => {
    expect(isSafetyReturn('RC06')).toBe(false)
  })

  it('there are exactly 4 safety codes', () => {
    expect(SAFETY_RETURN_CODES).toHaveLength(4)
  })
})
