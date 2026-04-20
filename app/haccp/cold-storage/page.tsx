/**
 * app/haccp/cold-storage/page.tsx
 *
 * CCP 2 — Cold Storage Temperature Check
 * AM and PM readings for all 5 units.
 * Corrective Action popup fires if any reading is amber or critical.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StorageUnit {
  id:            string
  name:          string
  unit_type:     'chiller' | 'freezer' | 'room'
  target_temp_c: number
  max_temp_c:    number
}

interface ExistingReading {
  unit_id:     string
  session:     'AM' | 'PM'
  temperature_c: number
  temp_status: string
  comments:    string | null
}

type TempStatus = 'pass' | 'amber' | 'critical' | null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTempStatus(temp: number, unitType: string): TempStatus {
  if (isNaN(temp)) return null
  if (unitType === 'freezer') {
    if (temp <= -18) return 'pass'
    if (temp <= -15) return 'amber'
    return 'critical'
  }
  if (unitType === 'room') {
    if (temp <= 12) return 'pass'
    if (temp <= 15) return 'amber'
    return 'critical'
  }
  // chiller: ≤5 pass, 5–8 amber, >8 critical (CA-001)
  if (temp <= 5)  return 'pass'
  if (temp <= 8)  return 'amber'
  return 'critical'
}

function getCorrectiveAction(status: TempStatus, unitType: string): string {
  if (status === 'amber' && unitType === 'freezer') return 'Keep door closed. Check for ice build-up on coils. Monitor closely. Acceptable short-term if product is re-frozen immediately.'
  if (status === 'critical' && unitType === 'freezer') return 'Assess product for thawing — check ice crystal formation and texture. Transfer to a functioning freezer. Do NOT refreeze if product has already thawed.'
  if (status === 'amber' && unitType === 'room') return 'Room temperature rising above 12°C. Investigate cause — check air conditioning and cooling unit. Bring product to production area in small quantities only. Monitor product core temperatures closely.'
  if (status === 'critical' && unitType === 'room') return 'CRITICAL: Room temperature above 15°C. Stop bringing product in. Return all product to chilled storage immediately. Do not resume production until cooling failure is resolved and temperature is back below 12°C.'
  if (status === 'amber') return 'Check door seals and closure. Verify unit is not overloaded. Reduce loading if necessary. Recheck within 30 minutes. Transfer product to backup chiller if temperature is still rising. Call refrigeration engineer.'
  if (status === 'critical') return 'CRITICAL: Minimise door openings immediately. Transfer ALL product to backup refrigeration unit. Probe individual product temperatures. Contact refrigeration engineer urgently. Segregate any product above 8°C for safety assessment. Supervisor sign-off required.'
  return ''
}

function currentSession(): 'AM' | 'PM' {
  return new Date().getHours() < 14 ? 'AM' : 'PM'
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_BG: Record<string, string> = {
  pass:     'bg-green-50 border-green-300 text-green-600',
  amber:    'bg-amber-50 border-amber-400 text-[#EB6619]',
  critical: 'bg-red-50 border-red-400 text-red-600',
}

const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass', amber: 'Amber', critical: 'Critical',
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange, onClose, unitName, unitType }: {
  value:    string
  onChange: (v: string) => void
  onClose:  () => void
  unitName: string
  unitType: string
}) {
  const numericVal = parseFloat(value)
  const status     = getTempStatus(numericVal, unitType)
  const isNeg      = unitType === 'freezer'

  function press(key: string) {
    if (key === 'back') { onChange(value.slice(0, -1)); return }
    if (key === '.' && value.includes('.')) return
    if (key === '-') { onChange(value.startsWith('-') ? value.slice(1) : '-' + value); return }
    if (value === '0') { onChange(key); return }
    onChange(value + key)
  }

  const keys = ['1','2','3','4','5','6','7','8','9', isNeg ? '-' : '.', '0', 'back']

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col" style={{ position: 'fixed' }}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-blue-100">
        <div>
          <p className="text-[#EB6619] text-xs font-bold tracking-widest uppercase">CCP 2 — Cold Storage</p>
          <h2 className="text-slate-900 text-xl font-bold mt-0.5">{unitName}</h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <div className={`text-6xl font-bold tracking-tight transition-colors ${
            status === 'pass' ? 'text-green-600' : status === 'amber' ? 'text-[#EB6619]' : status === 'critical' ? 'text-red-600' : 'text-white'
          }`}>
            {value || '—'}
            <span className="text-2xl ml-2 opacity-60">°C</span>
          </div>
          {status && (
            <div className={`mt-3 inline-block px-4 py-1.5 rounded-full text-sm font-bold border ${STATUS_BG[status]}`}>
              {STATUS_LABEL[status]}
              {status !== 'pass' && <span className="ml-2 opacity-80 text-xs">— action required</span>}
            </div>
          )}
          {status && status !== 'pass' && (
            <p className="text-slate-400 text-xs mt-3 max-w-xs mx-auto leading-relaxed">{getCorrectiveAction(status, unitType)}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {keys.map((k) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); press(k) }}
              className={`h-16 rounded-2xl text-xl font-semibold select-none transition-all active:scale-95 ${
                k === 'back' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white active:bg-orange-500'
              }`}>
              {k === 'back' ? (
                <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="13" y2="14"/><line x1="13" y1="9" x2="18" y2="14"/></svg>
              ) : k}
            </button>
          ))}
        </div>

        <button onClick={onClose} disabled={!value || isNaN(parseFloat(value))}
          className="w-full max-w-xs bg-[#EB6619] text-white font-bold py-4 rounded-2xl text-base disabled:opacity-40 transition-opacity">
          Confirm {value ? `${value}°C` : ''}
        </button>
      </div>
    </div>
  )
}

// ─── CCA Popup ────────────────────────────────────────────────────────────────

type CAPayload = {
  cause:       string
  action:      string
  disposition: string
  recurrence:  string
  notes:       string
}

const CAUSE_OPTIONS = [
  'Door left open',
  'Unit overloaded',
  'Seal damaged',
  'Equipment failure',
  'Power interruption',
  'Other',
]

const RECURRENCE_OPTIONS = [
  'Retrain staff on door discipline',
  'Schedule maintenance check',
  'Reduce loading limit',
  'Replace door seal',
  'Install temperature alarm',
  'Other',
]

const DISPOSITION_OPTIONS = ['Accept', 'Conditional accept', 'Assess', 'Reject', 'Dispose']

/**
 * Action list per CA-001. Equipment failure cause overrides the status-based
 * list with the dedicated equipment-failure action set.
 */
