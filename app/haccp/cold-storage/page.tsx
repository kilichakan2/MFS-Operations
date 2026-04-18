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
  unit_type:     'chiller' | 'freezer'
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
  if (temp <= 5)  return 'pass'
  if (temp <= 8)  return 'amber'
  return 'critical'
}

function getCorrectiveAction(status: TempStatus, unitType: string): string {
  if (status === 'amber' && unitType === 'freezer') return 'Keep door closed. Check for ice build-up on coils. Monitor closely. Acceptable short-term if product is re-frozen immediately.'
  if (status === 'critical' && unitType === 'freezer') return 'Assess product for thawing — check ice crystal formation and texture. Transfer to a functioning freezer. Do NOT refreeze if product has already thawed.'
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
  pass:     'bg-[#639922]/20 border-[#639922]/50 text-[#97C459]',
  amber:    'bg-[#EB6619]/20 border-[#EB6619]/55 text-[#EB6619]',
  critical: 'bg-[#E24B4A]/20 border-[#E24B4A]/60 text-[#F09595]',
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
    <div className="fixed inset-0 bg-[#16205B] z-50 flex flex-col" style={{ position: 'fixed' }}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
        <div>
          <p className="text-[#EB6619] text-xs font-bold tracking-widest uppercase">CCP 2 — Cold Storage</p>
          <h2 className="text-white text-xl font-bold mt-0.5">{unitName}</h2>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white/70 p-2">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <div className={`text-6xl font-bold tracking-tight transition-colors ${
            status === 'pass' ? 'text-[#97C459]' : status === 'amber' ? 'text-[#EB6619]' : status === 'critical' ? 'text-[#F09595]' : 'text-white'
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
            <p className="text-white/50 text-xs mt-3 max-w-xs mx-auto leading-relaxed">{getCorrectiveAction(status, unitType)}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {keys.map((k) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); press(k) }}
              className={`h-16 rounded-2xl text-xl font-semibold select-none transition-all active:scale-95 ${
                k === 'back' ? 'bg-white/10 text-white/60' : 'bg-white/10 text-white active:bg-[#EB6619]'
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

function CCAPopup({ deviations, onSubmit, onBack }: {
  deviations: { name: string; temp: number; status: TempStatus; unitType: string }[]
  onSubmit:   (action: string, disposition: string, notes: string) => void
  onBack:     () => void
}) {
  const [action,      setAction]      = useState('')
  const [disposition, setDisposition] = useState('')
  const [notes,       setNotes]       = useState('')

  const worst = deviations.find((d) => d.status === 'critical') ?? deviations[0]

  const actions = worst?.status === 'critical'
    ? ['Transfer all product to backup unit immediately', 'Call refrigeration engineer', 'Probe individual product temperatures', 'Segregate affected product for assessment']
    : ['Check door seals and closure', 'Reduce loading / check not overloaded', 'Recheck temperature in 30 minutes', 'Transfer product to backup unit', 'Call refrigeration engineer']

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end justify-center" style={{ position: 'fixed' }}>
      <div className="bg-[#0f1840] rounded-t-3xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[#F09595] text-xs font-bold tracking-widest uppercase">CCP 2 deviation</p>
            <h2 className="text-white text-xl font-bold mt-0.5">Corrective Action Required</h2>
          </div>
          <button onClick={onBack} className="text-white/40 hover:text-white/70">
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
          <div>
            <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Action taken</label>
            <div className="space-y-2">
              {actions.map((a) => (
                <button key={a} onClick={() => setAction(a)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                    action === a ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white/8 border-white/10 text-white/70'
                  }`}>{a}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Product disposition</label>
            <div className="grid grid-cols-3 gap-2">
              {['Accept', 'Conditional accept', 'Assess', 'Reject', 'Dispose'].map((d) => (
                <button key={d} onClick={() => setDisposition(d)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    disposition === d ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white/8 border-white/10 text-white/50'
                  }`}>{d}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Any additional details…"
              className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#EB6619] resize-none" />
          </div>

          <button onClick={() => onSubmit(action, disposition, notes)}
            disabled={!action || !disposition}
            className="w-full bg-[#E24B4A] text-white font-bold py-4 rounded-xl text-base disabled:opacity-40">
            Confirm corrective action &amp; submit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ColdStoragePage() {
  const [units,     setUnits]     = useState<StorageUnit[]>([])
  const [existing,  setExisting]  = useState<ExistingReading[]>([])
  const [session,   setSession]   = useState<'AM' | 'PM'>(currentSession())
  const [date,      setDate]      = useState(todayISO())
  const [temps,     setTemps]     = useState<Record<string, string>>({})
  const [comments,  setComments]  = useState('')
  const [loading,   setLoading]   = useState(true)
  const [submitting,setSubmitting] = useState(false)
  const [submitError,setSubmitError] = useState('')
  const [numpadUnit,setNumpadUnit] = useState<StorageUnit | null>(null)
  const [showCCA,   setShowCCA]   = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch('/api/haccp/cold-storage')
      .then((r) => r.json())
      .then((d) => {
        setUnits(d.units ?? [])
        setExisting(d.readings ?? [])
        setDate(d.date ?? todayISO())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Pre-fill if readings already exist for this session
  useEffect(() => {
    const sessionReadings = existing.filter((r) => r.session === session)
    if (sessionReadings.length > 0) {
      const pre: Record<string, string> = {}
      sessionReadings.forEach((r) => { pre[r.unit_id] = String(r.temperature_c) })
      setTemps(pre)
    }
  }, [existing, session])

  const allFilled = units.length > 0 && units.every((u) => temps[u.id] !== undefined && temps[u.id] !== '')

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
    doSubmit('', '', '')
  }, [deviations])

  const doSubmit = useCallback(async (action: string, disposition: string, notes: string) => {
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
        body:    JSON.stringify({ session, date, readings, comments }),
      })
      if (res.ok) {
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
      <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-[#639922]/25 flex items-center justify-center">
          <svg className="w-10 h-10 text-[#97C459]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p className="text-white text-xl font-bold">Session submitted</p>
        <p className="text-white/40 text-sm">CCP 2 · {session} · {date}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-white/10">
        <button onClick={() => { window.location.href = '/haccp' }} className="text-white/50 hover:text-white/80 transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <p className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">CCP 2 — Cold Storage</p>
          <h1 className="text-white text-lg font-bold leading-tight">Temperature Check</h1>
        </div>
      </div>

      {/* Session + date selectors */}
      <div className="px-5 py-4 flex items-center gap-4 border-b border-white/8">
        <div className="flex gap-2">
          {(['AM', 'PM'] as const).map((s) => (
            <button key={s} onClick={() => setSession(s)}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${session === s ? 'bg-[#EB6619] text-white' : 'bg-white/10 text-white/50'}`}>
              {s}
            </button>
          ))}
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#EB6619]" />
        <span className="text-white/30 text-xs ml-auto">SOP 3 — check twice daily</span>
      </div>

      {/* Unit list */}
      <div className="flex-1 px-5 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-3 text-white/40 text-sm mt-8">
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
                status === 'critical' ? 'bg-[#E24B4A]/12 border-[#E24B4A]/55' :
                status === 'amber'    ? 'bg-[#EB6619]/10 border-[#EB6619]/45' :
                status === 'pass'     ? 'bg-[#639922]/10 border-[#639922]/40' :
                'bg-white/6 border-white/10'
              }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-base">{unit.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {unit.unit_type === 'freezer' ? 'Target ≤-18°C' : 'Target ≤5°C · Max 8°C'}
                    {existing_session ? ' · Already recorded' : ''}
                  </p>
                </div>
                <div className="text-right">
                  {raw !== '' && !isNaN(numVal) ? (
                    <>
                      <p className={`text-2xl font-bold ${status === 'pass' ? 'text-[#97C459]' : status === 'amber' ? 'text-[#EB6619]' : 'text-[#F09595]'}`}>
                        {numVal}°C
                      </p>
                      {status && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BG[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="w-20 h-12 rounded-xl bg-white/8 border border-white/12 flex items-center justify-center text-white/30 text-sm">
                      Tap
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Comments + submit */}
      <div className="px-5 pb-6 space-y-3 border-t border-white/8 pt-4">
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2}
          placeholder="Comments (optional)…"
          className="w-full bg-white/8 border border-white/12 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#EB6619] resize-none" />

        {submitError && <p className="text-[#F09595] text-xs">{submitError}</p>}
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
    </div>
  )
}
