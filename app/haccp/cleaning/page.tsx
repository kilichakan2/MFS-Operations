/**
 * app/haccp/cleaning/page.tsx
 *
 * SOP 2 + SOP 2B — Cleaning Diary
 * Event-driven: log each clean throughout the day.
 * No AM/PM session — multiple entries per day, form resets after each submit.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CleanEntry {
  id:              string
  date:            string
  time_of_clean:   string
  what_was_cleaned:string
  issues:          boolean
  what_did_you_do: string | null
  verified_by:     string | null
  submitted_at:    string
  users:           { name: string }
}

// ─── Category chips ───────────────────────────────────────────────────────────

const CATEGORIES: { label: string; freq: string }[] = [
  { label: 'Knives',                          freq: 'After each use + 82°C steriliser start/end of shift' },
  { label: 'Knife steriliser (82°C)',          freq: 'Start and end of shift — temp logged' },
  { label: 'Cutting boards',                  freq: 'Between product types + end of shift' },
  { label: 'Work surfaces / prep tables',     freq: 'Every 2 hours during production + end of shift' },
  { label: 'Mincing equipment',               freq: 'After each run + end of shift' },
  { label: 'Vacuum packer / MAP machine',     freq: 'End of each shift' },
  { label: 'Weighing scales',                 freq: 'End of each shift' },
  { label: 'Production area floor',           freq: 'End of each shift' },
  { label: 'Production area drains',          freq: 'End of each shift' },
  { label: 'Cold storage interior',           freq: 'Weekly + after spillage' },
  { label: 'Corridor / welfare areas',        freq: 'End of each shift' },
  { label: 'Other',                           freq: '' },
]

const VERIFIED_BY_PRESETS = ['Daryl', 'Hakan', 'Ege']

// ─── CA constants (SOP 2 issues) ──────────────────────────────────────────────

type CAPayload = { cause: string; disposition: string; recurrence: string; notes: string }

const SOP2_CAUSES = [
  'Visible residue remaining after clean',
  'Steriliser not reaching 82°C',
  'Cleaning agent unavailable or wrong dilution',
  'Equipment damage preventing full clean',
  'Time pressure — clean was rushed',
  'Other',
]

const SOP2_RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  'Visible residue remaining after clean':     ['Retrain on 4-step cleaning process', 'Increase cleaning time allocated', 'Check cleaning agent concentration', 'Other'],
  'Steriliser not reaching 82°C':              ['Service or replace steriliser immediately', 'Log steriliser temps at start of every shift', 'Use chemical sanitiser as backup until fixed', 'Other'],
  'Cleaning agent unavailable or wrong dilution': ['Review stock levels and set reorder trigger', 'Keep backup supply on-site', 'Post dilution guide at cleaning station', 'Other'],
  'Equipment damage preventing full clean':    ['Take equipment out of service immediately', 'Report for maintenance', 'Do not use until repaired and re-verified', 'Other'],
  'Time pressure — clean was rushed':          ['Review production schedule — allow adequate cleaning time', 'Do not start next batch until clean is verified', 'Raise with supervisor', 'Other'],
  'Other':                                     ['Review cleaning procedure', 'Retrain staff', 'Schedule maintenance check', 'Other'],
}

const SOP2_DISPOSITIONS = ['Re-cleaned and verified', 'Equipment isolated', 'Supervisor notified', 'Maintenance requested']

const SOP2_PROTOCOL = [
  'Stop using affected equipment or area immediately',
  'Re-clean using the full 4-step process',
  'Verify clean before returning to use',
  'Do not continue production until re-clean is confirmed',
  'If issue cannot be resolved: notify supervisor and isolate area',
]

// ─── CCA Popup ────────────────────────────────────────────────────────────────

function CCAPopup({ onSubmit, onBack }: { onSubmit: (ca: CAPayload) => void; onBack: () => void }) {
  const [cause,       setCause]       = useState('')
  const [disposition, setDisposition] = useState(SOP2_DISPOSITIONS[0])
  const [recurrence,  setRecurrence]  = useState('')
  const [notes,       setNotes]       = useState('')

  const canSubmit = Boolean(cause && disposition && recurrence)

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{ position: 'fixed' }}>
      <div className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 pb-4 sticky top-0 bg-white border-b border-slate-100 z-10">
          <div>
            <p className="text-red-600 text-xs font-bold tracking-widest uppercase">Cleaning issue</p>
            <h2 className="text-slate-900 text-xl font-bold mt-0.5">Corrective Action Required</h2>
          </div>
          <button onClick={onBack} className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 pb-8 pt-4 space-y-5">
          {/* Protocol — read-only */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Required action — SOP 2</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
              {SOP2_PROTOCOL.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 bg-red-100 text-red-600">{i + 1}</div>
                  <p className="text-slate-700 text-xs leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Cause */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">What caused the issue?</p>
            <div className="grid grid-cols-2 gap-2">
              {SOP2_CAUSES.map((c) => (
                <button key={c} onClick={() => { setCause(c); setRecurrence('') }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border text-left ${
                    cause === c ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'
                  }`}>{c}</button>
              ))}
            </div>
          </div>
          {/* Disposition */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">What was done?</p>
            <div className="flex flex-wrap gap-2">
              {SOP2_DISPOSITIONS.map((d) => (
                <button key={d} onClick={() => setDisposition(d)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                    disposition === d ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-200 bg-white text-slate-400'
                  }`}>{d}</button>
              ))}
            </div>
          </div>
          {/* Recurrence — cause-aware */}
          {cause && (
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">How to prevent recurrence?</p>
              <div className="space-y-1.5">
                {(SOP2_RECURRENCE_BY_CAUSE[cause] ?? SOP2_RECURRENCE_BY_CAUSE['Other']).map((r) => (
                  <button key={r} onClick={() => setRecurrence(r)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                      recurrence === r ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'
                    }`}>{r}</button>
                ))}
              </div>
            </div>
          )}
          {/* Notes */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Notes <span className="normal-case font-normal">(optional)</span></p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Additional details…"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none"/>
          </div>
          <p className="text-slate-400 text-xs">This record is immutable once submitted. Protocol per SOP 2.</p>
          <button onClick={() => onSubmit({ cause, disposition, recurrence, notes: notes.trim() })}
            disabled={!canSubmit}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-xl text-base disabled:opacity-40">
            Confirm &amp; submit
          </button>
        </div>
      </div>
    </div>
  )
}



function nowDisplay(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function todayDisplay(): string {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

function entryTime(time_of_clean: string): string {
  return time_of_clean?.slice(0, 5) ?? '—'
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CleaningPage() {
  const [entries,   setEntries]   = useState<CleanEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [otherText, setOtherText] = useState('')
  const [issues,    setIssues]    = useState(false)
  const [note,      setNote]      = useState('')
  const [submitting,setSubmitting]= useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [flash,     setFlash]     = useState(false)
  const [showQuick, setShowQuick] = useState(false)
  const [timeNow,   setTimeNow]   = useState(nowDisplay())
  const [verifiedBy,setVerifiedBy]= useState('')
  const [showCCA,   setShowCCA]   = useState(false)

  // Keep displayed time current
  useEffect(() => {
    const t = setInterval(() => setTimeNow(nowDisplay()), 30000)
    return () => clearInterval(t)
  }, [])

  const loadEntries = useCallback(() => {
    fetch('/api/haccp/cleaning')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => setEntries(d.entries ?? []))
      .catch((e) => setSubmitErr(`Could not load log — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  function toggleCategory(cat: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function resetForm() {
    setSelected(new Set())
    setOtherText('')
    setIssues(false)
    setNote('')
    setVerifiedBy('')
    setSubmitErr('')
  }

  async function doSubmit(ca: CAPayload | null) {
    setShowCCA(false); setSubmitErr(''); setSubmitting(true)
    const cats    = Array.from(selected)
    const cleaned = cats
      .map((c) => c === 'Other' && otherText.trim() ? `Other: ${otherText.trim()}` : c)
      .join(', ')
    try {
      const res = await fetch('/api/haccp/cleaning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          what_was_cleaned: cleaned,
          issues,
          what_did_you_do: ca
            ? `${ca.cause} | ${ca.disposition} | ${ca.recurrence}`
            : undefined,
          verified_by: verifiedBy,
          corrective_action: ca ?? undefined,
        }),
      })
      if (res.ok) {
        setFlash(true)
        resetForm()
        loadEntries()
        setTimeout(() => setFlash(false), 2500)
      } else {
        const d = await res.json()
        setSubmitErr(d.error ?? 'Submission failed')
      }
    } catch { setSubmitErr('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  function handleSubmit() {
    setSubmitErr('')
    const cats = Array.from(selected)
    if (cats.length === 0)      { setSubmitErr('Select at least one item that was cleaned'); return }
    if (!verifiedBy.trim())     { setSubmitErr('Select who verified this clean'); return }
    if (issues) { setShowCCA(true); return }
    doSubmit(null)
  }

  const anyCatSelected = selected.size > 0

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">SOP 2 + SOP 2B — Cleaning</p>
          <h1 className="text-white text-lg font-bold leading-tight">Cleaning Diary</h1>
        </div>
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/18 border border-white/15 rounded-xl px-3 py-2 text-white/60 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/cleaning' }}
          className="flex items-center gap-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40 rounded-xl px-3 py-2 text-orange-300 transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* Time separation info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div>
            <p className="text-blue-700 text-[10px] font-bold uppercase tracking-widest mb-1">Cleaning reminder</p>
            <p className="text-slate-500 text-xs leading-relaxed">Full 4-step clean required between different product categories (e.g. lamb → beef, plain → allergen). Allergen products must always be processed after plain products with a verified clean in between. Log each changeover here.</p>
          </div>
        </div>

        {/* Success flash */}
        {flash && (
          <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="text-green-600 font-bold text-sm">Clean logged — ready for next entry</p>
          </div>
        )}

        {/* Log a clean form */}
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100">
            <p className="text-slate-900 font-semibold text-sm">Log a clean</p>
            <p className="text-slate-400 text-xs mt-0.5">Select everything that was cleaned</p>
          </div>

          {/* Category chips */}
          <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2">
            {CATEGORIES.map(({ label, freq }) => {
              const on = selected.has(label)
              return (
                <button key={label}
                  onPointerDown={(e) => { e.preventDefault(); toggleCategory(label) }}
                  className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 text-left ${
                    on ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-400'
                  }`}>
                  <span>{label}</span>
                  {freq && <span className={`block text-[10px] font-normal mt-0.5 ${on ? 'text-orange-400' : 'text-slate-300'}`}>{freq}</span>}
                </button>
              )
            })}
          </div>

          {/* Other free text — shown when Other is selected */}
          {selected.has('Other') && (
            <div className="px-4 pb-3">
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Describe what else was cleaned…"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
          )}

          <div className="h-px bg-slate-50 mx-4" />

          {/* Issues toggle */}
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-slate-600 text-sm">Any issues?</p>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} onClick={() => setIssues(v)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    issues === v
                      ? v
                        ? 'bg-[#EB6619] border-[#EB6619] text-white'
                        : 'bg-green-100 border-green-300 text-green-600'
                      : 'bg-white border-slate-300 text-slate-600'
                  }`}>
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {issues && (
            <div className="px-4 pb-3">
              <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-1">Corrective action required</p>
                <p className="text-slate-600 text-xs">Submit to open the corrective action form — you'll log the cause and what was done.</p>
              </div>
            </div>
          )}

          {/* Verified by */}
          <div className="px-4 pb-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Verified by</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {VERIFIED_BY_PRESETS.map((name) => (
                <button key={name}
                  onPointerDown={(e) => { e.preventDefault(); setVerifiedBy(name) }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                    verifiedBy === name ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-400'
                  }`}>{name}</button>
              ))}
              <button
                onPointerDown={(e) => { e.preventDefault(); setVerifiedBy('') }}
                className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                  verifiedBy !== '' && !VERIFIED_BY_PRESETS.includes(verifiedBy) ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-400'
                }`}>Other</button>
            </div>
            {/* Show text input if Other selected or no preset matches */}
            {!VERIFIED_BY_PRESETS.includes(verifiedBy) && (
              <input
                type="text"
                value={verifiedBy}
                onChange={(e) => setVerifiedBy(e.target.value)}
                placeholder="Enter name…"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500"
              />
            )}
          </div>

          {/* Date / time meta */}
          <div className="px-4 pb-3 flex items-center justify-between">
            <p className="text-slate-300 text-xs">{todayDisplay()}</p>
            <p className="text-slate-300 text-xs">Auto-time: {timeNow}</p>
          </div>

          {submitErr && <p className="px-4 pb-2 text-red-600 text-xs">{submitErr}</p>}

          <button onClick={handleSubmit}
            disabled={!anyCatSelected || submitting}
            className="w-full bg-[#EB6619] text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
            {submitting
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Submitting…</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Submit clean</>
            }
          </button>
        </div>

        {/* Today's log */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Today's log</p>
            {entries.length > 0 && (
              <span className="bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs font-bold text-green-600">
                {entries.length} {entries.length === 1 ? 'clean' : 'cleans'} logged
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-4">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Loading log…
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-slate-50 border border-blue-100 rounded-xl px-4 py-5 text-center">
              <p className="text-slate-400 text-sm">No cleans logged today yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div key={e.id}
                  className="bg-white border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium leading-snug">{e.what_was_cleaned}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{e.users?.name ?? 'Unknown'}{e.verified_by ? ` · Verified: ${e.verified_by}` : ''}</p>
                    {e.issues && e.what_did_you_do && (
                      <p className="text-[#EB6619] text-xs mt-1 italic leading-snug">{e.what_did_you_do}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <p className="text-slate-400 text-xs">{entryTime(e.time_of_clean)}</p>
                    {e.issues
                      ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#EB6619]">Issue noted</span>
                      : <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-600">No issues</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Quick reference */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-900 font-bold text-lg">SOP 2 — Quick Reference</h3>
              <button onClick={() => setShowQuick(false)}
                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-4">

              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-3">4-step cleaning process</p>
                <div className="space-y-2.5">
                  {[
                    ['1  Pre-clean',  'Remove all debris. Rinse with cold water.'],
                    ['2  Clean',      'Apply alkaline detergent at correct concentration. Scrub all surfaces.'],
                    ['3  Sanitise',   'Hot water ≥82°C for 30 seconds OR approved chemical sanitiser.'],
                    ['4  Verify',     'Visual inspection. Check temperature or concentration. Sign off.'],
                  ].map(([step, desc]) => (
                    <div key={step} className="flex gap-3">
                      <span className="text-[#EB6619] text-xs font-bold w-20 flex-shrink-0 pt-0.5">{step}</span>
                      <span className="text-slate-600 text-xs leading-relaxed">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-3">Minimum frequencies (SOP 2B)</p>
                <div className="space-y-2">
                  {[
                    ['Knives',                       'After each use + 82°C steriliser start/end of shift'],
                    ['Knife steriliser (82°C)',       'Start and end of shift — temp logged'],
                    ['Cutting boards',               'Between product types + end of shift'],
                    ['Work surfaces / prep tables',  'Every 2 hours during production + end of shift'],
                    ['Mincing equipment',            'After each run + end of shift'],
                    ['Vacuum packer / MAP machine',  'End of each shift'],
                    ['Weighing scales',              'End of each shift'],
                    ['Production area floor',        'End of each shift'],
                    ['Production area drains',       'End of each shift'],
                    ['Cold storage interior',        'Weekly + after spillage'],
                  ].map(([item, freq]) => (
                    <div key={item} className="flex gap-3">
                      <span className="text-slate-500 text-xs w-36 flex-shrink-0">{item}</span>
                      <span className="text-slate-400 text-xs">{freq}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <p className="text-amber-700 font-bold text-xs uppercase tracking-widest mb-1.5">Time separation rule</p>
                <p className="text-slate-600 text-xs leading-relaxed">Meat and mince require a full 4-step clean between categories. Process one at a time. Log each changeover in this diary.

Meat preparations containing allergens (marinades, coatings, seasonings) require the same strict separation — allergen products must always come AFTER plain products with a full verified clean in between.</p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* CCA Popup */}
      {showCCA && (
        <CCAPopup
          onSubmit={(ca) => doSubmit(ca)}
          onBack={() => setShowCCA(false)}
        />
      )}

    </div>
  )
}
