/**
 * app/haccp/process-room/page.tsx
 *
 * CCP 3 + SOP 1 — Process Room
 * Card 1: Temperature check (product + room ambient) — AM + PM
 * Card 2: Daily diary — Opening / Operational / Closing checklists
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Session  = 'AM' | 'PM'
type Phase    = 'opening' | 'operational' | 'closing'
type TempStat = 'pass' | 'amber' | 'critical' | null

interface TempReading {
  session:             Session
  product_temp_c:      number
  room_temp_c:         number
  product_within_limit:boolean
  room_within_limit:   boolean
  within_limits:       boolean
  submitted_at:        string
}

interface DiaryEntry {
  phase:           Phase
  check_results:   Record<string, boolean>
  issues:          boolean
  what_did_you_do: string | null
  submitted_at:    string
}

// ─── Check item definitions ───────────────────────────────────────────────────

const CHECKS: Record<Phase, { key: string; label: string }[]> = {
  opening: [
    { key: 'steriliser',    label: 'Hot water steriliser: minimum 82°C verified' },
    { key: 'handwash',      label: 'Hand washing stations: soap, sanitiser, paper towels adequate' },
    { key: 'room_temp',     label: 'Room temperature: processing area ≤12°C' },
    { key: 'ppe',           label: 'PPE: adequate supplies available for all staff' },
    { key: 'hairnets',      label: 'Hair nets, overalls, safety footwear worn correctly' },
    { key: 'jewellery',     label: 'All jewellery and personal items removed' },
    { key: 'handwashing',   label: 'Proper hand washing technique observed' },
    { key: 'plasters',      label: 'Cuts/wounds covered with coloured plasters' },
    { key: 'health',        label: 'Health reporting compliance confirmed' },
    { key: 'no_food',       label: 'No eating, drinking, or smoking in production areas' },
  ],
  operational: [
    { key: 'temp_limits',   label: 'Products being processed within temperature limits' },
    { key: 'cleaning',      label: 'Cleaning schedule being followed' },
    { key: 'hygiene',       label: 'Staff following hygiene procedures' },
    { key: 'contamination', label: 'No cross-contamination risks observed' },
    { key: 'equipment',     label: 'Equipment functioning correctly' },
  ],
  closing: [
    { key: 'product_chilled', label: 'All product removed from production area and chilled' },
    { key: 'equip_clean',     label: 'Equipment cleaned and sanitised' },
    { key: 'steriliser_clean',label: 'Sterilisers drained and cleaned' },
    { key: 'waste',           label: 'Waste disposed of correctly' },
    { key: 'secured',         label: 'Production area locked and secured' },
  ],
}

const PHASE_LABELS: Record<Phase, string> = {
  opening:     'Opening checks',
  operational: 'Operational checks',
  closing:     'Closing checks',
}

const PHASE_SUBS: Record<Phase, string> = {
  opening:     'Before shift starts — 10 items',
  operational: 'Mid-shift checks — 5 items',
  closing:     'End of shift — 5 items',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function currentSession(): Session {
  return new Date().getHours() < 14 ? 'AM' : 'PM'
}

function productStatus(t: number): TempStat {
  if (isNaN(t)) return null
  return t <= 4 ? 'pass' : 'critical'
}

function roomStatus(t: number): TempStat {
  if (isNaN(t)) return null
  if (t <= 12)  return 'pass'
  if (t <= 15)  return 'amber'
  return 'critical'
}

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_BORDER: Record<string, string> = {
  pass:     'border-green-300 bg-green-50',
  amber:    'border-amber-400 bg-amber-50',
  critical: 'border-red-400 bg-red-50',
  empty:    'border-blue-200 bg-white',
}
const STATUS_VAL: Record<string, string> = {
  pass:     'text-green-600',
  amber:    'text-[#EB6619]',
  critical: 'text-red-600',
  empty:    'text-slate-300',
}
const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass', amber: 'Amber', critical: 'Critical',
}
const STATUS_BADGE: Record<string, string> = {
  pass:     'bg-green-100 text-green-600',
  amber:    'bg-amber-100 text-[#EB6619]',
  critical: 'bg-red-100 text-red-600',
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange, onClose, label, limit }: {
  value:    string
  onChange: (v: string) => void
  onClose:  () => void
  label:    string
  limit:    string
}) {
  const num    = parseFloat(value)
  const isNeg  = label.includes('room') || label.includes('Room') ? false : false
  const stat   = label.toLowerCase().includes('product') ? productStatus(num) : roomStatus(num)

  function press(key: string) {
    if (key === 'back') { onChange(value.slice(0,-1)); return }
    if (key === '.' && value.includes('.')) return
    if (key === '-') { onChange(value.startsWith('-') ? value.slice(1) : '-' + value); return }
    if (value === '0') { onChange(key); return }
    onChange(value + key)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','.','0','back']

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col" style={{position:'fixed'}}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-blue-100">
        <div>
          <p className="text-[#EB6619] text-xs font-bold tracking-widest uppercase">CCP 3 — Process Room</p>
          <h2 className="text-slate-900 text-xl font-bold mt-0.5">{label}</h2>
          <p className="text-slate-400 text-sm mt-0.5">Limit: {limit}</p>
        </div>
        <button onClick={onClose} className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <div className={`text-6xl font-bold tracking-tight transition-colors ${stat ? STATUS_VAL[stat] : 'text-slate-300'}`}>
            {value || '—'}
            <span className="text-2xl ml-2 opacity-60">°C</span>
          </div>
          {stat && (
            <div className={`mt-3 inline-block px-4 py-1.5 rounded-full text-sm font-bold ${STATUS_BADGE[stat]}`}>
              {STATUS_LABEL[stat]}
            </div>
          )}
          {/* Verbatim warning for room >12°C */}
          {stat === 'amber' && label.toLowerCase().includes('room') && (
            <div className="mt-4 mx-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-left">
              <p className="text-amber-700 text-xs font-bold uppercase tracking-widest mb-1.5">CCP 3 — Required action</p>
              <p className="text-slate-600 text-xs leading-relaxed">Do NOT stop cutting. Bring product progressively in small quantities. Monitor product core temperature — must stay ≤4°C. Investigate cause.</p>
            </div>
          )}
          {stat === 'critical' && label.toLowerCase().includes('product') && (
            <p className="text-slate-400 text-xs mt-3 max-w-xs mx-auto">Return product to chilled storage immediately. Record time above limit.</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {keys.map((k) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); press(k) }}
              className={`h-16 rounded-2xl text-xl font-semibold select-none transition-all active:scale-95 ${k === 'back' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white active:bg-orange-500'}`}>
              {k === 'back' ? (
                <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="13" y2="14"/><line x1="13" y1="9" x2="18" y2="14"/></svg>
              ) : k}
            </button>
          ))}
        </div>
        <button onClick={onClose} disabled={!value || isNaN(parseFloat(value))}
          className="w-full max-w-xs bg-[#EB6619] text-white font-bold py-4 rounded-2xl text-base disabled:opacity-40">
          Confirm {value ? `${value}°C` : ''}
        </button>
      </div>
    </div>
  )
}

