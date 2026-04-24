/**
 * tests/unit/auditCalibration.test.ts
 *
 * Tests for the audit page — Calibration section (SOP 3).
 *
 * Two calibration modes:
 * - manual: ice water test (0°C ±1°C) + boiling water test (100°C ±1°C)
 * - certified_probe: no test results, just cert_reference + purchase_date
 *
 * Heatmap: monthly section — green on days logged, grey otherwise.
 * Gaps are NOT red day-to-day (calibration is monthly, not daily).
 */

import { describe, it, expect } from 'vitest'

// ── Mode labels ───────────────────────────────────────────────────────────────

function getModeLabel(mode: string): string {
  if (mode === 'certified_probe') return 'Certified probe'
  return 'Manual test'
}

function getModeColour(mode: string): string {
  if (mode === 'certified_probe') return 'blue'
  return 'slate'
}

describe('Calibration mode labels', () => {
  it('manual → Manual test', () => {
    expect(getModeLabel('manual')).toBe('Manual test')
  })

  it('certified_probe → Certified probe', () => {
    expect(getModeLabel('certified_probe')).toBe('Certified probe')
  })

  it('certified_probe → blue colour', () => {
    expect(getModeColour('certified_probe')).toBe('blue')
  })

  it('manual → slate colour', () => {
    expect(getModeColour('manual')).toBe('slate')
  })
})

// ── Manual test pass/fail logic ───────────────────────────────────────────────

// Ice water: 0°C ±1°C → pass range: -1°C to +1°C
// Boiling water: 100°C ±1°C → pass range: 99°C to 101°C

function iceWaterPass(temp: number): boolean {
  return temp >= -1 && temp <= 1
}

function boilingWaterPass(temp: number): boolean {
  return temp >= 99 && temp <= 101
}

describe('Manual calibration pass/fail logic', () => {
  it('ice water 0°C → pass', () => {
    expect(iceWaterPass(0)).toBe(true)
  })

  it('ice water 1°C → pass (upper boundary)', () => {
    expect(iceWaterPass(1)).toBe(true)
  })

  it('ice water -1°C → pass (lower boundary)', () => {
    expect(iceWaterPass(-1)).toBe(true)
  })

  it('ice water 1.1°C → fail', () => {
    expect(iceWaterPass(1.1)).toBe(false)
  })

  it('ice water 2.5°C → fail (real data example)', () => {
    expect(iceWaterPass(2.5)).toBe(false)
  })

  it('boiling water 100°C → pass', () => {
    expect(boilingWaterPass(100)).toBe(true)
  })

  it('boiling water 99°C → pass (lower boundary)', () => {
    expect(boilingWaterPass(99)).toBe(true)
  })

  it('boiling water 101°C → pass (upper boundary)', () => {
    expect(boilingWaterPass(101)).toBe(true)
  })

  it('boiling water 98°C → fail', () => {
    expect(boilingWaterPass(98)).toBe(false)
  })

  it('boiling water 98.5°C → fail (DB stores as boolean but we verify logic)', () => {
    expect(boilingWaterPass(98.5)).toBe(false)
  })
})

// ── Row colour logic ──────────────────────────────────────────────────────────

type CA = { resolved: boolean } | null

function getCalibrationRowColour(
  mode: string,
  icePass: boolean | null,
  boilingPass: boolean | null,
  ca: CA,
): 'red' | 'green' {
  if (ca && !ca.resolved) return 'red'
  if (mode === 'certified_probe') return 'green' // cert = always compliant
  if (icePass === false || boilingPass === false) return 'red'
  return 'green'
}

describe('Calibration row colour', () => {
  it('manual, both pass → green', () => {
    expect(getCalibrationRowColour('manual', true, true, null)).toBe('green')
  })

  it('manual, ice fail → red', () => {
    expect(getCalibrationRowColour('manual', false, true, null)).toBe('red')
  })

  it('manual, boiling fail → red', () => {
    expect(getCalibrationRowColour('manual', true, false, null)).toBe('red')
  })

  it('manual, both fail → red', () => {
    expect(getCalibrationRowColour('manual', false, false, null)).toBe('red')
  })

  it('certified_probe → green regardless (cert proves compliance)', () => {
    expect(getCalibrationRowColour('certified_probe', null, null, null)).toBe('green')
  })

  it('certified_probe + unresolved CA → red (CA overrides)', () => {
    expect(getCalibrationRowColour('certified_probe', null, null, { resolved: false })).toBe('red')
  })

  it('manual pass + unresolved CA → red', () => {
    expect(getCalibrationRowColour('manual', true, true, { resolved: false })).toBe('red')
  })

  it('manual fail + resolved CA → red (test still failed)', () => {
    expect(getCalibrationRowColour('manual', false, true, { resolved: true })).toBe('red')
  })
})

// ── Overall label ─────────────────────────────────────────────────────────────

function getCalibrationOverallLabel(
  mode: string,
  icePass: boolean | null,
  boilingPass: boolean | null,
): string {
  if (mode === 'certified_probe') return 'Certified ✓'
  if (icePass === null || boilingPass === null) return '—'
  return icePass && boilingPass ? 'Pass' : 'Fail'
}

