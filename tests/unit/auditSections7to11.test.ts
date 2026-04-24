/**
 * tests/unit/auditSections7to11.test.ts
 *
 * Tests for audit sections 7–11:
 * - Product Returns (SOP 12)
 * - Corrective Actions
 * - Reviews (Weekly + Monthly)
 * - Health & People (SOP 8)
 * - Training
 *
 * None of these have heatmap rows.
 */

import { describe, it, expect } from 'vitest'

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — PRODUCT RETURNS
// ═══════════════════════════════════════════════════════════════════════════════

const RETURN_CODES: Record<string, { label: string; safety: boolean }> = {
  RC01: { label: 'Temperature abuse',          safety: true  },
  RC02: { label: 'Quality / condition issue',  safety: true  },
  RC03: { label: 'Incorrect product / order',  safety: false },
  RC04: { label: 'Contamination suspected',    safety: true  },
  RC05: { label: 'Labelling / date issue',     safety: true  },
  RC06: { label: 'Quantity discrepancy',       safety: false },
  RC07: { label: 'Packaging damage',           safety: false },
  RC08: { label: 'Other',                      safety: false },
}

function getReturnCodeLabel(code: string): string {
  return RETURN_CODES[code]?.label ?? code
}

function isReturnSafetyCritical(code: string): boolean {
  return RETURN_CODES[code]?.safety ?? false
}

const DISPOSITION_LABELS: Record<string, string> = {
  disposed:       'Disposed',
  returned:       'Returned to supplier',
  downgraded:     'Downgraded',
  reprocessed:    'Reprocessed',
  other:          'Other',
}

function getDispositionLabel(d: string): string {
  return DISPOSITION_LABELS[d] ?? d
}

describe('Return codes', () => {
  it('RC01 is safety critical (temperature abuse)', () => {
    expect(isReturnSafetyCritical('RC01')).toBe(true)
    expect(getReturnCodeLabel('RC01')).toBe('Temperature abuse')
  })

  it('RC02 is safety critical (quality)', () => {
    expect(isReturnSafetyCritical('RC02')).toBe(true)
  })

  it('RC03 is NOT safety critical (incorrect product)', () => {
    expect(isReturnSafetyCritical('RC03')).toBe(false)
  })

  it('RC04 is safety critical (contamination)', () => {
    expect(isReturnSafetyCritical('RC04')).toBe(true)
  })

  it('RC05 is safety critical (labelling)', () => {
    expect(isReturnSafetyCritical('RC05')).toBe(true)
  })

  it('RC06 is NOT safety critical (quantity)', () => {
    expect(isReturnSafetyCritical('RC06')).toBe(false)
  })

  it('RC07 is NOT safety critical (packaging)', () => {
    expect(isReturnSafetyCritical('RC07')).toBe(false)
  })

  it('4 safety-critical codes total', () => {
    const safety = Object.entries(RETURN_CODES).filter(([, v]) => v.safety)
    expect(safety).toHaveLength(4)
  })

  it('unknown code falls back to code itself', () => {
    expect(getReturnCodeLabel('RC99')).toBe('RC99')
  })
})

describe('Disposition labels', () => {
  it('disposed → Disposed', () => expect(getDispositionLabel('disposed')).toBe('Disposed'))
  it('returned → Returned to supplier', () => expect(getDispositionLabel('returned')).toBe('Returned to supplier'))
  it('unknown falls back', () => expect(getDispositionLabel('xyz')).toBe('xyz'))
})

describe('Returns row colour', () => {
  function getReturnRowColour(code: string): 'red' | 'amber' | 'green' {
    if (isReturnSafetyCritical(code)) return 'red'
    return 'amber'
  }

  it('safety code RC01 → red', () => expect(getReturnRowColour('RC01')).toBe('red'))
  it('safety code RC04 → red', () => expect(getReturnRowColour('RC04')).toBe('red'))
  it('non-safety RC03 → amber', () => expect(getReturnRowColour('RC03')).toBe('amber'))
  it('non-safety RC06 → amber', () => expect(getReturnRowColour('RC06')).toBe('amber'))
})

