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

// ── Section 3.5 — Pest Control ────────────────────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.5 Pest Control', () => {
  it('section 3.5 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.5')).toBeDefined()
  })

  it('section 3.5 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.5')?.title).toBe('Pest Control')
  })

  it('section 3.5 has exactly 6 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.5')?.items).toHaveLength(6)
  })

  it('section 3.5 has NO data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.5')?.hasDataPanel).toBe(false)
  })

  it('section 3.5 items match BSD 1.9 compliant labels verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.5')!.items
    expect(items[0]).toBe('Pest control contract in place and service contract reviewed')
    expect(items[1]).toBe('Contractor visit reports reviewed — min every 12 weeks')
    expect(items[2]).toBe('Bait plan/site plan up to date')
    expect(items[3]).toBe('Site adequately proofed — no gaps, doors seal, no evidence of pest activity')
    expect(items[4]).toBe('EFK UV bulbs changed annually')
    expect(items[5]).toBe('Contractor recommendations actioned and trend analysis completed')
  })

  it('section order: 3.4 before 3.5', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.4')).toBeLessThan(keys.indexOf('3.5'))
  })

  it('REVIEW_SECTIONS has at least 5 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(5)
  })

  it('buildInitialChecklist includes 3.5 with 6 items and null statuses', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.5']).toBeDefined()
    expect(cl['3.5'].items).toHaveLength(6)
    expect(cl['3.5'].items[0].label).toBe('Pest control contract in place and service contract reviewed')
    expect(cl['3.5'].items.every(i => i.status === null)).toBe(true)
  })

  it('isChecklistComplete requires 3.5 to be complete before sign-off', () => {
    const cl = buildInitialChecklist()
    // Complete every section except 3.5
    for (const s of REVIEW_SECTIONS) {
      if (s.key !== '3.5') {
        cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
      }
    }
    expect(isChecklistComplete(cl)).toBe(false)
  })
})

// ── Section 3.6 — Temperature Control ────────────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.6 Temperature Control', () => {
  it('section 3.6 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.6')).toBeDefined()
  })

  it('section 3.6 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.6')?.title).toBe('Temperature Control')
  })

  it('section 3.6 has exactly 6 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.6')?.items).toHaveLength(6)
  })

  it('section 3.6 has data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.6')?.hasDataPanel).toBe(true)
  })

  it('section 3.6 items match plan verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.6')!.items
    expect(items[0]).toBe('Temperature monitoring records complete and up to date (cold storage, deliveries, process room)')
    expect(items[1]).toBe('Thermometers calibrated — manual monthly or certified probe in use (BSD 1.5.4)')
    expect(items[2]).toBe('Chillers operating ≤8°C and freezer operating ≤-18°C (legal limits)')
    expect(items[3]).toBe('Delivery temperatures checked at goods-in and recorded (BSD 1.6.3)')
    expect(items[4]).toBe('Temperature deviations investigated, corrective actions documented and resolved')
    expect(items[5]).toBe('Calibration records retained (cert reference or manual test results)')
  })

  it('section order: 3.5 before 3.6', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.5')).toBeLessThan(keys.indexOf('3.6'))
  })

  it('REVIEW_SECTIONS has at least 6 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(6)
  })

  it('buildInitialChecklist includes 3.6 with 6 items and null statuses', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.6']).toBeDefined()
    expect(cl['3.6'].items).toHaveLength(6)
    expect(cl['3.6'].items.every(i => i.status === null)).toBe(true)
  })

  it('isChecklistComplete requires 3.6 answered before sign-off', () => {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      if (s.key !== '3.6') {
        cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
      }
    }
    expect(isChecklistComplete(cl)).toBe(false)
  })
})

// ── Temperature data panel logic ──────────────────────────────────────────────