// ─── CCA Popup ────────────────────────────────────────────────────────────────

function CCAPopup({ productTemp, roomTemp, onSubmit, onBack }: {
  productTemp: number
  roomTemp:    number
  onSubmit:    (action: string, disposition: string, notes: string) => void
  onBack:      () => void
}) {
  const [action,      setAction]      = useState('')
  const [disposition, setDisposition] = useState('')
  const [notes,       setNotes]       = useState('')

  const productBreached = productTemp > 4
  const roomBreached    = roomTemp > 12

  const roomActions = roomTemp > 15
    ? ['Stop loading product into room', 'Return all product to chilled storage immediately', 'Investigate cooling failure urgently', 'Do not resume until temperature is below 12°C']
    : ['Bring product progressively in small quantities only', 'Monitor product core temperature closely', 'Investigate cause — check air conditioning/cooling', 'Do not stop cutting']

  const productActions = [
    'Return product to chilled storage immediately',
    'Record time product was above temperature limit',
    'If <2 hours at <8°C: complete processing within 30 minutes then chill',
    'If >2 hours or >8°C: segregate product for safety assessment',
  ]

  const actions = productBreached ? productActions : roomActions

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{position:'fixed'}}>
      <div className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <p className="text-red-600 text-xs font-bold tracking-widest uppercase">CCP 3 deviation</p>
            <h2 className="text-slate-900 text-xl font-bold mt-0.5">Corrective Action Required</h2>
          </div>
          <button onClick={onBack} className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Deviation summary */}
          <div className="space-y-2">
            {productBreached && (
              <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                <p className="text-red-600 font-semibold text-sm">Product temp: {productTemp}°C — limit ≤4°C</p>
                <p className="text-slate-400 text-xs mt-0.5">Return to chilled storage. Apply time-based decision tree.</p>
              </div>
            )}
            {roomBreached && (
              <div className={`border rounded-xl px-4 py-3 ${roomTemp > 15 ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
                <p className={`font-semibold text-sm ${roomTemp > 15 ? 'text-red-600' : 'text-[#EB6619]'}`}>Room temp: {roomTemp}°C — limit ≤12°C</p>
                {roomTemp <= 15 && <p className="text-slate-500 text-xs mt-0.5 font-medium">Do NOT stop cutting — bring product progressively.</p>}
              </div>
            )}
          </div>

          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Action taken (CA-001)</p>
            <div className="space-y-2">
              {actions.map((a) => (
                <button key={a} onClick={() => setAction(a)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all border ${action === a ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Product disposition</p>
            <div className="grid grid-cols-3 gap-2">
              {['Accept','Conditional accept','Assess','Reject','Dispose'].map((d) => (
                <button key={d} onClick={() => setDisposition(d)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${disposition === d ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Notes (optional)</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Additional details…"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none"/>
          </div>

          <button onClick={() => onSubmit(action, disposition, notes)}
            disabled={!action || !disposition}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-xl text-base disabled:opacity-40">
            Confirm &amp; submit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Diary Phase Card ─────────────────────────────────────────────────────────

function DiaryPhaseCard({
  phase, existing, onSubmit,
}: {
  phase:    Phase
  existing: DiaryEntry | undefined
  onSubmit: (phase: Phase, results: Record<string,boolean>, issues: boolean, note: string) => Promise<void>
}) {
  const checks  = CHECKS[phase]
  const isDone  = !!existing
  const [open,  setOpen]   = useState(false)
  const [results, setResults] = useState<Record<string,boolean>>({})
  const [issues,  setIssues]  = useState(false)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  const allAnswered = checks.every((c) => results[c.key] !== undefined)

  function toggle(key: string, val: boolean) {
    setResults((prev) => ({ ...prev, [key]: val }))
    // If anything is set to false, auto-toggle issues on
    if (!val) setIssues(true)
  }

  async function handleSubmit() {
    if (!allAnswered) { setErr('Answer all items before submitting'); return }
    if (issues && !note.trim()) { setErr('Describe what was done about the issue'); return }
    setSaving(true); setErr('')
    await onSubmit(phase, results, issues, note)
    setSaving(false)
  }

  if (isDone) {
    const anyFail = Object.values(existing.check_results).some((v) => v === false)
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl overflow-hidden">
        <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-slate-900 font-semibold text-sm">{PHASE_LABELS[phase]}</p>
            <p className="text-green-600 text-xs mt-0.5">
              Done · {new Date(existing.submitted_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
              {anyFail ? ' · issues noted' : ' · all pass'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {existing.issues && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#EB6619]">Issue noted</span>}
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </button>
        {open && (
          <div className="px-4 pb-4 border-t border-blue-100 pt-3 space-y-1.5">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${existing.check_results[c.key] ? 'bg-green-100' : 'bg-red-50'}`}>
                  {existing.check_results[c.key]
                    ? <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  }
                </div>
                <p className="text-slate-500 text-xs">{c.label}</p>
              </div>
            ))}
            {existing.issues && existing.what_did_you_do && (
              <div className="mt-3 bg-amber-50 border-l-2 border-amber-400 pl-3 py-2 border-radius-0">
                <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-0.5">Action taken</p>
                <p className="text-slate-500 text-xs italic">{existing.what_did_you_do}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`border rounded-2xl overflow-hidden ${open ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-white'}`}>
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-slate-900 font-semibold text-sm">{PHASE_LABELS[phase]}</p>
          <p className="text-slate-400 text-xs mt-0.5">{PHASE_SUBS[phase]}</p>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M19 9l-7 7-7-7"/></svg>
      </button>

      {open && (
        <div className="border-t border-blue-100">
          <div className="px-4 py-3 space-y-2">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <button onPointerDown={(e) => { e.preventDefault(); toggle(c.key, true) }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border-2 transition-all active:scale-95 ${results[c.key] === true ? 'bg-green-100 border-green-300' : 'bg-white border-slate-300'}`}>
                  <svg className={`w-5 h-5 ${results[c.key] === true ? 'text-green-600' : 'text-slate-300'}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <button onPointerDown={(e) => { e.preventDefault(); toggle(c.key, false) }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border-2 transition-all active:scale-95 ${results[c.key] === false ? 'bg-red-50 border-red-400' : 'bg-white border-slate-300'}`}>
                  <svg className={`w-5 h-5 ${results[c.key] === false ? 'text-red-600' : 'text-slate-300'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <p className="text-slate-700 text-sm flex-1">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="px-4 pb-4 space-y-3 border-t border-blue-100 pt-3">
            <div className="flex items-center gap-3">
              <p className="text-slate-500 text-sm">Any issues?</p>
              <div className="flex gap-2 ml-auto">
                {[true, false].map((v) => (
                  <button key={String(v)} onClick={() => setIssues(v)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${issues === v ? (v ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-green-100 border-green-300 text-green-600') : 'bg-white border-slate-300 text-slate-600'}`}>
                    {v ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </div>

            {issues && (
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="What did you do? Describe the action taken…"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none"/>
            )}

            {err && <p className="text-red-600 text-xs">{err}</p>}

            <button onClick={handleSubmit} disabled={!allAnswered || saving}
              className="w-full bg-[#EB6619] text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2">
              {saving
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Submitting…</>
                : `Submit ${PHASE_LABELS[phase].toLowerCase()}`
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProcessRoomPage() {
  const [temps,     setTemps]     = useState<TempReading[]>([])
  const [diary,     setDiary]     = useState<DiaryEntry[]>([])
  const [session,   setSession]   = useState<Session>(currentSession())
  const [date,      setDate]      = useState(todayISO())
  const [loading,   setLoading]   = useState(true)
  const [submitErr, setSubmitErr] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Numpad state
  const [numpadField, setNumpadField] = useState<'product' | 'room' | null>(null)
  const [productVal,  setProductVal]  = useState('')
  const [roomVal,     setRoomVal]     = useState('')

  // CCA state
  const [showCCA, setShowCCA] = useState(false)
  const [tempSubmitPending, setTempSubmitPending] = useState(false)

  // Quick ref state
  const [showQuick, setShowQuick] = useState(false)

  // Load today's data
  const loadData = useCallback((forDate: string) => {
    setLoading(true)
    fetch(`/api/haccp/process-room?date=${forDate}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => {
        const allTemps: TempReading[] = d.temps ?? []
        const allDiary: DiaryEntry[]  = d.diary ?? []
        setTemps(allTemps)
        setDiary(allDiary)
        // Smart session default — first unsubmitted
        const amDone = allTemps.some((t) => t.session === 'AM')
        const pmDone = allTemps.some((t) => t.session === 'PM')
        if (amDone && !pmDone) setSession('PM')
        else setSession('AM')
      })
      .catch((e) => setSubmitErr(`Could not load data — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData(date) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDateChange(newDate: string) {
    setDate(newDate)
    setProductVal('')
    setRoomVal('')
    loadData(newDate)
  }

  // Clear temp inputs when session switches
  useEffect(() => {
    const existing = temps.find((t) => t.session === session)
    if (existing) {
      setProductVal(String(existing.product_temp_c))
      setRoomVal(String(existing.room_temp_c))
    } else {
      setProductVal('')
      setRoomVal('')
    }
  }, [session, temps])

  const sessionReading     = temps.find((t) => t.session === session)
  const sessionAlreadyDone = !!sessionReading

  const productNum = parseFloat(productVal)
  const roomNum    = parseFloat(roomVal)
  const pStat      = productStatus(productNum)
  const rStat      = roomStatus(roomNum)
  const bothFilled = productVal !== '' && !isNaN(productNum) && roomVal !== '' && !isNaN(roomNum)
  const hasDeviation = (pStat === 'critical') || (rStat === 'amber') || (rStat === 'critical')

  // Submit temperature session
  const handleTempSubmit = useCallback(() => {
    if (!bothFilled) return
    if (hasDeviation) { setShowCCA(true); setTempSubmitPending(true); return }
    doTempSubmit()
  }, [bothFilled, hasDeviation])

  const doTempSubmit = useCallback(async () => {
    setShowCCA(false); setTempSubmitPending(false); setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/process-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'temps', session, date, product_temp_c: productNum, room_temp_c: roomNum }),
      })
      if (res.ok) {
        setSubmitted(true)
        loadData(date)
        setTimeout(() => setSubmitted(false), 2000)
      } else {
        const d = await res.json()
        setSubmitErr(d.error ?? 'Submission failed')
      }
    } catch { setSubmitErr('Connection error — try again') }
  }, [session, date, productNum, roomNum, loadData])

  // Submit diary phase
  const handleDiarySubmit = useCallback(async (phase: Phase, results: Record<string,boolean>, issues: boolean, note: string) => {
    setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/process-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'diary', phase, date, check_results: results, issues, what_did_you_do: note }),
      })
      if (res.ok) { loadData(date) }
      else { const d = await res.json(); setSubmitErr(d.error ?? 'Submission failed') }
    } catch { setSubmitErr('Connection error — try again') }
  }, [date, loadData])

  const tileClass = (s: TempStat, isEmpty: boolean) =>
    `flex-1 rounded-2xl p-4 cursor-pointer border transition-all active:scale-[0.97] ${
      isEmpty        ? STATUS_BORDER.empty :
      s === 'pass'   ? STATUS_BORDER.pass  :
      s === 'amber'  ? STATUS_BORDER.amber :
                       STATUS_BORDER.critical
    }`

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">CCP 3 + SOP 1 — Process Room</p>
          <h1 className="text-slate-900 text-lg font-bold leading-tight">Process Room Check</h1>
        </div>
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded-xl px-3 py-2 text-slate-500 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/process-room' }}
          className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl px-3 py-2 text-[#EB6619] transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 text-slate-400 text-sm mt-16">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
          Loading…
        </div>
      ) : (
        <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

          {submitErr && <p className="text-red-600 text-sm">{submitErr}</p>}

          {/* ── Card 1: Temperature check ── */}
          <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-semibold text-sm">Temperature check</p>
                <p className="text-slate-400 text-xs mt-0.5">CCP 3 · tap to enter reading</p>
              </div>
              <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)}
                max={todayISO()}
                className="bg-white border border-blue-100 rounded-xl px-3 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-orange-500" />
              <div className="flex gap-2">
                {(['AM','PM'] as Session[]).map((s) => {
                  const done = temps.some((t) => t.session === s)
                  return (
                    <button key={s} onClick={() => setSession(s)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${session === s ? 'bg-[#EB6619] text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {done && <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex gap-3">
                {/* Product temp */}
                <div className={tileClass(pStat, productVal === '')}
                  onPointerDown={() => !sessionAlreadyDone && setNumpadField('product')}>
                  <p className="text-slate-400 text-xs mb-1.5">Product core</p>
                  <p className={`text-2xl font-bold ${pStat ? STATUS_VAL[pStat] : 'text-slate-300'}`}>
                    {productVal !== '' && !isNaN(productNum) ? `${productNum}°C` : 'Tap'}
                  </p>
                  <p className="text-slate-300 text-[10px] mt-1">Limit ≤4°C</p>
                  {pStat && productVal !== '' && <p className={`text-[10px] font-bold mt-1 ${STATUS_VAL[pStat]}`}>{STATUS_LABEL[pStat]}</p>}
                </div>

                {/* Room temp */}
                <div className={tileClass(rStat, roomVal === '')}
                  onPointerDown={() => !sessionAlreadyDone && setNumpadField('room')}>
                  <p className="text-slate-400 text-xs mb-1.5">Room ambient</p>
                  <p className={`text-2xl font-bold ${rStat ? STATUS_VAL[rStat] : 'text-slate-300'}`}>
                    {roomVal !== '' && !isNaN(roomNum) ? `${roomNum}°C` : 'Tap'}
                  </p>
                  <p className="text-slate-300 text-[10px] mt-1">Limit ≤12°C</p>
                  {rStat && roomVal !== '' && <p className={`text-[10px] font-bold mt-1 ${STATUS_VAL[rStat]}`}>{STATUS_LABEL[rStat]}</p>}
                </div>
              </div>

              {/* Room >12°C verbatim warning */}
              {rStat && rStat !== 'pass' && roomVal !== '' && (
                <div className={`rounded-xl px-4 py-3 border ${rStat === 'critical' ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${rStat === 'critical' ? 'text-red-600' : 'text-[#EB6619]'}`}>
                    {rStat === 'critical' ? 'Critical — room temp action required' : 'Room temp above 12°C — CCP 3 guidance'}
                  </p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    {rStat === 'critical'
                      ? 'Stop loading product into the room. Return all product to chilled storage immediately. Investigate cooling failure.'
                      : 'Do NOT stop cutting. Bring product to production area progressively in small quantities to ensure core temperature does not exceed 4°C. Monitor product core temperature more frequently. Investigate cause.'}
                  </p>
                </div>
              )}

              {/* Submit / already done */}
              {sessionAlreadyDone ? (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <p className="text-green-600 font-bold text-sm">{session} check submitted</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Product: {sessionReading?.product_temp_c}°C · Room: {sessionReading?.room_temp_c}°C
                    </p>
                  </div>
                </div>
              ) : submitted ? (
                <div className="flex items-center justify-center gap-2 py-3">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  <p className="text-green-600 font-bold text-sm">Submitted</p>
                </div>
              ) : (
                <button onClick={handleTempSubmit} disabled={!bothFilled}
                  className="w-full bg-[#EB6619] text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Submit {session} temperature check
                  {hasDeviation && bothFilled ? ' — action required' : ''}
                </button>
              )}
            </div>
          </div>

          {/* ── Card 2: Daily diary ── */}
          <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-blue-100 flex items-center justify-between">
              <div>
                <p className="text-slate-900 font-semibold text-sm">Shift diary</p>
                <p className="text-slate-400 text-xs mt-0.5">SOP 1 · three phases</p>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                diary.length === 3 ? 'bg-green-100 text-green-600' :
                diary.length > 0   ? 'bg-amber-100 text-[#EB6619]' :
                                     'bg-slate-50 text-slate-400'
              }`}>
                {diary.length} of 3 done
              </span>
            </div>

            <div className="p-3 space-y-2">
              {(['opening','operational','closing'] as Phase[]).map((phase) => (
                <DiaryPhaseCard
                  key={phase}
                  phase={phase}
                  existing={diary.find((d) => d.phase === phase)}
                  onSubmit={handleDiarySubmit}
                />
              ))}
            </div>

            <div className="mx-4 mb-4 border-l-2 border-amber-300 pl-3 py-1" style={{borderRadius:0}}>
              <p className="text-slate-400 text-xs italic leading-relaxed">
                "Problems are always happening — the important thing is to show what is being done to put things right."
              </p>
            </div>
          </div>

        </div>
      )}

      {/* Numpad */}
      {numpadField && (
        <Numpad
          value={numpadField === 'product' ? productVal : roomVal}
          onChange={(v) => numpadField === 'product' ? setProductVal(v) : setRoomVal(v)}
          onClose={() => setNumpadField(null)}
          label={numpadField === 'product' ? 'Product core temperature' : 'Room ambient temperature'}
          limit={numpadField === 'product' ? '≤4°C' : '≤12°C'}
        />
      )}

      {/* CCA popup */}
      {showCCA && (
        <CCAPopup
          productTemp={productNum}
          roomTemp={roomNum}
          onSubmit={() => doTempSubmit()}
          onBack={() => { setShowCCA(false); setTempSubmitPending(false) }}
        />
      )}

      {/* Quick reference */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-900 font-bold text-lg">CCP 3 — Quick Reference</h3>
              <button onClick={() => setShowQuick(false)}
                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Product core temperature</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0"/><span className="text-slate-600">≤4°C — Pass</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0"/><span className="text-slate-600">&gt;4°C — Critical: return to chilled storage immediately</span></div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Room ambient temperature</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0"/><span className="text-slate-600">≤12°C — Pass</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#EB6619] flex-shrink-0"/><span className="text-slate-600">12–15°C — Amber: do NOT stop cutting, bring product in small batches</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0"/><span className="text-slate-600">&gt;15°C — Critical: stop loading, return all product</span></div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <p className="text-amber-700 font-bold text-xs uppercase tracking-widest mb-1.5">Key rule (verbatim — HB-001)</p>
                <p className="text-slate-600 text-xs leading-relaxed italic">"Do NOT stop cutting. Bring product to production area progressively in small quantities to ensure core temperature does not exceed 4°C."</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
