'use client'
/**
 * app/haccp/food-fraud/page.tsx
 * BSD 1.6.4 — Food Fraud Vulnerability Assessment
 * Three views: list, detail, edit
 * Every save inserts a new row — history preserved forever
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Constants ────────────────────────────────────────────────────────────────

const LIKELIHOOD_LABELS: Record<number, string> = {
  1: '1 — Rare',
  2: '2 — Unlikely',
  3: '3 — Possible',
  4: '4 — Likely',
  5: '5 — Almost certain',
}
const IMPACT_LABELS: Record<number, string> = {
  1: '1 — Minor',
  2: '2 — Moderate',
  3: '3 — Significant',
  4: '4 — Major',
  5: '5 — Critical',
}
const DETECTION_LABELS: Record<number, string> = {
  1: '1 — Easy to detect',
  2: '2 — Moderate difficulty',
  3: '3 — Difficult to detect',
  4: '4 — Very difficult',
  5: '5 — Virtually impossible',
}
const RISK_LEVEL_OPTIONS = ['LOW', 'MEDIUM', 'HIGH'] as const
type RiskLevel = typeof RISK_LEVEL_OPTIONS[number]

function calcRiskLevel(score: number): RiskLevel {
  if (score <= 25) return 'LOW'
  if (score <= 50) return 'MEDIUM'
  return 'HIGH'
}

const RISK_LEVEL_STYLE: Record<RiskLevel, string> = {
  LOW:    'bg-green-100 text-green-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH:   'bg-red-100 text-red-700',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskItem {
  fraud_type:   string
  description:  string
  likelihood:   number
  impact:       number
  detection:    number
  risk_score:   number
  risk_level:   RiskLevel
}

interface SupplyChainItem {
  category:      string
  supplier_type: string
  fraud_risk:    string
  assessment:    RiskLevel
}

interface Assessment {
  id:               string
  version:          string
  issue_date:       string
  next_review_date: string
  risks:            RiskItem[]
  supply_chain:     SupplyChainItem[]
  mitigation_notes: string | null
  created_at:       string
  preparer:         { name: string } | null
  approver:         { name: string } | null
}

interface User { id: string; name: string }

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(next_review_date: string) {
  return new Date(next_review_date) < new Date()
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditForm({
  base, users, isAdmin, onSaved, onCancel,
}: {
  base: Assessment | null
  users: User[]
  isAdmin: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [version,    setVersion]    = useState(base?.version ?? '')
  const [issueDate,  setIssueDate]  = useState(base?.issue_date ?? '')
  const [reviewDate, setReviewDate] = useState(base?.next_review_date ?? '')
  const [risks,      setRisks]      = useState<RiskItem[]>(
    base?.risks ?? [{ fraud_type: '', description: '', likelihood: 1, impact: 1, detection: 1, risk_score: 1, risk_level: 'LOW' }]
  )
  const [supplyChain, setSupplyChain] = useState<SupplyChainItem[]>(
    base?.supply_chain ?? [{ category: '', supplier_type: '', fraud_risk: '', assessment: 'LOW' }]
  )
  const [mitigationNotes, setMitigationNotes] = useState(base?.mitigation_notes ?? '')
  const [preparedBy, setPreparedBy] = useState(
    base?.preparer ? (users.find(u => u.name === base.preparer?.name)?.id ?? '') : ''
  )
  const [approvedBy, setApprovedBy] = useState(
    base?.approver ? (users.find(u => u.name === base.approver?.name)?.id ?? '') : ''
  )
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  function updateRisk(idx: number, field: keyof RiskItem, value: string | number) {
    setRisks(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: value }
      if (['likelihood', 'impact', 'detection'].includes(field as string)) {
        const score = Number(updated.likelihood) * Number(updated.impact) * Number(updated.detection)
        updated.risk_score = score
        updated.risk_level = calcRiskLevel(score)
      }
      return updated
    }))
  }

  function addRisk() {
    setRisks(prev => [...prev, { fraud_type: '', description: '', likelihood: 1, impact: 1, detection: 1, risk_score: 1, risk_level: 'LOW' }])
  }

  function removeRisk(idx: number) {
    setRisks(prev => prev.filter((_, i) => i !== idx))
  }

  function updateSC(idx: number, field: keyof SupplyChainItem, value: string) {
    setSupplyChain(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function addSC() {
    setSupplyChain(prev => [...prev, { category: '', supplier_type: '', fraud_risk: '', assessment: 'LOW' }])
  }

  function removeSC(idx: number) {
    setSupplyChain(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/haccp/food-fraud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version, issue_date: issueDate, next_review_date: reviewDate,
          risks, supply_chain: supplyChain,
          mitigation_notes: mitigationNotes || null,
          prepared_by: preparedBy || null,
          approved_by: approvedBy || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Save failed'); return }
      onSaved()
    } catch { setErr('Connection error') }
    finally { setSaving(false) }
  }

  const inputCls   = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400'
  const selectCls  = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400'
  const labelCls   = 'text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <button onClick={onCancel} className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p className="text-slate-900 font-bold text-base flex-1">New version based on {base?.version ?? '—'}</p>
      </div>

      <div className="px-5 py-5 space-y-4 max-w-lg mx-auto">

        {/* Version + dates */}
        <div className="grid grid-cols-3 gap-3">
          <div><p className={labelCls}>Version *</p>
            <input value={version} onChange={e => setVersion(e.target.value)} placeholder="V1.1" className={inputCls}/></div>
          <div><p className={labelCls}>Issue date *</p>
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls}/></div>
          <div><p className={labelCls}>Next review *</p>
            <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} className={inputCls}/></div>
        </div>

        {/* Risk rows */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className={labelCls + ' mb-0'}>Risk assessments</p>
            <button onClick={addRisk} className="text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg px-2 py-1">+ Add row</button>
          </div>
          <div className="space-y-4">
            {risks.map((r, idx) => {
              const score = r.likelihood * r.impact * r.detection
              const level = calcRiskLevel(score)
              return (
                <div key={idx} className="bg-white border border-blue-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-slate-600 text-xs font-bold">Risk {idx + 1}</p>
                    {risks.length > 1 && (
                      <button onClick={() => removeRisk(idx)} className="text-red-400 text-[10px]">Remove</button>
                    )}
                  </div>
                  <div><p className={labelCls}>Fraud type</p>
                    <input value={r.fraud_type} onChange={e => updateRisk(idx, 'fraud_type', e.target.value)} placeholder="e.g. Species substitution" className={inputCls}/></div>
                  <div><p className={labelCls}>Description / historical context</p>
                    <textarea value={r.description} onChange={e => updateRisk(idx, 'description', e.target.value)} rows={2} className={inputCls + ' resize-none'}/></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><p className={labelCls}>Likelihood</p>
                      <select value={r.likelihood} onChange={e => updateRisk(idx, 'likelihood', Number(e.target.value))} className={selectCls}>
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{LIKELIHOOD_LABELS[n]}</option>)}
                      </select></div>
                    <div><p className={labelCls}>Impact</p>
                      <select value={r.impact} onChange={e => updateRisk(idx, 'impact', Number(e.target.value))} className={selectCls}>
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{IMPACT_LABELS[n]}</option>)}
                      </select></div>
                    <div><p className={labelCls}>Detection difficulty</p>
                      <select value={r.detection} onChange={e => updateRisk(idx, 'detection', Number(e.target.value))} className={selectCls}>
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{DETECTION_LABELS[n]}</option>)}
                      </select></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-slate-500 text-xs">Score: <span className="font-bold text-slate-900">{score}</span></p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${RISK_LEVEL_STYLE[level]}`}>{level}</span>
                    <p className="text-slate-400 text-[10px]">({r.likelihood} × {r.impact} × {r.detection})</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Supply chain */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className={labelCls + ' mb-0'}>Supply chain categories</p>
            <button onClick={addSC} className="text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg px-2 py-1">+ Add row</button>
          </div>
          <div className="space-y-3">
            {supplyChain.map((s, idx) => (
              <div key={idx} className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="text-slate-600 text-xs font-bold">Category {idx + 1}</p>
                  {supplyChain.length > 1 && (
                    <button onClick={() => removeSC(idx)} className="text-red-400 text-[10px]">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className={labelCls}>Category</p>
                    <input value={s.category} onChange={e => updateSC(idx, 'category', e.target.value)} placeholder="e.g. Lamb" className={inputCls}/></div>
                  <div><p className={labelCls}>Supplier type</p>
                    <input value={s.supplier_type} onChange={e => updateSC(idx, 'supplier_type', e.target.value)} placeholder="e.g. UK abattoirs" className={inputCls}/></div>
                  <div><p className={labelCls}>Fraud risk</p>
                    <input value={s.fraud_risk} onChange={e => updateSC(idx, 'fraud_risk', e.target.value)} placeholder="e.g. Species, origin" className={inputCls}/></div>
                  <div><p className={labelCls}>Assessment</p>
                    <select value={s.assessment} onChange={e => updateSC(idx, 'assessment', e.target.value)} className={selectCls}>
                      {RISK_LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mitigation notes */}
        <div><p className={labelCls}>Mitigation notes / ongoing controls</p>
          <textarea value={mitigationNotes} onChange={e => setMitigationNotes(e.target.value)} rows={4} placeholder="Ongoing controls and review triggers…" className={inputCls + ' resize-none'}/></div>

        {/* Prepared / approved by */}
        <div className="grid grid-cols-2 gap-3">
          <div><p className={labelCls}>Prepared by</p>
            <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)} className={selectCls}>
              <option value="">— Select —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
          <div><p className={labelCls}>Approved by</p>
            <select value={approvedBy} onChange={e => setApprovedBy(e.target.value)} className={selectCls}>
              <option value="">— Select —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
        </div>

        {err && <p className="text-red-600 text-xs">{err}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">Cancel</button>
          <button onClick={handleSave} disabled={saving || !version.trim() || !issueDate || !reviewDate}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40">
            {saving ? 'Saving…' : 'Save new version'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetailView({
  assessment, isLatest, isAdmin, users,
  onBack, onEdit,
}: {
  assessment: Assessment
  isLatest:   boolean
  isAdmin:    boolean
  users:      User[]
  onBack:     () => void
  onEdit:     (base: Assessment) => void
}) {
  const overdue = isLatest && isOverdue(assessment.next_review_date)
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="flex-1">
          <p className="text-slate-900 font-bold text-base">MFS-FFRA-001 · {assessment.version}</p>
          <p className="text-slate-400 text-xs">{isLatest ? 'Current version' : 'Historical version'} · BSD 1.6.4</p>
        </div>
        {isAdmin && (
          <button onClick={() => onEdit(assessment)}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
            Edit
          </button>
        )}
      </div>
      <div className="px-5 py-5 space-y-4">
        {overdue && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-700 text-xs font-bold">⚠ Review overdue — due {fmtDate(assessment.next_review_date)}</p>
          </div>
        )}

        {/* Document metadata */}
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-3 grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-slate-400">Version</p><p className="font-semibold">{assessment.version}</p></div>
          <div><p className="text-slate-400">Issue date</p><p className="font-semibold">{fmtDate(assessment.issue_date)}</p></div>
          <div><p className="text-slate-400">Next review</p><p className="font-semibold">{fmtDate(assessment.next_review_date)}</p></div>
          <div><p className="text-slate-400">Saved</p><p className="font-semibold">{fmtDate(assessment.created_at)}</p></div>
          <div><p className="text-slate-400">Prepared by</p><p className="font-semibold">{assessment.preparer?.name ?? '—'}</p></div>
          <div><p className="text-slate-400">Approved by</p><p className="font-semibold">{assessment.approver?.name ?? '—'}</p></div>
        </div>

        {/* Risk assessments */}
        <div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Risk assessments</p>
          <div className="space-y-3">
            {assessment.risks.map((r, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-slate-900 font-bold text-sm">{r.fraud_type}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${RISK_LEVEL_STYLE[r.risk_level]}`}>{r.risk_level}</span>
                </div>
                {r.description && <p className="text-slate-500 text-xs mb-2">{r.description}</p>}
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <div><p className="text-slate-400">Likelihood</p><p className="font-semibold">{LIKELIHOOD_LABELS[r.likelihood]}</p></div>
                  <div><p className="text-slate-400">Impact</p><p className="font-semibold">{IMPACT_LABELS[r.impact]}</p></div>
                  <div><p className="text-slate-400">Detection</p><p className="font-semibold">{DETECTION_LABELS[r.detection]}</p></div>
                  <div><p className="text-slate-400">Score</p><p className="font-semibold">{r.risk_score} ({r.likelihood}×{r.impact}×{r.detection})</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Supply chain */}
        {assessment.supply_chain.length > 0 && (
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Supply chain assessment</p>
            <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
              {assessment.supply_chain.map((s, i) => (
                <div key={i} className={`px-4 py-3 grid grid-cols-4 gap-2 text-xs ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                  <p className="font-semibold text-slate-800">{s.category}</p>
                  <p className="text-slate-500">{s.supplier_type}</p>
                  <p className="text-slate-500">{s.fraud_risk}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full justify-self-end ${RISK_LEVEL_STYLE[s.assessment as RiskLevel]}`}>{s.assessment}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mitigation notes */}
        {assessment.mitigation_notes && (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Mitigation notes</p>
            <p className="text-slate-700 text-xs whitespace-pre-line">{assessment.mitigation_notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FoodFraudPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [users,       setUsers]       = useState<User[]>([])
  const [loading,     setLoading]     = useState(true)
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [selected,    setSelected]    = useState<Assessment | null>(null)
  const [editBase,    setEditBase]    = useState<Assessment | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const role = document.cookie.split(';').find(c => c.trim().startsWith('mfs_role='))?.split('=')[1]
    setIsAdmin(role === 'admin')
    try {
      const [ar, ur] = await Promise.all([
        fetch('/api/haccp/food-fraud').then(r => r.json()),
        fetch('/api/haccp/users').then(r => r.json()),
      ])
      setAssessments(ar.assessments ?? [])
      setUsers(ur.users ?? [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (editBase !== null) return (
    <EditForm
      base={editBase}
      users={users}
      isAdmin={isAdmin}
      onSaved={async () => { setEditBase(null); setSelected(null); await load() }}
      onCancel={() => setEditBase(null)}
    />
  )

  if (selected) {
    const isLatest = assessments[0]?.id === selected.id
    return (
      <DetailView
        assessment={selected}
        isLatest={isLatest}
        isAdmin={isAdmin}
        users={users}
        onBack={() => setSelected(null)}
        onEdit={base => setEditBase(base)}
      />
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Loading…</p>
    </div>
  )

  const latest   = assessments[0] ?? null
  const history  = assessments.slice(1)
  const overdue  = latest && isOverdue(latest.next_review_date)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <Link href="/haccp" className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div className="flex-1">
          <p className="text-slate-900 font-bold text-base">Food Fraud Assessment</p>
          <p className="text-slate-400 text-xs">MFS-FFRA-001 · BSD 1.6.4</p>
        </div>
        {isAdmin && (
          <button onClick={() => setEditBase(latest)}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
            + New version
          </button>
        )}
      </div>

      <div className="px-5 py-5 space-y-4">
        {latest ? (
          <>
            {overdue && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-red-700 text-xs font-bold">⚠ Review overdue — due {fmtDate(latest.next_review_date)}</p>
              </div>
            )}

            {/* Current version */}
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Current version</p>
              <button onClick={() => setSelected(latest)}
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-4 text-left active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-slate-900 font-bold">{latest.version}</p>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Current</span>
                      {overdue && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Review due</span>}
                    </div>
                    <p className="text-slate-400 text-xs">Issued {fmtDate(latest.issue_date)} · Next review {fmtDate(latest.next_review_date)}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{latest.risks.length} risk areas · {latest.supply_chain.length} supply chain categories</p>
                    {(latest.preparer || latest.approver) && (
                      <p className="text-slate-400 text-[10px] mt-0.5">
                        {latest.preparer && `Prepared: ${latest.preparer.name}`}
                        {latest.preparer && latest.approver && ' · '}
                        {latest.approver && `Approved: ${latest.approver.name}`}
                      </p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </button>
            </div>

            {/* Version history */}
            {history.length > 0 && (
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Version history</p>
                <div className="space-y-2">
                  {history.map(a => (
                    <button key={a.id} onClick={() => setSelected(a)}
                      className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-left flex items-center justify-between gap-3 active:scale-[0.99]">
                      <div>
                        <p className="text-slate-700 font-semibold text-sm">{a.version}</p>
                        <p className="text-slate-400 text-xs">Issued {fmtDate(a.issue_date)} · Saved {fmtDate(a.created_at)}</p>
                      </div>
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
            <p className="text-slate-400 text-sm">No assessment on file</p>
            {isAdmin && <p className="text-slate-400 text-xs mt-1">Tap + New version to create one</p>}
          </div>
        )}
      </div>
    </div>
  )
}
