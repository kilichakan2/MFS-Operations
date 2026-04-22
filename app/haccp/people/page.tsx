/**
 * app/haccp/people/page.tsx
 * People — Health Declarations, Return to Work, Visitor Log
 * Source: MFS Health Monitoring Forms V1.0
 * Reg 852/2004 Annex II Ch VIII
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthRecord {
  id:                    string
  record_type:           string
  date:                  string
  staff_name:            string | null
  visitor_name:          string | null
  visitor_company:       string | null
  fit_for_work:          boolean
  health_questions:      Record<string, boolean | string> | null
  exclusion_reason:      string | null
  illness_type:          string | null
  absence_from:          string | null
  absence_to:            string | null
  submitted_at:          string
  users:                 { name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MANAGER_PRESETS = ['Hakan', 'Ege']

// Health declaration — 4 exclusion questions (any YES = send home)
const EXCLUSION_QUESTIONS = [
  { id: 'dv',       label: 'Do you have, or have you recently had, diarrhoea or vomiting?' },
  { id: 'wounds',   label: 'Do you have any open cuts or wounds?' },
  { id: 'jaundice', label: 'Do you have jaundice (yellowing of skin or eyes)?' },
  { id: 'skin',     label: 'Do you have any skin infections or rashes?' },
]

// Health declaration — secondary questions
const SECONDARY_QUESTIONS = [
  { id: 'doctors_note',    label: 'Has a doctor\'s note been provided?' },
  { id: 'antibiotics',     label: 'Are you currently taking antibiotics?' },
  { id: 'hygiene_aware',   label: 'Do you understand the importance of good hygiene, especially good handwashing procedures?' },
]

// Return to work — illness-specific checklists
const RTW_GI_CHECKS = [
  { id: 'symptom_free_48h',  label: 'Staff confirms: NO symptoms for a full 48 hours' },
  { id: 'medical_cert',      label: 'Symptoms persisted >5 days: Medical certificate provided' },
]

const RTW_OTHER_CHECKS = [
  { id: 'symptom_resolution', label: 'Staff confirmed symptom resolution' },
  { id: 'no_fever',           label: 'No fever (temperature normal)' },
  { id: 'wellbeing',          label: 'General wellbeing restored' },
]

const RTW_SERIOUS_CHECKS = [
  { id: 'medical_cert',     label: 'Medical certificate attached' },
  { id: 'gp_clearance',     label: 'GP / Occupational health clearance confirmed' },
]

// Visitor — 9 health questions (Q9 = understanding, not an exclusion)
const VISITOR_QUESTIONS = [
  { id: 'vq1', label: 'In the past 24 hours, have you suffered from sickness, vomiting or diarrhoea?' },
  { id: 'vq2', label: 'Do you have any conditions of the skin, hands, arms or face?' },
  { id: 'vq3', label: 'Are you suffering from boils, sties or a septic finger?' },
  { id: 'vq4', label: 'Do you suffer from discharge from eyes, ears, gums or throat?' },
  { id: 'vq5', label: 'Are you suffering from a heavy cold or flu?' },
  { id: 'vq6', label: 'Have you been in contact with anyone suffering from enteric fever (e.g. Typhoid, Paratyphoid or Hepatitis)?' },
  { id: 'vq7', label: 'Do you have any allergies?' },
  { id: 'vq8', label: 'Are you required to carry medicines we should be aware of?' },
  { id: 'vq9', label: 'Do you understand all of the above?' },
]

// Visitor — declaration checklist (all must be confirmed)
const VISITOR_DECLARATION = [
  { id: 'vd1', label: 'I am not suffering from any infection and know of no reason why I should not enter the facility' },
  { id: 'vd2', label: 'I have removed all jewellery and watches' },
  { id: 'vd3', label: 'My tools and equipment are clean and free from contamination' },
  { id: 'vd4', label: 'My oils, greases and lubricants are food grade and allergen free' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function YNButton({ value, onChange, redOnYes = false }: {
  value: boolean | null; onChange: (v: boolean) => void; redOnYes?: boolean
}) {
  return (
    <div className="flex gap-2">
      {([true, false] as const).map((v) => {
        const isYes    = v === true
        const selected = value === v
        const danger   = selected && isYes && redOnYes
        return (
          <button key={String(v)} type="button"
            onPointerDown={(e) => { e.preventDefault(); onChange(v) }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold border-2 transition-all active:scale-95 ${
              selected
                ? danger
                  ? 'border-red-500 bg-red-100 text-red-700'
                  : isYes
                    ? 'border-green-500 bg-green-100 text-green-700'
                    : 'border-slate-400 bg-slate-100 text-slate-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}>
            {isYes ? 'YES' : 'NO'}
          </button>
        )
      })}
    </div>
  )
}

function ManagerSignOff({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isOther = value !== '' && !MANAGER_PRESETS.includes(value)
  return (
    <div>
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Authorised by (manager)</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {MANAGER_PRESETS.map((name) => (
          <button key={name} type="button"
            onPointerDown={(e) => { e.preventDefault(); onChange(name) }}
            className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
              value === name ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-slate-300 bg-white text-slate-400'
            }`}>{name}</button>
        ))}
        <button type="button"
          onPointerDown={(e) => { e.preventDefault(); if (!isOther) onChange('') }}
          className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
            isOther ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-slate-300 bg-white text-slate-400'
          }`}>Other</button>
      </div>
      {(value === '' || isOther) && (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="Enter manager name…"
          className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
      )}
    </div>
  )
}

// ─── Tab 1: Health Declaration (New Starter) ──────────────────────────────────

function HealthDeclarationTab({ onSubmitted }: { onSubmitted: () => void }) {
  const [staffName,     setStaffName]     = useState('')
  const [startDate,     setStartDate]     = useState('')
  const [exclusionQ,    setExclusionQ]    = useState<Record<string, boolean | null>>(
    Object.fromEntries(EXCLUSION_QUESTIONS.map(q => [q.id, null]))
  )
  const [symptomTiming, setSymptomTiming] = useState<string | null>(null)
  const [secondaryQ,    setSecondaryQ]    = useState<Record<string, boolean | null>>(
    Object.fromEntries(SECONDARY_QUESTIONS.map(q => [q.id, null]))
  )
  const [manager,       setManager]       = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')

  const anyExclusionYes = Object.values(exclusionQ).some(v => v === true)
  const lessThan2Days   = anyExclusionYes && symptomTiming === 'less2'
  const sendHome        = anyExclusionYes && (lessThan2Days || symptomTiming === null)
  const fitForWork      = !anyExclusionYes || (symptomTiming === 'more2')

  const allExclusionAnswered = EXCLUSION_QUESTIONS.every(q => exclusionQ[q.id] !== null)
  const symptomAnswered      = !anyExclusionYes || symptomTiming !== null
  const allSecondaryAnswered = SECONDARY_QUESTIONS.every(q => secondaryQ[q.id] !== null)
  const isValid = staffName.trim() && startDate && allExclusionAnswered && symptomAnswered && allSecondaryAnswered && manager.trim()

  async function handleSubmit() {
    if (!isValid || submitting) return
    setSubmitting(true); setError('')
    try {
      const questions = {
        ...Object.fromEntries(EXCLUSION_QUESTIONS.map(q => [q.id, exclusionQ[q.id]])),
        symptom_timing: symptomTiming,
        ...Object.fromEntries(SECONDARY_QUESTIONS.map(q => [q.id, secondaryQ[q.id]])),
      }
      const res = await fetch('/api/haccp/people', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_type: 'health_declaration',
          staff_name: staffName, start_date: startDate,
          health_questions: questions,
          fit_for_work: fitForWork,
          exclusion_reason: anyExclusionYes ? `Symptom timing: ${symptomTiming}` : null,
          manager_signed_by: manager,
        }),
      })
      if (res.ok) {
        onSubmitted()
        setStaffName(''); setStartDate(''); setManager(''); setSymptomTiming(null)
        setExclusionQ(Object.fromEntries(EXCLUSION_QUESTIONS.map(q => [q.id, null])))
        setSecondaryQ(Object.fromEntries(SECONDARY_QUESTIONS.map(q => [q.id, null])))
      } else {
        const d = await res.json(); setError(d.error ?? 'Submission failed')
      }
    } catch { setError('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        <p className="text-amber-800 text-xs leading-relaxed">This form must be completed before a new staff member handles food on their first shift. Reg 852/2004 Annex II Ch VIII.</p>
      </div>

      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-slate-900 font-semibold text-sm">Staff Health Declaration</p>
          <p className="text-slate-400 text-xs mt-0.5">Before first shift — new starter</p>
        </div>
        <div className="px-4 py-4 space-y-5">

          {/* Staff name */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Staff name</p>
            <input type="text" value={staffName} onChange={e => setStaffName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          {/* Start date */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Start date</p>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          {/* Exclusion questions */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">Mandatory health questions</p>
            <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
              {EXCLUSION_QUESTIONS.map((q, i) => (
                <div key={q.id} className={`px-4 py-3 border-b border-slate-100 last:border-0 flex items-start justify-between gap-4 ${exclusionQ[q.id] === true ? 'bg-red-50' : exclusionQ[q.id] === false ? 'bg-green-50' : 'bg-white'}`}>
                  <p className="text-slate-700 text-xs leading-relaxed flex-1">{i + 1}. {q.label}</p>
                  <YNButton redOnYes value={exclusionQ[q.id] as boolean | null}
                    onChange={v => setExclusionQ(prev => ({ ...prev, [q.id]: v }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Exclusion warning */}
          {anyExclusionYes && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
              <p className="text-red-700 text-xs font-bold uppercase tracking-widest mb-2">Possible exclusion — symptom timing</p>
              <p className="text-slate-600 text-xs mb-3">When did the employee last have these symptoms?</p>
              <div className="flex gap-3">
                {[
                  { val: 'more2', label: 'More than 2 days ago' },
                  { val: 'less2', label: 'Less than 2 days ago' },
                ].map(opt => (
                  <button key={opt.val} type="button"
                    onPointerDown={e => { e.preventDefault(); setSymptomTiming(opt.val) }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                      symptomTiming === opt.val
                        ? opt.val === 'less2' ? 'border-red-500 bg-red-100 text-red-700' : 'border-green-500 bg-green-100 text-green-700'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}>{opt.label}</button>
                ))}
              </div>
              {lessThan2Days && (
                <div className="mt-3 bg-red-100 border border-red-400 rounded-xl px-4 py-3">
                  <p className="text-red-700 text-xs font-bold">Send home immediately — 48 hour rule not met</p>
                </div>
              )}
              {symptomTiming === 'more2' && (
                <p className="text-green-600 text-xs font-bold mt-2">Symptoms resolved — may proceed with caution</p>
              )}
            </div>
          )}

          {/* Secondary questions */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">Additional questions</p>
            <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
              {SECONDARY_QUESTIONS.map((q, i) => (
                <div key={q.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex items-start justify-between gap-4 bg-white">
                  <p className="text-slate-700 text-xs leading-relaxed flex-1">{q.label}</p>
                  <YNButton value={secondaryQ[q.id] as boolean | null}
                    onChange={v => setSecondaryQ(prev => ({ ...prev, [q.id]: v }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Manager sign-off */}
          <ManagerSignOff value={manager} onChange={setManager} />

          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>

        <button onClick={handleSubmit} disabled={!isValid || submitting || sendHome}
          className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
          {submitting
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              {sendHome ? 'Cannot submit — staff must be sent home' : 'Submit health declaration'}</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── Tab 2: Return to Work ────────────────────────────────────────────────────

function ReturnToWorkTab({ onSubmitted }: { onSubmitted: () => void }) {
  const [staffName,   setStaffName]   = useState('')
  const [absenceFrom, setAbsenceFrom] = useState('')
  const [absenceTo,   setAbsenceTo]   = useState('')
  const [illnessType, setIllnessType] = useState<string>('')
  const [checks,      setChecks]      = useState<Record<string, boolean>>({})
  const [manager,     setManager]     = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')

  function toggleCheck(id: string) { setChecks(p => ({ ...p, [id]: !p[id] })) }

  const checkItems = illnessType === 'gi'      ? RTW_GI_CHECKS
                   : illnessType === 'other'   ? RTW_OTHER_CHECKS
                   : illnessType === 'serious' ? RTW_SERIOUS_CHECKS
                   : []

  const isValid = staffName.trim() && illnessType && manager.trim() &&
    (checkItems.length === 0 || checkItems.every(c => checks[c.id]))

  async function handleSubmit() {
    if (!isValid || submitting) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/haccp/people', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_type: 'return_to_work',
          staff_name: staffName, absence_from: absenceFrom || null,
          absence_to: absenceTo || null, illness_type: illnessType,
          health_questions: checks,
          symptom_free_48h:             illnessType === 'gi' ? (checks['symptom_free_48h'] ?? false) : null,
          medical_certificate_provided: (checks['medical_cert'] ?? false),
          manager_signed_by: manager,
        }),
      })
      if (res.ok) {
        onSubmitted()
        setStaffName(''); setAbsenceFrom(''); setAbsenceTo('')
        setIllnessType(''); setChecks({}); setManager('')
      } else {
        const d = await res.json(); setError(d.error ?? 'Submission failed')
      }
    } catch { setError('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-slate-900 font-semibold text-sm">Return to Work Certificate</p>
          <p className="text-slate-400 text-xs mt-0.5">Complete on the day the staff member returns</p>
        </div>
        <div className="px-4 py-4 space-y-5">

          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Staff name</p>
            <input type="text" value={staffName} onChange={e => setStaffName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Absence from</p>
              <input type="date" value={absenceFrom} onChange={e => setAbsenceFrom(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Absence to</p>
              <input type="date" value={absenceTo} onChange={e => setAbsenceTo(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>
          </div>

          {/* Illness type */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Reason for absence</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'gi',      label: 'Gastrointestinal',     sub: 'D&V / nausea' },
                { val: 'other',   label: 'Other illness',        sub: 'Cold / fever' },
                { val: 'serious', label: 'Serious / hospitalised', sub: '>7 days' },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onPointerDown={e => { e.preventDefault(); setIllnessType(opt.val); setChecks({}) }}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border-2 transition-all text-center ${
                    illnessType === opt.val ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'
                  }`}>
                  {opt.label}
                  <span className="block text-[10px] font-normal opacity-70 mt-0.5">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Illness-specific checklist */}
          {illnessType && checkItems.length > 0 && (
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Return criteria — all must be confirmed</p>
              {illnessType === 'gi' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2">
                  <p className="text-amber-800 text-xs font-bold">GI illness: 48-hour symptom-free rule applies</p>
                  <p className="text-slate-600 text-xs mt-0.5">Staff must be completely free of D&V for a minimum 48 hours before returning to food handling.</p>
                </div>
              )}
              <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
                {checkItems.map(c => (
                  <button key={c.id} type="button" onClick={() => toggleCheck(c.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-100 last:border-0 transition-all ${checks[c.id] ? 'bg-green-50' : 'bg-white hover:bg-slate-50'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${checks[c.id] ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                      {checks[c.id] && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <p className={`text-xs leading-relaxed ${checks[c.id] ? 'text-green-700 line-through decoration-green-400' : 'text-slate-700'}`}>{c.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ManagerSignOff value={manager} onChange={setManager} />

          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>

        <button onClick={handleSubmit} disabled={!isValid || submitting}
          className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
          {submitting
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Submit return to work certificate</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── Tab 3: Visitor Log ────────────────────────────────────────────────────────

function VisitorLogTab({ onSubmitted }: { onSubmitted: () => void }) {
  const [visitorName,    setVisitorName]    = useState('')
  const [company,        setCompany]        = useState('')
  const [reason,         setReason]         = useState('')
  const [answers,        setAnswers]        = useState<Record<string, boolean | null>>(
    Object.fromEntries(VISITOR_QUESTIONS.map(q => [q.id, null]))
  )
  const [details,        setDetails]        = useState('')
  const [declaration,    setDeclaration]    = useState<Record<string, boolean>>({})
  const [manager,        setManager]        = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState('')

  const hasExclusionYes = VISITOR_QUESTIONS.slice(0, 8).some(q => answers[q.id] === true)
  const allAnswered     = VISITOR_QUESTIONS.every(q => answers[q.id] !== null)
  const allDeclared     = VISITOR_DECLARATION.every(d => declaration[d.id])
  const isValid         = visitorName.trim() && company.trim() && reason.trim() &&
                          allAnswered && allDeclared && manager.trim() && !hasExclusionYes

  async function handleSubmit() {
    if (!isValid || submitting) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/haccp/people', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_type: 'visitor',
          visitor_name: visitorName, visitor_company: company, visitor_reason: reason,
          health_questions: { ...answers, details, ...declaration },
          visitor_declaration_confirmed: allDeclared,
          manager_signed_by: manager,
        }),
      })
      if (res.ok) {
        onSubmitted()
        setVisitorName(''); setCompany(''); setReason(''); setDetails('')
        setAnswers(Object.fromEntries(VISITOR_QUESTIONS.map(q => [q.id, null])))
        setDeclaration({}); setManager('')
      } else {
        const d = await res.json(); setError(d.error ?? 'Submission failed')
      }
    } catch { setError('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-slate-900 font-semibold text-sm">Visitor / Contractor Questionnaire</p>
          <p className="text-slate-400 text-xs mt-0.5">Must be completed before entering the food handling area</p>
        </div>
        <div className="px-4 py-4 space-y-5">

          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Visitor name</p>
            <input type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Company</p>
            <input type="text" value={company} onChange={e => setCompany(e.target.value)}
              placeholder="Company or organisation"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Reason for visit</p>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Purpose of visit"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          {/* Health questions */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">Health questionnaire</p>
            <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
              {VISITOR_QUESTIONS.map((q, i) => (
                <div key={q.id} className={`px-4 py-3 border-b border-slate-100 last:border-0 flex items-start justify-between gap-4 ${answers[q.id] === true && i < 8 ? 'bg-red-50' : 'bg-white'}`}>
                  <p className="text-slate-700 text-xs leading-relaxed flex-1">{i + 1}. {q.label}</p>
                  <YNButton redOnYes={i < 8} value={answers[q.id] as boolean | null}
                    onChange={v => setAnswers(prev => ({ ...prev, [q.id]: v }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Exclusion warning */}
          {hasExclusionYes && (
            <div className="bg-red-50 border border-red-400 rounded-xl px-4 py-3">
              <p className="text-red-700 text-xs font-bold uppercase tracking-widest mb-1">Entry not permitted</p>
              <p className="text-slate-600 text-xs">Visitor has answered YES to a health question. Entry to the food handling area is not permitted. Please provide details below and ask the visitor to return when symptoms have resolved.</p>
              <textarea value={details} onChange={e => setDetails(e.target.value)} rows={2}
                placeholder="Details of health concern…"
                className="mt-2 w-full bg-white border border-red-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none resize-none" />
            </div>
          )}

          {/* Declaration */}
          {!hasExclusionYes && allAnswered && (
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">Visitor declaration — confirm each point</p>
              <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
                {VISITOR_DECLARATION.map(d => (
                  <button key={d.id} type="button" onClick={() => setDeclaration(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-100 last:border-0 transition-all ${declaration[d.id] ? 'bg-green-50' : 'bg-white hover:bg-slate-50'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${declaration[d.id] ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                      {declaration[d.id] && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <p className={`text-xs leading-relaxed ${declaration[d.id] ? 'text-green-700 line-through decoration-green-400' : 'text-slate-700'}`}>{d.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ManagerSignOff value={manager} onChange={setManager} />

          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>

        <button onClick={handleSubmit} disabled={!isValid || submitting}
          className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
          {submitting
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Submit visitor log</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── History ──────────────────────────────────────────────────────────────────

function RecordHistory({ records, loading }: { records: HealthRecord[]; loading: boolean }) {
  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Loading…</div>
  if (records.length === 0) return (
    <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center">
      <p className="text-slate-400 text-sm">No records yet</p>
    </div>
  )

  const TYPE_LABELS: Record<string, string> = {
    health_declaration: 'Health Declaration',
    return_to_work:     'Return to Work',
    visitor:            'Visitor Log',
  }
  const TYPE_COLOURS: Record<string, string> = {
    health_declaration: 'bg-blue-100 text-blue-700',
    return_to_work:     'bg-amber-100 text-amber-700',
    visitor:            'bg-purple-100 text-purple-700',
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLOURS[r.record_type] ?? 'bg-slate-100 text-slate-600'}`}>
                {TYPE_LABELS[r.record_type] ?? r.record_type}
              </span>
              {r.record_type !== 'visitor' && !r.fit_for_work && (
                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Excluded</span>
              )}
            </div>
            <p className="text-slate-900 text-sm font-medium">
              {r.record_type === 'visitor' ? r.visitor_name : r.staff_name}
            </p>
            {r.record_type === 'visitor' && r.visitor_company && (
              <p className="text-slate-500 text-xs">{r.visitor_company}</p>
            )}
            {r.record_type === 'return_to_work' && r.illness_type && (
              <p className="text-slate-500 text-xs capitalize">{r.illness_type.replace('_', ' ')} illness</p>
            )}
            <p className="text-slate-400 text-[10px] mt-0.5">{r.users?.name ?? '—'} · {fmtDateTime(r.submitted_at)}</p>
          </div>
          <p className="text-slate-400 text-xs flex-shrink-0">{fmtDate(r.date)}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PeoplePage() {
  const [tab,     setTab]     = useState<'declaration' | 'rtw' | 'visitor'>('declaration')
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [flash,   setFlash]   = useState('')

  const loadData = useCallback(() => {
    fetch('/api/haccp/people')
      .then(r => r.json())
      .then(d => setRecords(d.records ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function handleSubmitted(label: string) {
    setFlash(`${label} submitted`)
    loadData()
    setTimeout(() => setFlash(''), 2500)
  }

  const tabCounts = {
    declaration: records.filter(r => r.record_type === 'health_declaration').length,
    rtw:         records.filter(r => r.record_type === 'return_to_work').length,
    visitor:     records.filter(r => r.record_type === 'visitor').length,
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B] flex-shrink-0">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">SOP 8 — Personnel Hygiene</p>
          <h1 className="text-white text-lg font-bold leading-tight">People</h1>
        </div>
      </div>

      {/* Tab selector */}
      <div className="px-5 pt-4 pb-0 flex gap-2 overflow-x-auto">
        {([
          { key: 'declaration', label: 'Health Declaration' },
          { key: 'rtw',         label: 'Return to Work'     },
          { key: 'visitor',     label: 'Visitor Log'        },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 py-2.5 px-4 rounded-xl text-sm font-bold border-2 transition-all ${
              tab === t.key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-600'
            }`}>
            {t.label}
            {tabCounts[t.key] > 0 && (
              <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">{tabCounts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {flash && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            <p className="text-green-700 font-bold text-sm">{flash}</p>
          </div>
        )}

        {tab === 'declaration' && <HealthDeclarationTab onSubmitted={() => handleSubmitted('Health declaration')} />}
        {tab === 'rtw'         && <ReturnToWorkTab       onSubmitted={() => handleSubmitted('Return to work certificate')} />}
        {tab === 'visitor'     && <VisitorLogTab         onSubmitted={() => handleSubmitted('Visitor log')} />}

        {/* History */}
        <div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
            {tab === 'declaration' ? 'Previous declarations'
           : tab === 'rtw'         ? 'Previous return to work records'
           :                         'Previous visitor logs'}
          </p>
          <RecordHistory
            loading={loading}
            records={records.filter(r =>
              tab === 'declaration' ? r.record_type === 'health_declaration'
            : tab === 'rtw'         ? r.record_type === 'return_to_work'
            :                         r.record_type === 'visitor'
            )}
          />
        </div>

      </div>
    </div>
  )
}
