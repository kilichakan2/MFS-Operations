/**
 * app/haccp/product-return/page.tsx
 * SOP 12 — Product Return Procedures
 * Source: MF-001 p.10 · HB-001 SOP 12 · CA-001 Table 5
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReturnRecord {
  id:                string
  date:              string
  time_of_return:    string
  customer:          string
  product:           string
  temperature_c:     number | null
  return_code:       string
  return_code_notes: string | null
  disposition:       string
  corrective_action: string | null
  submitted_at:      string
  users:             { name: string }
}

// ─── Return codes (HB-001 SOP 12) ────────────────────────────────────────────

const RETURN_CODES = [
  { code: 'RC01', label: 'Temperature complaint', desc: 'Customer claims product arrived warm', needsTemp: true },
  { code: 'RC02', label: 'Quality issue',         desc: 'Appearance, texture, or odour',        needsTemp: false },
  { code: 'RC03', label: 'Wrong product',         desc: 'Incorrect product delivered',           needsTemp: false },
  { code: 'RC04', label: 'Short shelf life',      desc: 'Date / shelf-life issue',               needsTemp: false },
  { code: 'RC05', label: 'Packaging damage',      desc: 'Damaged or compromised packaging',      needsTemp: false },
  { code: 'RC06', label: 'Quantity issue',        desc: 'Quantity discrepancy',                  needsTemp: false },
  { code: 'RC07', label: 'Order cancelled',       desc: 'Customer changed order / cancellation', needsTemp: false },
  { code: 'RC08', label: 'Other',                 desc: 'Specify below',                         needsTemp: false },
]

// ─── Corrective actions per code (CA-001 Table 5) ────────────────────────────

const CA_ACTIONS: Record<string, { title: string; steps: string[]; suggestedDisposition: string }> = {
  RC01: {
    title: 'Temperature above limit',
    suggestedDisposition: 'dispose',
    steps: [
      'DO NOT restock — temperature breach confirmed',
      'Dispose of product as Category 3 ABP waste',
      'Document temperature reading and disposal method',
      'Investigate delivery conditions / transport issue',
      'Review customer delivery procedures',
    ],
  },
  RC02: {
    title: 'Quality complaint',
    suggestedDisposition: 'quarantine',
    steps: [
      'Quarantine returned product in segregated area',
      'Assess organoleptic quality (colour, odour, texture)',
      'If satisfactory and temperature compliant: may reprocess or repack',
      'If questionable: dispose',
      'Log complaint in customer complaints register',
      'Investigate root cause',
    ],
  },
  RC03: {
    title: 'Wrong product delivered',
    suggestedDisposition: 'restock',
    steps: [
      'Check temperature compliant and packaging intact',
      'If compliant: return to stock with new label if needed',
      'Review picking / dispatch procedures',
      'Retrain staff if human error identified',
      'Update customer order',
    ],
  },
  RC04: {
    title: 'Short shelf life / date issue',
    suggestedDisposition: 'quarantine',
    steps: [
      'Assess remaining shelf life against minimum requirements',
      'If still within limits and temperature compliant: priority dispatch',
      'If shelf life too short for trade: dispose',
      'Review stock rotation procedures',
    ],
  },
  RC05: {
    title: 'Packaging damaged',
    suggestedDisposition: 'quarantine',
    steps: [
      'Assess for contamination — if seal compromised or ingress suspected: dispose',
      'If outer damage only with inner seal intact: repack in compliant packaging',
      'Investigate if damage occurred pre- or post-delivery',
      'Update packaging if recurring issue',
    ],
  },
  RC06: {
    title: 'Quantity discrepancy',
    suggestedDisposition: 'restock',
    steps: [
      'Investigate delivery records and picking sheet',
      'Credit customer if short-shipped',
      'Review picking procedures to prevent recurrence',
      'No product safety action required unless other issues present',
    ],
  },
  RC07: {
    title: 'Customer order cancelled',
    suggestedDisposition: 'restock',
    steps: [
      'Check temperature compliant and packaging intact',
      'If compliant: return to stock',
      'Update customer order records',
    ],
  },
  RC08: {
    title: 'Other — assess individually',
    suggestedDisposition: 'quarantine',
    steps: [
      'Assess on individual basis',
      'Document thoroughly including reason',
      'Seek supervisor guidance if uncertain',
    ],
  },
}

// ─── Disposition options ──────────────────────────────────────────────────────

const DISPOSITIONS = [
  { val: 'restock',    label: 'Return to stock',         colour: 'green'  },
  { val: 'reprocess',  label: 'Reprocess / repack',      colour: 'blue'   },
  { val: 'quarantine', label: 'Quarantine',               colour: 'amber'  },
  { val: 'dispose',    label: 'Dispose as ABP',           colour: 'red'    },
]

const DISP_STYLE: Record<string, { active: string; badge: string }> = {
  green:  { active: 'border-green-500 bg-green-50 text-green-800',   badge: 'bg-green-100 text-green-700' },
  blue:   { active: 'border-blue-500 bg-blue-50 text-blue-800',      badge: 'bg-blue-100 text-blue-700'   },
  amber:  { active: 'border-amber-500 bg-amber-50 text-amber-800',   badge: 'bg-amber-100 text-amber-700' },
  red:    { active: 'border-red-500 bg-red-50 text-red-800',         badge: 'bg-red-100 text-red-700'     },
}

const DISP_INACTIVE = 'border-slate-300 bg-white text-slate-600'

// ─── Acceptable return temps (HB-001 Table 11) ───────────────────────────────

function tempAcceptable(temp: number): { pass: boolean; label: string } {
  // Red meat ≤7°C; frozen handled separately — default to red meat
  if (temp <= 7) return { pass: true,  label: `${temp}°C — within limit` }
  return           { pass: false, label: `${temp}°C — exceeds limit (max 7°C)` }
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange, onClose }: {
  value: string; onChange: (v: string) => void; onClose: () => void
}) {
  const num  = parseFloat(value)
  const res  = !isNaN(num) && value !== '' ? tempAcceptable(num) : null

  function press(k: string) {
    if (k === 'back') { onChange(value.slice(0, -1)); return }
    if (k === '.' && value.includes('.')) return
    if (value === '0') { onChange(k); return }
    onChange(value + k)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','.','0','back']

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col" style={{ position: 'fixed' }}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-blue-100">
        <div>
          <p className="text-orange-600 text-xs font-bold tracking-widest uppercase">RC01 — Temperature</p>
          <h2 className="text-slate-900 text-xl font-bold mt-0.5">Return probe reading</h2>
          <p className="text-slate-400 text-sm mt-0.5">Red meat ≤7°C · Frozen ≤-18°C (no thaw)</p>
        </div>
        <button onClick={onClose}
          className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-all active:scale-95">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <div className={`text-6xl font-bold ${!res ? 'text-slate-300' : res.pass ? 'text-green-600' : 'text-red-600'}`}>
            {value || '—'}<span className="text-2xl ml-2 opacity-50">°C</span>
          </div>
          {res && (
            <div className={`mt-3 inline-block px-5 py-1.5 rounded-full text-sm font-bold ${res.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {res.pass ? 'Acceptable temp' : 'Temperature exceeded — DO NOT restock'}
            </div>
          )}
          {res && !res.pass && (
            <div className="mt-4 mx-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-left">
              <p className="text-red-700 text-xs font-bold uppercase tracking-widest mb-1.5">CA-001 — Temperature breach</p>
              <p className="text-slate-600 text-xs leading-relaxed">DO NOT restock. Dispose as Category 3 ABP waste. Document temperature and disposal.</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {keys.map((k) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); press(k) }}
              className={`h-16 rounded-2xl text-xl font-semibold select-none transition-all active:scale-95 ${k === 'back' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white active:bg-orange-500'}`}>
              {k === 'back'
                ? <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="13" y2="14"/><line x1="13" y1="9" x2="18" y2="14"/></svg>
                : k}
            </button>
          ))}
        </div>
        <button onClick={onClose} disabled={!value || isNaN(parseFloat(value))}
          className="w-full max-w-xs bg-orange-600 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-40">
          Confirm {value ? `${value}°C` : ''}
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RC_LABELS: Record<string, string> = Object.fromEntries(RETURN_CODES.map((r) => [r.code, r.label]))
const DISP_LABELS: Record<string, string> = Object.fromEntries(DISPOSITIONS.map((d) => [d.val, d.label]))

function fmtTime(t: string) { return t?.slice(0, 5) ?? '—' }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductReturnPage() {
  const [records, setRecords] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Form
  const [returnCode,    setReturnCode]    = useState('')
  const [rcNotes,       setRcNotes]       = useState('')
  const [customer,      setCustomer]      = useState('')
  const [product,       setProduct]       = useState('')
  const [tempVal,       setTempVal]       = useState('')
  const [disposition,   setDisposition]   = useState('')
  const [caText,        setCaText]        = useState('')
  const [notes,         setNotes]         = useState('')

  // Checklist state (5 assessment items from SOP 12)
  const [checked, setChecked] = useState<boolean[]>([false, false, false, false, false])
  function toggleCheck(i: number) {
    setChecked((prev) => prev.map((v, idx) => idx === i ? !v : v))
  }

  // UI
  const [showNumpad,   setShowNumpad]   = useState(false)
  const [showQuick,    setShowQuick]    = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitErr,    setSubmitErr]    = useState('')
  const [flash,        setFlash]        = useState(false)

  const loadData = useCallback(() => {
    fetch('/api/haccp/product-return')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => setRecords(d.returns ?? []))
      .catch((e) => setSubmitErr(`Could not load records — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // When return code changes, pre-load CA action and suggest disposition
  function selectCode(code: string) {
    setReturnCode(code)
    setRcNotes('')
    setTempVal('')
    const ca = CA_ACTIONS[code]
    if (ca) {
      setCaText(ca.steps.join('\n'))
      setDisposition(ca.suggestedDisposition)
    }
  }

  function resetForm() {
    setReturnCode(''); setRcNotes(''); setCustomer(''); setProduct('')
    setTempVal(''); setDisposition(''); setCaText(''); setNotes(''); setSubmitErr('')
    setChecked([false, false, false, false, false])
  }

  const rc       = RETURN_CODES.find((r) => r.code === returnCode)
  const tempNum  = parseFloat(tempVal)
  const tempOk   = !isNaN(tempNum) && tempVal !== '' ? tempAcceptable(tempNum) : null

  const isValid =
    customer.trim() && product.trim() && returnCode && disposition &&
    (returnCode !== 'RC08' || rcNotes.trim()) &&
    (returnCode !== 'RC01' || (tempVal !== '' && !isNaN(tempNum)))

  async function handleSubmit() {
    if (!isValid) return
    setSubmitting(true); setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/product-return', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customer.trim(), product: product.trim(),
          return_code: returnCode, return_code_notes: rcNotes || undefined,
          temperature_c: returnCode === 'RC01' && tempVal ? tempNum : undefined,
          disposition, corrective_action: caText || undefined,
        }),
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

  const ca = returnCode ? CA_ACTIONS[returnCode] : null

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">SOP 12 — Product Return</p>
          <h1 className="text-white text-lg font-bold leading-tight">Product Return Log</h1>
        </div>
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/18 border border-white/15 rounded-xl px-3 py-2 text-white/60 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/product-return' }}
          className="flex items-center gap-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40 rounded-xl px-3 py-2 text-orange-300 transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* Never resell banner */}
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          <div>
            <p className="text-red-700 text-[10px] font-bold uppercase tracking-widest mb-1">Never resell (SOP 12)</p>
            <p className="text-slate-600 text-xs leading-relaxed">Products that are thawed, have broken seals, unknown temperature history, are past use-by date, or where any doubt exists about safety must <strong className="text-red-700">never</strong> be restocked.</p>
          </div>
        </div>

        {/* Flash */}
        {flash && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="text-green-700 font-bold text-sm">Return logged successfully</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-slate-900 font-semibold text-sm">Log a return</p>
            <p className="text-slate-400 text-xs mt-0.5">SOP 12 · one record per return</p>
          </div>

          <div className="px-4 py-4 space-y-5">

            {/* Return code */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Return reason (HB-001 SOP 12)</p>
              <div className="grid grid-cols-2 gap-2">
                {RETURN_CODES.map((rc) => (
                  <button key={rc.code} onClick={() => selectCode(rc.code)}
                    className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                      returnCode === rc.code
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}>
                    <p className={`text-[10px] font-bold ${returnCode === rc.code ? 'text-orange-600' : 'text-slate-400'}`}>{rc.code}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${returnCode === rc.code ? 'text-slate-900' : 'text-slate-600'}`}>{rc.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{rc.desc}</p>
                  </button>
                ))}
              </div>
              {returnCode === 'RC08' && (
                <textarea value={rcNotes} onChange={(e) => setRcNotes(e.target.value)} rows={2}
                  placeholder="Specify the reason…"
                  className="mt-2 w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
              )}
            </div>

            {/* Customer */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Customer</p>
              <input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)}
                placeholder="Customer / account name"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>

            {/* Product */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Product description</p>
              <input type="text" value={product} onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Lamb leg — 4 units, batch MFS-2026-04"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>

            {/* Temperature — RC01 only */}
            {returnCode === 'RC01' && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Return temperature (required for RC01)</p>
                <button onClick={() => setShowNumpad(true)}
                  className={`w-full rounded-2xl p-4 border-2 flex items-center justify-between transition-all ${
                    !tempVal    ? 'border-blue-200 bg-white' :
                    tempOk?.pass ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                  }`}>
                  <div>
                    <p className="text-slate-400 text-xs mb-1">Probe core temperature of returned product</p>
                    <p className={`text-2xl font-bold ${!tempVal ? 'text-slate-300' : tempOk?.pass ? 'text-green-600' : 'text-red-600'}`}>
                      {tempVal && !isNaN(tempNum) ? `${tempNum}°C` : 'Tap to enter'}
                    </p>
                  </div>
                  {tempOk && (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${tempOk.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {tempOk.pass ? 'Acceptable' : 'Exceeded'}
                    </span>
                  )}
                </button>
                {tempOk && !tempOk.pass && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <p className="text-red-700 text-xs font-bold uppercase tracking-widest mb-1">CA-001 — Temp breach</p>
                    <p className="text-slate-600 text-xs">DO NOT restock. Dispose as Category 3 ABP waste.</p>
                  </div>
                )}
              </div>
            )}

            {/* Assessment checklist */}
            {returnCode && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                  Assessment checklist (SOP 12) — tap each to confirm
                </p>
                <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
                  {[
                    'Visual inspection — no discolouration, damage, swelling, leakage, or off-odours',
                    'Packaging integrity — seals intact, no tears or punctures, labelling legible',
                    'Date / shelf-life — remaining shelf life verified',
                    'Batch / lot traceability — batch code matches original delivery documentation',
                    returnCode === 'RC01' ? 'Temperature — core temperature recorded above' : 'Temperature — record if uncertain about cold chain',
                  ].map((item, i) => (
                    <button key={i} onClick={() => toggleCheck(i)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all border-b border-slate-100 last:border-b-0 ${
                        checked[i] ? 'bg-green-50' : 'bg-white hover:bg-slate-50'
                      }`}>
                      <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                        checked[i] ? 'border-green-500 bg-green-500' : 'border-slate-300 bg-white'
                      }`}>
                        {checked[i] && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <p className={`text-xs leading-relaxed ${checked[i] ? 'text-green-700 line-through decoration-green-400' : 'text-slate-600'}`}>
                        {item}
                      </p>
                    </button>
                  ))}
                </div>
                {checked.every(Boolean) && (
                  <p className="text-green-600 text-xs font-bold mt-1.5 px-1">✓ All checks completed</p>
                )}
              </div>
            )}

            {/* Disposition */}
            {returnCode && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Disposition</p>
                {ca && <p className="text-slate-400 text-[10px] mb-2">Suggested: <span className="font-bold text-slate-600">{DISP_LABELS[ca.suggestedDisposition]}</span></p>}
                <div className="grid grid-cols-2 gap-2">
                  {DISPOSITIONS.map((d) => {
                    const style = DISP_STYLE[d.colour]
                    return (
                      <button key={d.val} onClick={() => setDisposition(d.val)}
                        className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all ${disposition === d.val ? style.active : DISP_INACTIVE}`}>
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Corrective action — auto-loaded, editable */}
            {ca && returnCode && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Corrective action (CA-001 — {ca.title})</p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2 space-y-1.5">
                  {ca.steps.map((s) => (
                    <div key={s} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                      <p className="text-slate-700 text-xs leading-relaxed">{s}</p>
                    </div>
                  ))}
                </div>
                <textarea value={caText} onChange={(e) => setCaText(e.target.value)} rows={3}
                  placeholder="Edit or add detail to the corrective action taken…"
                  className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
              </div>
            )}

            {/* Additional notes */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Additional notes (optional)</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Any additional information…"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
            </div>

            <p className="text-slate-300 text-xs">
              {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/London' })}
            </p>
            {submitErr && <p className="text-red-600 text-xs">{submitErr}</p>}

          </div>

          <button onClick={handleSubmit} disabled={!isValid || submitting}
            className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
            {submitting
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Submit return</>
            }
          </button>
        </div>

        {/* Today's log */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Today's returns</p>
            {records.length > 0 && (
              <span className="bg-slate-200 rounded-full px-3 py-1 text-xs font-bold text-slate-600">{records.length} logged</span>
            )}
          </div>
          {loading ? (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-4">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center">
              <p className="text-slate-400 text-sm">No returns logged today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((r) => {
                const disp = DISPOSITIONS.find((d) => d.val === r.disposition)
                const badge = disp ? DISP_STYLE[disp.colour].badge : 'bg-slate-100 text-slate-600'
                return (
                  <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-orange-600 text-[10px] font-bold">{r.return_code}</span>
                          <span className="text-slate-900 font-semibold text-sm">{r.customer}</span>
                        </div>
                        <p className="text-slate-500 text-xs">{r.product}</p>
                        {r.temperature_c != null && (
                          <p className="text-slate-400 text-xs mt-0.5">Temp: {r.temperature_c}°C</p>
                        )}
                        <p className="text-slate-300 text-xs mt-0.5">{r.users?.name} · {fmtTime(r.time_of_return)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <p className="text-slate-400 text-xs">{fmtDate(r.date)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>
                          {DISP_LABELS[r.disposition] ?? r.disposition}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          {RC_LABELS[r.return_code] ?? r.return_code}
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
      {showNumpad && (
        <Numpad value={tempVal} onChange={setTempVal} onClose={() => setShowNumpad(false)} />
      )}

      {/* Quick ref */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" style={{ position: 'fixed' }}>
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-900 font-bold text-lg">SOP 12 — Quick Reference</h3>
              <button onClick={() => setShowQuick(false)}
                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-50 border border-blue-100 rounded-xl p-4">
                <p className="text-orange-600 font-bold text-xs uppercase tracking-widest mb-3">Return codes (HB-001 SOP 12)</p>
                <div className="space-y-1.5">
                  {RETURN_CODES.map((rc) => (
                    <div key={rc.code} className="flex gap-3">
                      <span className="text-orange-600 text-xs font-bold w-10 flex-shrink-0">{rc.code}</span>
                      <span className="text-slate-600 text-xs">{rc.label} — {rc.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-50 border border-blue-100 rounded-xl p-4">
                <p className="text-orange-600 font-bold text-xs uppercase tracking-widest mb-2">Acceptable return temps (Table 11)</p>
                <div className="space-y-1">
                  <div className="flex gap-3"><span className="text-slate-600 text-xs w-20 flex-shrink-0">Red meat</span><span className="text-slate-500 text-xs">≤7°C — Assess or BIN if exceeded</span></div>
                  <div className="flex gap-3"><span className="text-slate-600 text-xs w-20 flex-shrink-0">Frozen</span><span className="text-slate-500 text-xs">≤-18°C, no thaw signs — BIN if thawed</span></div>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-700 font-bold text-xs uppercase tracking-widest mb-2">Never resell</p>
                {['Previously frozen then thawed','Packaging seal broken or compromised','Unknown temperature history','Exceeded temperature limits at any point','Past use-by or best-before date','Any doubt about product safety'].map((s) => (
                  <div key={s} className="flex items-start gap-2 mb-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5"/><p className="text-slate-600 text-xs">{s}</p></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
