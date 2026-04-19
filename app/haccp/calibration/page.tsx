/**
 * app/haccp/calibration/page.tsx
 *
 * SOP 3 — Thermometer Calibration
 * Two modes: Manual test (monthly) OR Certified probe in use (annual purchase)
 *
 * Source: MF-001 p.11 · HB-001 SOP 3 · CA-001 Table 3
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'manual' | 'certified_probe'

interface CalibrationRecord {
  id:                    string
  date:                  string
  time_of_check:         string
  thermometer_id:        string
  calibration_mode:      Mode
  cert_reference:        string | null
  purchase_date:         string | null
  ice_water_result_c:    number | null
  ice_water_pass:        boolean | null
  boiling_water_result_c:number | null
  boiling_water_pass:    boolean | null
  action_taken:          string | null
  submitted_at:          string
  users:                 { name: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function todayDisplay() {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

function icePass(v: number)  { return v >= -1  && v <= 1   }
function boilPass(v: number) { return v >= 99  && v <= 101 }

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange, onClose, label, expected }: {
  value:    string
  onChange: (v: string) => void
  onClose:  () => void
  label:    string
  expected: string
}) {
  const num  = parseFloat(value)
  const isIce  = label.toLowerCase().includes('ice')
  const pass   = !isNaN(num) && (isIce ? icePass(num) : boilPass(num))
  const fail   = !isNaN(num) && !pass && value !== ''

  function press(k: string) {
    if (k === 'back') { onChange(value.slice(0, -1)); return }
    if (k === '.' && value.includes('.')) return
    if (k === '-') { onChange(value.startsWith('-') ? value.slice(1) : '-' + value); return }
    if (value === '0') { onChange(k); return }
    onChange(value + k)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','.','0','back']

  return (
    <div className="fixed inset-0 bg-[#16205B] z-50 flex flex-col" style={{position:'fixed'}}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
        <div>
          <p className="text-[#EB6619] text-xs font-bold tracking-widest uppercase">SOP 3 — Calibration</p>
          <h2 className="text-white text-xl font-bold mt-0.5">{label}</h2>
          <p className="text-white/35 text-sm mt-0.5">Pass range: {expected}</p>
        </div>
        <button onClick={onClose} className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <div className={`text-6xl font-bold tracking-tight ${fail ? 'text-[#F09595]' : pass ? 'text-[#97C459]' : 'text-white'}`}>
            {value || '—'}<span className="text-2xl ml-2 opacity-60">°C</span>
          </div>
          {value !== '' && !isNaN(num) && (
            <div className={`mt-3 inline-block px-5 py-1.5 rounded-full text-sm font-bold ${pass ? 'bg-[#639922]/25 text-[#97C459]' : 'bg-[#E24B4A]/25 text-[#F09595]'}`}>
              {pass ? 'Pass' : 'Fail — remove from service'}
            </div>
          )}
          {fail && (
            <div className="mt-4 mx-2 bg-[#E24B4A]/12 border border-[#E24B4A]/40 rounded-xl px-4 py-3 text-left">
              <p className="text-[#F09595] text-xs font-bold uppercase tracking-widest mb-1.5">Action required (CA-001)</p>
              <p className="text-white/65 text-xs leading-relaxed">Remove thermometer from service immediately. Use backup calibrated thermometer. Send failed unit for professional calibration or dispose.</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {keys.map((k) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); press(k) }}
              className={`h-16 rounded-2xl text-xl font-semibold select-none transition-all active:scale-95 ${k === 'back' ? 'bg-white/10 text-white/60' : 'bg-white/10 text-white active:bg-[#EB6619]'}`}>
              {k === 'back' ? (
                <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="13" y2="14"/><line x1="13" y1="9" x2="18" y2="14"/></svg>
              ) : k}
            </button>
          ))}
          {isIce && (
            <button onPointerDown={(e) => { e.preventDefault(); press('-') }}
              className="col-span-3 h-12 rounded-2xl bg-white/8 text-white/55 text-sm font-bold active:scale-95">
              +/− Toggle negative
            </button>
          )}
        </div>
        <button onClick={onClose} disabled={!value || isNaN(parseFloat(value))}
          className="w-full max-w-xs bg-[#EB6619] text-white font-bold py-4 rounded-2xl text-base disabled:opacity-40">
          Confirm {value ? `${value}°C` : ''}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalibrationPage() {
  const [records,       setRecords]       = useState<CalibrationRecord[]>([])
  const [doneThisMonth, setDoneThisMonth] = useState(false)
  const [loading,       setLoading]       = useState(true)

  // Form
  const [mode,         setMode]         = useState<Mode>('manual')
  const [probeId,      setProbeId]      = useState('')
  const [iceVal,       setIceVal]       = useState('')
  const [boilVal,      setBoilVal]      = useState('')
  const [actionTaken,  setActionTaken]  = useState('')
  const [certRef,      setCertRef]      = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [certNotes,    setCertNotes]    = useState('')

  // UI
  const [numpad,       setNumpad]       = useState<'ice' | 'boil' | null>(null)
  const [showQuick,    setShowQuick]    = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitErr,    setSubmitErr]    = useState('')
  const [flash,        setFlash]        = useState(false)

  const loadData = useCallback(() => {
    fetch('/api/haccp/calibration')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => { setRecords(d.records ?? []); setDoneThisMonth(d.done_this_month) })
      .catch((e) => setSubmitErr(`Could not load records — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const iceNum  = parseFloat(iceVal)
  const boilNum = parseFloat(boilVal)
  const iceFail  = iceVal  !== '' && !isNaN(iceNum)  && !icePass(iceNum)
  const boilFail = boilVal !== '' && !isNaN(boilNum) && !boilPass(boilNum)
  const anyFail  = iceFail || boilFail

  function resetForm() {
    setProbeId(''); setIceVal(''); setBoilVal(''); setActionTaken('')
    setCertRef(''); setPurchaseDate(''); setCertNotes(''); setSubmitErr('')
  }

  function switchMode(m: Mode) { setMode(m); resetForm() }

  const manualValid = probeId.trim() &&
    iceVal  !== '' && !isNaN(iceNum) &&
    boilVal !== '' && !isNaN(boilNum) &&
    (!anyFail || actionTaken.trim())

  const certValid = probeId.trim() && certRef.trim() && purchaseDate

  async function handleSubmit() {
    setSubmitErr('')
    const body = mode === 'certified_probe'
      ? { calibration_mode: 'certified_probe', thermometer_id: probeId, cert_reference: certRef, purchase_date: purchaseDate, notes: certNotes }
      : { calibration_mode: 'manual', thermometer_id: probeId, ice_water_result_c: iceNum, boiling_water_result_c: boilNum, action_taken: actionTaken }

    setSubmitting(true)
    try {
      const res = await fetch('/api/haccp/calibration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setFlash(true); resetForm(); loadData()
        setTimeout(() => setFlash(false), 2500)
      } else {
        const d = await res.json(); setSubmitErr(d.error ?? 'Submission failed')
      }
    } catch { setSubmitErr('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/9 hover:bg-white/14 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">SOP 3 — Calibration</p>
          <h1 className="text-white text-lg font-bold leading-tight">Thermometer Calibration</h1>
        </div>
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-white/9 hover:bg-white/14 border border-white/12 rounded-xl px-3 py-2 text-white/55 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/calibration' }}
          className="flex items-center gap-1.5 bg-[#EB6619]/15 hover:bg-[#EB6619]/25 border border-[#EB6619]/35 rounded-xl px-3 py-2 text-[#EB6619] transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* Monthly status banner */}
        {!loading && (
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${
            doneThisMonth
              ? 'bg-[#639922]/12 border-[#639922]/35'
              : 'bg-[#EB6619]/10 border-[#EB6619]/35'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${doneThisMonth ? 'bg-[#639922]/25' : 'bg-[#EB6619]/20'}`}>
              {doneThisMonth
                ? <svg className="w-4 h-4 text-[#97C459]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg className="w-4 h-4 text-[#EB6619]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
              }
            </div>
            <div>
              <p className={`font-bold text-sm ${doneThisMonth ? 'text-[#97C459]' : 'text-[#EB6619]'}`}>
                {doneThisMonth ? 'Calibration done this month' : 'Calibration due this month'}
              </p>
              <p className="text-white/38 text-xs mt-0.5">
                {doneThisMonth
                  ? 'Record logged — no further action required until next month'
                  : 'Complete monthly calibration check or log certified probe in use'}
              </p>
            </div>
          </div>
        )}

        {/* Flash */}
        {flash && (
          <div className="bg-[#639922]/20 border border-[#639922]/45 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#639922]/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[#97C459]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="text-[#97C459] font-bold text-sm">Calibration record saved</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-white/6 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8">
            <p className="text-white font-semibold text-sm">Log calibration</p>
            <p className="text-white/38 text-xs mt-0.5">Calibrate monthly before shift — SOP 3</p>
          </div>

          {/* Mode selector */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Calibration method</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => switchMode('manual')}
                className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all text-left ${
                  mode === 'manual' ? 'border-[#EB6619] bg-[#EB6619]/15 text-white' : 'border-white/12 bg-white/6 text-white/45'
                }`}>
                <p className={mode === 'manual' ? 'text-[#EB6619]' : 'text-white/35'} style={{fontSize:'10px', fontWeight:700, letterSpacing:'0.08em', marginBottom:'2px'}}>MONTHLY TEST</p>
                Manual calibration
              </button>
              <button onClick={() => switchMode('certified_probe')}
                className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all text-left ${
                  mode === 'certified_probe' ? 'border-[#EB6619] bg-[#EB6619]/15 text-white' : 'border-white/12 bg-white/6 text-white/45'
                }`}>
                <p className={mode === 'certified_probe' ? 'text-[#EB6619]' : 'text-white/35'} style={{fontSize:'10px', fontWeight:700, letterSpacing:'0.08em', marginBottom:'2px'}}>ANNUAL PURCHASE</p>
                Certified probe in use
              </button>
            </div>
          </div>

          <div className="px-4 py-3 space-y-4">

            {/* Probe ID — shared both modes */}
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">
                {mode === 'certified_probe' ? 'New probe ID / name' : 'Thermometer ID / name'}
              </p>
              <input type="text" value={probeId} onChange={(e) => setProbeId(e.target.value)}
                placeholder={mode === 'certified_probe' ? 'e.g. New Probe Apr 2026' : 'e.g. Probe 1, Backup Probe'}
                className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#EB6619]" />
            </div>

            {mode === 'manual' ? (
              <>
                {/* Ice water test */}
                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Ice water test — pass: -1°C to +1°C</p>
                  <button onClick={() => setNumpad('ice')}
                    className={`w-full rounded-2xl p-4 border-2 flex items-center justify-between transition-all ${
                      iceVal === '' ? 'border-white/12 bg-white/6' :
                      icePass(iceNum) ? 'border-[#639922]/50 bg-[#639922]/10' : 'border-[#E24B4A]/55 bg-[#E24B4A]/10'
                    }`}>
                    <div>
                      <p className="text-white/40 text-xs mb-1">Fill container with crushed ice + small amount of water, stir 2 min</p>
                      <p className={`text-2xl font-bold ${iceVal === '' ? 'text-white/25' : icePass(iceNum) ? 'text-[#97C459]' : 'text-[#F09595]'}`}>
                        {iceVal !== '' && !isNaN(iceNum) ? `${iceNum}°C` : 'Tap to enter'}
                      </p>
                    </div>
                    {iceVal !== '' && !isNaN(iceNum) && (
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${icePass(iceNum) ? 'bg-[#639922]/25 text-[#97C459]' : 'bg-[#E24B4A]/25 text-[#F09595]'}`}>
                        {icePass(iceNum) ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </button>
                </div>

                {/* Boiling water test */}
                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Boiling water test — pass: 99°C to 101°C</p>
                  <button onClick={() => setNumpad('boil')}
                    className={`w-full rounded-2xl p-4 border-2 flex items-center justify-between transition-all ${
                      boilVal === '' ? 'border-white/12 bg-white/6' :
                      boilPass(boilNum) ? 'border-[#639922]/50 bg-[#639922]/10' : 'border-[#E24B4A]/55 bg-[#E24B4A]/10'
                    }`}>
                    <div>
                      <p className="text-white/40 text-xs mb-1">Insert probe 2 inches into rolling boil, wait for stable reading</p>
                      <p className={`text-2xl font-bold ${boilVal === '' ? 'text-white/25' : boilPass(boilNum) ? 'text-[#97C459]' : 'text-[#F09595]'}`}>
                        {boilVal !== '' && !isNaN(boilNum) ? `${boilNum}°C` : 'Tap to enter'}
                      </p>
                    </div>
                    {boilVal !== '' && !isNaN(boilNum) && (
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${boilPass(boilNum) ? 'bg-[#639922]/25 text-[#97C459]' : 'bg-[#E24B4A]/25 text-[#F09595]'}`}>
                        {boilPass(boilNum) ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </button>
                </div>

                {/* Action taken — required if any fail */}
                {anyFail && (
                  <div>
                    <div className="bg-[#E24B4A]/12 border border-[#E24B4A]/40 rounded-xl px-4 py-3 mb-3">
                      <p className="text-[#F09595] text-xs font-bold uppercase tracking-widest mb-1.5">Calibration failure — CA-001 required actions</p>
                      <div className="space-y-1.5">
                        {[
                          'Remove thermometer from service immediately',
                          'Use backup calibrated thermometer',
                          'Send failed unit for professional calibration or dispose',
                          'Review all temperature readings taken with the faulty probe',
                        ].map((a) => (
                          <div key={a} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#F09595] flex-shrink-0 mt-1.5"/>
                            <p className="text-white/65 text-xs">{a}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Action taken (required)</p>
                    <textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} rows={2}
                      placeholder="Describe what was done — e.g. probe removed from service, backup probe used, sent for calibration…"
                      className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#EB6619] resize-none" />
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Certified probe mode */}
                <div className="bg-[#639922]/10 border border-[#639922]/30 rounded-xl px-4 py-3">
                  <p className="text-[#97C459] text-xs font-bold uppercase tracking-widest mb-1.5">HB-001 SOP 3 — Certified probe</p>
                  <p className="text-white/60 text-xs leading-relaxed">A new probe purchased with a UKAS or traceable calibration certificate satisfies the FSA calibration requirement without requiring the monthly ice/boiling water test.</p>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Certificate reference</p>
                  <input type="text" value={certRef} onChange={(e) => setCertRef(e.target.value)}
                    placeholder="e.g. UKAS-2026-04-1234 or supplier cert number"
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#EB6619]" />
                </div>
                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Probe purchase date</p>
                  <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)}
                    max={new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })}
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#EB6619]" />
                </div>
                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Notes (optional)</p>
                  <textarea value={certNotes} onChange={(e) => setCertNotes(e.target.value)} rows={2}
                    placeholder="Any additional notes…"
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#EB6619] resize-none" />
                </div>
              </>
            )}

            <p className="text-white/28 text-xs">{todayDisplay()}</p>
            {submitErr && <p className="text-[#F09595] text-xs">{submitErr}</p>}

          </div>

          <button onClick={handleSubmit}
            disabled={!(mode === 'certified_probe' ? certValid : manualValid) || submitting}
            className="w-full bg-[#EB6619] text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
            {submitting
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                {mode === 'certified_probe' ? 'Log certified probe' : 'Submit calibration'}</>
            }
          </button>
        </div>

        {/* History */}
        <div>
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">Calibration history</p>
          {loading ? (
            <div className="flex items-center gap-3 text-white/40 text-sm py-4">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-5 text-center">
              <p className="text-white/30 text-sm">No calibration records yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((r) => {
                const isCert    = r.calibration_mode === 'certified_probe'
                const bothPass  = r.ice_water_pass && r.boiling_water_pass
                const anyFailed = r.ice_water_pass === false || r.boiling_water_pass === false
                return (
                  <div key={r.id} className={`rounded-xl px-4 py-3 border ${
                    isCert    ? 'bg-[#639922]/8 border-[#639922]/30' :
                    anyFailed ? 'bg-[#E24B4A]/8 border-[#E24B4A]/30' :
                                'bg-white/5 border-white/9'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{r.thermometer_id}</p>
                        {isCert ? (
                          <p className="text-white/45 text-xs mt-0.5">Certified probe · {r.cert_reference} · purchased {r.purchase_date ? fmtDate(r.purchase_date) : '—'}</p>
                        ) : (
                          <p className="text-white/45 text-xs mt-0.5">
                            Ice: {r.ice_water_result_c}°C · Boiling: {r.boiling_water_result_c}°C
                          </p>
                        )}
                        {r.action_taken && <p className="text-[#EB6619] text-xs mt-1 italic">{r.action_taken}</p>}
                        <p className="text-white/28 text-xs mt-0.5">{r.users?.name} · {r.time_of_check?.slice(0,5)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <p className="text-white/35 text-xs">{fmtDate(r.date)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isCert    ? 'bg-[#639922]/25 text-[#97C459]' :
                          anyFailed ? 'bg-[#E24B4A]/25 text-[#F09595]' :
                                      'bg-[#639922]/25 text-[#97C459]'
                        }`}>
                          {isCert ? 'Certified probe' : anyFailed ? 'Fail — action taken' : 'Pass'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* Numpad */}
      {numpad && (
        <Numpad
          value={numpad === 'ice' ? iceVal : boilVal}
          onChange={numpad === 'ice' ? setIceVal : setBoilVal}
          onClose={() => setNumpad(null)}
          label={numpad === 'ice' ? 'Ice water test' : 'Boiling water test'}
          expected={numpad === 'ice' ? '-1°C to +1°C' : '99°C to 101°C'}
        />
      )}

      {/* Quick reference */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-[#0f1840] rounded-t-3xl w-full p-6 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">SOP 3 — Quick Reference</h3>
              <button onClick={() => setShowQuick(false)} className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="bg-white/6 rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-3">Pass ranges (HB-001 SOP 3)</p>
                <div className="space-y-2">
                  <div className="flex gap-3"><span className="text-white/55 text-xs w-36 flex-shrink-0">Ice water test</span><span className="text-white/40 text-xs">-1°C to +1°C</span></div>
                  <div className="flex gap-3"><span className="text-white/55 text-xs w-36 flex-shrink-0">Boiling water test</span><span className="text-white/40 text-xs">99°C to 101°C</span></div>
                </div>
              </div>
              <div className="bg-white/6 rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Ice water procedure</p>
                <div className="space-y-1.5">
                  {['Fill container with crushed ice, add small amount of water','Stir mixture and wait 2 minutes for temperature to stabilise','Insert probe, avoiding container sides','Reading must be within 0°C ±1°C to pass'].map((s) => (
                    <div key={s} className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#EB6619] flex-shrink-0 mt-1.5"/><p className="text-white/60 text-xs">{s}</p></div>
                  ))}
                </div>
              </div>
              <div className="bg-white/6 rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">If test fails (CA-001)</p>
                <div className="space-y-1.5">
                  {['Remove thermometer from service immediately','Use backup calibrated thermometer','Send failed unit for professional calibration or dispose','Review all readings taken with the faulty probe'].map((s) => (
                    <div key={s} className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#F09595] flex-shrink-0 mt-1.5"/><p className="text-white/60 text-xs">{s}</p></div>
                  ))}
                </div>
              </div>
              <div className="bg-[#639922]/10 border border-[#639922]/30 rounded-xl p-4">
                <p className="text-[#97C459] font-bold text-xs uppercase tracking-widest mb-1.5">Certified probe alternative</p>
                <p className="text-white/60 text-xs leading-relaxed">HB-001 SOP 3: "Monthly Calibration Procedure / Annually Buy New Calibrated Probe" — a new probe with a UKAS or traceable certificate satisfies the FSA requirement without a monthly manual test.</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
