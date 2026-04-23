/**
 * tests/unit/auditCleaning.test.ts
 *
 * Tests for the audit page — Cleaning section (SOP 2).
 *
 * Key fields:
 * - issues boolean (like diary — not a temp status)
 * - sanitiser_temp_c numeric nullable (≥82°C required)
 * - what_was_cleaned: long comma-separated string
 * - verified_by: text (no UUID issue)
 */

import { describe, it, expect } from 'vitest'

// ── Row colour logic ──────────────────────────────────────────────────────────

type CA = { resolved: boolean } | null

function getCleaningRowColour(
  issues: boolean,
  actionTaken: string | null,
  ca: CA,
): 'red' | 'amber' | 'green' {
  if (ca && !ca.resolved)           return 'red'   // unresolved CA overrides
  if (issues && !actionTaken?.trim()) return 'red'  // issue, no action
  if (issues)                        return 'amber' // issue, action taken
  return 'green'
}

describe('Cleaning row colour', () => {
  it('no issues → green', () => {
    expect(getCleaningRowColour(false, null, null)).toBe('green')
  })

  it('issues + action taken → amber', () => {
    expect(getCleaningRowColour(true, 'Re-cleaned and verified', null)).toBe('amber')
  })

  it('issues + no action → red', () => {
    expect(getCleaningRowColour(true, null, null)).toBe('red')
  })

  it('issues + empty action string → red', () => {
    expect(getCleaningRowColour(true, '', null)).toBe('red')
  })

  it('issues + whitespace-only action → red', () => {
    expect(getCleaningRowColour(true, '   ', null)).toBe('red')
  })

  it('no issues + unresolved CA → red', () => {
    expect(getCleaningRowColour(false, null, { resolved: false })).toBe('red')
  })

  it('issues + action + unresolved CA → red (CA overrides)', () => {
    expect(getCleaningRowColour(true, 'Fixed it', { resolved: false })).toBe('red')
  })

  it('no issues + resolved CA → green', () => {
    expect(getCleaningRowColour(false, null, { resolved: true })).toBe('green')
  })
})

// ── Sanitiser temperature ─────────────────────────────────────────────────────

const SANITISER_LIMIT = 82 // ≥82°C required (SOP 2, instrument standard)

function getSanitiserStatus(tempC: number | null): 'pass' | 'fail' | 'none' {
  if (tempC === null || tempC === undefined) return 'none'
  return tempC >= SANITISER_LIMIT ? 'pass' : 'fail'
}

function getSanitiserLabel(tempC: number | null): string {
  if (tempC === null || tempC === undefined) return '—'
  const status = getSanitiserStatus(tempC)
  if (status === 'pass') return `${tempC}°C ✓`
  return `${tempC}°C ✗ (limit ≥82°C)`
}

describe('Sanitiser temperature', () => {
  it('null → none / "—"', () => {
    expect(getSanitiserStatus(null)).toBe('none')
    expect(getSanitiserLabel(null)).toBe('—')
  })

  it('exactly 82°C → pass (boundary)', () => {
    expect(getSanitiserStatus(82)).toBe('pass')
    expect(getSanitiserLabel(82)).toBe('82°C ✓')
  })

  it('above 82°C → pass', () => {
    expect(getSanitiserStatus(90)).toBe('pass')
    expect(getSanitiserLabel(90)).toBe('90°C ✓')
  })

  it('below 82°C → fail', () => {
    expect(getSanitiserStatus(79)).toBe('fail')
    expect(getSanitiserLabel(79)).toBe('79°C ✗ (limit ≥82°C)')
  })

  it('0°C → fail', () => {
    expect(getSanitiserStatus(0)).toBe('fail')
  })

  it('81.9°C → fail (below limit)', () => {
    expect(getSanitiserStatus(81.9)).toBe('fail')
  })

  it('limit is 82°C (FSA SOP 2 standard)', () => {
    expect(SANITISER_LIMIT).toBe(82)
  })
})

// ── What was cleaned — display ────────────────────────────────────────────────