function getActionList(
  cause: string,
  worstStatus: TempStatus,
  worstUnitType: string,
): string[] {
  if (cause === 'Equipment failure') {
    return [
      'Document time of failure discovery',
      'Transfer products to backup refrigeration',
      'Estimate time product was at elevated temperature',
      'Contact refrigeration engineer',
      'Assess each product individually (if >2h above limit)',
      'Complete equipment failure log',
    ]
  }
  if (worstUnitType === 'freezer') {
    if (worstStatus === 'critical') {
      return [
        'Assess product for thawing (ice crystal formation, texture)',
        'Transfer to functioning freezer',
        'Do NOT refreeze if product has thawed',
      ]
    }
    return [
      'Keep door closed',
      'Check for ice build-up on coils',
      'Acceptable short-term if product re-frozen immediately',
    ]
  }
  if (worstUnitType === 'room') {
    if (worstStatus === 'critical') {
      return [
        'Stop bringing product into room',
        'Return all product to chilled storage immediately',
        'Investigate cooling failure',
        'Do not resume production until <12°C',
      ]
    }
    return [
      'Investigate cooling cause (A/C, cooling unit)',
      'Bring product in small quantities only',
      'Monitor core temperatures closely',
    ]
  }
  // chiller
  if (worstStatus === 'critical') {
    return [
      'Minimise door openings',
      'Transfer all product to backup unit immediately',
      'Probe individual products to assess core temperature',
      'Segregate any product >8°C for assessment',
      'Contact refrigeration engineer urgently',
      'Assess all product for safety before release',
    ]
  }
  return [
    'Check door seals and closure',
    'Verify unit not overloaded / reduce loading',
    'Recheck temperature within 30 minutes',
    'Transfer product to backup chiller',
    'Call refrigeration engineer',
  ]
}

