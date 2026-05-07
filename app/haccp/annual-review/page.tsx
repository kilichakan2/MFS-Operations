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
  '3.6'?: {
    calibration: {
      thermometer_id:          string
      calibration_mode:        string
      date:                    string
      cert_reference:          string | null
      ice_water_result_c:      number | null
      ice_water_pass:          boolean | null
      boiling_water_result_c:  number | null
      boiling_water_pass:      boolean | null
    }[]
    cold_storage: {
      name:          string
      unit_type:     string
      target_temp_c: number
      max_temp_c:    number
      latest:        { temperature_c: number; temp_status: string; date: string; session: string } | null
    }[]
    delivery_temps: {
      total:    number
      pass:     number
      urgent:   number
      fail:     number
      temp_cas: number
    }
  }
  '3.7'?: {
    supplier_stats: {
      total:             number
      formally_approved: number
      fsa_approved:      number
      expired_certs:     number
      expiring_60_days:  number
    }
    spec_stats: {
      total:      number
      review_due: number
    }
    goods_in: {
      total:             number
      has_batch:         number
      meat_total:        number
      meat_bls_complete: number
    }
  }
  '3.8'?: {
    ca_stats: {
      total_open:     number
      total_resolved: number
      in_period:      number
      open_by_source: { source: string; count: number }[]
    }
    returns_stats: {
      total:   number
      by_code: { code: string; label: string; count: number }[]
    }
    complaints_stats: {
      total:    number
      open:     number
      resolved: number
    }
  }
  '3.9'?: {
    food_fraud: {
      exists: boolean; version: string | null
      issue_date: string | null; next_review: string | null; review_due: boolean
    }
    food_defence: {
      exists: boolean; version: string | null
      issue_date: string | null; next_review: string | null; review_due: boolean
    }
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

// ─── Section 3.6 Temperature Control data panel ───────────────────────────────

function TempControlDataPanel({ data }: { data: SectionData['3.6'] | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null

  const { calibration, cold_storage, delivery_temps } = data

  // Derive alert state
  const calibFails  = calibration.filter(r =>
    r.calibration_mode === 'manual' && (r.ice_water_pass === false || r.boiling_water_pass === false)
  )
  const today       = new Date(); today.setHours(0, 0, 0, 0)
  const staleCalib  = calibration.filter(r => {
    const days = Math.floor((today.getTime() - new Date(r.date).getTime()) / 86_400_000)
    return days > 31
  })
  const coldFails   = cold_storage.filter(r => r.latest && r.latest.temp_status !== 'pass')
  const hasAlerts   = calibFails.length > 0 || staleCalib.length > 0 || coldFails.length > 0 || delivery_temps.temp_cas > 0

  const alertParts = [
    calibFails.length  > 0 && `${calibFails.length} probe fail${calibFails.length > 1 ? 's' : ''}`,
    staleCalib.length  > 0 && `${staleCalib.length} probe${staleCalib.length > 1 ? 's' : ''} overdue`,
    coldFails.length   > 0 && `${coldFails.length} unit${coldFails.length > 1 ? 's' : ''} off-temp`,
    delivery_temps.temp_cas > 0 && `${delivery_temps.temp_cas} delivery deviation${delivery_temps.temp_cas > 1 ? 's' : ''}`,
  ].filter(Boolean)

  return (
    <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
          </svg>
          <p className="text-slate-600 text-xs font-bold">Temperature records</p>
          {hasAlerts && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {alertParts.join(' · ')}
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

          {/* Calibration */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Thermometer calibration
            </p>
            {calibration.length === 0 ? (
              <p className="text-slate-400 text-xs">No calibration records found</p>
            ) : (
              <div className="space-y-1.5">
                {calibration.map((r, i) => {
                  const isCert   = r.calibration_mode === 'certified_probe'
                  const manFail  = !isCert && (r.ice_water_pass === false || r.boiling_water_pass === false)
                  const days     = Math.floor((today.getTime() - new Date(r.date).getTime()) / 86_400_000)
                  const stale    = days > 31
                  return (
                    <div key={i} className={`rounded-lg px-3 py-2 border ${manFail ? 'bg-red-50 border-red-200' : stale ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-slate-800 text-xs font-semibold">{r.thermometer_id}</p>
                          {isCert ? (
                            <p className="text-slate-500 text-[10px]">Certified probe · Ref: {r.cert_reference ?? '—'}</p>
                          ) : (
                            <p className="text-slate-500 text-[10px]">
                              Ice {r.ice_water_result_c}°C {r.ice_water_pass ? '✓' : '✗'}
                              {' · '}
                              Boiling {r.boiling_water_result_c}°C {r.boiling_water_pass ? '✓' : '✗'}
                            </p>
                          )}
                          <p className="text-slate-400 text-[10px]">
                            {fmtShortDate(r.date)} · {days === 0 ? 'today' : `${days}d ago`}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold flex-shrink-0 ${manFail ? 'text-red-600' : stale ? 'text-amber-600' : 'text-green-700'}`}>
                          {manFail ? '✗ Fail' : stale ? '⚠ Overdue' : isCert ? '✓ Certified' : '✓ Pass'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Cold storage */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Cold storage — current state
            </p>
            {cold_storage.length === 0 ? (
              <p className="text-slate-400 text-xs">No storage units found</p>
            ) : (
              <div className="space-y-1.5">
                {cold_storage.map((u, i) => {
                  const isFail = u.latest && u.latest.temp_status !== 'pass'
                  return (
                    <div key={i} className={`rounded-lg px-3 py-2 border ${isFail ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-slate-800 text-xs font-semibold">{u.name}</p>
                          <p className="text-slate-400 text-[10px]">
                            {u.unit_type === 'freezer' ? 'Freezer' : 'Chiller'}
                            {' · '}target {u.target_temp_c}°C · max {u.max_temp_c}°C
                          </p>
                          {u.latest && (
                            <p className="text-slate-400 text-[10px]">
                              Last: {fmtShortDate(u.latest.date)} {u.latest.session}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {u.latest ? (
                            <>
                              <p className={`text-sm font-bold ${isFail ? 'text-red-600' : 'text-green-700'}`}>
                                {u.latest.temperature_c}°C
                              </p>
                              <p className={`text-[10px] font-bold ${isFail ? 'text-red-600' : 'text-green-700'}`}>
                                {isFail ? '✗ ' : '✓ '}{u.latest.temp_status}
                              </p>
                            </>
                          ) : (
                            <p className="text-amber-500 text-[10px] font-bold">No reading</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Delivery temps */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Delivery temperature checks — review period
            </p>
            {delivery_temps.total === 0 ? (
              <p className="text-slate-400 text-xs">No delivery temperature checks in this period</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Checked', value: delivery_temps.total, colour: 'text-slate-900' },
                  { label: 'Pass',    value: delivery_temps.pass,   colour: 'text-green-700' },
                  { label: 'Urgent',  value: delivery_temps.urgent, colour: delivery_temps.urgent > 0 ? 'text-amber-600' : 'text-slate-400' },
                  { label: 'Fail',    value: delivery_temps.fail,   colour: delivery_temps.fail > 0   ? 'text-red-600'   : 'text-slate-400' },
                ].map(({ label, value, colour }) => (
                  <div key={label} className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                    <p className={`font-bold text-sm ${colour}`}>{value}</p>
                    <p className="text-slate-400 text-[10px]">{label}</p>
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

// ─── Section 3.7 Supplier & Traceability data panel ──────────────────────────

function SupplierDataPanel({ data }: { data: SectionData['3.7'] | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null

  const { supplier_stats: s, spec_stats: sp, goods_in: g } = data

  const approvalGap    = s.total - s.formally_approved
  const blsIncomplete  = g.meat_total > 0 && g.meat_bls_complete < g.meat_total
  const hasAlerts      = approvalGap > 0 || s.expired_certs > 0 || s.expiring_60_days > 0
                       || blsIncomplete || sp.review_due > 0

  const alertParts = [
    approvalGap > 0       && `${approvalGap} supplier${approvalGap > 1 ? 's' : ''} not approved`,
    s.expired_certs > 0   && `${s.expired_certs} expired cert${s.expired_certs > 1 ? 's' : ''}`,
    s.expiring_60_days > 0 && `${s.expiring_60_days} expiring soon`,
    blsIncomplete          && 'BLS incomplete',
    sp.review_due > 0      && `${sp.review_due} spec${sp.review_due > 1 ? 's' : ''} review due`,
  ].filter(Boolean)

  const Stat = ({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) => (
    <div className={`rounded-lg px-3 py-2 ${alert ? 'bg-amber-50' : 'bg-slate-50'}`}>
      <p className={`font-bold text-sm ${alert ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
      <p className="text-slate-400 text-[10px]">{label}</p>
    </div>
  )

  return (
    <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p className="text-slate-600 text-xs font-bold">Supplier register &amp; goods-in</p>
          {hasAlerts && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {alertParts.join(' · ')}
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

          {/* Supplier register */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Supplier register — current state
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Active suppliers"       value={s.total} />
              <Stat label="Formally approved"      value={`${s.formally_approved}/${s.total}`} alert={s.formally_approved < s.total} />
              <Stat label="FSA approved"           value={s.fsa_approved} />
              <Stat label="Expired certs"          value={s.expired_certs}    alert={s.expired_certs > 0} />
              <Stat label="Expiring ≤60 days"      value={s.expiring_60_days} alert={s.expiring_60_days > 0} />
            </div>
            {s.formally_approved < s.total && (
              <p className="text-amber-600 text-[10px] mt-1.5">
                ⚠ {approvalGap} supplier{approvalGap > 1 ? 's' : ''} missing approval date — set in Admin → Suppliers
              </p>
            )}
          </div>

          {/* Product specs */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Product specifications (BSD 1.6.2)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Specs on file"  value={sp.total} alert={sp.total === 0} />
              <Stat label="Review due"     value={sp.review_due} alert={sp.review_due > 0} />
            </div>
            {sp.total === 0 && (
              <p className="text-amber-600 text-[10px] mt-1.5">⚠ No product specs on file — add via Product Specs tile</p>
            )}
          </div>

          {/* Goods-in */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Goods-in — review period
            </p>
            {g.total === 0 ? (
              <p className="text-slate-400 text-xs">No deliveries in this review period</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Total deliveries"   value={g.total} />
                <Stat label="With batch number"  value={`${g.has_batch}/${g.total}`}
                  alert={g.has_batch < g.total} />
                <Stat label="Meat deliveries"    value={g.meat_total} />
                <Stat label="BLS complete"       value={g.meat_total > 0 ? `${g.meat_bls_complete}/${g.meat_total}` : '—'}
                  alert={blsIncomplete} />
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Section 3.8 Incidents & Complaints data panel ───────────────────────────

function IncidentsDataPanel({ data }: { data: SectionData['3.8'] | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null

  const { ca_stats: ca, returns_stats: ret, complaints_stats: comp } = data
  const hasAlerts = ca.total_open > 0 || comp.open > 0

  const alertParts = [
    ca.total_open > 0   && `${ca.total_open} open CA${ca.total_open > 1 ? 's' : ''}`,
    comp.open > 0       && `${comp.open} open complaint${comp.open > 1 ? 's' : ''}`,
  ].filter(Boolean)

  return (
    <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-slate-600 text-xs font-bold">Incidents, CAs &amp; complaints</p>
          {hasAlerts && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {alertParts.join(' · ')}
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

          {/* Corrective actions */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Corrective actions
            </p>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className={`rounded-lg px-3 py-2 text-center ${ca.total_open > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                <p className={`font-bold text-sm ${ca.total_open > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{ca.total_open}</p>
                <p className="text-slate-400 text-[10px]">Open (all time)</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                <p className="text-green-700 font-bold text-sm">{ca.total_resolved}</p>
                <p className="text-slate-400 text-[10px]">Resolved</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                <p className="text-slate-900 font-bold text-sm">{ca.in_period}</p>
                <p className="text-slate-400 text-[10px]">Raised in period</p>
              </div>
            </div>
            {ca.open_by_source.length > 0 && (
              <div className="space-y-1">
                <p className="text-slate-400 text-[10px] font-semibold">Open by area:</p>
                {ca.open_by_source.map(s => (
                  <div key={s.source} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-1.5">
                    <p className="text-slate-700 text-xs">{s.source}</p>
                    <p className="text-amber-700 text-xs font-bold">{s.count}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Returns */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Returns — review period
            </p>
            {ret.total === 0 ? (
              <p className="text-slate-400 text-xs">No returns in this period</p>
            ) : (
              <div className="space-y-1">
                {ret.by_code.map(r => (
                  <div key={r.code} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                    <p className="text-slate-700 text-xs">{r.label} <span className="text-slate-400">({r.code})</span></p>
                    <p className="text-slate-900 text-xs font-bold">{r.count}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-1">
                  <p className="text-slate-500 text-xs font-semibold">Total</p>
                  <p className="text-slate-900 text-xs font-bold">{ret.total}</p>
                </div>
              </div>
            )}
          </div>

          {/* Complaints */}
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              Complaints — review period
            </p>
            {comp.total === 0 ? (
              <p className="text-slate-400 text-xs">No complaints in this period</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-slate-900 font-bold text-sm">{comp.total}</p>
                  <p className="text-slate-400 text-[10px]">Total</p>
                </div>
                <div className={`rounded-lg px-3 py-2 text-center ${comp.open > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <p className={`font-bold text-sm ${comp.open > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{comp.open}</p>
                  <p className="text-slate-400 text-[10px]">Open</p>
                </div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-green-700 font-bold text-sm">{comp.resolved}</p>
                  <p className="text-slate-400 text-[10px]">Resolved</p>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Section 3.9 Food Fraud & Food Defence data panel ────────────────────────

function FoodFraudDefencePanel({ data }: { data: SectionData['3.9'] | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null

  const { food_fraud: ff, food_defence: fd } = data
  const hasAlerts = ff.review_due || !ff.exists || fd.review_due || !fd.exists

  const alertParts = [
    !ff.exists           && 'Fraud assessment missing',
    ff.exists && ff.review_due  && 'Fraud review due',
    !fd.exists           && 'Defence plan missing',
    fd.exists && fd.review_due  && 'Defence review due',
  ].filter(Boolean)

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function DocCard({
    label, docRef, d,
  }: {
    label: string
    docRef: string
    d: { exists: boolean; version: string | null; issue_date: string | null; next_review: string | null; review_due: boolean }
  }) {
    if (!d.exists) return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <p className="text-red-700 text-xs font-bold">{label}</p>
        <p className="text-red-600 text-[10px] mt-0.5">{docRef} — not on file</p>
      </div>
    )
    return (
      <div className={`border rounded-xl px-4 py-3 ${d.review_due ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-slate-800 text-xs font-bold">{label}</p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${d.review_due ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
            {d.review_due ? 'Review due' : 'Current'}
          </span>
        </div>
        <p className="text-slate-500 text-[10px]">{docRef} · {d.version}</p>
        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
          <div><p className="text-slate-400">Issued</p><p className="font-semibold text-slate-700">{fmtDate(d.issue_date)}</p></div>
          <div><p className="text-slate-400">Next review</p><p className={`font-semibold ${d.review_due ? 'text-amber-700' : 'text-slate-700'}`}>{fmtDate(d.next_review)}</p></div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p className="text-slate-600 text-xs font-bold">Food fraud &amp; food defence documents</p>
          {hasAlerts && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {alertParts.join(' · ')}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="px-4 pt-3 pb-4 space-y-3 bg-white">
          <DocCard label="Food Fraud Risk Assessment" docRef="MFS-FFRA-001" d={ff} />
          <DocCard label="Food Defence Plan"          docRef="MFS-FDP-001"  d={fd} />
          <p className="text-slate-400 text-[10px]">
            Items 3 &amp; 4 (site security, cyber security) are covered within the Food Defence Plan.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Section 4: Action Plan ───────────────────────────────────────────────────

function ActionPlanSection({
  items, locked, onChange,
}: {
  items:    ActionPlanItem[]
  locked:   boolean
  onChange: (items: ActionPlanItem[]) => void
}) {
  // Normalise to exactly 6 rows
  const rows: ActionPlanItem[] = Array.from({ length: 6 }, (_, i) => (
    items[i] ?? { ref: i + 1, action: '', owner: '', due_date: '', status: 'open' }
  ))

  function updateRow(idx: number, field: keyof ActionPlanItem, value: string) {
    const updated = rows.map((r, i) =>
      i === idx ? { ...r, [field]: value } : r
    )
    onChange(updated)
  }

  function toggleStatus(idx: number) {
    const updated = rows.map((r, i) =>
      i === idx ? { ...r, status: r.status === 'open' ? 'complete' as const : 'open' as const } : r
    )
    onChange(updated)
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:text-slate-400'

  return (
    <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-slate-900 font-bold text-sm">4. Action Plan</p>
        <p className="text-slate-400 text-xs mt-0.5">Record actions identified during this review</p>
      </div>

      <div className="divide-y divide-slate-50">
        {rows.map((row, idx) => (
          <div key={idx} className="px-4 py-3">
            <div className="flex items-start gap-3">
              {/* Ref number */}
              <span className="text-slate-400 text-xs font-bold w-4 flex-shrink-0 mt-1.5">{idx + 1}</span>

              <div className="flex-1 space-y-2">
                {/* Action required */}
                {locked ? (
                  <p className="text-slate-700 text-xs">{row.action || '—'}</p>
                ) : (
                  <textarea
                    value={row.action}
                    onChange={e => updateRow(idx, 'action', e.target.value)}
                    placeholder="Describe action required…"
                    rows={2}
                    className={inputCls + ' resize-none'}
                  />
                )}

                <div className="grid grid-cols-3 gap-2">
                  {/* Owner */}
                  <div>
                    <p className="text-slate-400 text-[10px] mb-0.5">Owner</p>
                    {locked ? (
                      <p className="text-slate-700 text-xs">{row.owner || '—'}</p>
                    ) : (
                      <input
                        value={row.owner}
                        onChange={e => updateRow(idx, 'owner', e.target.value)}
                        placeholder="Name"
                        className={inputCls}
                      />
                    )}
                  </div>

                  {/* Due date */}
                  <div>
                    <p className="text-slate-400 text-[10px] mb-0.5">Due date</p>
                    {locked ? (
                      <p className="text-slate-700 text-xs">
                        {row.due_date ? new Date(row.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    ) : (
                      <input
                        type="date"
                        value={row.due_date}
                        onChange={e => updateRow(idx, 'due_date', e.target.value)}
                        className={inputCls}
                      />
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-slate-400 text-[10px] mb-0.5">Status</p>
                    {locked ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        row.status === 'complete' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {row.status === 'complete' ? 'Complete' : 'Open'}
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleStatus(idx)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                          row.status === 'complete'
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-white text-slate-500 border-slate-200'
                        }`}
                      >
                        {row.status === 'complete' ? '✓ Complete' : 'Open'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
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
        fetch('/api/haccp/users').then(r => r.json()),
      ])
      setReviews(reviewsRes.reviews ?? [])
      const priority = ['Hakan', 'Ege', 'Daz']
      const allUsers: User[] = usersRes.users ?? []
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

  // ── Action plan ─────────────────────────────────────────────────────────────

  function handleActionPlanChange(items: ActionPlanItem[]) {
    if (!active || active.locked) return
    setActive(prev => prev ? { ...prev, action_plan: items } : prev)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch(`/api/haccp/annual-review`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: active.id, action_plan: items }),
        })
        if (!res.ok) setSaveErr('Auto-save failed')
        else setSaveErr('')
      } catch { setSaveErr('Auto-save failed') }
      finally { setSaving(false) }
    }, 800)
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
          <button onClick={() => { setView('list'); load() }} className="text-slate-400 hover:text-slate-600">
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
          if (def.key === '3.2') dataPanelContent = <TrainingDataPanel    data={sectionData['3.2']} />
          if (def.key === '3.3') dataPanelContent = <HealthDataPanel      data={sectionData['3.3']} />
          if (def.key === '3.4') dataPanelContent = <CleaningDataPanel    data={sectionData['3.4']} />
          if (def.key === '3.6') dataPanelContent = <TempControlDataPanel data={sectionData['3.6']} />
          if (def.key === '3.7') dataPanelContent = <SupplierDataPanel      data={sectionData['3.7']} />
          if (def.key === '3.8') dataPanelContent = <IncidentsDataPanel     data={sectionData['3.8']} />
          if (def.key === '3.9') dataPanelContent = <FoodFraudDefencePanel  data={sectionData['3.9']} />
          if (def.key === '3.10') dataPanelContent = (
            <div className="mb-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-blue-700 text-xs">
                <span className="font-bold">Water testing: </span>
                Paper records maintained on site. Present to auditor on request.
              </p>
            </div>
          )

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

        {/* Action Plan — Section 4 */}
        <ActionPlanSection
          items={active.action_plan}
          locked={active.locked}
          onChange={handleActionPlanChange}
        />

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