function formatCleanedItems(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

function truncateCleanedItems(raw: string, maxItems = 3): string {
  const items = formatCleanedItems(raw)
  if (items.length <= maxItems) return items.join(', ')
  return `${items.slice(0, maxItems).join(', ')} +${items.length - maxItems} more`
}

describe('What was cleaned display', () => {
  it('splits comma-separated items', () => {
    const result = formatCleanedItems('Knives, Cutting boards, Work surfaces')
    expect(result).toEqual(['Knives', 'Cutting boards', 'Work surfaces'])
  })

  it('handles whitespace around commas', () => {
    const result = formatCleanedItems('Knives ,  Cutting boards , Band saw')
    expect(result).toEqual(['Knives', 'Cutting boards', 'Band saw'])
  })

  it('truncates long list with count', () => {
    const raw = 'Knives, Cutting boards, Work surfaces / prep tables, Mincing equipment, Band saw'
    const result = truncateCleanedItems(raw, 3)
    expect(result).toBe('Knives, Cutting boards, Work surfaces / prep tables +2 more')
  })

  it('does not truncate short list', () => {
    const raw = 'Knives, Cutting boards'
    const result = truncateCleanedItems(raw, 3)
    expect(result).toBe('Knives, Cutting boards')
  })

  it('exactly at limit does not truncate', () => {
    const raw = 'Knives, Cutting boards, Band saw'
    const result = truncateCleanedItems(raw, 3)
    expect(result).toBe('Knives, Cutting boards, Band saw')
  })
})

// ── Summary counts ────────────────────────────────────────────────────────────

interface CleaningRow {
  issues: boolean
  what_did_you_do: string | null
  sanitiser_temp_c: number | null
  ca: CA
}

function summariseCleaning(rows: CleaningRow[]) {
  return {
    total:           rows.length,
    no_issues:       rows.filter((r) => !r.issues).length,
    with_issues:     rows.filter((r) => r.issues).length,
    sanitiser_fail:  rows.filter((r) => r.sanitiser_temp_c !== null && r.sanitiser_temp_c < 82).length,
    ca_count:        rows.filter((r) => r.ca !== null).length,
    unresolved:      rows.filter((r) => r.ca !== null && !r.ca.resolved).length,
  }
}

describe('Cleaning summary counts', () => {
  const rows: CleaningRow[] = [
    { issues: false, what_did_you_do: null,              sanitiser_temp_c: 90, ca: null },
    { issues: false, what_did_you_do: null,              sanitiser_temp_c: 82, ca: null },
    { issues: true,  what_did_you_do: 'Re-cleaned',      sanitiser_temp_c: 79, ca: { resolved: false } },
    { issues: true,  what_did_you_do: null,              sanitiser_temp_c: null, ca: null },
    { issues: false, what_did_you_do: null,              sanitiser_temp_c: null, ca: { resolved: true } },
  ]

  it('total = 5', ()          => expect(summariseCleaning(rows).total).toBe(5))
  it('no_issues = 3', ()      => expect(summariseCleaning(rows).no_issues).toBe(3))
  it('with_issues = 2', ()    => expect(summariseCleaning(rows).with_issues).toBe(2))
  it('sanitiser_fail = 1', () => expect(summariseCleaning(rows).sanitiser_fail).toBe(1))
  it('ca_count = 2', ()       => expect(summariseCleaning(rows).ca_count).toBe(2))
  it('unresolved = 1', ()     => expect(summariseCleaning(rows).unresolved).toBe(1))

  it('no_issues + with_issues = total', () => {
    const s = summariseCleaning(rows)
    expect(s.no_issues + s.with_issues).toBe(s.total)
  })

  it('null sanitiser_temp_c is not counted as fail', () => {
    const rows2: CleaningRow[] = [
      { issues: false, what_did_you_do: null, sanitiser_temp_c: null, ca: null },
    ]
    expect(summariseCleaning(rows2).sanitiser_fail).toBe(0)
  })
})

// ── Heatmap cell ──────────────────────────────────────────────────────────────

type HeatCell = 'green' | 'amber' | 'red' | 'grey'

function cleaningHeatCell(
  hasRecords: boolean,
  hasDeviations: boolean,
  isWeekend: boolean,
): HeatCell {
  if (isWeekend)     return 'grey'
  if (!hasRecords)   return 'red'    // expected daily — gap is red
  if (hasDeviations) return 'amber'
  return 'green'
}

describe('Cleaning heatmap cell', () => {
  it('weekend → grey', () => {
    expect(cleaningHeatCell(false, false, true)).toBe('grey')
  })

  it('no records on weekday → red (expected daily)', () => {
    expect(cleaningHeatCell(false, false, false)).toBe('red')
  })

  it('records with deviation → amber', () => {
    expect(cleaningHeatCell(true, true, false)).toBe('amber')
  })

  it('records, no issues → green', () => {
    expect(cleaningHeatCell(true, false, false)).toBe('green')
  })
})

// ── CSV headers ───────────────────────────────────────────────────────────────

const CLEANING_CSV_HEADERS = [
  'Date', 'Time', 'What was cleaned', 'Sanitiser °C', 'Sanitiser pass',
  'Issues', 'Action taken', 'Verified by',
  'CA logged', 'CA resolved', 'CA deviation', 'CA action taken',
]

describe('Cleaning CSV headers', () => {
  it('has 12 columns', () => {
    expect(CLEANING_CSV_HEADERS).toHaveLength(12)
  })

  it('includes key audit fields', () => {
    expect(CLEANING_CSV_HEADERS).toContain('Sanitiser °C')
    expect(CLEANING_CSV_HEADERS).toContain('Sanitiser pass')
    expect(CLEANING_CSV_HEADERS).toContain('Issues')
    expect(CLEANING_CSV_HEADERS).toContain('Action taken')
    expect(CLEANING_CSV_HEADERS).toContain('Verified by')
    expect(CLEANING_CSV_HEADERS).toContain('CA logged')
  })
})