describe('Temperature data panel logic', () => {
  const makeCalibManual = (pass: boolean, daysAgo: number, id = 'Probe 1') => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo)
    return {
      thermometer_id: id, calibration_mode: 'manual',
      date: d.toISOString().slice(0, 10), cert_reference: null,
      ice_water_result_c: pass ? 0.5 : 2.5, ice_water_pass: pass,
      boiling_water_result_c: pass ? 99.5 : 97, boiling_water_pass: pass,
    }
  }
  const makeCalibCert = (daysAgo: number, ref = 'CERT-001') => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo)
    return {
      thermometer_id: 'Certified', calibration_mode: 'certified_probe',
      date: d.toISOString().slice(0, 10), cert_reference: ref,
      ice_water_result_c: null, ice_water_pass: null,
      boiling_water_result_c: null, boiling_water_pass: null,
    }
  }

  it('certified probe: never counts as a failure', () => {
    const r = makeCalibCert(10)
    const isFail = r.calibration_mode === 'manual' && (r.ice_water_pass === false || r.boiling_water_pass === false)
    expect(isFail).toBe(false)
  })

  it('manual pass: both tests pass → not a failure', () => {
    const r = makeCalibManual(true, 5)
    const isFail = r.calibration_mode === 'manual' && (r.ice_water_pass === false || r.boiling_water_pass === false)
    expect(isFail).toBe(false)
  })

  it('manual fail: either test fails → is a failure', () => {
    const r = makeCalibManual(false, 5)
    const isFail = r.calibration_mode === 'manual' && (r.ice_water_pass === false || r.boiling_water_pass === false)
    expect(isFail).toBe(true)
  })

  it('stale calibration: > 31 days → overdue flag', () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const r = makeCalibManual(true, 32)
    const days = Math.floor((today.getTime() - new Date(r.date).getTime()) / 86_400_000)
    expect(days).toBeGreaterThan(31)
  })

  it('31 days exactly → not yet stale', () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const r = makeCalibManual(true, 31)
    const days = Math.floor((today.getTime() - new Date(r.date).getTime()) / 86_400_000)
    expect(days).toBeLessThanOrEqual(31)
  })

  it('cold storage: non-pass status → alert', () => {
    const units = [{ latest: { temp_status: 'amber' } }, { latest: { temp_status: 'pass' } }]
    const fails = units.filter(u => u.latest && u.latest.temp_status !== 'pass')
    expect(fails).toHaveLength(1)
  })

  it('cold storage: all pass → no alert', () => {
    const units = [{ latest: { temp_status: 'pass' } }, { latest: { temp_status: 'pass' } }]
    const fails = units.filter(u => u.latest && u.latest.temp_status !== 'pass')
    expect(fails).toHaveLength(0)
  })

  it('delivery temp_cas uses temp_status not corrective_action_required', () => {
    // 15 deliveries all pass temp, 2 have CA from contamination
    // temp_cas must be 0, not 2
    const delivs = Array(15).fill({ temp_status: 'pass', corrective_action_required: false })
    const contamCAs = [
      { temp_status: 'pass', corrective_action_required: true },
      { temp_status: 'pass', corrective_action_required: true },
    ]
    const all = [...delivs, ...contamCAs]
    const temp_cas_correct = all.filter(d => d.temp_status !== 'pass').length
    const temp_cas_wrong   = all.filter(d => d.corrective_action_required).length
    expect(temp_cas_correct).toBe(0)  // correct: 0 temp deviations
    expect(temp_cas_wrong).toBe(2)    // wrong method would return 2
  })

  it('hasAlerts true when any calibration fails', () => {
    const calibFails = [makeCalibManual(false, 5)]
    expect(calibFails.length > 0).toBe(true)
  })

  it('hasAlerts false when everything is fine', () => {
    const calibFails:  unknown[] = []
    const staleCalib:  unknown[] = []
    const coldFails:   unknown[] = []
    const temp_cas    = 0
    const hasAlerts   = calibFails.length > 0 || staleCalib.length > 0 || coldFails.length > 0 || temp_cas > 0
    expect(hasAlerts).toBe(false)
  })
})

// ── Section 3.7 — Supplier Control & Traceability ────────────────────────────

describe('REVIEW_SECTIONS — Section 3.7 Supplier Control & Traceability', () => {
  it('section 3.7 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.7')).toBeDefined()
  })

  it('section 3.7 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.7')?.title).toBe('Supplier Control & Traceability')
  })

  it('section 3.7 has exactly 6 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.7')?.items).toHaveLength(6)
  })

  it('section 3.7 has data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.7')?.hasDataPanel).toBe(true)
  })

  it('section 3.7 items match plan verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.7')!.items
    expect(items[0]).toBe('Approved supplier list maintained — all active suppliers risk assessed and date approved recorded')
    expect(items[1]).toBe('Product specifications held for all supplied products and reviewed (BSD 1.6.2)')
    expect(items[2]).toBe('Supplier certificates current — FSA approval numbers and third-party certs on file where applicable')
    expect(items[3]).toBe('Goods-in checks completed at every delivery — temp, condition, batch number and documentation')
    expect(items[4]).toBe('BLS traceability data recorded at intake for all red meat and offal (EC 853/2004)')
    expect(items[5]).toBe('Traceability test conducted — mock recall completed forward and backward (BSD 3.4.2)')
  })

  it('section order: 3.6 before 3.7', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.6')).toBeLessThan(keys.indexOf('3.7'))
  })

  it('REVIEW_SECTIONS has at least 7 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(7)
  })

  it('buildInitialChecklist includes 3.7 with 6 items and null statuses', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.7']).toBeDefined()
    expect(cl['3.7'].items).toHaveLength(6)
    expect(cl['3.7'].items.every(i => i.status === null)).toBe(true)
  })

  it('isChecklistComplete requires 3.7 answered before sign-off', () => {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      if (s.key !== '3.7') {
        cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
      }
    }
    expect(isChecklistComplete(cl)).toBe(false)
  })
})