function CCAPopup({ deviations, onSubmit, onBack }: {
  deviations: { name: string; temp: number; status: TempStatus; unitType: string }[]
  onSubmit:   (ca: CAPayload) => void
  onBack:     () => void
}) {
  const [cause,           setCause]           = useState('')
  const [causeOther,      setCauseOther]      = useState('')
  const [action,          setAction]          = useState('')
  const [disposition,     setDisposition]     = useState('')
  const [recurrence,      setRecurrence]      = useState('')
  const [recurrenceOther, setRecurrenceOther] = useState('')
  const [notes,           setNotes]           = useState('')

  const worst       = deviations.find((d) => d.status === 'critical') ?? deviations[0]
  const worstStatus = worst?.status ?? 'amber'
  const worstType   = worst?.unitType ?? 'chiller'

  const actions = getActionList(cause, worstStatus, worstType)

  // If cause changes and the currently-picked action is no longer in the list, clear it
  useEffect(() => {
    if (action && !actions.includes(action)) setAction('')
  }, [cause]) // eslint-disable-line react-hooks/exhaustive-deps

  const finalCause      = cause === 'Other'      ? causeOther.trim()      : cause
  const finalRecurrence = recurrence === 'Other' ? recurrenceOther.trim() : recurrence

  const canSubmit = Boolean(finalCause && action && disposition && finalRecurrence)

  function handleConfirm() {
    onSubmit({
      cause:       finalCause,
      action,
      disposition,
      recurrence:  finalRecurrence,
      notes:       notes.trim(),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end justify-center" style={{ position: 'fixed' }}>
      <div className="bg-white rounded-t-3xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-red-600 text-xs font-bold tracking-widest uppercase">CCP 2 deviation</p>
            <h2 className="text-slate-900 text-xl font-bold mt-0.5">Corrective Action Required</h2>
          </div>
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="space-y-2 mb-5">
          {deviations.map((d) => (
            <div key={d.name} className={`rounded-xl p-3 border ${STATUS_BG[d.status ?? 'amber']}`}>
              <span className="font-semibold text-sm">{d.name}: {d.temp}°C</span>
              <span className="ml-2 text-xs opacity-75">— {STATUS_LABEL[d.status ?? 'amber']}</span>
              <p className="text-xs mt-1 opacity-70">{getCorrectiveAction(d.status, d.unitType)}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {/* Cause */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Cause of deviation</label>
            <div className="grid grid-cols-2 gap-2">
              {CAUSE_OPTIONS.map((c) => (
                <button key={c} onClick={() => setCause(c)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                    cause === c ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'
                  }`}>{c}</button>
              ))}
            </div>
            {cause === 'Other' && (
              <input type="text" value={causeOther} onChange={(e) => setCauseOther(e.target.value)}
                placeholder="Describe the cause…"
                className="mt-2 w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            )}
          </div>

          {/* Action taken */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Action taken</label>
            {!cause ? (
              <p className="text-xs text-slate-400 italic px-1">Select a cause first to see relevant actions.</p>
            ) : (
              <div className="space-y-2">
                {actions.map((a) => (
                  <button key={a} onClick={() => setAction(a)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                      action === a ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}>{a}</button>
                ))}
              </div>
            )}
          </div>

          {/* Product disposition */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Product disposition</label>
            <div className="grid grid-cols-3 gap-2">
              {DISPOSITION_OPTIONS.map((d) => (
                <button key={d} onClick={() => setDisposition(d)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    disposition === d ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'
                  }`}>{d}</button>
              ))}
            </div>
          </div>

          {/* Recurrence prevention */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Recurrence prevention</label>
            <div className="grid grid-cols-1 gap-2">
              {RECURRENCE_OPTIONS.map((r) => (
                <button key={r} onClick={() => setRecurrence(r)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    recurrence === r ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'
                  }`}>{r}</button>
              ))}
            </div>
            {recurrence === 'Other' && (
              <input type="text" value={recurrenceOther} onChange={(e) => setRecurrenceOther(e.target.value)}
                placeholder="Describe the prevention measure…"
                className="mt-2 w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Any additional details…"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
          </div>

          <button onClick={handleConfirm}
            disabled={!canSubmit}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-xl text-base disabled:opacity-40">
            Confirm corrective action &amp; submit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ColdStoragePage() {
  const [units,      setUnits]      = useState<StorageUnit[]>([])
  const [existing,   setExisting]   = useState<ExistingReading[]>([])
  const [session,    setSession]    = useState<'AM' | 'PM'>(currentSession())
  const [date,       setDate]       = useState(todayISO())
  const [temps,      setTemps]      = useState<Record<string, string>>({})
  const [comments,   setComments]   = useState('')
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError,setSubmitError]= useState('')
  const [numpadUnit, setNumpadUnit] = useState<StorageUnit | null>(null)
  const [showCCA,    setShowCCA]    = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  // Quick reference panel state
  const [showQuick, setShowQuick] = useState(false)

  function openHandbook() {
    window.location.href = '/haccp/documents/hb-001?from=/haccp/cold-storage'
  }

  // Separate function so we can call it on date change too
  const loadReadings = useCallback((forDate: string) => {
    fetch(`/api/haccp/cold-storage?date=${forDate}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`)
        return r.json()
      })
      .then((d) => {
        const loadedUnits    = d.units    ?? []
        const loadedReadings = d.readings ?? []
        setUnits(loadedUnits)
        setExisting(loadedReadings)
        // Default to first unsubmitted session
        const amDone = loadedUnits.length > 0 &&
          loadedUnits.every((u: StorageUnit) => loadedReadings.some((r: ExistingReading) => r.unit_id === u.id && r.session === 'AM'))
        const pmDone = loadedUnits.length > 0 &&
          loadedUnits.every((u: StorageUnit) => loadedReadings.some((r: ExistingReading) => r.unit_id === u.id && r.session === 'PM'))
        if (amDone && !pmDone) setSession('PM')
        else setSession('AM')
      })
      .catch((err) => {
        console.error('[cold-storage] fetch failed:', err)
        setSubmitError('Could not load units — check connection')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadReadings(date)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when date changes
  function handleDateChange(newDate: string) {
    setDate(newDate)
    setLoading(true)
    setTemps({})
    loadReadings(newDate)
  }

  // Pre-fill if readings already exist for this session
  useEffect(() => {
    const sessionReadings = existing.filter((r) => r.session === session)
    if (sessionReadings.length > 0) {
      const pre: Record<string, string> = {}
      sessionReadings.forEach((r) => { pre[r.unit_id] = String(r.temperature_c) })
      setTemps(pre)
    } else {
      setTemps({})  // Clear — don't leak previous session's values into an empty session
    }
  }, [existing, session])

  const allFilled = units.length > 0 && units.every((u) => temps[u.id] !== undefined && temps[u.id] !== '')

  // True when all units already have a reading for the current session (read-only mode)
  const sessionAlreadyDone = units.length > 0 &&
    units.every((u) => existing.some((r) => r.unit_id === u.id && r.session === session))

  const deviations = units
    .filter((u) => {
      const t = parseFloat(temps[u.id] ?? '')
      return !isNaN(t) && getTempStatus(t, u.unit_type) !== 'pass'
    })
    .map((u) => ({
      name:     u.name,
      temp:     parseFloat(temps[u.id]),
      status:   getTempStatus(parseFloat(temps[u.id]), u.unit_type),
      unitType: u.unit_type,
    }))

  const handleSubmitAttempt = useCallback(() => {
    if (deviations.length > 0) { setShowCCA(true); return }
    doSubmit(null)
  }, [deviations])

  const doSubmit = useCallback(async (ca: CAPayload | null) => {
    setSubmitting(true)
    setShowCCA(false)
    try {
      const readings = units.map((u) => ({
        unit_id:       u.id,
        temperature_c: parseFloat(temps[u.id]),
        unit_type:     u.unit_type,
      }))
      const res = await fetch('/api/haccp/cold-storage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session, date, readings, comments, corrective_action: ca }),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.ca_write_failed) {
          // Readings saved but CA row(s) didn't — don't silently succeed
          setSubmitError('Readings saved, but corrective action record failed. Please notify admin.')
          setSubmitting(false)
          return
        }
        setSubmitted(true)
        setTimeout(() => { window.location.href = '/haccp' }, 2000)
      } else {
        const d = await res.json()
        setSubmitError(d.error ?? 'Submission failed')
      }
    } catch { setSubmitError('Connection error — try again') }
    finally { setSubmitting(false) }
  }, [units, temps, session, date, comments])

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p className="text-slate-900 text-xl font-bold">Session submitted</p>
        <p className="text-slate-400 text-sm">CCP 2 · {session} · {date}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">CCP 2 — Cold Storage</p>
          <h1 className="text-white text-lg font-bold leading-tight">Temperature Check</h1>
        </div>
        {/* ? quick-tip button */}
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/18 border border-white/15 rounded-xl px-3 py-2 text-white/60 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        {/* Handbook button — navigates to dedicated document page */}
        <button onClick={openHandbook}
          className="flex items-center gap-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40 rounded-xl px-3 py-2 text-orange-300 transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      {/* Session + date selectors */}
      <div className="px-5 py-4 flex items-center gap-4 border-b border-blue-100">
        <div className="flex gap-2">
          {(['AM', 'PM'] as const).map((s) => {
            const isDone = units.length > 0 &&
              units.every((u) => existing.some((r) => r.unit_id === u.id && r.session === s))
            return (
              <button key={s} onClick={() => setSession(s)}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                  session === s ? 'bg-[#EB6619] text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                {isDone && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                {s}
              </button>
            )
          })}
        </div>
        <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)}
          max={todayISO()}
          className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-[#EB6619]" />
        <span className="text-slate-400 text-xs ml-auto">SOP 3 — check twice daily</span>
      </div>

      {/* Unit list */}
      <div className="flex-1 px-5 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-3 text-slate-400 text-sm mt-8">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Loading units…
          </div>
        ) : units.map((unit) => {
          const raw    = temps[unit.id] ?? ''
          const numVal = parseFloat(raw)
          const status = raw !== '' && !isNaN(numVal) ? getTempStatus(numVal, unit.unit_type) : null
          const existing_session = existing.find((r) => r.unit_id === unit.id && r.session === session)

          return (
            <button key={unit.id}
              onClick={() => setNumpadUnit(unit)}
              className={`w-full text-left rounded-2xl p-4 border transition-all active:scale-[0.98] ${
                status === 'critical' ? 'bg-red-50 border-red-400' :
                status === 'amber'    ? 'bg-amber-50 border-amber-300' :
                status === 'pass'     ? 'bg-green-50 border-green-200' :
                'bg-white border-blue-100'
              }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-900 font-semibold text-base">{unit.name}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {unit.unit_type === 'freezer' ? 'Target ≤-18°C' :
                     unit.unit_type === 'room'    ? 'Room ambient · Max 12°C' :
                                                   'Target ≤5°C · Max 8°C'}
                    {existing_session ? ' · Already recorded' : ''}
                  </p>
                </div>
                <div className="text-right">
                  {raw !== '' && !isNaN(numVal) ? (
                    <>
                      <p className={`text-2xl font-bold ${status === 'pass' ? 'text-green-600' : status === 'amber' ? 'text-[#EB6619]' : 'text-red-600'}`}>
                        {numVal}°C
                      </p>
                      {status && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BG[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="w-20 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 text-sm">
                      Tap
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Comments + submit — hidden when session already done */}
      <div className="px-5 pb-6 border-t border-blue-100 pt-4">
        {sessionAlreadyDone ? (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <p className="text-green-600 font-bold text-sm">{session} check already submitted</p>
              <p className="text-slate-400 text-xs mt-0.5">Readings recorded above are read-only</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2}
              placeholder="Comments (optional)…"
              className="w-full bg-slate-50 border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-[#EB6619] resize-none" />
            {submitError && <p className="text-red-600 text-xs">{submitError}</p>}
            <button onClick={handleSubmitAttempt}
              disabled={!allFilled || submitting}
              className="w-full bg-[#EB6619] text-white font-bold py-4 rounded-2xl text-base disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
              {submitting ? (
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              )}
              {submitting ? 'Submitting…' : `Submit ${session} check`}
            </button>
          </div>
        )}
      </div>

      {/* Numpad overlay */}
      {numpadUnit && (
        <Numpad
          value={temps[numpadUnit.id] ?? ''}
          onChange={(v) => setTemps((prev) => ({ ...prev, [numpadUnit.id]: v }))}
          onClose={() => setNumpadUnit(null)}
          unitName={numpadUnit.name}
          unitType={numpadUnit.unit_type}
        />
      )}

      {/* CCA popup */}
      {showCCA && (
        <CCAPopup
          deviations={deviations}
          onSubmit={doSubmit}
          onBack={() => setShowCCA(false)}
        />
      )}

      {/* Quick reference panel */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-900 font-bold text-lg">CCP 2 — Quick Reference</h3>
              <button onClick={() => setShowQuick(false)} className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Chillers (Lamb, Dispatch, Dairy)</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0"/><span className="text-slate-600">≤5°C — Pass</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#EB6619] flex-shrink-0"/><span className="text-slate-600">5–8°C — Amber: check seals, recheck in 30 min</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0"/><span className="text-slate-600">&gt;8°C — Critical: transfer all product, call engineer</span></div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Process Room (ambient)</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0"/><span className="text-slate-600">≤12°C — Pass</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#EB6619] flex-shrink-0"/><span className="text-slate-600">12–15°C — Amber: investigate cooling</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0"/><span className="text-slate-600">&gt;15°C — Critical: stop loading, return product to storage</span></div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Freezer</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0"/><span className="text-slate-600">≤-18°C — Pass</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#EB6619] flex-shrink-0"/><span className="text-slate-600">-15 to -18°C — Amber: keep door closed, check coils</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0"/><span className="text-slate-600">&gt;-15°C — Critical: assess for thawing, do NOT refreeze</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
