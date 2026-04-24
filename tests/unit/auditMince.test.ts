/**
 * tests/unit/auditMince.test.ts
 *
 * Tests for the audit page — Mince & Prep section (CCP-M).
 *
 * Key fields:
 * - input_temp_pass / output_temp_pass: boolean (≤4°C limit)
 * - kill_date_within_limit: boolean (freshness check)
 * - corrective_action: inline text (not a linked CA record)
 * - source_batch_numbers: array
 * - output_mode: chilled / frozen / prep
 * - variable frequency section (gaps = grey not red)
 */

import { describe, it, expect } from 'vitest'

// ── Row colour logic ──────────────────────────────────────────────────────────

type CA = { resolved: boolean } | null

function getMinceRowColour(
  inputPass: boolean,
  outputPass: boolean,
  killLimitPass: boolean,
  ca: CA,
): 'red' | 'green' {
  if (!inputPass || !outputPass || !killLimitPass) return 'red'
  if (ca && !ca.resolved)                          return 'red'
  return 'green'
}

describe('Mince row colour', () => {
  it('all pass, no CA → green', () => {
    expect(getMinceRowColour(true, true, true, null)).toBe('green')
  })

  it('input fail → red', () => {
    expect(getMinceRowColour(false, true, true, null)).toBe('red')
  })

  it('output fail → red', () => {
    expect(getMinceRowColour(true, false, true, null)).toBe('red')
  })

  it('kill limit fail → red', () => {
    expect(getMinceRowColour(true, true, false, null)).toBe('red')
  })

  it('all fail → red', () => {
    expect(getMinceRowColour(false, false, false, null)).toBe('red')
  })

  it('all pass + unresolved CA → red', () => {
    expect(getMinceRowColour(true, true, true, { resolved: false })).toBe('red')
  })

  it('all pass + resolved CA → green', () => {
    expect(getMinceRowColour(true, true, true, { resolved: true })).toBe('green')
  })

  it('input fail + resolved CA → still red (temp fail stands)', () => {
    expect(getMinceRowColour(false, true, true, { resolved: true })).toBe('red')
  })
})

// ── Temp display ──────────────────────────────────────────────────────────────

function getTempDisplay(tempC: number, pass: boolean): string {
  return `${tempC}°C ${pass ? '✓' : '✗'}`
}

describe('Mince temp display', () => {
  it('4.0°C pass', () => {
    expect(getTempDisplay(4.0, true)).toBe('4°C ✓')
  })

  it('9.0°C fail (real data example)', () => {
    expect(getTempDisplay(9.0, false)).toBe('9°C ✗')
  })

  it('2.0°C pass output', () => {
    expect(getTempDisplay(2.0, true)).toBe('2°C ✓')
  })
})

// ── Output mode labels ────────────────────────────────────────────────────────

function getOutputModeLabel(mode: string): string {
  if (mode === 'chilled') return 'Chilled'
  if (mode === 'frozen')  return 'Frozen'
  if (mode === 'prep')    return 'Prep'
  return mode
}

describe('Output mode labels', () => {
  it('chilled → Chilled', () => expect(getOutputModeLabel('chilled')).toBe('Chilled'))
  it('frozen → Frozen',   () => expect(getOutputModeLabel('frozen')).toBe('Frozen'))
  it('prep → Prep',       () => expect(getOutputModeLabel('prep')).toBe('Prep'))
})

// ── Source batch numbers ──────────────────────────────────────────────────────

function formatBatchNumbers(batches: string[] | null): string {
  if (!batches || batches.length === 0) return '—'
  return batches.join(', ')
}

describe('Source batch numbers', () => {
  it('null → —', () => {
    expect(formatBatchNumbers(null)).toBe('—')
  })

  it('empty array → —', () => {
    expect(formatBatchNumbers([])).toBe('—')
  })

  it('single batch', () => {
    expect(formatBatchNumbers(['2104-GB-3'])).toBe('2104-GB-3')
  })

  it('multiple batches joined with comma', () => {
    expect(formatBatchNumbers(['2104-GB-3', '2104-GB-5'])).toBe('2104-GB-3, 2104-GB-5')
  })
})

// ── Overall status label ──────────────────────────────────────────────────────

function getMinceOverallLabel(
  inputPass: boolean,
  outputPass: boolean,
  killLimitPass: boolean,
): string {
  if (inputPass && outputPass && killLimitPass) return 'Pass'
  const fails: string[] = []
  if (!inputPass)     fails.push('Input temp')
  if (!outputPass)    fails.push('Output temp')
  if (!killLimitPass) fails.push('Kill limit')
  return `Fail (${fails.join(', ')})`
}