describe('Calibration overall label', () => {
  it('certified_probe → Certified ✓', () => {
    expect(getCalibrationOverallLabel('certified_probe', null, null)).toBe('Certified ✓')
  })

  it('manual both pass → Pass', () => {
    expect(getCalibrationOverallLabel('manual', true, true)).toBe('Pass')
  })

  it('manual any fail → Fail', () => {
    expect(getCalibrationOverallLabel('manual', false, true)).toBe('Fail')
    expect(getCalibrationOverallLabel('manual', true, false)).toBe('Fail')
    expect(getCalibrationOverallLabel('manual', false, false)).toBe('Fail')
  })

  it('manual nulls → —', () => {
    expect(getCalibrationOverallLabel('manual', null, null)).toBe('—')
  })
})

// ── Summary counts ────────────────────────────────────────────────────────────

interface CalibRow {
  calibration_mode: string
  ice_water_pass: boolean | null
  boiling_water_pass: boolean | null
  ca: CA
}

function summariseCalibration(rows: CalibRow[]) {
  const manual    = rows.filter(r => r.calibration_mode === 'manual')
  const certified = rows.filter(r => r.calibration_mode === 'certified_probe')
  return {
    total:      rows.length,
    manual:     manual.length,
    certified:  certified.length,
    pass:       manual.filter(r => r.ice_water_pass && r.boiling_water_pass).length,
    fail:       manual.filter(r => r.ice_water_pass === false || r.boiling_water_pass === false).length,
    ca_count:   rows.filter(r => r.ca !== null).length,
    unresolved: rows.filter(r => r.ca !== null && !r.ca.resolved).length,
  }
}

describe('Calibration summary counts', () => {
  const rows: CalibRow[] = [
    { calibration_mode: 'manual',           ice_water_pass: true,  boiling_water_pass: true,  ca: null },
    { calibration_mode: 'manual',           ice_water_pass: false, boiling_water_pass: false, ca: { resolved: false } },
    { calibration_mode: 'certified_probe',  ice_water_pass: null,  boiling_water_pass: null,  ca: null },
    { calibration_mode: 'manual',           ice_water_pass: true,  boiling_water_pass: true,  ca: null },
  ]

  it('total = 4',      () => expect(summariseCalibration(rows).total).toBe(4))
  it('manual = 3',     () => expect(summariseCalibration(rows).manual).toBe(3))
  it('certified = 1',  () => expect(summariseCalibration(rows).certified).toBe(1))
  it('pass = 2',       () => expect(summariseCalibration(rows).pass).toBe(2))
  it('fail = 1',       () => expect(summariseCalibration(rows).fail).toBe(1))
  it('ca_count = 1',   () => expect(summariseCalibration(rows).ca_count).toBe(1))
  it('unresolved = 1', () => expect(summariseCalibration(rows).unresolved).toBe(1))
})

// ── Heatmap — monthly, NOT daily ──────────────────────────────────────────────

type HeatCell = 'green' | 'amber' | 'red' | 'grey'

function calibrationHeatCell(
  hasRecords: boolean,
  hasDeviations: boolean,
  isWeekend: boolean,
): HeatCell {
  if (isWeekend)    return 'grey'
  if (!hasRecords)  return 'grey'   // no record = grey (not red — calibration is monthly)
  if (hasDeviations) return 'amber'
  return 'green'
}

describe('Calibration heatmap — monthly section (gaps are GREY not red)', () => {
  it('weekend → grey', () => {
    expect(calibrationHeatCell(false, false, true)).toBe('grey')
  })

  it('no record on weekday → GREY (not red — calibration is monthly not daily)', () => {
    expect(calibrationHeatCell(false, false, false)).toBe('grey')
  })

  it('calibration logged, all pass → green', () => {
    expect(calibrationHeatCell(true, false, false)).toBe('green')
  })

  it('calibration logged, deviation → amber', () => {
    expect(calibrationHeatCell(true, true, false)).toBe('amber')
  })
})

// ── CSV headers ───────────────────────────────────────────────────────────────

const CALIBRATION_CSV_HEADERS = [
  'Date', 'Time', 'Probe ID', 'Mode',
  'Ice water °C', 'Ice pass', 'Boiling water °C', 'Boiling pass', 'Overall',
  'Cert reference', 'Purchase date',
  'Action taken', 'Verified by',
  'CA logged', 'CA resolved', 'CA deviation', 'CA action taken',
]

describe('Calibration CSV headers', () => {
  it('has 17 columns', () => {
    expect(CALIBRATION_CSV_HEADERS).toHaveLength(17)
  })

  it('includes mode-specific fields', () => {
    expect(CALIBRATION_CSV_HEADERS).toContain('Cert reference')
    expect(CALIBRATION_CSV_HEADERS).toContain('Purchase date')
    expect(CALIBRATION_CSV_HEADERS).toContain('Ice water °C')
    expect(CALIBRATION_CSV_HEADERS).toContain('Boiling water °C')
  })

  it('includes audit fields', () => {
    expect(CALIBRATION_CSV_HEADERS).toContain('Overall')
    expect(CALIBRATION_CSV_HEADERS).toContain('Verified by')
    expect(CALIBRATION_CSV_HEADERS).toContain('CA logged')
  })
})
