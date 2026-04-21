/**
 * app/haccp/mince/page.tsx
 * CCP-M1, CCP-M2, CCP-MP1, CCP-MP2 — Mince & Meat Preparations
 * Three sub-forms: Mince log · Meatprep log · Time separation log
 * Source: MMP-001 V1.0 · MMP-MF-001 V1.0 · MMP-HA-001 V1.0
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabType = 'mince' | 'meatprep' | 'timesep'

interface DeliveryOption {
  id:               string
  supplier:         string
  product:          string
  product_category: string
  batch_number:     string
  slaughter_site:   string | null
  born_in:          string | null
  delivery_number:  number | null
  date:             string
  temperature_c:    number
  temp_status:      string
}

interface MinceRecord {
  id: string; date: string; time_of_production: string
  batch_code: string; product_species: string
  kill_date: string; days_from_kill: number
  kill_date_within_limit: boolean
  input_temp_c: number; output_temp_c: number
  input_temp_pass: boolean; output_temp_pass: boolean
  output_mode: string; source_batch_numbers: string[]
  corrective_action: string | null; submitted_at: string
  users: { name: string }
}

interface MeatprepRecord {
  id: string; date: string; time_of_production: string
  batch_code: string; product_name: string
  kill_date: string | null; days_from_kill: number | null
  input_temp_c: number; output_temp_c: number
  input_temp_pass: boolean; output_temp_pass: boolean
  output_mode: string
  allergens_present: string[]; label_check_completed: boolean
  source_batch_numbers: string[]
  corrective_action: string | null; submitted_at: string
  users: { name: string }
}

interface TimesepRecord {
  id: string; date: string; time_of_entry: string
  plain_products_end_time: string | null
  clean_completed_time: string
  allergen_products_start_time: string | null
  clean_verified_by: string; allergens_in_production: string
  corrective_action: string | null; submitted_at: string
  users: { name: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPECIES = [
  { key: 'lamb',         label: 'Lamb',                   inputLimit: '≤7°C', maxDays: 6,    killEnforced: true  },
  { key: 'beef',         label: 'Beef (fresh)',            inputLimit: '≤7°C', maxDays: 6,    killEnforced: true  },
  { key: 'imported_vac', label: 'Imported / vac-packed',  inputLimit: '≤7°C', maxDays: null, killEnforced: false },
]

const ALLERGENS = [
  'Mustard', 'Celery', 'Sulphites', 'Gluten', 'Milk/Dairy',
  'Soya', 'Eggs', 'Peanuts', 'Tree nuts', 'Crustaceans',
  'Molluscs', 'Fish', 'Lupin', 'Sesame',
]

const COUNTRIES: Record<string, string> = {
  IRL: 'Ireland', UK: 'UK', AUS: 'Australia', NZL: 'New Zealand', BRA: 'Brazil',
}

// ─── CA constants (Phase M-B/C — adaptive popup) ─────────────────────────────

type CAPayload = { cause: string; disposition: string; recurrence: string; notes: string }

type CAChannel = 'M1-input' | 'M1-output' | 'MP1-input' | 'MP1-output'

const MINCE_CAUSES = [
  'Supplier delivered above temperature',
  'Delay in transit / vehicle issue',
  'Insufficient chilling after delivery',
  'Batch too large for chiller',
  'Chiller / freezer malfunction',
  'Other',
]

const MINCE_RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  'Supplier delivered above temperature': ['Raise with supplier', 'Request temperature logs on next delivery', 'Review approved supplier status', 'Other'],
  'Delay in transit / vehicle issue':     ['Improve delivery scheduling', 'Request pre-cooled vehicles', 'Raise with supplier', 'Other'],
  'Insufficient chilling after delivery': ['Chill immediately on receipt', 'Reduce batch sizes', 'Review intake procedure', 'Other'],
  'Batch too large for chiller':          ['Reduce batch sizes', 'Split into smaller runs', 'Review chiller capacity', 'Other'],
  'Chiller / freezer malfunction':        ['Contact refrigeration engineer', 'Schedule maintenance check', 'Install temperature alarm', 'Other'],
  'Other':                                ['Review procedure', 'Retrain staff', 'Schedule maintenance check', 'Other'],
}

// Protocol steps per channel — read-only in popup
const MINCE_PROTOCOL: Record<CAChannel, string[]> = {
  'M1-input': [
    'Quarantine batch immediately',
    'Assess product condition and odour',
    'Attempt rapid chilling to ≤7°C within 2 hours',
    'If ≤7°C not achieved within 2 hours: reject — return to supplier',
    'Investigate supplier temperature control',
    'Record on Mincing Production Log (MMP-MF-001 Form 1)',
  ],
  'M1-output': [
    'Extend chilling period — recheck after 30 minutes',
    'If still above 2°C: assess product safety',
    'Reduce batch size — friction heat may be the cause',
    'Do not dispatch until ≤2°C confirmed',
  ],
  'MP1-input': [
    'Quarantine batch immediately',
    'Assess product condition',
    'Attempt rapid chilling to ≤7°C within 2 hours',
    'If ≤7°C not achieved: reject product',
    'Record on Meat Prep Log (MMP-MF-001 Form 2)',
  ],
  'MP1-output': [
    'Extend chilling period — recheck after 30 minutes',
    'If still above 4°C: assess product safety before dispatch',
    'Consider reducing batch size',
    'Do not dispatch until temperature compliance achieved',
  ],
}

const MINCE_DISPOSITION_BY_CHANNEL: Record<CAChannel, string[]> = {
  'M1-input':  ['Assess', 'Reject', 'Conditional accept'],
  'M1-output': ['Conditional accept', 'Assess', 'Reject'],
  'MP1-input': ['Assess', 'Reject', 'Conditional accept'],
  'MP1-output':['Conditional accept', 'Assess', 'Reject'],
}

const CHANNEL_LABELS: Record<CAChannel, string> = {
  'M1-input':  'CCP-M1 — Input temperature exceeded',
  'M1-output': 'CCP-M1 — Output temperature exceeded',
  'MP1-input': 'CCP-MP1 — Input temperature exceeded',
  'MP1-output':'CCP-MP1 — Output temperature exceeded',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputTempPass(temp: number): boolean {
  return temp <= 7  // all current species are red meat ≤7°C
}

function outputTempPass(temp: number, form: 'mince' | 'meatprep', mode: string): boolean {
  if (mode === 'frozen') return temp <= -18
  return form === 'mince' ? temp <= 2 : temp <= 4
}

/** imported_vac has no enforced limit — always passes (informational only) */
function killDaysPass(species: string, days: number): boolean {
  const sp = SPECIES.find((s) => s.key === species)
  if (!sp || !sp.killEnforced) return true
  return days <= (sp.maxDays ?? 6)
}