describe('Mince overall status label', () => {
  it('all pass → Pass', () => {
    expect(getMinceOverallLabel(true, true, true)).toBe('Pass')
  })

  it('input fail only', () => {
    expect(getMinceOverallLabel(false, true, true)).toBe('Fail (Input temp)')
  })

  it('output fail only', () => {
    expect(getMinceOverallLabel(true, false, true)).toBe('Fail (Output temp)')
  })

  it('kill limit fail only', () => {
    expect(getMinceOverallLabel(true, true, false)).toBe('Fail (Kill limit)')
  })

  it('multiple fails listed', () => {
    expect(getMinceOverallLabel(false, false, true)).toBe('Fail (Input temp, Output temp)')
  })
})

// ── Summary counts ────────────────────────────────────────────────────────────

interface MinceRow {
  input_temp_pass:      boolean
  output_temp_pass:     boolean
  kill_date_within_limit: boolean
  corrective_action:    string | null
  ca:                   CA
}

function summariseMince(rows: MinceRow[]) {
  return {
    total:       rows.length,
    all_pass:    rows.filter(r => r.input_temp_pass && r.output_temp_pass && r.kill_date_within_limit).length,
    temp_fails:  rows.filter(r => !r.input_temp_pass || !r.output_temp_pass).length,
    kill_fails:  rows.filter(r => !r.kill_date_within_limit).length,
    with_ca_note:rows.filter(r => !!r.corrective_action?.trim()).length,
    linked_cas:  rows.filter(r => r.ca !== null).length,
    unresolved:  rows.filter(r => r.ca !== null && !r.ca.resolved).length,
  }
}

describe('Mince summary counts', () => {
  const rows: MinceRow[] = [
    { input_temp_pass: true,  output_temp_pass: true,  kill_date_within_limit: true,  corrective_action: null,          ca: null },
    { input_temp_pass: false, output_temp_pass: true,  kill_date_within_limit: true,  corrective_action: 'Batch too large', ca: null },
    { input_temp_pass: true,  output_temp_pass: true,  kill_date_within_limit: false, corrective_action: null,          ca: { resolved: false } },
    { input_temp_pass: true,  output_temp_pass: true,  kill_date_within_limit: true,  corrective_action: null,          ca: { resolved: true  } },
  ]

  it('total = 4',         () => expect(summariseMince(rows).total).toBe(4))
  it('all_pass = 2',      () => expect(summariseMince(rows).all_pass).toBe(2))
  it('temp_fails = 1',    () => expect(summariseMince(rows).temp_fails).toBe(1))
  it('kill_fails = 1',    () => expect(summariseMince(rows).kill_fails).toBe(1))
  it('with_ca_note = 1',  () => expect(summariseMince(rows).with_ca_note).toBe(1))
  it('linked_cas = 2',    () => expect(summariseMince(rows).linked_cas).toBe(2))
  it('unresolved = 1',    () => expect(summariseMince(rows).unresolved).toBe(1))
})

// ── Heatmap — variable (grey not red for gaps) ────────────────────────────────

type HeatCell = 'green' | 'amber' | 'grey'

function minceHeatCell(hasRecords: boolean, hasDeviations: boolean, isWeekend: boolean): HeatCell {
  if (isWeekend)     return 'grey'
  if (!hasRecords)   return 'grey'   // variable — no run today is expected
  if (hasDeviations) return 'amber'
  return 'green'
}

describe('Mince heatmap — variable section (gaps are GREY)', () => {
  it('weekend → grey', () => expect(minceHeatCell(false, false, true)).toBe('grey'))
  it('no records on weekday → grey (not red — runs are variable)', () => expect(minceHeatCell(false, false, false)).toBe('grey'))
  it('runs logged, all pass → green', () => expect(minceHeatCell(true, false, false)).toBe('green'))
  it('runs logged with deviation → amber', () => expect(minceHeatCell(true, true, false)).toBe('amber'))
})

// ── CSV headers ───────────────────────────────────────────────────────────────

const MINCE_CSV_HEADERS = [
  'Date', 'Time', 'Species', 'Batch code', 'Mode',
  'Input temp °C', 'Input pass', 'Output temp °C', 'Output pass',
  'Kill date', 'Days from kill', 'Kill limit pass',
  'CA note', 'Source batches', 'Linked CA', 'CA resolved',
]

describe('Mince CSV headers', () => {
  it('has 16 columns', () => {
    expect(MINCE_CSV_HEADERS).toHaveLength(16)
  })

  it('includes key audit fields', () => {
    expect(MINCE_CSV_HEADERS).toContain('Input temp °C')
    expect(MINCE_CSV_HEADERS).toContain('Kill date')
    expect(MINCE_CSV_HEADERS).toContain('Days from kill')
    expect(MINCE_CSV_HEADERS).toContain('Kill limit pass')
    expect(MINCE_CSV_HEADERS).toContain('CA note')
    expect(MINCE_CSV_HEADERS).toContain('Source batches')
  })
})
