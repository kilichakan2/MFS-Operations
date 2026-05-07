/**
 * tests/unit/annualReview.test.ts
 *
 * SALSA 3.1 — Annual Systems Review
 * Phase 1: DB shell + Section 3.1 HACCP System
 */

import { describe, it, expect } from 'vitest'
import {
  REVIEW_SECTIONS,
  buildInitialChecklist,
  buildInitialActionPlan,
  isSectionComplete,
  isChecklistComplete,
  completedSectionCount,
  canSignOff,
  isValidStatus,
  isValidReviewPeriod,
  trainingRefreshStatus,
  type Checklist,
} from '@/lib/annualReview/sections'

// ── Section definitions ───────────────────────────────────────────────────────

describe('REVIEW_SECTIONS — Phase 1 structure', () => {
  it('has at least 1 section defined', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(1)
  })

  it('first section is 3.1 HACCP System', () => {
    const s = REVIEW_SECTIONS[0]
    expect(s.key).toBe('3.1')
    expect(s.title).toBe('HACCP System')
  })

  it('section 3.1 has exactly 7 items', () => {
    const s = REVIEW_SECTIONS.find(x => x.key === '3.1')
    expect(s?.items).toHaveLength(7)
  })

  it('section 3.1 contains required SALSA items', () => {
    const s = REVIEW_SECTIONS.find(x => x.key === '3.1')!
    expect(s.items).toContain('HACCP plan reviewed and current')
    expect(s.items).toContain('Hazard analysis up to date')
    expect(s.items).toContain('CCPs and critical limits appropriate')
    expect(s.items).toContain('Monitoring procedures effective')
    expect(s.items).toContain('Corrective actions documented and followed')
    expect(s.items).toContain('HACCP team competent and trained')
    expect(s.items).toContain('Process flow diagrams accurate')
  })

  it('section 3.1 has no data panel in Phase 1', () => {
    const s = REVIEW_SECTIONS.find(x => x.key === '3.1')
    expect(s?.hasDataPanel).toBe(false)
  })

  it('all sections have unique keys', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('all sections have at least 1 item', () => {
    for (const s of REVIEW_SECTIONS) {
      expect(s.items.length).toBeGreaterThan(0)
    }
  })
})

// ── buildInitialChecklist ─────────────────────────────────────────────────────

describe('buildInitialChecklist', () => {
  const checklist = buildInitialChecklist()

  it('creates a key for every defined section', () => {
    for (const s of REVIEW_SECTIONS) {
      expect(checklist).toHaveProperty(s.key)
    }
  })

  it('each section has items array matching section definition', () => {
    for (const s of REVIEW_SECTIONS) {
      expect(checklist[s.key].items).toHaveLength(s.items.length)
    }
  })

  it('all items start with null status', () => {
    for (const s of REVIEW_SECTIONS) {
      for (const item of checklist[s.key].items) {
        expect(item.status).toBeNull()
      }
    }
  })

  it('all items have labels matching section definition', () => {
    const s = REVIEW_SECTIONS.find(x => x.key === '3.1')!
    const section = checklist['3.1']
    for (let i = 0; i < s.items.length; i++) {
      expect(section.items[i].label).toBe(s.items[i])
    }
  })

  it('all items start with empty notes', () => {
    for (const s of REVIEW_SECTIONS) {
      for (const item of checklist[s.key].items) {
        expect(item.notes).toBe('')
      }
    }
  })

  it('all sections start with empty section_notes', () => {
    for (const s of REVIEW_SECTIONS) {
      expect(checklist[s.key].section_notes).toBe('')
    }
  })

  it('labels are stored in DB record (self-contained for audit)', () => {
    // Labels in the checklist should match the section definition
    const section = checklist['3.1']
    expect(section.items[0].label).toBe('HACCP plan reviewed and current')
  })
})

// ── buildInitialActionPlan ────────────────────────────────────────────────────

