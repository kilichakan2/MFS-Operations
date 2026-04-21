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

// ─── CA constants (Batch 4 — adaptive redesign) ──────────────────────────────

const CAUSE_OPTIONS = [
  'A/C or cooling failure',
  'Doors left open',
  'Product held in room too long',
  'Batch too large',
  'Equipment failure',
  'Power interruption',
  'Other',
]

const RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  'A/C or cooling failure':        ['Schedule A/C maintenance', 'Install temperature alarm', 'Other'],
  'Doors left open':               ['Retrain staff on door discipline', 'Add door-close reminder signage', 'Other'],
  'Product held in room too long': ['Retrain staff on batch timing', 'Reduce batch sizes', 'Other'],
  'Batch too large':               ['Reduce batch sizes', 'Retrain staff on batch timing', 'Other'],
  'Equipment failure':             ['Contact refrigeration/maintenance engineer', 'Schedule maintenance check', 'Install temperature alarm', 'Other'],
  'Power interruption':            ['Install temperature alarm', 'Review backup power options', 'Schedule maintenance check', 'Other'],
  'Other':                         ['Schedule maintenance check', 'Retrain staff', 'Install temperature alarm', 'Other'],
}

const PROTOCOL_STEPS: Record<string, string[]> = {
  product_breach: [
    'Return product to chilled storage immediately',
    'Record time product was above temperature limit',
    'If <2 hours at <8\u00b0C: complete processing within 30 minutes then chill',
    'If >2 hours or >8\u00b0C: segregate product for safety assessment',
    'Reduce batch sizes for future processing',
  ],
  room_breach_high: [
    'Stop loading product into room',
    'Return all product to chilled storage immediately',
    'Investigate cooling failure urgently',
    'Do not resume until temperature below 12\u00b0C',
  ],
  room_breach_amber: [
    'Do NOT stop cutting',
    'Bring product to production progressively in small quantities',
    'Monitor product core temperature — must remain \u22644\u00b0C',
    'If core temp rises above 4\u00b0C, return to chilled storage',
    'Investigate cause — check A/C and cooling unit',
  ],
  equipment_failure: [
    'Document time of failure discovery',
    'Transfer products to chilled storage immediately',
    'Estimate time product was at elevated temperature',
    'Contact refrigeration/maintenance engineer urgently',
    'Assess each product individually (if >2h above limit)',
    'Complete equipment failure log',
  ],
}

function getProtocolKey(cause: string, productBreached: boolean, roomBreached: boolean, roomTemp: number): string {
  if (cause === 'Equipment failure') return 'equipment_failure'
  if (productBreached) return 'product_breach'
  if (roomBreached)    return roomTemp > 15 ? 'room_breach_high' : 'room_breach_amber'
  return 'product_breach'
}

function getDispositionDefault(cause: string, productBreached: boolean, roomBreached: boolean, roomTemp: number): string {
  if (cause === 'Equipment failure') return 'Assess'
  if (productBreached)               return 'Assess'
  if (roomBreached && roomTemp > 15) return 'Assess'
  return 'Accept'
}

function getDispositionOptions(cause: string, productBreached: boolean, roomBreached: boolean, roomTemp: number): string[] {
  if (cause === 'Equipment failure') return ['Assess', 'Conditional accept', 'Reject']
  if (productBreached)               return ['Assess', 'Reject', 'Conditional accept']
  if (roomBreached && roomTemp > 15) return ['Assess', 'Reject']
  return ['Accept', 'Assess', 'Conditional accept']
}

// ─── CCAPopup ─────────────────────────────────────────────────────────────────