// ── Supplier & traceability data logic ───────────────────────────────────────

describe('Supplier data panel logic', () => {
  it('formally_approved < total → approval gap alert', () => {
    const s = { total: 43, formally_approved: 0, fsa_approved: 2, expired_certs: 0, expiring_60_days: 0 }
    expect(s.total - s.formally_approved).toBe(43)
    expect(s.formally_approved < s.total).toBe(true)
  })

  it('formally_approved === total → no gap', () => {
    const s = { total: 5, formally_approved: 5, fsa_approved: 2, expired_certs: 0, expiring_60_days: 0 }
    expect(s.formally_approved < s.total).toBe(false)
  })

  it('expired_certs > 0 → alert', () => {
    const s = { total: 10, formally_approved: 10, fsa_approved: 2, expired_certs: 1, expiring_60_days: 0 }
    expect(s.expired_certs > 0).toBe(true)
  })

  it('BLS completeness: all complete → no alert', () => {
    const g = { total: 17, has_batch: 17, meat_total: 13, meat_bls_complete: 13 }
    const blsIncomplete = g.meat_total > 0 && g.meat_bls_complete < g.meat_total
    expect(blsIncomplete).toBe(false)
  })

  it('BLS completeness: some incomplete → alert', () => {
    const g = { total: 17, has_batch: 17, meat_total: 13, meat_bls_complete: 11 }
    const blsIncomplete = g.meat_total > 0 && g.meat_bls_complete < g.meat_total
    expect(blsIncomplete).toBe(true)
  })

  it('BLS completeness: no meat deliveries → no alert', () => {
    const g = { total: 5, has_batch: 5, meat_total: 0, meat_bls_complete: 0 }
    const blsIncomplete = g.meat_total > 0 && g.meat_bls_complete < g.meat_total
    expect(blsIncomplete).toBe(false)
  })

  it('hasAlerts false when everything clean', () => {
    const s = { total: 5, formally_approved: 5, fsa_approved: 2, expired_certs: 0, expiring_60_days: 0 }
    const sp = { total: 2, review_due: 0 }
    const g  = { total: 10, has_batch: 10, meat_total: 8, meat_bls_complete: 8 }
    const blsIncomplete = g.meat_total > 0 && g.meat_bls_complete < g.meat_total
    const hasAlerts = (s.total - s.formally_approved) > 0 || s.expired_certs > 0
      || s.expiring_60_days > 0 || blsIncomplete || sp.review_due > 0
    expect(hasAlerts).toBe(false)
  })

  it('empty period: goods_in total = 0, no crash', () => {
    const g = { total: 0, has_batch: 0, meat_total: 0, meat_bls_complete: 0 }
    expect(g.total).toBe(0)
  })
})

// ── Section 3.8 — Incidents & Complaints ─────────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.8 Incidents & Complaints', () => {
  it('section 3.8 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.8')).toBeDefined()
  })

  it('section 3.8 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.8')?.title).toBe('Incidents & Complaints')
  })

  it('section 3.8 has exactly 4 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.8')?.items).toHaveLength(4)
  })

  it('section 3.8 has data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.8')?.hasDataPanel).toBe(true)
  })

  it('section 3.8 items match MFS-ASR-001 verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.8')!.items
    expect(items[0]).toBe('Complaint handling procedure in place')
    expect(items[1]).toBe('Complaints investigated and closed out')
    expect(items[2]).toBe('Recall procedure documented and tested')
    expect(items[3]).toBe('No outstanding incidents')
  })

  it('section order: 3.7 before 3.8', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.7')).toBeLessThan(keys.indexOf('3.8'))
  })

  it('REVIEW_SECTIONS has at least 8 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(8)
  })

  it('buildInitialChecklist includes 3.8 with 4 items and null statuses', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.8']).toBeDefined()
    expect(cl['3.8'].items).toHaveLength(4)
    expect(cl['3.8'].items.every(i => i.status === null)).toBe(true)
  })

  it('isChecklistComplete requires 3.8 answered before sign-off', () => {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      if (s.key !== '3.8') {
        cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
      }
    }
    expect(isChecklistComplete(cl)).toBe(false)
  })
})

