/**
 * lib/annualReview/sections.ts
 *
 * SALSA 3.1 — Annual Systems Review
 *
 * Section definitions and pure logic functions.
 * Shared between API, page, and tests.
 *
 * Labels are stored in the DB record (not derived from this file at read time)
 * so every saved review is self-contained and auditable.
 * This file is used when CREATING a new review to pre-populate the structure.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ItemStatus = 'ok' | 'na' | 'action' | null

export interface ChecklistItem {
  label:  string
  status: ItemStatus
  notes:  string
}

export interface ChecklistSection {
  items:        ChecklistItem[]
  section_notes: string
}

export type Checklist = Record<string, ChecklistSection>

export interface ActionPlanItem {
  ref:      number
  action:   string
  owner:    string
  due_date: string   // ISO date string or ''
  status:   'open' | 'complete'
}

// ─── Section definitions ──────────────────────────────────────────────────────
// Only sections built in the UI are included here.
// Phases add more sections to this array.

export interface SectionDef {
  key:         string
  title:       string
  items:       string[]
  hasDataPanel: boolean
}

export const REVIEW_SECTIONS: SectionDef[] = [
  {
    key:          '3.1',
    title:        'HACCP System',
    hasDataPanel: false,
    items: [
      'HACCP plan reviewed and current',
      'Hazard analysis up to date',
      'CCPs and critical limits appropriate',
      'Monitoring procedures effective',
      'Corrective actions documented and followed',
      'HACCP team competent and trained',
      'Process flow diagrams accurate',
    ],
  },
  // Phase 2 will add: 3.2 Training, 3.3 Hygiene, 3.4 Cleaning
  // Phase 3 will add: 3.5 Pest Control, 3.6 Temperature, 3.7 Suppliers, 3.8 Incidents
  // Phase 4 will add: 3.9 Food Fraud, 3.10 Premises
  // Phase 5 will add: 3.11 Allergens, 3.12 Labelling
]

// ─── Pure logic ───────────────────────────────────────────────────────────────

/** Build a blank checklist pre-populated from REVIEW_SECTIONS */
export function buildInitialChecklist(): Checklist {
  const checklist: Checklist = {}
  for (const section of REVIEW_SECTIONS) {
    checklist[section.key] = {
      items: section.items.map(label => ({ label, status: null, notes: '' })),
      section_notes: '',
    }
  }
  return checklist
}

/** True if every item in a section has a non-null status */
export function isSectionComplete(section: ChecklistSection): boolean {
  return section.items.every(item => item.status !== null)
}

/** True if all defined sections in the checklist are complete */
export function isChecklistComplete(checklist: Checklist): boolean {
  return REVIEW_SECTIONS.every(def => {
    const section = checklist[def.key]
    if (!section) return false
    return isSectionComplete(section)
  })
}

/** True if the review can be signed off (not locked + all sections complete) */
export function canSignOff(
  locked:    boolean,
  checklist: Checklist,
): boolean {
  return !locked && isChecklistComplete(checklist)
}

/** Count how many sections have all items answered */
export function completedSectionCount(checklist: Checklist): number {
  return REVIEW_SECTIONS.filter(def => {
    const section = checklist[def.key]
    return section ? isSectionComplete(section) : false
  }).length
}

/** Validate item status — must be one of the four allowed values */
export function isValidStatus(status: unknown): status is ItemStatus {
  return status === 'ok' || status === 'na' || status === 'action' || status === null
}

/** Validate review period — from must be before to, neither in the future */
export function isValidReviewPeriod(from: string, to: string): boolean {
  if (!from || !to) return false
  const f  = new Date(from)
  const t  = new Date(to)
  const now = new Date()
  now.setHours(23, 59, 59, 999)  // allow today
  return f < t && t <= now
}

/** Build a blank action plan with 6 pre-populated empty rows */
export function buildInitialActionPlan(): ActionPlanItem[] {
  return Array.from({ length: 6 }, (_, i) => ({
    ref:      i + 1,
    action:   '',
    owner:    '',
    due_date: '',
    status:   'open' as const,
  }))
}
