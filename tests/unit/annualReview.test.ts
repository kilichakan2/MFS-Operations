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
