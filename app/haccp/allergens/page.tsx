/**
 * app/haccp/allergens/page.tsx
 *
 * SALSA 1.4.1 — Site Allergen Identification & Cross-Contamination Risk Assessment
 *
 * Staff: read-only view of current assessment
 * Admin: can update the assessment
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawMaterial {
  material:         string
  category:         string
  allergen_status:  'nil' | 'contains' | 'may_contain'
  notes:            string
}

interface AllergenAssessment {
  id:                string
  site_status:       'nil_allergens' | 'allergens_present' | 'under_review'
  raw_materials:     RawMaterial[]
  cross_contam_risk: string
  procedure_notes:   string | null
  assessed_at:       string
  next_review_date:  string
  assessor:          { name: string } | null
  updater:           { name: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function reviewStatus(dateStr: string): 'ok' | 'soon' | 'overdue' {
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000
  if (days < 0)   return 'overdue'
  if (days < 60)  return 'soon'
  return 'ok'
}

const SITE_STATUS_LABELS: Record<string, { label: string; colour: string }> = {
  nil_allergens:    { label: 'Nil allergens on site',       colour: 'bg-green-100 text-green-800' },
  allergens_present:{ label: 'Allergens present on site',  colour: 'bg-red-100 text-red-700' },
  under_review:     { label: 'Assessment under review',     colour: 'bg-amber-100 text-amber-700' },
}

const ALLERGEN_STATUS_LABELS: Record<string, { label: string; colour: string }> = {
  nil:         { label: 'Nil',         colour: 'bg-green-100 text-green-700' },
  contains:    { label: 'Contains',    colour: 'bg-red-100 text-red-700' },
  may_contain: { label: 'May contain', colour: 'bg-amber-100 text-amber-700' },
}

const DEFAULT_MATERIALS: RawMaterial[] = [
  { material: 'Lamb carcasses',                     category: 'Raw meat',      allergen_status: 'nil', notes: 'Pure ovine — no allergens' },
  { material: 'Beef primal cuts',                   category: 'Raw meat',      allergen_status: 'nil', notes: 'Pure bovine — no allergens' },
  { material: 'Vacuum packaging film',              category: 'Packaging',     allergen_status: 'nil', notes: 'Confirmed nil by supplier' },
  { material: 'Modified atmosphere gas',            category: 'Processing aid', allergen_status: 'nil', notes: 'Pure gases — no allergens' },
  { material: 'Cleaning chemicals',                 category: 'Chemical',      allergen_status: 'nil', notes: 'Controlled use, no cross-contamination risk' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AllergenAssessmentPage() {
  const [assessment,  setAssessment]  = useState<AllergenAssessment | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [editing,     setEditing]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveErr,     setSaveErr]     = useState('')
  const [flash,       setFlash]       = useState('')

  // Edit form state
  const [editStatus,    setEditStatus]    = useState<AllergenAssessment['site_status']>('nil_allergens')
  const [editReview,    setEditReview]    = useState('')
  const [editRisk,      setEditRisk]      = useState('')
  const [editNotes,     setEditNotes]     = useState('')
  const [editMaterials, setEditMaterials] = useState<RawMaterial[]>([])

  const loadAssessment = useCallback(() => {
    setLoading(true)
    fetch('/api/haccp/allergen-assessment')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(d => {
        setAssessment(d.assessment ?? null)
        // Detect admin from cookie via a quick profile check
        fetch('/api/auth/type')
          .then(r => r.json())
          .then(p => setIsAdmin(p.role === 'admin'))
          .catch(() => {})
      })
      .catch(e => setError(`Could not load — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadAssessment() }, [loadAssessment])

  function openEdit() {
    if (!assessment) return
    setEditStatus(assessment.site_status)
    setEditReview(assessment.next_review_date)
    setEditRisk(assessment.cross_contam_risk)
    setEditNotes(assessment.procedure_notes ?? '')
    setEditMaterials(assessment.raw_materials.length > 0
      ? [...assessment.raw_materials]
      : [...DEFAULT_MATERIALS])
    setEditing(true)
    setSaveErr('')
  }

  async function handleSave() {
    setSaving(true)
    setSaveErr('')
    try {
      const res = await fetch('/api/haccp/allergen-assessment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          site_status:       editStatus,
          next_review_date:  editReview,
          cross_contam_risk: editRisk.trim(),
          procedure_notes:   editNotes.trim() || null,
          raw_materials:     editMaterials,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setSaveErr(d.error ?? 'Save failed')
        return
      }
      setEditing(false)
      setFlash('Assessment updated')
      setTimeout(() => setFlash(''), 3000)
      loadAssessment()
    } catch {
      setSaveErr('Connection error')
    } finally {
      setSaving(false)
    }
  }

  function setMaterialField(idx: number, field: keyof RawMaterial, val: string) {
    setEditMaterials(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m))
  }

  function addMaterial() {
    setEditMaterials(prev => [...prev, { material: '', category: '', allergen_status: 'nil', notes: '' }])
  }

  function removeMaterial(idx: number) {
    setEditMaterials(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/60">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 className="text-white text-lg font-bold">Allergen Assessment</h1>
      </div>
      <p className="text-slate-400 text-sm p-6">Loading…</p>
    </div>
  )

  const siteStatusInfo   = SITE_STATUS_LABELS[assessment?.site_status ?? 'nil_allergens']
  const reviewStat       = assessment ? reviewStatus(assessment.next_review_date) : 'ok'
  const reviewColour     = reviewStat === 'overdue' ? 'text-red-600' : reviewStat === 'soon' ? 'text-amber-600' : 'text-green-700'

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B] flex-shrink-0">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">HACCP · SALSA 1.4.1</p>
          <h1 className="text-white text-lg font-bold leading-tight">Site Allergen Assessment</h1>
        </div>
        {isAdmin && assessment && !editing && (
          <button onClick={openEdit}
            className="bg-white/10 hover:bg-white/18 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all">
            Update
          </button>
        )}
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {flash && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            <p className="text-green-700 text-sm font-bold">{flash}</p>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {assessment && !editing && (
          <>
            {/* Site status */}
            <div className="bg-white border border-blue-100 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Site Allergen Status</p>
              <span className={`inline-block text-sm font-bold px-3 py-1.5 rounded-xl ${siteStatusInfo.colour}`}>
                {siteStatusInfo.label}
              </span>
              <p className="text-slate-500 text-xs mt-3 leading-relaxed">{assessment.cross_contam_risk}</p>
            </div>

            {/* Assessment metadata */}
            <div className="bg-white border border-blue-100 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">Assessment Details</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-slate-500 text-xs">Date assessed</p>
                  <p className="text-slate-800 text-xs font-bold">{fmtDate(assessment.assessed_at)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-slate-500 text-xs">Assessed by</p>
                  <p className="text-slate-800 text-xs font-bold">{assessment.assessor?.name ?? 'Hakan Kilic'}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-slate-500 text-xs">Next review due</p>
                  <p className={`text-xs font-bold ${reviewColour}`}>
                    {fmtDate(assessment.next_review_date)}
                    {reviewStat === 'overdue' && ' — OVERDUE'}
                    {reviewStat === 'soon'    && ' — due soon'}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-slate-500 text-xs">SALSA reference</p>
                  <p className="text-slate-800 text-xs font-bold">Issue 6, Clause 1.4.1</p>
                </div>
              </div>
            </div>

            {/* Raw materials */}
            <div className="bg-white border border-blue-100 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">
                Raw Materials & Allergen Status
              </p>
              <div className="space-y-2">
                {assessment.raw_materials.map((m, i) => {
                  const statusInfo = ALLERGEN_STATUS_LABELS[m.allergen_status]
                  return (
                    <div key={i} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800 text-sm font-semibold">{m.material}</p>
                        <p className="text-slate-400 text-[10px] mt-0.5">{m.category}</p>
                        {m.notes && <p className="text-slate-500 text-xs mt-0.5 italic">{m.notes}</p>}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${statusInfo.colour}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Procedure notes */}
            {assessment.procedure_notes && (
              <div className="bg-white border border-blue-100 rounded-xl px-5 py-4">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Procedure Notes</p>
                <p className="text-slate-700 text-xs leading-relaxed">{assessment.procedure_notes}</p>
              </div>
            )}

            {/* SALSA compliance note */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <p className="text-blue-700 text-[10px] font-bold uppercase tracking-widest mb-1">SALSA 1.4.1 Compliance</p>
              <p className="text-blue-600 text-xs leading-relaxed">
                This assessment documents all allergens handled on site in compliance with SALSA Issue 6, Clause 1.4.1.
                It must be reviewed annually and updated whenever raw materials, suppliers, or processes change.
              </p>
            </div>
          </>
        )}

        {/* ── Edit form ──────────────────────────────────────────────────────── */}
        {editing && (
          <div className="space-y-4">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Update Allergen Assessment</p>

            {/* Site status */}
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">Site allergen status</p>
              <div className="grid grid-cols-1 gap-2">
                {(['nil_allergens', 'allergens_present', 'under_review'] as const).map(s => (
                  <button key={s} onClick={() => setEditStatus(s)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-colors ${
                      editStatus === s
                        ? s === 'nil_allergens'
                          ? 'bg-green-600 text-white border-green-600'
                          : s === 'allergens_present'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}>
                    {SITE_STATUS_LABELS[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Review date */}
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1">Next review date</p>
              <input type="date" value={editReview} onChange={e => setEditReview(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
            </div>

            {/* Cross-contamination risk */}
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1">Cross-contamination risk statement</p>
              <textarea value={editRisk} onChange={e => setEditRisk(e.target.value)} rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 resize-none" />
            </div>

            {/* Raw materials */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600">Raw materials</p>
                <button onClick={addMaterial}
                  className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  + Add row
                </button>
              </div>
              <div className="space-y-2">
                {editMaterials.map((m, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={m.material} onChange={e => setMaterialField(i, 'material', e.target.value)}
                        placeholder="Material name"
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                      <input value={m.category} onChange={e => setMaterialField(i, 'category', e.target.value)}
                        placeholder="Category"
                        className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                    </div>
                    <div className="flex gap-2 items-center">
                      <select value={m.allergen_status}
                        onChange={e => setMaterialField(i, 'allergen_status', e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white">
                        <option value="nil">Nil</option>
                        <option value="contains">Contains</option>
                        <option value="may_contain">May contain</option>
                      </select>
                      <input value={m.notes} onChange={e => setMaterialField(i, 'notes', e.target.value)}
                        placeholder="Notes (optional)"
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                      <button onClick={() => removeMaterial(i)}
                        className="text-red-400 text-xs font-bold px-1.5 py-1 rounded">×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Procedure notes */}
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1">Procedure notes (optional)</p>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                placeholder="Describe controls in place to prevent allergens entering the site…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 resize-none" />
            </div>

            {saveErr && <p className="text-red-600 text-xs">{saveErr}</p>}

            <div className="flex gap-3">
              <button onClick={() => setEditing(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !editReview}
                className="flex-1 py-3 rounded-xl bg-orange-600 text-white text-sm font-bold disabled:opacity-40">
                {saving ? 'Saving…' : 'Save assessment'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
