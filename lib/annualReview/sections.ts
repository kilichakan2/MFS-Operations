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
  {
    key:          '3.2',
    title:        'Training',
    hasDataPanel: true,
    items: [
      'All staff have appropriate food safety training',
      'Training records complete and up to date',
      'Annual refresher training completed',
      'New starters inducted before handling food',
    ],
  },
  {
    key:          '3.3',
    title:        'Personal Hygiene & Health',
    hasDataPanel: true,
    items: [
      'Hand washing facilities adequate',
      'Protective clothing policy followed',
      'Health screening procedure in place',
      'Illness reporting procedure followed',
    ],
  },
  {
    key:          '3.4',
    title:        'Cleaning & Disinfection',
    hasDataPanel: true,
    items: [
      'Cleaning schedules in place and followed',
      'Cleaning chemicals stored safely',
      'Cleaning verification conducted (ATP swabs)',
      'Equipment sanitisation effective (82C steriliser)',
    ],
  },
  {
    key:          '3.5',
    title:        'Pest Control',
    hasDataPanel: false,
    items: [
      'Pest control contract in place and service contract reviewed',
      'Contractor visit reports reviewed — min every 12 weeks',
      'Bait plan/site plan up to date',
      'Site adequately proofed — no gaps, doors seal, no evidence of pest activity',
      'EFK UV bulbs changed annually',
      'Contractor recommendations actioned and trend analysis completed',
    ],
  },
  {
    key:          '3.6',
    title:        'Temperature Control',
    hasDataPanel: true,
    items: [
      'Temperature monitoring records complete and up to date (cold storage, deliveries, process room)',
      'Thermometers calibrated — manual monthly or certified probe in use (BSD 1.5.4)',
      'Chillers operating ≤8°C and freezer operating ≤-18°C (legal limits)',
      'Delivery temperatures checked at goods-in and recorded (BSD 1.6.3)',
      'Temperature deviations investigated, corrective actions documented and resolved',
      'Calibration records retained (cert reference or manual test results)',
    ],
  },
  {
    key:          '3.7',
    title:        'Supplier Control & Traceability',
    hasDataPanel: true,
    items: [
      'Approved supplier list maintained — all active suppliers risk assessed and date approved recorded',
      'Product specifications held for all supplied products and reviewed (BSD 1.6.2)',
      'Supplier certificates current — FSA approval numbers and third-party certs on file where applicable',
      'Goods-in checks completed at every delivery — temp, condition, batch number and documentation',
      'BLS traceability data recorded at intake for all red meat and offal (EC 853/2004)',
      'Traceability test conducted — mock recall completed forward and backward (BSD 3.4.2)',
    ],
  },
  {
    key:          '3.8',
    title:        'Incidents & Complaints',
    hasDataPanel: true,
    items: [
      'Complaint handling procedure in place',
      'Complaints investigated and closed out',
      'Recall procedure documented and tested',
      'No outstanding incidents',
    ],
  },
  {
    key:          '3.9',
    title:        'Food Fraud & Food Defence',
    hasDataPanel: true,
    items: [
      'Food fraud risk assessment completed',
      'Food defence plan in place',
      'Site security adequate',
      'Cyber security measures in place',
    ],
  },
  // Phase 10 will add: 3.10 Premises & Equipment
]

// ─── Training status logic (used in data panel + tests) ──────────────────────

export type TrainingStatus = 'current' | 'due_soon' | 'overdue' | 'not_recorded'

/**
 * Derive training currency from a refresh date.
 * - null / undefined  → not_recorded
 * - past today        → overdue
 * - within 90 days    → due_soon
 * - > 90 days away    → current
 */
export function trainingRefreshStatus(refreshDate: string | null | undefined): TrainingStatus {
  if (!refreshDate) return 'not_recorded'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const refresh   = new Date(refreshDate)
  const daysUntil = Math.floor((refresh.getTime() - today.getTime()) / 86_400_000)
  if (daysUntil < 0)   return 'overdue'
  if (daysUntil <= 90) return 'due_soon'
  return 'current'
}

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
