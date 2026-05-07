'use client'
/**
 * app/haccp/annual-review/page.tsx
 *
 * SALSA 3.1 — Annual Food Safety Systems Review
 *
 * Phase 1: DB shell + Section 3.1
 * Phase 2: Section 3.2 Training with live data panel
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  REVIEW_SECTIONS,
  completedSectionCount,
  isSectionComplete,
  canSignOff,
  trainingRefreshStatus,
  type Checklist,
  type ChecklistSection,
  type ItemStatus,
  type ActionPlanItem,
  type TrainingStatus,
} from '@/lib/annualReview/sections'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnnualReview {
  id:                  string
  review_year:         string
  review_period_from:  string
  review_period_to:    string
  checklist:           Checklist
  action_plan:         ActionPlanItem[]
  locked:              boolean
  signed_off_at:       string | null
  approved_at:         string | null
  signer:              { name: string } | null
  approver:            { name: string } | null
  creator:             { name: string } | null
  updated_at:          string
}

interface User {
  id:   string
  name: string
}

interface StaffTrainingRecord {
  staff_name:      string
  job_role:        string | null
  training_type:   string
  completion_date: string | null
  refresh_date:    string | null
}

interface AllergenTrainingRecord {
  staff_name:         string
  job_role:           string | null
  certification_date: string | null
  refresh_date:       string | null
}

interface HealthRecord {
  id:                           string
  record_type:                  string
  date:                         string
  staff_name:                   string | null
  fit_for_work:                 boolean
  exclusion_reason:             string | null
  illness_type:                 string | null
  absence_from:                 string | null
  absence_to:                   string | null
  symptom_free_48h:             boolean | null
  return_date:                  string | null
  visitor_name:                 string | null
  visitor_company:              string | null
  visitor_declaration_confirmed: boolean | null
}

interface SectionData {
  '3.2'?: {
    staff_training:    StaffTrainingRecord[]
    allergen_training: AllergenTrainingRecord[]
  }
  '3.3'?: {
    new_staff:  HealthRecord[]
    exclusions: HealthRecord[]
    visitors:   HealthRecord[]
  }
  '3.4'?: {
    total:            number
    issues_count:     number
    issues_list:      { date: string; what_did_you_do: string | null }[]
    sanitiser_checks: number
    low_temp_list:    { date: string; sanitiser_temp_c: number }[]
    last_log_date:    string | null
  }
}

// ─── Training status helpers ─────────────────────────────────────────────────

const TRAINING_STATUS_CONFIG: Record<TrainingStatus, { label: string; dot: string }> = {
  current:      { label: '✓ Current',     dot: 'bg-green-500' },
  due_soon:     { label: '⚠ Due soon',    dot: 'bg-amber-400' },
  overdue:      { label: '✗ Overdue',     dot: 'bg-red-500'   },
  not_recorded: { label: '— Not on file', dot: 'bg-slate-300' },
}

function StatusDot({ status }: { status: TrainingStatus }) {
  const cfg = TRAINING_STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${
      status === 'current' ? 'text-green-700' :
      status === 'due_soon' ? 'text-amber-600' :
      status === 'overdue' ? 'text-red-600' : 'text-slate-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  )
}

// ─── Section 3.2 Training data panel ─────────────────────────────────────────

function TrainingDataPanel({ data }: {
  data: SectionData['3.2'] | undefined
}) {
  const [open, setOpen] = useState(false)

  if (!data) return null

  const { staff_training, allergen_training } = data

  return (
    <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <p className="text-slate-600 text-xs font-bold">Training records as of today</p>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="px-4 pt-3 pb-4 space-y-4 bg-white">

          {/* Food safety training */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Food safety training</p>
            {staff_training.length === 0 ? (
              <p className="text-slate-400 text-xs">No records found</p>
            ) : (
              <div className="space-y-1">
                {staff_training.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 py-1.5 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-slate-800 text-xs font-semibold leading-tight">{r.staff_name}</p>
                      <p className="text-slate-400 text-[10px]">{r.training_type}{r.job_role ? ` · ${r.job_role}` : ''}</p>
                      {r.completion_date && (
                        <p className="text-slate-400 text-[10px]">
                          Completed {new Date(r.completion_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <StatusDot status={trainingRefreshStatus(r.refresh_date)} />
                      {r.refresh_date && (
                        <p className="text-slate-400 text-[10px] mt-0.5">
                          Refresh {new Date(r.refresh_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Allergen awareness training */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Allergen awareness training</p>
            {allergen_training.length === 0 ? (
              <p className="text-slate-400 text-xs">No records found</p>
            ) : (
              <div className="space-y-1">
                {allergen_training.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 py-1.5 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-slate-800 text-xs font-semibold leading-tight">{r.staff_name}</p>
                      {r.job_role && <p className="text-slate-400 text-[10px]">{r.job_role}</p>}
                      {r.certification_date && (
                        <p className="text-slate-400 text-[10px]">
                          Certified {new Date(r.certification_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <StatusDot status={trainingRefreshStatus(r.refresh_date)} />
                      {r.refresh_date && (
                        <p className="text-slate-400 text-[10px] mt-0.5">
                          Refresh {new Date(r.refresh_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<NonNullable<ItemStatus>, { label: string; colour: string; bg: string }> = {
  ok:     { label: '✓ OK',             colour: 'text-green-700', bg: 'bg-green-50 border-green-300' },
  na:     { label: '— N/A',            colour: 'text-slate-500', bg: 'bg-slate-100 border-slate-300' },
  action: { label: '⚠ Action Required', colour: 'text-amber-700', bg: 'bg-amber-50 border-amber-300' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function defaultPeriod() {
  const to   = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)
  return {
    from: from.toLocaleDateString('en-CA'),
    to:   to.toLocaleDateString('en-CA'),
  }
}

function defaultYear() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth() + 1
  return m >= 4 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`
}

// ─── Section Item Row ─────────────────────────────────────────────────────────

function ItemRow({
  item,
  idx,
  locked,
  onChange,
}: {
  item:     { label: string; status: ItemStatus; notes: string }
  idx:      number
  locked:   boolean
  onChange: (idx: number, status: ItemStatus, notes: string) => void
}) {
  const statuses: NonNullable<ItemStatus>[] = ['ok', 'na', 'action']

  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      <p className="text-slate-800 text-sm mb-2 leading-snug">{item.label}</p>
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => {
          const cfg     = STATUS_CONFIG[s]
          const active  = item.status === s
          return (
            <button
              key={s}
              disabled={locked}
              onClick={() => onChange(idx, active ? null : s, item.notes)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 disabled:opacity-50 ${
                active ? cfg.bg + ' ' + cfg.colour : 'border-slate-200 bg-white text-slate-400'
              }`}>
              {cfg.label}
            </button>
          )
        })}
      </div>
      {item.status === 'action' && (
        <textarea
          value={item.notes}
          onChange={e => onChange(idx, 'action', e.target.value)}
          disabled={locked}
          placeholder="Describe action required…"
          rows={2}
          className="mt-2 w-full border border-amber-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 resize-none disabled:opacity-50"
        />
      )}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  sectionKey,
  section,
  locked,
  onItemChange,
  onNotesChange,
  dataPanelContent,
}: {
  sectionKey:        string
  section:           ChecklistSection
  locked:            boolean
  onItemChange:      (idx: number, status: ItemStatus, notes: string) => void
  onNotesChange:     (notes: string) => void
  dataPanelContent?: React.ReactNode
}) {
  const def      = REVIEW_SECTIONS.find(s => s.key === sectionKey)
  const complete = isSectionComplete(section)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className={`w-full px-4 py-3 border-b flex items-center gap-3 text-left transition-colors ${
          complete ? 'border-green-100 bg-green-50' : 'border-blue-100'
        }`}
      >
        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
          complete ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-600'
        }`}>
          {complete ? '✓' : sectionKey}
        </span>
        <div className="flex-1">
          <p className="text-slate-900 font-bold text-sm">{def?.title ?? sectionKey}</p>
          <p className="text-slate-400 text-[10px]">
            {section.items.filter(i => i.status !== null).length} of {section.items.length} items answered
          </p>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div className="px-4 pt-3 pb-3">
          {dataPanelContent}
          {section.items.map((item, idx) => (
            <ItemRow key={idx} item={item} idx={idx} locked={locked} onChange={onItemChange} />
          ))}
          <div className="mt-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Section notes (optional)</p>
            <textarea
              value={section.section_notes}
              onChange={e => onNotesChange(e.target.value)}
              disabled={locked}
              placeholder="Any overall notes for this section…"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400 resize-none disabled:opacity-50"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section 3.3 Health data panel ───────────────────────────────────────────

function HealthDataPanel({ data }: { data: SectionData['3.3'] | undefined }) {
  const [open, setOpen] = useState(false)

  if (!data) return null

  const { new_staff, exclusions, visitors } = data
  const totalRecords = new_staff.length + exclusions.length + visitors.length
  const openExclusions = exclusions.filter(r => !r.absence_to)

  return (
    <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p className="text-slate-600 text-xs font-bold">Health &amp; hygiene records — review period</p>
          {openExclusions.length > 0 && (
            <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
              {openExclusions.length} open exclusion{openExclusions.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="px-4 pt-3 pb-4 space-y-4 bg-white">

          {totalRecords === 0 && (
            <p className="text-slate-400 text-xs">No health records in this review period</p>
          )}

          {/* New starter declarations */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              New starter declarations ({new_staff.length})
            </p>
            {new_staff.length === 0 ? (
              <p className="text-slate-400 text-xs">None in period</p>
            ) : (
              <div className="space-y-1">
                {new_staff.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 py-1.5 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-slate-800 text-xs font-semibold">{r.staff_name ?? '—'}</p>
                      <p className="text-slate-400 text-[10px]">
                        {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold self-center ${r.fit_for_work ? 'text-green-700' : 'text-red-600'}`}>
                      {r.fit_for_work ? '✓ Fit' : '✗ Not fit'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Illness exclusions */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Illness exclusions / returns ({exclusions.length})
            </p>
            {exclusions.length === 0 ? (
              <p className="text-slate-400 text-xs">None in period</p>
            ) : (
              <div className="space-y-1">
                {exclusions.map((r, i) => {
                  const isOpen = !r.absence_to
                  const notSymptomFree = r.symptom_free_48h === false
                  return (
                    <div key={i} className={`py-1.5 border-b border-slate-50 last:border-0 ${isOpen ? 'bg-red-50 -mx-1 px-1 rounded' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-slate-800 text-xs font-semibold">{r.staff_name ?? '—'}</p>
                          {r.illness_type && <p className="text-slate-500 text-[10px]">{r.illness_type}</p>}
                          <p className="text-slate-400 text-[10px]">
                            {r.absence_from ? new Date(r.absence_from).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '?'}
                            {' → '}
                            {r.absence_to ? new Date(r.absence_to).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '?'}
                          </p>
                          {r.return_date && (
                            <p className="text-slate-400 text-[10px]">
                              Returned {new Date(r.return_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 space-y-0.5">
                          {isOpen && <p className="text-red-600 text-[10px] font-bold">🔴 Open</p>}
                          {notSymptomFree && <p className="text-amber-600 text-[10px] font-bold">⚠ 48h not confirmed</p>}
                          {!isOpen && !notSymptomFree && <p className="text-green-700 text-[10px] font-bold">✓ Closed</p>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Visitor declarations */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Visitor declarations ({visitors.length})
            </p>
            {visitors.length === 0 ? (
              <p className="text-slate-400 text-xs">None in period</p>
            ) : (
              <div className="space-y-1">
                {visitors.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 py-1.5 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-slate-800 text-xs font-semibold">{r.visitor_name ?? '—'}</p>
                      {r.visitor_company && <p className="text-slate-400 text-[10px]">{r.visitor_company}</p>}
                      <p className="text-slate-400 text-[10px]">
                        {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold self-center ${r.visitor_declaration_confirmed ? 'text-green-700' : 'text-red-600'}`}>
                      {r.visitor_declaration_confirmed ? '✓ Declared' : '✗ Not confirmed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Section 3.4 Cleaning data panel ─────────────────────────────────────────

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function CleaningDataPanel({ data }: { data: SectionData['3.4'] | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null

  const { total, issues_count, issues_list, sanitiser_checks, low_temp_list, last_log_date } = data
  const hasAlerts = issues_count > 0 || low_temp_list.length > 0

  return (
    <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <p className="text-slate-600 text-xs font-bold">Cleaning records — review period</p>
          {hasAlerts && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {[issues_count > 0 && `${issues_count} issue${issues_count > 1 ? 's' : ''}`,
                low_temp_list.length > 0 && `${low_temp_list.length} low temp${low_temp_list.length > 1 ? 's' : ''}`
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="px-4 pt-3 pb-4 space-y-4 bg-white">
          {total === 0 ? (
            <p className="text-slate-400 text-xs">No cleaning records in this review period</p>
          ) : (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-slate-900 font-bold text-base">{total}</p>
                  <p className="text-slate-400 text-[10px]">Sessions logged</p>
                </div>
                <div className={`rounded-lg px-3 py-2 text-center ${issues_count > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <p className={`font-bold text-base ${issues_count > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                    {issues_count}
                  </p>
                  <p className="text-slate-400 text-[10px]">Issues flagged</p>
                </div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-slate-900 font-bold text-base">{sanitiser_checks}</p>
                  <p className="text-slate-400 text-[10px]">Sanitiser checks</p>
                </div>
              </div>

              {last_log_date && (
                <p className="text-slate-400 text-[10px]">Last log: {fmtShortDate(last_log_date)}</p>
              )}

              {/* Issues list */}
              {issues_count > 0 && (
                <div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Issues flagged</p>
                  <div className="space-y-1.5">
                    {issues_list.map((r, i) => (
                      <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <p className="text-slate-400 text-[10px]">{fmtShortDate(r.date)}</p>
                        <p className="text-slate-700 text-xs mt-0.5">
                          {r.what_did_you_do ?? 'No action recorded'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Low sanitiser temps */}
              {low_temp_list.length > 0 && (
                <div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
                    Sanitiser below 82°C (CCP limit)
                  </p>
                  <div className="space-y-1.5">
                    {low_temp_list.map((r, i) => (
                      <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
                        <p className="text-slate-400 text-[10px]">{fmtShortDate(r.date)}</p>
                        <p className="text-amber-700 text-xs font-bold">{r.sanitiser_temp_c}°C</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AnnualReviewPage() {
  const [view,      setView]      = useState<'list' | 'editing'>('list')
  const [reviews,   setReviews]   = useState<AnnualReview[]>([])
  const [active,    setActive]    = useState<AnnualReview | null>(null)
  const [users,     setUsers]     = useState<User[]>([])
  const [loading,   setLoading]   = useState(true)
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveErr,   setSaveErr]   = useState('')
  const [flash,     setFlash]     = useState('')
  const [sectionData, setSectionData] = useState<SectionData>({})

  // New review modal
  const [showModal,  setShowModal]  = useState(false)
  const [newYear,    setNewYear]    = useState(defaultYear())
  const [newFrom,    setNewFrom]    = useState(defaultPeriod().from)
  const [newTo,      setNewTo]      = useState(defaultPeriod().to)
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState('')

  // Sign-off
  const [showSignOff,  setShowSignOff]  = useState(false)
  const [approvedBy,   setApprovedBy]   = useState('')
  const [approvedAt,   setApprovedAt]   = useState(new Date().toLocaleDateString('en-CA'))
  const [signingOff,   setSigningOff]   = useState(false)
  const [signOffErr,   setSignOffErr]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const role = document.cookie.split(';').find(c => c.trim().startsWith('mfs_role='))?.split('=')[1]
    setIsAdmin(role === 'admin')

    try {
      const [reviewsRes, usersRes] = await Promise.all([
        fetch('/api/haccp/annual-review').then(r => r.json()),
        fetch('/api/haccp/people').then(r => r.json()),
      ])
      setReviews(reviewsRes.reviews ?? [])
      // Filter to Hakan, Ege, Daz as primary approvers — sort them first
      const priority = ['Hakan', 'Ege', 'Daz']
      const allUsers: User[] = usersRes.team ?? usersRes.users ?? []
      allUsers.sort((a, b) => {
        const ai = priority.indexOf(a.name)
        const bi = priority.indexOf(b.name)
        if (ai >= 0 && bi >= 0) return ai - bi
        if (ai >= 0) return -1
        if (bi >= 0) return 1
        return a.name.localeCompare(b.name)
      })
      setUsers(allUsers)
    } catch (e) {
      console.error('Annual review load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openReview(r: AnnualReview) {
    // Merge any newly added sections into the checklist so they render correctly
    const merged = { ...r.checklist }
    for (const def of REVIEW_SECTIONS) {
      if (!merged[def.key]) {
        merged[def.key] = {
          items: def.items.map(label => ({ label, status: null, notes: '' })),
          section_notes: '',
        }
      }
    }
    setActive({ ...r, checklist: merged })
    setView('editing')
    // Fetch section data with review period dates for period-filtered panels
    const params = new URLSearchParams({
      from: r.review_period_from,
      to:   r.review_period_to,
    })
    fetch(`/api/haccp/annual-review/data?${params}`)
      .then(res => res.ok ? res.json() : {})
      .then(d => setSectionData(d))
      .catch(() => {})
  }

  async function handleCreate() {
    setCreating(true); setCreateErr('')
    try {
      const res = await fetch('/api/haccp/annual-review', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          review_year:        newYear,
          review_period_from: newFrom,
          review_period_to:   newTo,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setCreateErr(d.error ?? 'Failed to create review'); return }
      setShowModal(false)
      setActive(d.review)
      setView('editing')
      await load()
    } catch {
      setCreateErr('Connection error')
    } finally {
      setCreating(false)
    }
  }

  // ── Auto-save checklist ─────────────────────────────────────────────────────

  async function saveChecklist(checklist: Checklist) {
    if (!active) return
    setSaving(true); setSaveErr('')
    const start = Date.now()
    try {
      const res = await fetch('/api/haccp/annual-review', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: active.id, checklist }),
      })
      const d = await res.json()
      if (!res.ok) { setSaveErr(d.error ?? 'Save failed'); return }
      setActive(prev => prev ? { ...prev, checklist, updated_at: d.review.updated_at } : prev)
    } catch {
      setSaveErr('Connection error')
    } finally {
      // Keep "Saving…" visible for at least 600ms so it's readable
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 600 - elapsed)
      setTimeout(() => setSaving(false), remaining)
    }
  }

  // ── Item change handlers ────────────────────────────────────────────────────

  function handleItemChange(sectionKey: string, idx: number, status: ItemStatus, notes: string) {
    if (!active || active.locked) return
    const newChecklist = {
      ...active.checklist,
      [sectionKey]: {
        ...active.checklist[sectionKey],
        items: active.checklist[sectionKey].items.map((item, i) =>
          i === idx ? { ...item, status, notes } : item
        ),
      },
    }
    setActive(prev => prev ? { ...prev, checklist: newChecklist } : prev)
    saveChecklist(newChecklist)
  }

  function handleSectionNotesChange(sectionKey: string, notes: string) {
    if (!active || active.locked) return
    const newChecklist = {
      ...active.checklist,
      [sectionKey]: {
        ...active.checklist[sectionKey],
        section_notes: notes,
      },
    }
    setActive(prev => prev ? { ...prev, checklist: newChecklist } : prev)
    // Debounce section notes — save on blur instead of every keystroke
  }

  async function handleSectionNotesSave(sectionKey: string) {
    if (!active) return
    await saveChecklist(active.checklist)
  }

  // ── Sign-off ────────────────────────────────────────────────────────────────

  async function handleSignOff() {
    if (!active || !approvedBy || !approvedAt) return
    setSigningOff(true); setSignOffErr('')
    try {
      const res = await fetch('/api/haccp/annual-review', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:           active.id,
          checklist:    active.checklist,
          action_plan:  active.action_plan,
          sign_off:     { approved_by: approvedBy, approved_at: approvedAt },
        }),
      })
      const d = await res.json()
      if (!res.ok) { setSignOffErr(d.error ?? 'Sign-off failed'); return }
      setActive(d.review)
      setShowSignOff(false)
      setFlash('Review signed off and locked')
      setTimeout(() => setFlash(''), 3000)
      await load()
    } catch {
      setSignOffErr('Connection error')
    } finally {
      setSigningOff(false)
    }
  }

  // ── Render: list view ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (view === 'list') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
          <Link href="/haccp" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </Link>
          <div className="flex-1">
            <p className="text-slate-900 font-bold text-base">Annual Systems Review</p>
            <p className="text-slate-400 text-xs">SALSA 3.1 · MFS-ASR-001</p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
              + New review
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-3">
          {reviews.length === 0 ? (
            <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
              <p className="text-slate-400 text-sm">No annual reviews yet</p>
              <p className="text-slate-400 text-xs mt-1">Start the first review with the + button above</p>
            </div>
          ) : (
            reviews.map(r => (
              <button key={r.id}
                onClick={() => openReview(r)}
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-left hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-900 font-bold text-sm">{r.review_year}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.locked
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.locked ? 'Signed off' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {fmtDate(r.review_period_from)} → {fmtDate(r.review_period_to)}
                    </p>
                    {r.locked && r.signer && (
                      <p className="text-slate-400 text-[10px] mt-0.5">
                        Signed off by {r.signer.name}
                        {r.approver ? ` · Approved by ${r.approver.name}` : ''}
                      </p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </button>
            ))
          )}
        </div>

        {/* New review modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-3xl px-5 pt-5 pb-8 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-900 font-bold">New annual review</p>
                <button onClick={() => setShowModal(false)} className="text-slate-400 text-sm">Cancel</button>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Review year label</p>
                <input value={newYear} onChange={e => setNewYear(e.target.value)}
                  placeholder="e.g. 2025/26"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Period from</p>
                  <input type="date" value={newFrom} onChange={e => setNewFrom(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Period to</p>
                  <input type="date" value={newTo} onChange={e => setNewTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
                </div>
              </div>
              {createErr && <p className="text-red-600 text-xs">{createErr}</p>}
              <button onClick={handleCreate} disabled={creating || !newYear}
                className="w-full bg-slate-900 text-white text-sm font-bold py-3 rounded-xl disabled:opacity-40">
                {creating ? 'Creating…' : 'Start review'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render: editing view ────────────────────────────────────────────────────

  if (!active) return null

  const totalSections   = REVIEW_SECTIONS.length
  const completedCount  = completedSectionCount(active.checklist)
  const ready           = canSignOff(active.locked, active.checklist)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-blue-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-slate-900 font-bold text-base">{active.review_year}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                active.locked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {active.locked ? 'Signed off' : 'Draft'}
              </span>
            </div>
            <p className="text-slate-400 text-xs">
              {fmtDate(active.review_period_from)} → {fmtDate(active.review_period_to)}
            </p>
          </div>
          <div className="text-right flex items-center gap-2">
            {saving && (
              <span className="text-[10px] font-bold text-orange-500 animate-pulse">Saving…</span>
            )}
            <p className="text-slate-400 text-[10px]">{completedCount}/{totalSections} sections</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2.5 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${totalSections > 0 ? (completedCount / totalSections) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className="mx-5 mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
          <p className="text-green-700 text-xs font-bold">✓ {flash}</p>
        </div>
      )}
      {saveErr && (
        <div className="mx-5 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <p className="text-red-600 text-xs">Auto-save failed: {saveErr}</p>
        </div>
      )}

      <div className="px-5 py-5 space-y-4">

        {/* Render built sections only */}
        {REVIEW_SECTIONS.map(def => {
          const section = active.checklist[def.key]
          if (!section) return null

          // Build data panel content per section
          let dataPanelContent: React.ReactNode = undefined
          if (def.key === '3.2') {
            dataPanelContent = <TrainingDataPanel data={sectionData['3.2']} />
          }
          if (def.key === '3.3') {
            dataPanelContent = <HealthDataPanel data={sectionData['3.3']} />
          }
          if (def.key === '3.4') {
            dataPanelContent = <CleaningDataPanel data={sectionData['3.4']} />
          }

          return (
            <SectionCard
              key={def.key}
              sectionKey={def.key}
              section={section}
              locked={active.locked}
              dataPanelContent={dataPanelContent}
              onItemChange={(idx, status, notes) => handleItemChange(def.key, idx, status, notes)}
              onNotesChange={notes => handleSectionNotesChange(def.key, notes)}
            />
          )
        })}

        {/* Coming soon placeholder for unbuilt sections */}
        {!active.locked && (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-4 text-center">
            <p className="text-slate-400 text-xs">Sections 3.2–3.12 will be added in subsequent phases</p>
          </div>
        )}

        {/* Sign-off section */}
        {!active.locked && isAdmin && (
          <div className={`bg-white border rounded-xl px-4 py-4 ${ready ? 'border-green-200' : 'border-slate-200'}`}>
            <p className="text-slate-900 font-bold text-sm mb-1">Sign off review</p>
            <p className="text-slate-400 text-xs mb-3">
              {ready
                ? 'All sections complete — ready to sign off.'
                : `Complete all ${totalSections} sections before signing off (${completedCount}/${totalSections} done).`}
            </p>
            {ready && !showSignOff && (
              <button onClick={() => setShowSignOff(true)}
                className="w-full bg-slate-900 text-white text-sm font-bold py-3 rounded-xl">
                Sign off
              </button>
            )}
            {ready && showSignOff && (
              <div className="space-y-3">
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Approved by</p>
                  <select value={approvedBy} onChange={e => setApprovedBy(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400">
                    <option value="">Select approver…</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Approved date</p>
                  <input type="date" value={approvedAt} onChange={e => setApprovedAt(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
                </div>
                {signOffErr && <p className="text-red-600 text-xs">{signOffErr}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setShowSignOff(false)}
                    className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">
                    Cancel
                  </button>
                  <button onClick={handleSignOff} disabled={signingOff || !approvedBy || !approvedAt}
                    className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40">
                    {signingOff ? 'Signing off…' : 'Confirm sign-off'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Locked sign-off record */}
        {active.locked && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4">
            <p className="text-green-700 text-xs font-bold uppercase tracking-widest mb-1">Review signed off</p>
            {active.signer && (
              <p className="text-slate-600 text-xs">Reviewed by: {active.signer.name}</p>
            )}
            {active.approver && (
              <p className="text-slate-600 text-xs">Approved by: {active.approver.name}</p>
            )}
            {active.signed_off_at && (
              <p className="text-slate-500 text-[10px] mt-1">{fmtDate(active.signed_off_at)}</p>
            )}
            <p className="text-slate-400 text-[10px] mt-2">SALSA 3.1 · MFS-ASR-001</p>
          </div>
        )}
      </div>
    </div>
  )
}