function CCAPopup({ productTemp, roomTemp, onSubmit, onBack }: {
  productTemp: number
  roomTemp:    number
  onSubmit:    (ca: CAPayload) => void
  onBack:      () => void
}) {
  const productBreached = productTemp > 4
  const roomBreached    = roomTemp > 12

  const [cause,       setCause]       = useState('')
  const [disposition, setDisposition] = useState(getDispositionDefault('', productBreached, roomBreached, roomTemp))
  const [recurrence,  setRecurrence]  = useState('')
  const [notes,       setNotes]       = useState('')

  const protocolKey   = getProtocolKey(cause, productBreached, roomBreached, roomTemp)
  const protocolSteps = PROTOCOL_STEPS[protocolKey] ?? []
  const dispOptions   = getDispositionOptions(cause, productBreached, roomBreached, roomTemp)

  useEffect(() => {
    setDisposition(getDispositionDefault(cause, productBreached, roomBreached, roomTemp))
    setRecurrence('')
  }, [cause]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = Boolean(cause && disposition && recurrence)

  function handleConfirm() {
    onSubmit({ cause, disposition, recurrence, notes: notes.trim() })
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{position:'fixed'}}>
      <div className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">

        <div className="flex items-start justify-between p-6 pb-4 sticky top-0 bg-white border-b border-slate-100 z-10">
          <div>
            <p className="text-red-600 text-xs font-bold tracking-widest uppercase">CCP 3 deviation</p>
            <h2 className="text-slate-900 text-xl font-bold mt-0.5">Corrective Action Required</h2>
          </div>
          <button onClick={onBack} className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-95 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-6 pb-8 pt-4 space-y-5">

          {/* Deviation summary */}
          <div className="space-y-2">
            {productBreached && (
              <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                <p className="text-red-600 font-semibold text-sm">Product temp: {productTemp}\u00b0C \u2014 limit \u22644\u00b0C</p>
                <p className="text-slate-400 text-xs mt-0.5">Return to chilled storage. Apply time-based decision tree.</p>
              </div>
            )}
            {roomBreached && (
              <div className={`border rounded-xl px-4 py-3 ${roomTemp > 15 ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
                <p className={`font-semibold text-sm ${roomTemp > 15 ? 'text-red-600' : 'text-[#EB6619]'}`}>Room temp: {roomTemp}\u00b0C \u2014 limit \u226412\u00b0C</p>
                {roomTemp <= 15 && <p className="text-slate-500 text-xs mt-0.5 font-medium">Do NOT stop cutting \u2014 bring product progressively.</p>}
              </div>
            )}
          </div>

          {/* Required protocol — read only */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
              Required action (CA-001)
              {cause === 'Equipment failure' && <span className="ml-1 text-amber-600 normal-case font-normal">\u2014 equipment failure override</span>}
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
              {protocolSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 bg-red-100 text-red-600">{i + 1}</div>
                  <p className="text-slate-700 text-xs leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Cause */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">What caused this?</p>
            <div className="grid grid-cols-2 gap-2">
              {CAUSE_OPTIONS.map((c) => (
                <button key={c} onClick={() => setCause(c)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                    cause === c ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'
                  }`}>{c}</button>
              ))}
            </div>
          </div>

          {/* Disposition — pre-filled, limited options */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Product disposition</p>
            <div className="flex flex-wrap gap-2">
              {dispOptions.map((d) => (
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
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Recurrence prevention</p>
              <div className="space-y-1.5">
                {(RECURRENCE_BY_CAUSE[cause] ?? RECURRENCE_BY_CAUSE['Other']).map((r) => (
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
              placeholder="Additional details\u2026"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none"/>
          </div>

          <p className="text-slate-400 text-xs">This record is immutable once submitted. Protocol per CA-001.</p>

          <button onClick={handleConfirm} disabled={!canSubmit}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-xl text-base disabled:opacity-40">
            Confirm &amp; submit
          </button>
        </div>
      </div>
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
    doTempSubmit(null)
  }, [bothFilled, hasDeviation])

  const doTempSubmit = useCallback(async (ca: CAPayload | null) => {
    setShowCCA(false); setTempSubmitPending(false); setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/process-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'temps', session, date, product_temp_c: productNum, room_temp_c: roomNum, corrective_action: ca }),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.ca_write_failed) {
          setSubmitErr('Readings saved, but corrective action record failed. Please notify admin.')
          return
        }
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
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">CCP 3 + SOP 1 — Process Room</p>
          <h1 className="text-white text-lg font-bold leading-tight">Process Room Check</h1>
        </div>
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/18 border border-white/15 rounded-xl px-3 py-2 text-white/60 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/process-room' }}
          className="flex items-center gap-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40 rounded-xl px-3 py-2 text-orange-300 transition-all text-xs font-bold flex-shrink-0">
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
          onSubmit={(ca) => doTempSubmit(ca)}
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