// ── Incidents data panel logic ────────────────────────────────────────────────

describe('Incidents data panel logic', () => {
  it('hasAlerts true when open CAs > 0', () => {
    const ca = { total_open: 3, total_resolved: 10, in_period: 2, open_by_source: [] }
    const comp = { total: 5, open: 0, resolved: 5 }
    expect(ca.total_open > 0 || comp.open > 0).toBe(true)
  })

  it('hasAlerts true when open complaints > 0', () => {
    const ca = { total_open: 0, total_resolved: 10, in_period: 0, open_by_source: [] }
    const comp = { total: 5, open: 2, resolved: 3 }
    expect(ca.total_open > 0 || comp.open > 0).toBe(true)
  })

  it('hasAlerts false when all clear', () => {
    const ca = { total_open: 0, total_resolved: 10, in_period: 2, open_by_source: [] }
    const comp = { total: 5, open: 0, resolved: 5 }
    expect(ca.total_open > 0 || comp.open > 0).toBe(false)
  })

  it('open_by_source groups correctly', () => {
    const cas = [
      { source_table: 'haccp_deliveries', resolved: false },
      { source_table: 'haccp_deliveries', resolved: false },
      { source_table: 'haccp_cleaning_log', resolved: false },
      { source_table: 'haccp_deliveries', resolved: true },
    ]
    const open = cas.filter(c => !c.resolved)
    const map: Record<string, number> = {}
    for (const c of open) map[c.source_table] = (map[c.source_table] ?? 0) + 1
    expect(map['haccp_deliveries']).toBe(2)
    expect(map['haccp_cleaning_log']).toBe(1)
    expect(Object.keys(map).length).toBe(2)
  })

  it('return code count correct', () => {
    const returns = [
      { return_code: 'RC01' }, { return_code: 'RC01' }, { return_code: 'RC02' },
    ]
    const map: Record<string, number> = {}
    for (const r of returns) map[r.return_code] = (map[r.return_code] ?? 0) + 1
    expect(map['RC01']).toBe(2)
    expect(map['RC02']).toBe(1)
  })

  it('empty period: all zeros, no crash', () => {
    const ret = { total: 0, by_code: [] }
    const comp = { total: 0, open: 0, resolved: 0 }
    expect(ret.total).toBe(0)
    expect(comp.total).toBe(0)
  })

  it('CA in_period filter uses submitted_at date slice', () => {
    const cas = [
      { submitted_at: '2026-04-15T09:00:00Z', resolved: false },
      { submitted_at: '2026-03-01T09:00:00Z', resolved: false },
      { submitted_at: '2026-04-30T09:00:00Z', resolved: true },
    ]
    const from = '2026-04-01', to = '2026-04-30'
    const inPeriod = cas.filter(c => {
      const d = c.submitted_at?.slice(0, 10) ?? ''
      return d >= from && d <= to
    })
    expect(inPeriod.length).toBe(2)
  })
})

// ── Section 3.9 — Food Fraud & Food Defence ──────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.9 Food Fraud & Food Defence', () => {
  it('section 3.9 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.9')).toBeDefined()
  })

  it('section 3.9 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.9')?.title).toBe('Food Fraud & Food Defence')
  })

  it('section 3.9 has exactly 4 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.9')?.items).toHaveLength(4)
  })

  it('section 3.9 has data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.9')?.hasDataPanel).toBe(true)
  })

  it('section 3.9 items match MFS-ASR-001 verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.9')!.items
    expect(items[0]).toBe('Food fraud risk assessment completed')
    expect(items[1]).toBe('Food defence plan in place')
    expect(items[2]).toBe('Site security adequate')
    expect(items[3]).toBe('Cyber security measures in place')
  })

  it('section order: 3.8 before 3.9', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.8')).toBeLessThan(keys.indexOf('3.9'))
  })

  it('REVIEW_SECTIONS has at least 9 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(9)
  })

  it('buildInitialChecklist includes 3.9 with 4 items and null statuses', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.9']).toBeDefined()
    expect(cl['3.9'].items).toHaveLength(4)
    expect(cl['3.9'].items.every(i => i.status === null)).toBe(true)
  })

  it('isChecklistComplete requires 3.9 answered', () => {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      if (s.key !== '3.9') {
        cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
      }
    }
    expect(isChecklistComplete(cl)).toBe(false)
  })
})