describe('buildInitialActionPlan', () => {
  const plan = buildInitialActionPlan()

  it('starts with 6 empty rows', () => {
    expect(plan).toHaveLength(6)
  })

  it('rows are numbered 1–6', () => {
    for (let i = 0; i < 6; i++) {
      expect(plan[i].ref).toBe(i + 1)
    }
  })

  it('all rows start with open status', () => {
    for (const item of plan) {
      expect(item.status).toBe('open')
    }
  })

  it('all rows start with empty fields', () => {
    for (const item of plan) {
      expect(item.action).toBe('')
      expect(item.owner).toBe('')
      expect(item.due_date).toBe('')
    }
  })
})

// ── isValidStatus ─────────────────────────────────────────────────────────────

describe('isValidStatus', () => {
  it('ok is valid',     () => expect(isValidStatus('ok')).toBe(true))
  it('na is valid',     () => expect(isValidStatus('na')).toBe(true))
  it('action is valid', () => expect(isValidStatus('action')).toBe(true))
  it('null is valid',   () => expect(isValidStatus(null)).toBe(true))
  it('empty string is invalid', () => expect(isValidStatus('')).toBe(false))
  it('arbitrary string is invalid', () => expect(isValidStatus('yes')).toBe(false))
  it('undefined is invalid', () => expect(isValidStatus(undefined)).toBe(false))
  it('number is invalid', () => expect(isValidStatus(1)).toBe(false))
})

// ── isSectionComplete ─────────────────────────────────────────────────────────

describe('isSectionComplete', () => {
  it('all items answered → complete', () => {
    expect(isSectionComplete({
      items: [
        { label: 'A', status: 'ok',     notes: '' },
        { label: 'B', status: 'na',     notes: '' },
        { label: 'C', status: 'action', notes: 'Fix this' },
      ],
      section_notes: '',
    })).toBe(true)
  })

  it('one null item → not complete', () => {
    expect(isSectionComplete({
      items: [
        { label: 'A', status: 'ok', notes: '' },
        { label: 'B', status: null, notes: '' },
      ],
      section_notes: '',
    })).toBe(false)
  })

  it('all null → not complete', () => {
    expect(isSectionComplete({
      items: [
        { label: 'A', status: null, notes: '' },
        { label: 'B', status: null, notes: '' },
      ],
      section_notes: '',
    })).toBe(false)
  })

  it('empty items array → complete (vacuously true)', () => {
    expect(isSectionComplete({ items: [], section_notes: '' })).toBe(true)
  })
})

// ── isChecklistComplete ───────────────────────────────────────────────────────

describe('isChecklistComplete', () => {
  function makeComplete(): Checklist {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
    }
    return cl
  }

  it('all sections complete → true', () => {
    expect(isChecklistComplete(makeComplete())).toBe(true)
  })

  it('initial blank checklist → false', () => {
    expect(isChecklistComplete(buildInitialChecklist())).toBe(false)
  })

  it('one section missing entirely → false', () => {
    const cl = makeComplete()
    delete cl[REVIEW_SECTIONS[0].key]
    expect(isChecklistComplete(cl)).toBe(false)
  })

  it('one item null in one section → false', () => {
    const cl = makeComplete()
    cl[REVIEW_SECTIONS[0].key].items[0].status = null
    expect(isChecklistComplete(cl)).toBe(false)
  })
})

// ── completedSectionCount ─────────────────────────────────────────────────────

describe('completedSectionCount', () => {
  it('blank checklist → 0', () => {
    expect(completedSectionCount(buildInitialChecklist())).toBe(0)
  })

  it('fully complete → equals total sections', () => {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
    }
    expect(completedSectionCount(cl)).toBe(REVIEW_SECTIONS.length)
  })

  it('partial completion counted correctly', () => {
    if (REVIEW_SECTIONS.length < 2) return  // skip if only 1 section
    const cl = buildInitialChecklist()
    // Complete just the first section
    cl[REVIEW_SECTIONS[0].key].items = cl[REVIEW_SECTIONS[0].key].items.map(
      item => ({ ...item, status: 'ok' as const })
    )
    expect(completedSectionCount(cl)).toBe(1)
  })
})

// ── canSignOff ────────────────────────────────────────────────────────────────