describe('Returns CSV headers', () => {
  const RETURNS_CSV_HEADERS = [
    'Date', 'Time', 'Customer', 'Product', 'Return code', 'Code description',
    'Safety critical', 'Temp °C', 'Disposition', 'Batch number',
    'Corrective action', 'Verified by',
  ]
  it('has 12 columns', () => expect(RETURNS_CSV_HEADERS).toHaveLength(12))
  it('includes Safety critical column', () => expect(RETURNS_CSV_HEADERS).toContain('Safety critical'))
  it('includes Return code and description', () => {
    expect(RETURNS_CSV_HEADERS).toContain('Return code')
    expect(RETURNS_CSV_HEADERS).toContain('Code description')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — CORRECTIVE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const SOURCE_TABLE_LABELS: Record<string, string> = {
  haccp_deliveries:         'Deliveries',
  haccp_cold_storage_temps: 'Cold Storage',
  haccp_processing_temps:   'Process Room',
  haccp_daily_diary:        'Daily Diary',
  haccp_cleaning_log:       'Cleaning',
  haccp_calibration_log:    'Calibration',
  haccp_mince_log:          'Mince & Prep',
  haccp_returns:            'Product Returns',
  haccp_weekly_review:      'Weekly Review',
  haccp_monthly_review:     'Monthly Review',
}

function getSourceLabel(table: string): string {
  return SOURCE_TABLE_LABELS[table] ?? table
}

describe('CA source table labels', () => {
  it('maps all known tables', () => {
    expect(getSourceLabel('haccp_deliveries')).toBe('Deliveries')
    expect(getSourceLabel('haccp_cold_storage_temps')).toBe('Cold Storage')
    expect(getSourceLabel('haccp_processing_temps')).toBe('Process Room')
    expect(getSourceLabel('haccp_mince_log')).toBe('Mince & Prep')
  })

  it('unknown table falls back to table name', () => {
    expect(getSourceLabel('unknown_table')).toBe('unknown_table')
  })

  it('covers all 10 source tables', () => {
    expect(Object.keys(SOURCE_TABLE_LABELS)).toHaveLength(10)
  })
})

describe('CA row colour', () => {
  function getCARowColour(resolved: boolean, mgmtRequired: boolean): 'red' | 'amber' | 'green' {
    if (!resolved && mgmtRequired) return 'red'
    if (!resolved)                  return 'amber'
    return 'green'
  }

  it('unresolved + mgmt required → red', () => {
    expect(getCARowColour(false, true)).toBe('red')
  })

  it('unresolved + no mgmt → amber', () => {
    expect(getCARowColour(false, false)).toBe('amber')
  })

  it('resolved → green', () => {
    expect(getCARowColour(true, false)).toBe('green')
    expect(getCARowColour(true, true)).toBe('green')
  })
})

describe('CA summary counts', () => {
  interface CARow { resolved: boolean; management_verification_required: boolean }

  function summariseCAs(rows: CARow[]) {
    return {
      total:       rows.length,
      resolved:    rows.filter(r => r.resolved).length,
      unresolved:  rows.filter(r => !r.resolved).length,
      mgmt_req:    rows.filter(r => !r.resolved && r.management_verification_required).length,
    }
  }

  const rows: CARow[] = [
    { resolved: true,  management_verification_required: false },
    { resolved: false, management_verification_required: false },
    { resolved: false, management_verification_required: true  },
    { resolved: true,  management_verification_required: false },
  ]

  it('total = 4',      () => expect(summariseCAs(rows).total).toBe(4))
  it('resolved = 2',   () => expect(summariseCAs(rows).resolved).toBe(2))
  it('unresolved = 2', () => expect(summariseCAs(rows).unresolved).toBe(2))
  it('mgmt_req = 1',   () => expect(summariseCAs(rows).mgmt_req).toBe(1))
  it('resolved + unresolved = total', () => {
    const s = summariseCAs(rows)
    expect(s.resolved + s.unresolved).toBe(s.total)
  })
})

describe('CA CSV headers', () => {
  const CA_CSV_HEADERS = [
    'Date', 'CCP ref', 'Source section', 'Deviation', 'Action taken',
    'Product disposition', 'Recurrence prevention',
    'Mgmt verification required', 'Resolved', 'Verified at', 'Actioned by',
  ]
  it('has 11 columns', () => expect(CA_CSV_HEADERS).toHaveLength(11))
  it('includes key fields', () => {
    expect(CA_CSV_HEADERS).toContain('CCP ref')
    expect(CA_CSV_HEADERS).toContain('Source section')
    expect(CA_CSV_HEADERS).toContain('Mgmt verification required')
    expect(CA_CSV_HEADERS).toContain('Resolved')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Weekly review assessment parsing', () => {
  const assessments = [
    { id: 'ccp_complete', label: 'Daily CCP monitoring complete?', state: 'yes' },
    { id: 'training_current', label: 'Staff training current?', state: 'yes' },
    { id: 'emergency_items', label: 'Emergency items accessible?', state: 'problem' },
  ]

  function countAssessmentProblems(items: { state: string }[]): number {
    return items.filter(a => a.state === 'problem' || a.state === 'no').length
  }

  it('counts problem assessments', () => {
    expect(countAssessmentProblems(assessments)).toBe(1)
  })

  it('all pass = 0 problems', () => {
    const allPass = assessments.map(a => ({ ...a, state: 'yes' }))
    expect(countAssessmentProblems(allPass)).toBe(0)
  })
})

describe('Weekly review row colour', () => {
  function getWeeklyRowColour(problemCount: number): 'red' | 'amber' | 'green' {
    if (problemCount === 0) return 'green'
    if (problemCount <= 2)  return 'amber'
    return 'red'
  }

  it('0 problems → green', () => expect(getWeeklyRowColour(0)).toBe('green'))
  it('1-2 problems → amber', () => {
    expect(getWeeklyRowColour(1)).toBe('amber')
    expect(getWeeklyRowColour(2)).toBe('amber')
  })
  it('3+ problems → red', () => expect(getWeeklyRowColour(3)).toBe('red'))
})

describe('Monthly review check counting', () => {
  const equipmentChecks = {
    mixer_clean: false, steril_temp: true, burger_clean: false,
    chiller_temp: true, mincer_clean: false,
  }

  function countFailed(checks: Record<string, boolean>): number {
    return Object.values(checks).filter(v => !v).length
  }

  function countPassed(checks: Record<string, boolean>): number {
    return Object.values(checks).filter(Boolean).length
  }

  it('counts failed equipment checks', () => {
    expect(countFailed(equipmentChecks)).toBe(3)
  })

  it('counts passed equipment checks', () => {
    expect(countPassed(equipmentChecks)).toBe(2)
  })

  it('pass + fail = total', () => {
    const total = Object.keys(equipmentChecks).length
    expect(countPassed(equipmentChecks) + countFailed(equipmentChecks)).toBe(total)
  })
})

describe('Monthly HACCP system review parsing', () => {
  const systemReview = [
    { id: 'limits_valid', result: 'YES', invertFail: false },
    { id: 'plan_current', result: 'NO',  invertFail: false }, // fail
    { id: 'procedures_revise', result: 'NO', invertFail: true }, // pass (inverted)
  ]

  function isSystemReviewItemPass(item: { result: string; invertFail: boolean }): boolean {
    const isYes = item.result === 'YES'
    return item.invertFail ? !isYes : isYes
  }

  it('YES non-inverted → pass', () => {
    expect(isSystemReviewItemPass({ result: 'YES', invertFail: false })).toBe(true)
  })

  it('NO non-inverted → fail', () => {
    expect(isSystemReviewItemPass({ result: 'NO', invertFail: false })).toBe(false)
  })

  it('NO inverted → pass (e.g. "procedures require revision? NO = good")', () => {
    expect(isSystemReviewItemPass({ result: 'NO', invertFail: true })).toBe(true)
  })

  it('YES inverted → fail', () => {
    expect(isSystemReviewItemPass({ result: 'YES', invertFail: true })).toBe(false)
  })
})

describe('Reviews CSV headers', () => {
  const WEEKLY_CSV = ['Week ending','Problems found','Total assessments','Issues detail','Submitted by']
  const MONTHLY_CSV = ['Month','Equipment fails','Facilities fails','System review fails','Further notes','Submitted by']

  it('weekly CSV has 5 columns', () => expect(WEEKLY_CSV).toHaveLength(5))
  it('monthly CSV has 6 columns', () => expect(MONTHLY_CSV).toHaveLength(6))
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — HEALTH & PEOPLE
// ═══════════════════════════════════════════════════════════════════════════════

const RECORD_TYPE_LABELS: Record<string, string> = {
  new_staff_declaration: 'Health Declaration',
  return_to_work:        'Return to Work',
  visitor:               'Visitor Log',
}

function getRecordTypeLabel(type: string): string {
  return RECORD_TYPE_LABELS[type] ?? type
}

const ILLNESS_TYPE_LABELS: Record<string, string> = {
  gastrointestinal: 'Gastrointestinal',
  other_illness:    'Other illness',
  serious_illness:  'Serious illness',
}

function getIllnessTypeLabel(type: string | null): string {
  if (!type) return '—'
  return ILLNESS_TYPE_LABELS[type] ?? type
}

describe('Health record type labels', () => {
  it('new_staff_declaration → Health Declaration', () => {
    expect(getRecordTypeLabel('new_staff_declaration')).toBe('Health Declaration')
  })
  it('return_to_work → Return to Work', () => {
    expect(getRecordTypeLabel('return_to_work')).toBe('Return to Work')
  })
  it('visitor → Visitor Log', () => {
    expect(getRecordTypeLabel('visitor')).toBe('Visitor Log')
  })
})

describe('Illness type labels', () => {
  it('null → —', () => expect(getIllnessTypeLabel(null)).toBe('—'))
  it('gastrointestinal → Gastrointestinal', () => {
    expect(getIllnessTypeLabel('gastrointestinal')).toBe('Gastrointestinal')
  })
  it('other_illness → Other illness', () => {
    expect(getIllnessTypeLabel('other_illness')).toBe('Other illness')
  })
})

describe('Health record person name', () => {
  function getPersonName(staffName: string | null, visitorName: string | null): string {
    return staffName ?? visitorName ?? '—'
  }

  it('staff name takes priority', () => {
    expect(getPersonName('Daz', null)).toBe('Daz')
  })
  it('falls back to visitor name', () => {
    expect(getPersonName(null, 'John Smith')).toBe('John Smith')
  })
  it('both null → —', () => {
    expect(getPersonName(null, null)).toBe('—')
  })
})

describe('Health row colour', () => {
  function getHealthRowColour(fitForWork: boolean, recordType: string): 'red' | 'amber' | 'green' {
    if (!fitForWork) return 'red'
    if (recordType === 'new_staff_declaration') return 'amber' // declaration — always needs review
    return 'green'
  }

  it('not fit for work → red', () => {
    expect(getHealthRowColour(false, 'new_staff_declaration')).toBe('red')
    expect(getHealthRowColour(false, 'visitor')).toBe('red')
  })

  it('fit for work + declaration → amber (needs manager sign-off)', () => {
    expect(getHealthRowColour(true, 'new_staff_declaration')).toBe('amber')
  })

  it('fit for work + return to work → green', () => {
    expect(getHealthRowColour(true, 'return_to_work')).toBe('green')
  })

  it('visitor fit for work → green', () => {
    expect(getHealthRowColour(true, 'visitor')).toBe('green')
  })
})

describe('Health summary counts', () => {
  interface HealthRow { record_type: string; fit_for_work: boolean }

  function summariseHealth(rows: HealthRow[]) {
    return {
      total:         rows.length,
      declarations:  rows.filter(r => r.record_type === 'new_staff_declaration').length,
      return_to_work:rows.filter(r => r.record_type === 'return_to_work').length,
      visitors:      rows.filter(r => r.record_type === 'visitor').length,
      excluded:      rows.filter(r => !r.fit_for_work).length,
    }
  }

  const rows: HealthRow[] = [
    { record_type: 'new_staff_declaration', fit_for_work: true  },
    { record_type: 'return_to_work',        fit_for_work: true  },
    { record_type: 'visitor',               fit_for_work: true  },
    { record_type: 'visitor',               fit_for_work: false },
  ]

  it('total = 4',          () => expect(summariseHealth(rows).total).toBe(4))
  it('declarations = 1',   () => expect(summariseHealth(rows).declarations).toBe(1))
  it('return_to_work = 1', () => expect(summariseHealth(rows).return_to_work).toBe(1))
  it('visitors = 2',       () => expect(summariseHealth(rows).visitors).toBe(2))
  it('excluded = 1',       () => expect(summariseHealth(rows).excluded).toBe(1))
})

describe('Health CSV headers', () => {
  const HEALTH_CSV = ['Date','Type','Name','Company (visitor)','Fit for work','Exclusion reason','Illness type','Absence from','Absence to','Manager signed by']
  it('has 10 columns', () => expect(HEALTH_CSV).toHaveLength(10))
  it('includes exclusion reason', () => expect(HEALTH_CSV).toContain('Exclusion reason'))
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — TRAINING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Training refresh status', () => {
  function getRefreshStatus(refreshDate: string, today: string): 'overdue' | 'due_soon' | 'current' {
    const diff = (new Date(refreshDate).getTime() - new Date(today).getTime()) / 86400000
    if (diff < 0)   return 'overdue'
    if (diff <= 30) return 'due_soon'
    return 'current'
  }

  it('past date → overdue', () => {
    expect(getRefreshStatus('2026-03-01', '2026-04-24')).toBe('overdue')
  })

  it('within 30 days → due_soon', () => {
    expect(getRefreshStatus('2026-05-10', '2026-04-24')).toBe('due_soon')
  })

  it('more than 30 days → current', () => {
    expect(getRefreshStatus('2027-04-24', '2026-04-24')).toBe('current')
  })

  it('exactly today → due_soon', () => {
    expect(getRefreshStatus('2026-04-24', '2026-04-24')).toBe('due_soon')
  })
})

describe('Training type labels', () => {
  const TRAINING_TYPE_LABELS: Record<string, string> = {
    butchery_process_room: 'Butchery & Process Room',
    warehouse_operative:   'Warehouse Operative',
    allergen_awareness:    'Allergen Awareness',
  }

  it('butchery_process_room → Butchery & Process Room', () => {
    expect(TRAINING_TYPE_LABELS['butchery_process_room']).toBe('Butchery & Process Room')
  })
  it('allergen_awareness → Allergen Awareness', () => {
    expect(TRAINING_TYPE_LABELS['allergen_awareness']).toBe('Allergen Awareness')
  })
})

describe('Training row colour', () => {
  function getTrainingRowColour(status: 'overdue' | 'due_soon' | 'current'): 'red' | 'amber' | 'green' {
    if (status === 'overdue')  return 'red'
    if (status === 'due_soon') return 'amber'
    return 'green'
  }

  it('overdue → red',   () => expect(getTrainingRowColour('overdue')).toBe('red'))
  it('due_soon → amber',() => expect(getTrainingRowColour('due_soon')).toBe('amber'))
  it('current → green', () => expect(getTrainingRowColour('current')).toBe('green'))
})

describe('Training CSV headers', () => {
  const STAFF_CSV = ['Staff name','Job role','Training type','Document version','Completed','Refresh due','Status','Supervisor']
  const ALLERGEN_CSV = ['Staff name','Job role','Completed','Refresh due','Status','Supervisor','Allergens confirmed','Understanding confirmed']

  it('staff CSV has 8 columns', () => expect(STAFF_CSV).toHaveLength(8))
  it('allergen CSV has 8 columns', () => expect(ALLERGEN_CSV).toHaveLength(8))
  it('staff CSV includes document version', () => expect(STAFF_CSV).toContain('Document version'))
  it('allergen CSV includes confirmation counts', () => {
    expect(ALLERGEN_CSV).toContain('Allergens confirmed')
    expect(ALLERGEN_CSV).toContain('Understanding confirmed')
  })
})