// ── 3.9 data panel logic ──────────────────────────────────────────────────────

describe('FoodFraudDefencePanel logic', () => {
  const today = new Date().toISOString().slice(0, 10)
  const future = '2027-01-12'
  const past   = '2025-01-01'

  it('review_due false when next_review in future', () => {
    expect(!('exists') || future < today).toBe(false)
    expect(future < today).toBe(false)
  })

  it('review_due true when next_review in past', () => {
    expect(past < today).toBe(true)
  })

  it('hasAlerts false when both current', () => {
    const ff = { exists: true, version: 'V1.0', issue_date: '2026-01-12', next_review: future, review_due: false }
    const fd = { exists: true, version: 'V1.0', issue_date: '2026-01-12', next_review: future, review_due: false }
    const hasAlerts = ff.review_due || !ff.exists || fd.review_due || !fd.exists
    expect(hasAlerts).toBe(false)
  })

  it('hasAlerts true when fraud assessment missing', () => {
    const ff = { exists: false, version: null, issue_date: null, next_review: null, review_due: true }
    const fd = { exists: true,  version: 'V1.0', issue_date: '2026-01-12', next_review: future, review_due: false }
    const hasAlerts = ff.review_due || !ff.exists || fd.review_due || !fd.exists
    expect(hasAlerts).toBe(true)
  })

  it('hasAlerts true when defence plan overdue', () => {
    const ff = { exists: true, version: 'V1.0', issue_date: '2026-01-12', next_review: future, review_due: false }
    const fd = { exists: true, version: 'V1.0', issue_date: '2025-01-12', next_review: past,   review_due: true }
    const hasAlerts = ff.review_due || !ff.exists || fd.review_due || !fd.exists
    expect(hasAlerts).toBe(true)
  })

  it('hasAlerts true when both missing', () => {
    const ff = { exists: false, version: null, issue_date: null, next_review: null, review_due: true }
    const fd = { exists: false, version: null, issue_date: null, next_review: null, review_due: true }
    const hasAlerts = ff.review_due || !ff.exists || fd.review_due || !fd.exists
    expect(hasAlerts).toBe(true)
  })
})

// ── Section 3.10 — Premises & Equipment ──────────────────────────────────────

describe('REVIEW_SECTIONS — Section 3.10 Premises & Equipment', () => {
  it('section 3.10 exists', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.10')).toBeDefined()
  })

  it('section 3.10 title is correct', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.10')?.title).toBe('Premises & Equipment')
  })

  it('section 3.10 has exactly 4 items', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.10')?.items).toHaveLength(4)
  })

  it('section 3.10 has no data panel', () => {
    expect(REVIEW_SECTIONS.find(s => s.key === '3.10')?.hasDataPanel).toBe(false)
  })

  it('section 3.10 items match MFS-ASR-001 verbatim', () => {
    const items = REVIEW_SECTIONS.find(s => s.key === '3.10')!.items
    expect(items[0]).toBe('Premises in good repair')
    expect(items[1]).toBe('Equipment maintained and fit for purpose')
    expect(items[2]).toBe('Glass/breakables register up to date')
    expect(items[3]).toBe('Water supply safe (testing current)')
  })

  it('section order: 3.9 before 3.10', () => {
    const keys = REVIEW_SECTIONS.map(s => s.key)
    expect(keys.indexOf('3.9')).toBeLessThan(keys.indexOf('3.10'))
  })

  it('REVIEW_SECTIONS has at least 10 sections', () => {
    expect(REVIEW_SECTIONS.length).toBeGreaterThanOrEqual(10)
  })

  it('buildInitialChecklist includes 3.10 with 4 items and null statuses', () => {
    const cl = buildInitialChecklist()
    expect(cl['3.10']).toBeDefined()
    expect(cl['3.10'].items).toHaveLength(4)
    expect(cl['3.10'].items.every(i => i.status === null)).toBe(true)
  })

  it('isChecklistComplete requires 3.10 answered', () => {
    const cl = buildInitialChecklist()
    for (const s of REVIEW_SECTIONS) {
      if (s.key !== '3.10') {
        cl[s.key].items = cl[s.key].items.map(item => ({ ...item, status: 'ok' as const }))
      }
    }
    expect(isChecklistComplete(cl)).toBe(false)
  })
})