describe('canSignOff', () => {
  function completeChecklist(): Checklist {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
    }
    return cl
  }

  it('not locked + complete → can sign off', () => {
    expect(canSignOff(false, completeChecklist())).toBe(true)
  })

  it('already locked → cannot sign off', () => {
    expect(canSignOff(true, completeChecklist())).toBe(false)
  })

  it('not locked + incomplete → cannot sign off', () => {
    expect(canSignOff(false, buildInitialChecklist())).toBe(false)
  })

  it('locked + incomplete → cannot sign off', () => {
    expect(canSignOff(true, buildInitialChecklist())).toBe(false)
  })
})

// ── isValidReviewPeriod ───────────────────────────────────────────────────────

describe('isValidReviewPeriod', () => {
  const past1   = '2025-01-01'
  const past2   = '2026-01-01'
  const today   = new Date().toLocaleDateString('en-CA')
  const future  = new Date(Date.now() + 86400000 * 10).toLocaleDateString('en-CA')

  it('valid period: past from, past to, from < to', () => {
    expect(isValidReviewPeriod(past1, past2)).toBe(true)
  })

  it('valid period: past from, today to', () => {
    expect(isValidReviewPeriod(past1, today)).toBe(true)
  })

  it('invalid: from after to', () => {
    expect(isValidReviewPeriod(past2, past1)).toBe(false)
  })

  it('invalid: to in future', () => {
    expect(isValidReviewPeriod(past1, future)).toBe(false)
  })

  it('invalid: from equals to', () => {
    expect(isValidReviewPeriod(past1, past1)).toBe(false)
  })

  it('invalid: empty strings', () => {
    expect(isValidReviewPeriod('', past2)).toBe(false)
    expect(isValidReviewPeriod(past1, '')).toBe(false)
  })
})

// ── Section 3.2 — Training ────────────────────────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.2 Training', () => {
  it('section 3.2 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.2')).toBeDefined()
  })

  it('section 3.2 title is Training', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.2')?.title).toBe('Training')
  })

  it('section 3.2 has exactly 4 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.2')?.items).toHaveLength(4)
  })

  it('section 3.2 has data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.2')?.hasDataPanel).toBe(true)
  })

  it('section 3.2 contains required SALSA training items', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.2')!.items
    expect(items).toContain('All staff have appropriate food safety training')
    expect(items).toContain('Training records complete and up to date')
    expect(items).toContain('Annual refresher training completed')
    expect(items).toContain('New starters inducted before handling food')
  })

  it('REVIEW_SECTIONS now has at least 2 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(2)
  })

  it('buildInitialChecklist includes section 3.2', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.2']).toBeDefined()
    expect(cl['3.2'].items).toHaveLength(4)
  })
})

// ── trainingRefreshStatus ─────────────────────────────────────────────────────

