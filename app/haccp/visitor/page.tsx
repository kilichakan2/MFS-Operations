'use client'
/**
 * app/haccp/visitor/page.tsx
 *
 * PUBLIC — no login required. Kiosk page for visitor sign-in.
 * Tablet left on wall — visitors complete health declaration before entry.
 * Records saved to haccp_health_records via /api/haccp/visitor (public POST).
 * All visits saved — excluded visitors saved with fit_for_work=false (audit trail).
 */

import { useState, useEffect, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

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

const VISITOR_DECLARATION = [
  { id: 'vd1', label: 'I am not suffering from any infection and know of no reason why I should not enter the facility' },
  { id: 'vd2', label: 'I have removed all jewellery and watches' },
  { id: 'vd3', label: 'My tools and equipment are clean and free from contamination' },
  { id: 'vd4', label: 'My oils, greases and lubricants are food grade and allergen free' },
]

type Answers     = Record<string, boolean | null>
type Declaration = Record<string, boolean>

function initialAnswers(): Answers {
  return Object.fromEntries(VISITOR_QUESTIONS.map(q => [q.id, null]))
}
function initialDeclaration(): Declaration {
  return Object.fromEntries(VISITOR_DECLARATION.map(d => [d.id, false]))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VisitorSignInPage() {
  const [name,        setName]        = useState('')
  const [company,     setCompany]     = useState('')
  const [reason,      setReason]      = useState('')
  const [answers,     setAnswers]     = useState<Answers>(initialAnswers())
  const [declaration, setDeclaration] = useState<Declaration>(initialDeclaration())
  const [manager,     setManager]     = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [result,      setResult]      = useState<'success' | 'excluded' | null>(null)
  const [countdown,   setCountdown]   = useState(10)

  // Exclusion: any of vq1–vq8 = yes
  const hasExclusion   = VISITOR_QUESTIONS.slice(0, 8).some(q => answers[q.id] === true)
  const allAnswered    = VISITOR_QUESTIONS.every(q => answers[q.id] !== null)
  const allDeclared    = VISITOR_DECLARATION.every(d => declaration[d.id])
  const isValid        = name.trim() && company.trim() && reason.trim()
                       && allAnswered && allDeclared && manager.trim()

  const reset = useCallback(() => {
    setName(''); setCompany(''); setReason('')
    setAnswers(initialAnswers()); setDeclaration(initialDeclaration())
    setManager(''); setResult(null); setCountdown(10)
  }, [])

  // Auto-reset after success/excluded
  useEffect(() => {
    if (!result) return
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); reset(); return 10 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [result, reset])

  async function handleSubmit() {
    if (!isValid) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/haccp/visitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_name:                  name.trim(),
          visitor_company:               company.trim(),
          visitor_reason:                reason.trim(),
          health_questions:              answers,
          visitor_declaration_confirmed: allDeclared,
          manager_signed_by:             manager.trim(),
          fit_for_work:                  !hasExclusion,
        }),
      })
      if (!res.ok) { setSubmitting(false); return }
      setResult(hasExclusion ? 'excluded' : 'success')
    } catch { /* silent — kiosk, no error UI */ }
    finally { setSubmitting(false) }
  }

  const inputCls = 'w-full bg-[#1e2d3d] border border-[#2d4a6b] rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#3b82f6]'
  const labelCls = 'text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5 block'

  // ── Success ────────────────────────────────────────────────────────────────

  if (result === 'success') return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p className="text-white text-2xl font-bold mb-2">Welcome, {name}</p>
      <p className="text-slate-400 text-sm mb-1">Your visit has been recorded.</p>
      <p className="text-slate-400 text-sm mb-8">Please follow the instructions from your host.</p>
      <p className="text-slate-500 text-xs mb-4">This page will reset in <span className="text-white font-bold">{countdown}s</span></p>
      <button onClick={reset}
        className="px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm font-bold">
        Sign in another visitor
      </button>
    </div>
  )

  // ── Excluded ───────────────────────────────────────────────────────────────

  if (result === 'excluded') return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p className="text-white text-2xl font-bold mb-2">Entry not permitted</p>
      <p className="text-slate-400 text-sm mb-2">Based on your answers, you cannot enter the production area at this time.</p>
      <p className="text-slate-400 text-sm mb-8">Please inform a member of staff. Your details have been recorded.</p>
      <p className="text-slate-500 text-xs mb-4">This page will reset in <span className="text-white font-bold">{countdown}s</span></p>
      <button onClick={reset}
        className="px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm font-bold">
        Start again
      </button>
    </div>
  )

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0f172a] pb-12">

      {/* Header */}
      <div className="bg-[#1e293b] px-5 py-5 mb-6">
        <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase mb-1">MFS Global · HACCP</p>
        <h1 className="text-white text-xl font-bold">Visitor Sign-In</h1>
        <p className="text-slate-400 text-sm mt-0.5">Complete this form before entering the production area</p>
      </div>

      <div className="px-5 space-y-6 max-w-lg mx-auto">

        {/* 1 — Visitor details */}
        <div>
          <p className="text-white text-sm font-bold mb-3">1. Your details</p>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Full name *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. John Smith" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Company *</label>
              <input value={company} onChange={e => setCompany(e.target.value)}
                placeholder="e.g. ABC Supplies Ltd" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Reason for visit *</label>
              <input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Equipment maintenance" className={inputCls} />
            </div>
          </div>
        </div>

        {/* 2 — Health questions */}
        <div>
          <p className="text-white text-sm font-bold mb-1">2. Health declaration</p>
          <p className="text-slate-400 text-xs mb-3">Please answer all questions honestly</p>
          <div className="space-y-3">
            {VISITOR_QUESTIONS.map(q => (
              <div key={q.id} className="bg-[#1e2d3d] border border-[#2d4a6b] rounded-xl px-4 py-3">
                <p className="text-white text-xs mb-2.5">{q.label}</p>
                <div className="flex gap-2">
                  {(['Yes', 'No'] as const).map(opt => {
                    const val = opt === 'Yes'
                    const selected = answers[q.id] === val
                    const isExclusionYes = val && q.id !== 'vq9' && val
                    return (
                      <button key={opt}
                        onClick={() => setAnswers(prev => ({ ...prev, [q.id]: val }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                          selected
                            ? (isExclusionYes && q.id !== 'vq9'
                                ? 'bg-red-500 text-white'
                                : 'bg-green-500 text-white')
                            : 'bg-[#0f172a] text-slate-400 border border-[#2d4a6b]'
                        }`}>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Exclusion warning — shown inline if any vq1–vq8 = yes */}
          {hasExclusion && (
            <div className="mt-3 bg-red-900/40 border border-red-700 rounded-xl px-4 py-3">
              <p className="text-red-300 text-xs font-bold">⚠ Based on your answers, you may not be able to enter the production area.</p>
              <p className="text-red-400 text-xs mt-1">Please inform a member of staff before proceeding.</p>
            </div>
          )}
        </div>

        {/* 3 — Declaration */}
        <div>
          <p className="text-white text-sm font-bold mb-1">3. Declarations</p>
          <p className="text-slate-400 text-xs mb-3">Please confirm all of the following</p>
          <div className="space-y-2">
            {VISITOR_DECLARATION.map(d => (
              <button key={d.id}
                onClick={() => setDeclaration(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                  declaration[d.id]
                    ? 'bg-green-900/30 border-green-700'
                    : 'bg-[#1e2d3d] border-[#2d4a6b]'
                }`}>
                <div className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border ${
                  declaration[d.id] ? 'bg-green-500 border-green-500' : 'border-slate-500'
                }`}>
                  {declaration[d.id] && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <p className="text-white text-xs leading-relaxed">{d.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 4 — Manager sign-off */}
        <div>
          <p className="text-white text-sm font-bold mb-1">4. Staff countersignature</p>
          <p className="text-slate-400 text-xs mb-3">Please call a member of staff to confirm your sign-in</p>
          <div>
            <label className={labelCls}>Staff member name *</label>
            <input value={manager} onChange={e => setManager(e.target.value)}
              placeholder="Name of staff member" className={inputCls} />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="w-full py-4 rounded-xl bg-orange-500 text-white text-base font-bold disabled:opacity-30 transition-opacity">
          {submitting ? 'Signing in…' : 'Submit sign-in'}
        </button>

        <p className="text-slate-600 text-[10px] text-center pb-4">
          MFS Global Ltd · Unit 2-3 Rutland Way, Sheffield S3 8DG · HACCP Visitor Record
        </p>

      </div>
    </div>
  )
}