function killDaysHardFail(species: string, days: number): boolean {
  const sp = SPECIES.find((s) => s.key === species)
  if (!sp || !sp.killEnforced) return false
  return days > (sp.maxDays ?? 6)
}

function calcDays(killDate: string): number {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const diff  = new Date(today + 'T00:00:00').getTime() - new Date(killDate + 'T00:00:00').getTime()
  return Math.floor(diff / 86400000)
}

function fmtTime(t?: string) { return t?.slice(0, 5) ?? '—' }

function todayStr() {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── CCA Popup ───────────────────────────────────────────────────────────────

function CCAPopup({ channels, onSubmit, onBack }: {
  channels:  CAChannel[]
  onSubmit:  (ca: CAPayload) => void
  onBack:    () => void
}) {
  // Use the first channel's protocol/disposition as primary (both share the same cause list)
  const primary = channels[0]

  const [cause,       setCause]       = useState('')
  const [disposition, setDisposition] = useState(MINCE_DISPOSITION_BY_CHANNEL[primary][0])
  const [recurrence,  setRecurrence]  = useState('')
  const [notes,       setNotes]       = useState('')

  useEffect(() => {
    setDisposition(MINCE_DISPOSITION_BY_CHANNEL[primary][0])
    setRecurrence('')
  }, [cause]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = Boolean(cause && disposition && recurrence)

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{ position: 'fixed' }}>
      <div className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">

        <div className="flex items-start justify-between p-6 pb-4 sticky top-0 bg-white border-b border-slate-100 z-10">
          <div>
            <p className="text-red-600 text-xs font-bold tracking-widest uppercase">Temperature deviation</p>
            <h2 className="text-slate-900 text-xl font-bold mt-0.5">Corrective Action Required</h2>
          </div>
          <button onClick={onBack} className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-6 pb-8 pt-4 space-y-5">

          {/* Deviation summary */}
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch} className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                <p className="text-red-600 text-xs font-bold">{CHANNEL_LABELS[ch]}</p>
              </div>
            ))}
          </div>

          {/* Protocol — read-only */}
          {channels.map((ch) => (
            <div key={ch}>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                Required action — {CHANNEL_LABELS[ch]}
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                {MINCE_PROTOCOL[ch].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 bg-red-100 text-red-600">{i + 1}</div>
                    <p className="text-slate-700 text-xs leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Cause */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">What caused this?</p>
            <div className="grid grid-cols-2 gap-2">
              {MINCE_CAUSES.map((c) => (
                <button key={c} onClick={() => setCause(c)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                    cause === c ? 'bg-[#EB6619] border-[#EB6619] text-white' : 'bg-white border-slate-300 text-slate-600'
                  }`}>{c}</button>
              ))}
            </div>
          </div>

          {/* Disposition */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Product disposition</p>
            <div className="flex flex-wrap gap-2">
              {MINCE_DISPOSITION_BY_CHANNEL[primary].map((d) => (
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
                {(MINCE_RECURRENCE_BY_CAUSE[cause] ?? MINCE_RECURRENCE_BY_CAUSE['Other']).map((r) => (
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

          <p className="text-slate-400 text-xs">This record is immutable once submitted. Protocol per CA-001 Table 4.</p>

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

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange, onClose, label, hint }: {
  value: string; onChange: (v: string) => void; onClose: () => void
  label: string; hint: string
}) {
  const num  = parseFloat(value)
  const keys = ['1','2','3','4','5','6','7','8','9','.','0','back']

  function press(k: string) {
    if (k === 'back') { onChange(value.slice(0, -1)); return }
    if (k === '.' && value.includes('.')) return
    if (value === '0') { onChange(k); return }
    onChange(value + k)
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col" style={{ position: 'fixed' }}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-blue-100">
        <div>
          <p className="text-orange-600 text-xs font-bold tracking-widest uppercase">Temperature</p>
          <h2 className="text-slate-900 text-xl font-bold mt-0.5">{label}</h2>
          <p className="text-slate-400 text-sm mt-0.5">Pass: {hint}</p>
        </div>
        <button onClick={onClose} className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className={`text-6xl font-bold font-mono ${!value ? 'text-slate-300' : 'text-slate-900'}`}>
          {value || '—'}<span className="text-2xl ml-2 opacity-50">°C</span>
        </div>
        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {keys.map((k) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); press(k) }}
              className={`h-16 rounded-2xl text-xl font-semibold select-none active:scale-95 transition-all ${
                k === 'back' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white active:bg-orange-500'
              }`}>
              {k === 'back'
                ? <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="13" y2="14"/><line x1="13" y1="9" x2="18" y2="14"/></svg>
                : k}
            </button>
          ))}
          <button onPointerDown={(e) => { e.preventDefault(); onChange(value.startsWith('-') ? value.slice(1) : '-' + value) }}
            className="col-span-3 h-12 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-95">
            +/− Toggle negative (for frozen)
          </button>
        </div>
        <button onClick={onClose} disabled={!value || isNaN(num)}
          className="w-full max-w-xs bg-orange-600 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-40">
          Confirm {value ? `${value}°C` : ''}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MincePage() {
  const [tab, setTab]       = useState<TabType>('mince')
  const [minceRecs, setMinceRecs]     = useState<MinceRecord[]>([])
  const [prepRecs,  setPrepRecs]      = useState<MeatprepRecord[]>([])
  const [tsRecs,    setTsRecs]        = useState<TimesepRecord[]>([])
  const [deliveries,setDeliveries]    = useState<DeliveryOption[]>([])
  const [minceBatches, setMinceBatches] = useState<{ id: string; batch_code: string; species: string; kill_date: string; output_mode: string }[]>([])
  const [loading,   setLoading]       = useState(true)

  // ── Mince form state ────────────────────────────────────────────────────────
  const [mSpecies,       setMSpecies]       = useState('')
  const [mKillDate,      setMKillDate]      = useState('')
  const [mInputVal,      setMInputVal]      = useState('')
  const [mOutputVal,     setMOutputVal]     = useState('')
  const [mOutputMode,    setMOutputMode]    = useState<'chilled'|'frozen'>('chilled')
  const [mSourceIds,     setMSourceIds]     = useState<string[]>([])
  const [mSourceBatches, setMSourceBatches] = useState<string[]>([])

  // ── Meatprep form state ─────────────────────────────────────────────────────
  const [pProductName,      setPProductName]      = useState('')
  const [pSpecies,          setPSpecies]          = useState('')
  const [pKillDate,         setPKillDate]         = useState('')  // kept for route compat — not shown in UI
  const [pInputVal,         setPInputVal]         = useState('')
  const [pOutputVal,        setPOutputVal]        = useState('')
  const [pOutputMode,       setPOutputMode]       = useState<'chilled'|'frozen'>('chilled')
  const [pAllergens,        setPAllergens]        = useState<string[]>([])
  const [pLabelCheck,       setPLabelCheck]       = useState(false)
  const [pSourceIds,        setPSourceIds]        = useState<string[]>([])
  const [pSourceBatches,    setPSourceBatches]    = useState<string[]>([])
  // Source mince batches (today's runs) — for prep coming from mince
  const [pMinceBatchIds,    setPMinceBatchIds]    = useState<string[]>([])
  const [pMinceBatchCodes,  setPMinceBatchCodes]  = useState<string[]>([])

  // ── Time sep form state ─────────────────────────────────────────────────────
  const [tPlainEnd,      setTPlainEnd]      = useState('')
  const [tCleanDone,     setTCleanDone]     = useState('')
  const [tAllergenStart, setTAllergenStart] = useState('')
  const [tVerifiedBy,    setTVerifiedBy]    = useState('')
  const [tAllergens,     setTAllergens]     = useState('')
  const [tCA,            setTCA]            = useState('')

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [numpad,      setNumpad]      = useState<string | null>(null)
  const [submitErr,   setSubmitErr]   = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [flash,       setFlash]       = useState('')
  const [showCCA,     setShowCCA]     = useState(false)
  const [ccaChannels, setCcaChannels] = useState<CAChannel[]>([])
  const [pendingTab,  setPendingTab]  = useState<'mince' | 'meatprep' | null>(null)

  const loadData = useCallback(() => {
    fetch('/api/haccp/mince-prep')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => {
        setMinceRecs(d.mince ?? [])
        setPrepRecs(d.meatprep ?? [])
        setTsRecs(d.timesep ?? [])
        setDeliveries(d.deliveries ?? [])
        setMinceBatches(d.mince_batches ?? [])
      })
      .catch((e) => setSubmitErr(`Load error — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const mInputNum     = parseFloat(mInputVal)
  const mOutputNum    = parseFloat(mOutputVal)
  const mDays         = mKillDate ? calcDays(mKillDate) : null
  const mKillHardFail = mDays !== null && mSpecies ? killDaysHardFail(mSpecies, mDays) : false
  const mKillPass     = mDays !== null && mSpecies ? killDaysPass(mSpecies, mDays) : null
  const mInPass       = mInputVal ? inputTempPass(mInputNum) : null
  const mOutPass      = mOutputVal ? outputTempPass(mOutputNum, 'mince', mOutputMode) : null
  const mTempFail     = mInPass === false || mOutPass === false
  const mSp           = SPECIES.find((s) => s.key === mSpecies)

  const pInputNum  = parseFloat(pInputVal)
  const pOutputNum = parseFloat(pOutputVal)
  const pDays      = pKillDate ? calcDays(pKillDate) : null
  const pInPass    = pInputVal ? inputTempPass(pInputNum) : null
  const pOutPass   = pOutputVal ? outputTempPass(pOutputNum, 'meatprep', pOutputMode) : null
  const pAllergenIssue = pAllergens.length > 0 && !pLabelCheck
  const pAnyFail   = pInPass === false || pOutPass === false || pAllergenIssue

  function resetMince() {
    setMSpecies(''); setMKillDate(''); setMInputVal(''); setMOutputVal('')
    setMOutputMode('chilled'); setMSourceIds([]); setMSourceBatches([])
  }
  function resetPrep() {
    setPProductName(''); setPSpecies(''); setPKillDate(''); setPInputVal(''); setPOutputVal('')
    setPOutputMode('chilled'); setPAllergens([]); setPLabelCheck(false)
    setPSourceIds([]); setPSourceBatches([])
    setPMinceBatchIds([]); setPMinceBatchCodes([])
  }
  function resetTs() { setTPlainEnd(''); setTCleanDone(''); setTAllergenStart(''); setTVerifiedBy(''); setTAllergens(''); setTCA('') }

  async function doSubmit(ca: CAPayload | null) {
    setShowCCA(false); setSubmitErr(''); setSubmitting(true)
    const activeTab = pendingTab ?? tab
    setPendingTab(null)
    try {
      let body: Record<string, unknown>

      if (activeTab === 'mince') {
        body = {
          form: 'mince', product_species: mSpecies, kill_date: mKillDate,
          input_temp_c: mInputNum, output_temp_c: mOutputNum, output_mode: mOutputMode,
          source_batch_numbers: mSourceBatches, source_delivery_ids: mSourceIds,
          corrective_action: ca ?? undefined,
        }
      } else if (activeTab === 'meatprep') {
        body = {
          form: 'meatprep', product_name: pProductName,
          product_species: pSpecies || undefined,
          kill_date: undefined,
          input_temp_c: pInputNum, output_temp_c: pOutputNum, output_mode: pOutputMode,
          allergens_present: pAllergens, label_check_completed: pLabelCheck,
          source_batch_numbers: pSourceBatches, source_delivery_ids: pSourceIds,
          source_mince_batch_ids: pMinceBatchCodes,
          corrective_action: ca ?? undefined,
        }
      } else {
        body = {
          form: 'timesep',
          plain_products_end_time: tPlainEnd || undefined,
          clean_completed_time: tCleanDone,
          allergen_products_start_time: tAllergenStart || undefined,
          clean_verified_by: tVerifiedBy, allergens_in_production: tAllergens,
          corrective_action: undefined,
        }
      }

      const res = await fetch('/api/haccp/mince-prep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const d = await res.json()
        if (d.ca_write_failed) {
          setSubmitErr('Record saved, but corrective action log failed. Notify admin.')
          return
        }
        const msg = activeTab === 'mince'
          ? `Mince logged — ${d.batch_code}`
          : activeTab === 'meatprep' ? `Prep logged — ${d.batch_code}`
          : 'Time separation logged'
        setFlash(msg)
        activeTab === 'mince' ? resetMince() : activeTab === 'meatprep' ? resetPrep() : resetTs()
        loadData()
        setTimeout(() => setFlash(''), 3000)
      } else {
        const d = await res.json()
        setSubmitErr(d.error ?? 'Submission failed')
      }
    } catch { setSubmitErr('Connection error') }
    finally { setSubmitting(false) }
  }

  function handleSubmit() {
    setSubmitErr('')

    if (tab === 'mince') {
      if (!mSpecies || !mKillDate || !mInputVal || !mOutputVal) {
        setSubmitErr('Fill in all required fields'); return
      }
      if (mKillHardFail) {
        setSubmitErr(`Kill date exceeded (${mDays} days) — DO NOT MINCE. Segregate product.`); return
      }
      if (mTempFail) {
        // Open CCA popup
        const channels: CAChannel[] = []
        if (mInPass === false)  channels.push('M1-input')
        if (mOutPass === false) channels.push('M1-output')
        setCcaChannels(channels); setPendingTab('mince'); setShowCCA(true); return
      }
      doSubmit(null)
    } else if (tab === 'meatprep') {
      if (!pProductName || !pInputVal || !pOutputVal) {
        setSubmitErr('Fill in all required fields'); return
      }
      if (pInPass === false || pOutPass === false) {
        const channels: CAChannel[] = []
        if (pInPass === false)  channels.push('MP1-input')
        if (pOutPass === false) channels.push('MP1-output')
        setCcaChannels(channels); setPendingTab('meatprep'); setShowCCA(true); return
      }
      doSubmit(null)
    } else {
      if (!tCleanDone || !tVerifiedBy || !tAllergens) {
        setSubmitErr('Fill in all required fields'); return
      }
      doSubmit(null)
    }
  }

  // Numpad target state
  const numpadState: Record<string, [string, (v: string) => void, string, string]> = {
    m_input:  [mInputVal,  setMInputVal,  'Input temperature (CCP-M1)', '≤7°C'],
    m_output: [mOutputVal, setMOutputVal, 'Output temperature — check after chilling/freezing (CCP-M1)', mOutputMode === 'frozen' ? '≤-18°C' : '≤2°C'],
    p_input:  [pInputVal,  setPInputVal,  'Input temperature (CCP-MP1)', '≤7°C'],
    p_output: [pOutputVal, setPOutputVal, 'Output temperature — check after chilling/freezing (CCP-MP1)', pOutputMode === 'frozen' ? '≤-18°C' : '≤4°C'],
  }

  // Pre-compute filtered delivery lists in component body — avoids stale closure in DeliveryPicker
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

  function matchesSpecies(d: DeliveryOption, species: string): boolean {
    if (!species) return true
    if (d.product_category === 'red_meat') return true  // legacy — show for both
    switch (species) {
      case 'lamb':         return d.product_category === 'lamb'
      case 'beef':
      case 'imported_vac': return d.product_category === 'beef'
      default:             return true
    }
  }

  const filteredMDeliveries = deliveries.filter((d) => matchesSpecies(d, mSpecies))
  const filteredPDeliveries = deliveries.filter((d) => matchesSpecies(d, pSpecies))

  /** Delivery batch picker — receives pre-filtered list as prop */
  function DeliveryPicker({
    form, filtered, activeSpecies,
  }: { form: 'mince' | 'meatprep'; filtered: DeliveryOption[]; activeSpecies: string }) {
    const selectedIds = form === 'mince' ? mSourceIds : pSourceIds
    const toggle = (d: DeliveryOption) => {
      const setIds     = form === 'mince' ? setMSourceIds     : setPSourceIds
      const setBatches = form === 'mince' ? setMSourceBatches : setPSourceBatches
      setIds((prev) => prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])
      setBatches((prev) => prev.includes(d.batch_number) ? prev.filter((x) => x !== d.batch_number) : [...prev, d.batch_number])
    }

    const hasDeliveries = deliveries.length > 0
    const hasFiltered   = filtered.length > 0

    if (!hasDeliveries) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-slate-500 text-xs">No delivery batches in the last 16 days.</p>
        </div>
      )
    }

    if (activeSpecies && !hasFiltered) {
      const spLabel = SPECIES.find(s => s.key === activeSpecies)?.label ?? activeSpecies
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-amber-700 text-xs font-semibold">No {spLabel} batches found in recent deliveries.</p>
          <p className="text-slate-500 text-xs mt-1">Log the delivery first via the Goods In section, or continue without selecting a source batch.</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {filtered.map((d) => {
          const sel     = selectedIds.includes(d.id)
          const isToday = d.date === today
          return (
            <button key={d.id} onClick={() => toggle(d)}
              className={`w-full text-left rounded-xl px-4 py-3 border-2 transition-all ${
                sel ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.delivery_number && <span className="text-[10px] font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded font-mono">#{d.delivery_number}</span>}
                    {!isToday && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{d.date}</span>}
                    <p className={`text-sm font-semibold ${sel ? 'text-slate-900' : 'text-slate-700'}`}>{d.supplier}</p>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">{d.product}</p>
                  {d.batch_number && <p className="text-slate-700 text-xs font-mono font-bold mt-0.5">{d.batch_number}</p>}
                  {d.born_in && <p className="text-slate-400 text-[10px] mt-0.5">{COUNTRIES[d.born_in] ?? d.born_in}{d.slaughter_site ? ` · Site: ${d.slaughter_site}` : ''}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'border-orange-500 bg-orange-500' : 'border-slate-300 bg-white'}`}>
                    {sel && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${d.temp_status === 'pass' ? 'bg-green-100 text-green-700' : d.temp_status === 'urgent' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {d.temperature_c}°C
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  /** Mince batch picker for the prep form — today's mince runs */
  function MinceBatchPicker() {
    if (minceBatches.length === 0) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-slate-500 text-xs">No mince runs logged today — select delivery batches above if sourcing direct from delivery.</p>
        </div>
      )
    }
    return (
      <div className="space-y-2">
        {minceBatches.map((m) => {
          const sel = pMinceBatchIds.includes(m.id)
          return (
            <button key={m.id} onClick={() => {
              setPMinceBatchIds((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])
              setPMinceBatchCodes((prev) => prev.includes(m.batch_code) ? prev.filter((x) => x !== m.batch_code) : [...prev, m.batch_code])
            }}
              className={`w-full text-left rounded-xl px-4 py-3 border-2 transition-all ${
                sel ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold font-mono ${sel ? 'text-slate-900' : 'text-slate-700'}`}>{m.batch_code}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {m.species} · kill {m.kill_date} · {m.output_mode}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${sel ? 'border-orange-500 bg-orange-500' : 'border-slate-300 bg-white'}`}>
                  {sel && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">CCP-M1 · CCP-M2 · CCP-MP1 · CCP-MP2</p>
          <h1 className="text-white text-lg font-bold leading-tight">Mince &amp; Meat Prep</h1>
        </div>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/mince' }}
          className="flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/40 rounded-xl px-3 py-2 text-orange-300 text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      {/* Tab selector */}
      <div className="px-5 pt-4 pb-0 grid grid-cols-3 gap-2">
        {([
          { key: 'mince',   label: 'Mince Log',  count: minceRecs.length },
          { key: 'meatprep',label: 'Meat Prep',  count: prepRecs.length  },
          { key: 'timesep', label: 'Time Sep',   count: tsRecs.length    },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
              tab === t.key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-600'
            }`}>
            {t.label}
            {t.count > 0 && <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-orange-100' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* Flash */}
        {flash && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            <p className="text-green-700 font-bold text-sm">{flash}</p>
          </div>
        )}

        {/* ── MINCE TAB ────────────────────────────────────────────────────── */}
        {tab === 'mince' && (
          <>
            <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-slate-900 font-semibold text-sm">Mincing Production Log</p>
                <p className="text-slate-500 text-xs mt-0.5">CCP-M1 (Temp) · CCP-M2 (Kill date) · MMP-MF-001 Form 1</p>
              </div>

              <div className="px-4 py-4 space-y-4">

                {/* Species */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Species (CCP-M2 — determines kill date limit)</p>
                  <div className="flex flex-wrap gap-2">
                    {SPECIES.map((s) => (
                      <button key={s.key} onClick={() => { setMSpecies(s.key); setMInputVal('') }}
                        className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all ${
                          mSpecies === s.key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-600'
                        }`}>
                        {s.label}
                        <span className="block text-[9px] font-normal opacity-60">
                          {s.killEnforced ? `max ${s.maxDays}d · ${s.inputLimit}` : `no kill limit · ${s.inputLimit}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Delivery batch picker */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Source delivery batches (select all that apply)</p>
                  <DeliveryPicker form="mince" filtered={filteredMDeliveries} activeSpecies={mSpecies} />
                  {mSourceBatches.length > 0 && (
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <p className="text-slate-500 text-[10px] mb-1">Selected batches:</p>
                      <p className="text-slate-800 text-xs font-mono font-bold">{mSourceBatches.join(' · ')}</p>
                    </div>
                  )}
                </div>

                {/* Kill date */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                    Kill date (CCP-M2)
                    {mSp && mSp.killEnforced && <span className="text-orange-600"> — max {mSp.maxDays} days for {mSp.label}</span>}
                    {mSp && !mSp.killEnforced && <span className="text-slate-400"> — recorded for traceability only</span>}
                  </p>
                  <input type="date" value={mKillDate}
                    onChange={(e) => setMKillDate(e.target.value)}
                    max={new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })}
                    className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
                  {mDays !== null && mSpecies && (
                    <div className={`mt-2 rounded-xl px-4 py-3 border ${
                      mKillHardFail ? 'bg-red-50 border-red-300' :
                      mKillPass     ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-bold ${mKillHardFail ? 'text-red-700' : mKillPass ? 'text-green-700' : 'text-slate-700'}`}>
                          {mDays} days from kill
                        </p>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                          mKillHardFail           ? 'bg-red-100 text-red-700' :
                          !mSp?.killEnforced       ? 'bg-slate-100 text-slate-600' :
                          mKillPass               ? 'bg-green-100 text-green-700' :
                                                    'bg-amber-100 text-amber-700'
                        }`}>
                          {mKillHardFail    ? 'DO NOT MINCE' :
                           !mSp?.killEnforced ? 'Informational' :
                           mKillPass         ? `Pass ≤${mSp?.maxDays}d` : 'Warning'}
                        </span>
                      </div>
                      {mKillHardFail && (
                        <p className="text-red-600 text-xs mt-1.5 font-semibold">
                          Kill date exceeded — segregate product. Return to supplier or dispose as Category 3 ABP.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Input temp */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Input temperature — CCP-M1</p>
                  <button onClick={() => setNumpad('m_input')} disabled={!mSpecies}
                    className={`w-full rounded-2xl px-4 py-3 border-2 flex items-center justify-between transition-all disabled:opacity-40 ${
                      !mInputVal ? 'border-blue-200 bg-white' :
                      mInPass    ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                    }`}>
                    <div>
                      <p className="text-slate-400 text-xs mb-0.5">{mSp ? `${mSp.label} · limit ${mSp.inputLimit}` : 'Select species first'}</p>
                      <p className={`text-2xl font-bold font-mono ${!mInputVal ? 'text-slate-300' : mInPass ? 'text-green-700' : 'text-red-600'}`}>
                        {mInputVal && !isNaN(mInputNum) ? `${mInputNum}°C` : 'Tap to enter'}
                      </p>
                    </div>
                    {mInPass !== null && mInputVal && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${mInPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {mInPass ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </button>
                </div>

                {/* Output temp */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Output temperature — CCP-M1</p>
                  <div className="flex gap-2 mb-2">
                    {(['chilled','frozen'] as const).map((m) => (
                      <button key={m} onClick={() => { setMOutputMode(m); setMOutputVal('') }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          mOutputMode === m ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'
                        }`}>
                        {m === 'chilled' ? 'Chilled ≤2°C' : 'Frozen ≤-18°C'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setNumpad('m_output')}
                    className={`w-full rounded-2xl px-4 py-3 border-2 flex items-center justify-between transition-all ${
                      !mOutputVal ? 'border-blue-200 bg-white' :
                      mOutPass    ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                    }`}>
                    <div>
                      <p className="text-slate-400 text-xs mb-0.5">Check after {mOutputMode === 'frozen' ? 'freezing' : 'chilling'} — must reach {mOutputMode === 'frozen' ? '≤-18°C' : '≤2°C'}</p>
                      <p className={`text-2xl font-bold font-mono ${!mOutputVal ? 'text-slate-300' : mOutPass ? 'text-green-700' : 'text-red-600'}`}>
                        {mOutputVal && !isNaN(mOutputNum) ? `${mOutputNum}°C` : 'Tap to enter'}
                      </p>
                    </div>
                    {mOutPass !== null && mOutputVal && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${mOutPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {mOutPass ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </button>
                </div>

                {/* Deviation info — popup opens on submit */}
                {mTempFail && !mKillHardFail && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                    <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-1">Temperature deviation detected</p>
                    <p className="text-slate-600 text-xs">A corrective action record will be required before this submission is saved.</p>
                  </div>
                )}

                <p className="text-slate-300 text-xs">{todayStr()}</p>
                {submitErr && <p className="text-red-600 text-xs">{submitErr}</p>}
              </div>

              <button onClick={handleSubmit}
                disabled={submitting || !mSpecies || !mKillDate || !mInputVal || !mOutputVal || mKillHardFail}
                className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting ? 'Saving…' : mKillHardFail ? 'Blocked — kill date exceeded' : 'Submit mince log'}
              </button>
            </div>

            {/* Mince history */}
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Today's mince runs</p>
              {loading ? <p className="text-slate-400 text-sm">Loading…</p>
              : minceRecs.length === 0
              ? <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center"><p className="text-slate-400 text-sm">No mince runs logged today</p></div>
              : (
                <div className="space-y-2">
                  {minceRecs.map((r) => (
                    <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 font-semibold text-sm font-mono">{r.batch_code}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{r.product_species} · {r.days_from_kill}d from kill</p>
                          {r.source_batch_numbers?.length > 0 && (
                            <p className="text-slate-400 text-[10px] mt-0.5">From: {r.source_batch_numbers.join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <p className="text-slate-400 text-xs">{fmtTime(r.time_of_production)}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.kill_date_within_limit && r.input_temp_pass && r.output_temp_pass
                              ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {r.kill_date_within_limit && r.input_temp_pass && r.output_temp_pass ? 'All pass' : 'Deviation'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── MEATPREP TAB ────────────────────────────────────────────────────── */}
        {tab === 'meatprep' && (
          <>
            <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-slate-900 font-semibold text-sm">Meat Preparations Production Log</p>
                <p className="text-slate-500 text-xs mt-0.5">CCP-MP1 (Temp) · CCP-MP2 (Allergens) · MMP-MF-001 Form 2</p>
              </div>

              <div className="px-4 py-4 space-y-4">

                {/* Product name */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Product name</p>
                  <input type="text" value={pProductName} onChange={(e) => setPProductName(e.target.value)}
                    placeholder="e.g. Marinated lamb leg, Burger patties, Seasoned mince"
                    className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
                </div>

                {/* Species (optional for prep) */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Species (optional — for traceability)</p>
                  <div className="flex flex-wrap gap-2">
                    {SPECIES.map((s) => (
                      <button key={s.key} onClick={() => setPSpecies(pSpecies === s.key ? '' : s.key)}
                        className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all ${
                          pSpecies === s.key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-600'
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Source — delivery batches */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Source delivery batches (select all that apply)</p>
                  <DeliveryPicker form="meatprep" filtered={filteredPDeliveries} activeSpecies={pSpecies} />
                </div>

                {/* Source — mince batches (today's runs) */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Source mince batches — today's runs (select if prep comes from mince)</p>
                  <MinceBatchPicker />
                  {pMinceBatchCodes.length > 0 && (
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <p className="text-slate-500 text-[10px] mb-1">Selected mince batches:</p>
                      <p className="text-slate-800 text-xs font-mono font-bold">{pMinceBatchCodes.join(' · ')}</p>
                    </div>
                  )}
                </div>

                {/* Input temp */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Input temperature — CCP-MP1 (≤7°C)</p>
                  <button onClick={() => setNumpad('p_input')}
                    className={`w-full rounded-2xl px-4 py-3 border-2 flex items-center justify-between transition-all ${
                      !pInputVal ? 'border-blue-200 bg-white' :
                      pInPass    ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                    }`}>
                    <p className={`text-2xl font-bold font-mono ${!pInputVal ? 'text-slate-300' : pInPass ? 'text-green-700' : 'text-red-600'}`}>
                      {pInputVal && !isNaN(pInputNum) ? `${pInputNum}°C` : 'Tap to enter'}
                    </p>
                    {pInPass !== null && pInputVal && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${pInPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {pInPass ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </button>
                </div>

                {/* Output temp */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Output temperature — CCP-MP1</p>
                  <div className="flex gap-2 mb-2">
                    {(['chilled','frozen'] as const).map((m) => (
                      <button key={m} onClick={() => { setPOutputMode(m); setPOutputVal('') }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          pOutputMode === m ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'
                        }`}>
                        {m === 'chilled' ? 'Chilled ≤4°C' : 'Frozen ≤-18°C'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setNumpad('p_output')}
                    className={`w-full rounded-2xl px-4 py-3 border-2 flex items-center justify-between transition-all ${
                      !pOutputVal ? 'border-blue-200 bg-white' :
                      pOutPass    ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                    }`}>
                    <div>
                      <p className="text-slate-400 text-xs mb-0.5">Check after {pOutputMode === 'frozen' ? 'freezing' : 'chilling'} — must reach {pOutputMode === 'frozen' ? '≤-18°C' : '≤4°C'}</p>
                      <p className={`text-2xl font-bold font-mono ${!pOutputVal ? 'text-slate-300' : pOutPass ? 'text-green-700' : 'text-red-600'}`}>
                        {pOutputVal && !isNaN(pOutputNum) ? `${pOutputNum}°C` : 'Tap to enter'}
                      </p>
                    </div>
                    {pOutPass !== null && pOutputVal && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${pOutPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {pOutPass ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </button>
                </div>

                {/* Allergens — CCP-MP2 */}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Allergens present (CCP-MP2) — select all that apply</p>
                  <div className="flex flex-wrap gap-2">
                    {ALLERGENS.map((a) => (
                      <button key={a} onClick={() => setPAllergens((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])}
                        className={`px-3 py-1.5 rounded-2xl text-xs font-bold border-2 transition-all ${
                          pAllergens.includes(a) ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600'
                        }`}>
                        {a}
                      </button>
                    ))}
                  </div>
                  {pAllergens.length === 0 && (
                    <p className="text-slate-400 text-xs mt-1.5">Select none if plain meat product with no allergen ingredients</p>
                  )}
                </div>

                {/* Label check — required if allergens */}
                {pAllergens.length > 0 && (
                  <button onClick={() => setPLabelCheck((v) => !v)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                      pLabelCheck ? 'border-green-500 bg-green-50' : 'border-red-300 bg-red-50'
                    }`}>
                    <div className={`w-6 h-6 rounded border-2 flex-shrink-0 flex items-center justify-center ${pLabelCheck ? 'border-green-500 bg-green-500' : 'border-red-400 bg-white'}`}>
                      {pLabelCheck && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-bold ${pLabelCheck ? 'text-green-700' : 'text-red-700'}`}>Label check completed (CCP-MP2)</p>
                      <p className="text-slate-500 text-xs">All allergens verified on label before production starts</p>
                    </div>
                  </button>
                )}

                {/* Deviation info — popup opens on submit */}
                {(pInPass === false || pOutPass === false) && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                    <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-1">Temperature deviation detected</p>
                    <p className="text-slate-600 text-xs">A corrective action record will be required before this submission is saved.</p>
                  </div>
                )}

                <p className="text-slate-300 text-xs">{todayStr()}</p>
                {submitErr && <p className="text-red-600 text-xs">{submitErr}</p>}
              </div>

              <button onClick={handleSubmit} disabled={submitting || !pProductName || !pInputVal || !pOutputVal || pAllergenIssue}
                className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting ? 'Saving…' : 'Submit meat prep log'}
              </button>
            </div>

            {/* Meatprep history */}
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Today's prep runs</p>
              {prepRecs.length === 0
              ? <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center"><p className="text-slate-400 text-sm">No prep runs logged today</p></div>
              : (
                <div className="space-y-2">
                  {prepRecs.map((r) => (
                    <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 font-semibold text-sm font-mono">{r.batch_code}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{r.product_name}</p>
                          {r.allergens_present?.length > 0 && (
                            <p className="text-red-600 text-[10px] mt-0.5">Allergens: {r.allergens_present.join(', ')}</p>
                          )}
                          {r.source_batch_numbers?.length > 0 && (
                            <p className="text-slate-400 text-[10px] mt-0.5">From: {r.source_batch_numbers.join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <p className="text-slate-400 text-xs">{fmtTime(r.time_of_production)}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.input_temp_pass && r.output_temp_pass && r.label_check_completed
                              ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {r.input_temp_pass && r.output_temp_pass ? 'Pass' : 'Deviation'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TIME SEP TAB ─────────────────────────────────────────────────── */}
        {tab === 'timesep' && (
          <>
            {/* Process sequence reminder */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-2">Required process sequence (MMP-001 §7)</p>
              {[
                '1. Complete ALL plain cutting / mincing',
                '2. Remove all plain products from area',
                '3. FULL CLEAN & SANITISE all equipment and surfaces',
                '4. Visual inspection — verify cleanliness',
                '5. Sign off below',
                '6. Begin allergen products',
              ].map((s) => (
                <p key={s} className="text-slate-700 text-xs leading-relaxed">{s}</p>
              ))}
            </div>

            <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-slate-900 font-semibold text-sm">Time Separation Log</p>
                <p className="text-slate-500 text-xs mt-0.5">MMP-MF-001 Form 3 · Allergen cross-contamination prevention</p>
              </div>

              <div className="px-4 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Plain products ended</p>
                    <input type="time" value={tPlainEnd} onChange={(e) => setTPlainEnd(e.target.value)}
                      className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Clean completed ✱</p>
                    <input type="time" value={tCleanDone} onChange={(e) => setTCleanDone(e.target.value)}
                      className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div className="col-span-2">
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Allergen products started</p>
                    <input type="time" value={tAllergenStart} onChange={(e) => setTAllergenStart(e.target.value)}
                      className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                </div>

                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Clean verified by ✱</p>
                  <input type="text" value={tVerifiedBy} onChange={(e) => setTVerifiedBy(e.target.value)}
                    placeholder="Name of person who visually verified the clean"
                    className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
                </div>

                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Allergens in production ✱</p>
                  <input type="text" value={tAllergens} onChange={(e) => setTAllergens(e.target.value)}
                    placeholder="e.g. Mustard, Gluten, Soya"
                    className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
                </div>

                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Corrective action (if any issue found)</p>
                  <textarea value={tCA} onChange={(e) => setTCA(e.target.value)} rows={2}
                    placeholder="Any issues or actions taken…"
                    className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
                </div>

                <p className="text-slate-300 text-xs">{todayStr()}</p>
                {submitErr && <p className="text-red-600 text-xs">{submitErr}</p>}
              </div>

              <button onClick={handleSubmit} disabled={submitting || !tCleanDone || !tVerifiedBy || !tAllergens}
                className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting ? 'Saving…' : 'Submit time separation log'}
              </button>
            </div>

            {/* Time sep history */}
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Today's time separation records</p>
              {tsRecs.length === 0
              ? <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center"><p className="text-slate-400 text-sm">No time separation logs today</p></div>
              : (
                <div className="space-y-2">
                  {tsRecs.map((r) => (
                    <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
                      <p className="text-slate-900 font-semibold text-sm">Clean completed: {fmtTime(r.clean_completed_time)}</p>
                      <p className="text-slate-500 text-xs mt-0.5">Verified by: {r.clean_verified_by}</p>
                      <p className="text-red-600 text-xs mt-0.5">Allergens: {r.allergens_in_production}</p>
                      {r.allergen_products_start_time && (
                        <p className="text-slate-400 text-[10px] mt-0.5">Allergen production started: {fmtTime(r.allergen_products_start_time)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* CCA Popup */}
      {showCCA && (
        <CCAPopup
          channels={ccaChannels}
          onSubmit={(ca) => doSubmit(ca)}
          onBack={() => { setShowCCA(false); setPendingTab(null) }}
        />
      )}

      {/* Numpad */}
      {numpad && numpadState[numpad] && (() => {
        const [val, setVal, label, hint] = numpadState[numpad]
        return (
          <Numpad
            value={val}
            onChange={setVal}
            onClose={() => setNumpad(null)}
            label={label}
            hint={hint}
          />
        )
      })()}

    </div>
  )
}