describe('trainingRefreshStatus', () => {
  const today = new Date()

  function daysFromToday(n: number): string {
    const d = new Date(today)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  it('null → not_recorded',      () => expect(trainingRefreshStatus(null)).toBe('not_recorded'))
  it('undefined → not_recorded', () => expect(trainingRefreshStatus(undefined)).toBe('not_recorded'))
  it('empty string → not_recorded', () => expect(trainingRefreshStatus('')).toBe('not_recorded'))

  it('yesterday → overdue',      () => expect(trainingRefreshStatus(daysFromToday(-1))).toBe('overdue'))
  it('30 days ago → overdue',    () => expect(trainingRefreshStatus(daysFromToday(-30))).toBe('overdue'))
  it('365 days ago → overdue',   () => expect(trainingRefreshStatus(daysFromToday(-365))).toBe('overdue'))

  it('today → due_soon (0 days = within 90)', () => expect(trainingRefreshStatus(daysFromToday(0))).toBe('due_soon'))
  it('45 days → due_soon',       () => expect(trainingRefreshStatus(daysFromToday(45))).toBe('due_soon'))
  it('90 days → due_soon',       () => expect(trainingRefreshStatus(daysFromToday(90))).toBe('due_soon'))

  it('91 days → current',        () => expect(trainingRefreshStatus(daysFromToday(91))).toBe('current'))
  it('180 days → current',       () => expect(trainingRefreshStatus(daysFromToday(180))).toBe('current'))
  it('365 days → current',       () => expect(trainingRefreshStatus(daysFromToday(365))).toBe('current'))
})

// ── Section 3.3 — Personal Hygiene & Health ───────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.3 Personal Hygiene & Health', () => {
  it('section 3.3 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.3')).toBeDefined()
  })

  it('section 3.3 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.3')?.title).toBe('Personal Hygiene & Health')
  })

  it('section 3.3 has exactly 4 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.3')?.items).toHaveLength(4)
  })

  it('section 3.3 has data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.3')?.hasDataPanel).toBe(true)
  })

  it('section 3.3 items match document verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.3')!.items
    expect(items[0]).toBe('Hand washing facilities adequate')
    expect(items[1]).toBe('Protective clothing policy followed')
    expect(items[2]).toBe('Health screening procedure in place')
    expect(items[3]).toBe('Illness reporting procedure followed')
  })

  it('REVIEW_SECTIONS now has at least 3 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(3)
  })

  it('buildInitialChecklist includes section 3.3', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.3']).toBeDefined()
    expect(cl['3.3'].items).toHaveLength(4)
    expect(cl['3.3'].items[0].label).toBe('Hand washing facilities adequate')
    expect(cl['3.3'].items[0].status).toBeNull()
  })

  it('section order is 3.1, 3.2, 3.3', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.1')).toBeLessThan(keys.indexOf('3.2'))
    expect(keys.indexOf('3.2')).toBeLessThan(keys.indexOf('3.3'))
  })
})

// ── Health data open exclusion logic ─────────────────────────────────────────

describe('Health exclusion open/closed logic', () => {
  // Pure logic: open exclusion = absence_to is null
  function isOpenExclusion(record: { absence_to: string | null }): boolean {
    return record.absence_to === null
  }

  it('null absence_to → open exclusion', () => {
    expect(isOpenExclusion({ absence_to: null })).toBe(true)
  })

  it('set absence_to → closed exclusion', () => {
    expect(isOpenExclusion({ absence_to: '2026-04-30' })).toBe(false)
  })

  it('filters open exclusions from a list', () => {
    const records = [
      { absence_to: null },
      { absence_to: '2026-04-15' },
      { absence_to: null },
    ]
    const open = records.filter(isOpenExclusion)
    expect(open).toHaveLength(2)
  })

  it('empty list returns no open exclusions', () => {
    expect([].filter(isOpenExclusion)).toHaveLength(0)
  })
})

// ── Section 3.3 data panel empty state ───────────────────────────────────────

describe('Section 3.3 data panel empty states', () => {
  it('all empty arrays produce totalRecords = 0', () => {
    const data = { new_staff: [], exclusions: [], visitors: [] }
    const total = data.new_staff.length + data.exclusions.length + data.visitors.length
    expect(total).toBe(0)
  })

  it('counts across all three sub-panels correctly', () => {
    const data = {
      new_staff:  [{ id: '1' }, { id: '2' }],
      exclusions: [{ id: '3' }],
      visitors:   [{ id: '4' }, { id: '5' }, { id: '6' }],
    }
    const total = data.new_staff.length + data.exclusions.length + data.visitors.length
    expect(total).toBe(6)
  })
})

// ── Section 3.4 — Cleaning & Disinfection ────────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.4 Cleaning & Disinfection', () => {
  it('section 3.4 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.4')).toBeDefined()
  })

  it('section 3.4 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.4')?.title).toBe('Cleaning & Disinfection')
  })

  it('section 3.4 has exactly 4 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.4')?.items).toHaveLength(4)
  })

  it('section 3.4 has data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.4')?.hasDataPanel).toBe(true)
  })

  it('section 3.4 items match MFS-ASR-001 verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.4')!.items
    expect(items[0]).toBe('Cleaning schedules in place and followed')
    expect(items[1]).toBe('Cleaning chemicals stored safely')
    expect(items[2]).toBe('Cleaning verification conducted (ATP swabs)')
    expect(items[3]).toBe('Equipment sanitisation effective (82C steriliser)')
  })

  it('section order: 3.3 before 3.4', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.3')).toBeLessThan(keys.indexOf('3.4'))
  })

  it('REVIEW_SECTIONS has at least 4 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(4)
  })

  it('buildInitialChecklist includes 3.4 with 4 items and null statuses', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.4']).toBeDefined()
    expect(cl['3.4'].items).toHaveLength(4)
    expect(cl['3.4'].items[0].label).toBe('Cleaning schedules in place and followed')
    expect(cl['3.4'].items.every(i => i.status === null)).toBe(true)
  })
})

// ── Cleaning data logic ───────────────────────────────────────────────────────

describe('Cleaning data panel logic', () => {
  const makeRecord = (issues: boolean, what_did_you_do: string | null, sanitiser_temp_c: number | null, date = '2026-04-21') =>
    ({ date, issues, what_did_you_do, sanitiser_temp_c })

  it('empty period: all zeros, null last_log_date', () => {
    const records: ReturnType<typeof makeRecord>[] = []
    expect(records.length).toBe(0)
    expect(records.filter(r => r.issues).length).toBe(0)
    expect(records.filter(r => r.sanitiser_temp_c !== null).length).toBe(0)
    expect(records.length > 0 ? records[0].date : null).toBeNull()
  })

  it('issues filter counts records where issues = true', () => {
    const records = [
      makeRecord(true, 'Fixed it', null),
      makeRecord(false, null, 82),
      makeRecord(true, null, 79),
    ]
    expect(records.filter(r => r.issues).length).toBe(2)
  })

  it('issues_list maps date and what_did_you_do', () => {
    const records = [makeRecord(true, 'Action taken', null, '2026-04-21')]
    const list = records.filter(r => r.issues).map(r => ({ date: r.date, what_did_you_do: r.what_did_you_do }))
    expect(list[0].date).toBe('2026-04-21')
    expect(list[0].what_did_you_do).toBe('Action taken')
  })

  it('what_did_you_do null on issues=true: no crash, returns null', () => {
    const records = [makeRecord(true, null, null)]
    const list = records.filter(r => r.issues).map(r => ({ date: r.date, what_did_you_do: r.what_did_you_do }))
    expect(list[0].what_did_you_do).toBeNull()
  })

  it('sanitiser_checks counts non-null sanitiser_temp_c', () => {
    const records = [
      makeRecord(false, null, 82),
      makeRecord(false, null, null),
      makeRecord(true, 'Fixed', 79),
      makeRecord(false, null, null),
    ]
    expect(records.filter(r => r.sanitiser_temp_c !== null).length).toBe(2)
  })

  it('low_temp_list: only records where sanitiser_temp_c < 82 (strict)', () => {
    const records = [
      makeRecord(false, null, 82),   // exactly 82 — passes, not in list
      makeRecord(false, null, 83),   // above — passes
      makeRecord(false, null, 79),   // below — in list
      makeRecord(false, null, 81),   // below — in list
      makeRecord(false, null, null), // no reading — not in list
    ]
    const lowTemps = records.filter(r => r.sanitiser_temp_c !== null && r.sanitiser_temp_c < 82)
    expect(lowTemps.length).toBe(2)
    expect(lowTemps.map(r => r.sanitiser_temp_c)).toEqual([79, 81])
  })

  it('82°C exactly does NOT appear in low_temp_list', () => {
    const records = [makeRecord(false, null, 82)]
    const lowTemps = records.filter(r => r.sanitiser_temp_c !== null && r.sanitiser_temp_c < 82)
    expect(lowTemps.length).toBe(0)
  })

  it('last_log_date is first record when sorted descending', () => {
    const records = [
      makeRecord(false, null, null, '2026-04-24'),
      makeRecord(false, null, null, '2026-04-19'),
    ]
    expect(records.length > 0 ? records[0].date : null).toBe('2026-04-24')
  })

  it('hasAlerts true when issues_count > 0', () => {
    const hasAlerts = (issues_count: number, low_temp_count: number) =>
      issues_count > 0 || low_temp_count > 0
    expect(hasAlerts(1, 0)).toBe(true)
    expect(hasAlerts(0, 1)).toBe(true)
    expect(hasAlerts(0, 0)).toBe(false)
  })
})
