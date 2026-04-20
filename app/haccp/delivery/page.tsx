/**
 * app/haccp/delivery/page.tsx
 *
 * CCP 1 — Delivery Intake (Goods In Temperature Check)
 * Event-driven: one record per delivery. Form resets after submit.
 * Supplier: dropdown from DB + "Other" free text fallback.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TempStatus = 'pass' | 'urgent' | 'fail' | null

interface Supplier  { id: string; name: string }
interface Delivery  {
  id:                   string
  time_of_delivery:     string
  supplier:             string
  product:              string
  product_category:     string
  temperature_c:        number
  temp_status:          string
  covered_contaminated: string
  corrective_action_required: boolean
  contamination_notes:  string | null
  notes:                string | null
  born_in:              string | null
  reared_in:            string | null
  slaughter_site:       string | null
  cut_site:             string | null
  batch_number:         string | null
  delivery_number:      number | null
  submitted_at:         string
  users:                { name: string }
}

// ─── Product categories ───────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string; limit: string; detail: string }[] = [
  { key: 'red_meat',   label: 'Red meat (beef / lamb)', limit: '≤8°C (target ≤5°C)', detail: '≤5°C pass · 5–8°C conditional accept · >8°C reject' },
  { key: 'offal',      label: 'Offal',                  limit: '≤3°C',               detail: '≤3°C pass · >3°C reject' },
  { key: 'mince_prep', label: 'Mince / meat prep',      limit: '≤4°C',               detail: '≤4°C pass · >4°C reject' },
  { key: 'frozen',     label: 'Frozen',                 limit: '≤-18°C',             detail: '≤-18°C pass · -15 to -18°C conditional (refreeze immediately) · >-15°C reject' },
]

const CATEGORY_LABELS: Record<string, string> = {
  red_meat:   'Red meat', offal: 'Offal', mince_prep: 'Mince / prep', frozen: 'Frozen',
}

// Country of origin options + ISO codes for batch number
const COUNTRIES = [
  { label: 'Ireland',     code: 'IRL' },
  { label: 'UK',          code: 'UK'  },
  { label: 'Australia',   code: 'AUS' },
  { label: 'New Zealand', code: 'NZL' },
  { label: 'Brazil',      code: 'BRA' },
]

// Generate batch number: DDMM-{COUNTRY_CODE}-{SLAUGHTER_SITE}
function buildBatchNumber(date: string, countryCode: string, slaughterSite: string): string {
  if (!date || !countryCode || !slaughterSite.trim()) return ''
  const d   = new Date(date + 'T00:00:00')
  const dd  = String(d.getDate()).padStart(2, '0')
  const mm  = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}${mm}-${countryCode}-${slaughterSite.trim()}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcStatus(temp: number, category: string): TempStatus {
  if (isNaN(temp)) return null
  switch (category) {
    // CA-001: chilled meat ≤8°C legal max, target ≤5°C
    // 5–8°C = conditional accept (NOT reject), >8°C = reject
    case 'red_meat':   return temp <= 5.0 ? 'pass' : temp <= 8.0 ? 'urgent' : 'fail'
    case 'offal':      return temp <= 3.0 ? 'pass' : 'fail'
    case 'mince_prep': return temp <= 4.0 ? 'pass' : 'fail'
    // CA-001: frozen ≤-18°C target, acceptable to -15°C if re-frozen immediately
    case 'frozen':     return temp <= -18.0 ? 'pass' : temp <= -15.0 ? 'urgent' : 'fail'
    default:           return null
  }
}

function nowDisplay() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
}

function deliveryTime(t: string) { return t?.slice(0, 5) ?? '—' }

const STATUS_COLOUR: Record<string, string> = {
  pass:   'text-green-600', urgent: 'text-[#EB6619]', fail: 'text-red-600',
}
const STATUS_BADGE: Record<string, string> = {
  pass:   'bg-green-100 text-green-600',
  urgent: 'bg-amber-100 text-[#EB6619]',
  fail:   'bg-red-100 text-red-600',
}
const STATUS_BORDER: Record<string, string> = {
  pass:   'border-green-300 bg-green-50',
  urgent: 'border-amber-400 bg-amber-50',
  fail:   'border-red-400 bg-red-50',
  empty:  'border-blue-200 bg-white',
}
const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass', urgent: 'Conditional accept', fail: 'Reject',
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange, onClose, category }: {
  value:    string
  onChange: (v: string) => void
  onClose:  () => void
  category: string
}) {
  const num  = parseFloat(value)
  const stat = category ? calcStatus(num, category) : null
  const cat  = CATEGORIES.find((c) => c.key === category)

  function press(key: string) {
    if (key === 'back') { onChange(value.slice(0, -1)); return }
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
          <p className="text-[#EB6619] text-xs font-bold tracking-widest uppercase">CCP 1 — Delivery Intake</p>
          <h2 className="text-slate-900 text-xl font-bold mt-0.5">Probe temperature</h2>
          {cat && <p className="text-slate-400 text-sm mt-0.5">{cat.label} · limit {cat.limit}</p>}
        </div>
        <button onClick={onClose} className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <div className={`text-6xl font-bold tracking-tight ${stat ? STATUS_COLOUR[stat] : 'text-slate-300'}`}>
            {value || '—'}<span className="text-2xl ml-2 opacity-60">°C</span>
          </div>
          {stat && (
            <div className={`mt-3 inline-block px-5 py-1.5 rounded-full text-sm font-bold ${STATUS_BADGE[stat]}`}>
              {STATUS_LABEL[stat]}
            </div>
          )}
          {stat === 'urgent' && (
            <div className="mt-4 mx-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-left">
              <p className="text-amber-700 text-xs font-bold uppercase tracking-widest mb-1.5">Conditional accept — do NOT reject (CA-001)</p>
              {category === 'frozen'
                ? <p className="text-slate-600 text-xs leading-relaxed">Acceptable short-term if product is re-frozen immediately. Document decision.</p>
                : <p className="text-slate-600 text-xs leading-relaxed">Place immediately into coldest chiller area. Halve remaining shelf life. Document assessment. Review supplier performance.</p>
              }
            </div>
          )}
          {stat === 'fail' && (
            <div className="mt-4 mx-2 bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-left">
              <p className="text-red-600 text-xs font-bold uppercase tracking-widest mb-1.5">Reject delivery</p>
              <p className="text-slate-600 text-xs leading-relaxed">Do NOT accept. Photograph product and temp reading. Complete non-conformance report. Notify supplier within 24 hours.</p>
            </div>
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
          {/* Negative toggle for frozen */}
          {category === 'frozen' && (
            <button onPointerDown={(e) => { e.preventDefault(); press('-') }}
              className="col-span-3 h-12 rounded-2xl bg-slate-50 text-slate-500 text-sm font-bold active:scale-95">
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

// ─── CCA Popup ────────────────────────────────────────────────────────────────

function CCAPopup({ tempStatus, contaminated, onConfirm, onBack }: {
  tempStatus:   TempStatus
  contaminated: string
  onConfirm:    () => void
  onBack:       () => void
}) {
  // CA-001 verbatim corrective actions per deviation type
  // tempStatus 'urgent' = conditional accept (5-8°C chilled, or -15 to -18°C frozen)
  const conditionalAcceptActions = ['Accept conditionally — do NOT reject the delivery', 'Place immediately into coldest chiller area (or refreeze immediately if frozen)', 'Use within reduced shelf life — halve remaining use-by', 'Document assessment and accelerated use decision', 'Review supplier performance']

  const rejectActions = ['REJECT delivery immediately — do NOT accept product', 'Photograph product and temperature reading', 'Complete Non-Conformance Report', 'Notify supplier in writing within 24 hours', 'Segregate and return or dispose as required', 'Do not accept for human consumption']

  const contamActions = ['Trim contaminated area using clean knife', 'Dispose of trimmings as Category 2/3 ABP', 'Sterilise knife immediately after trimming (≥82°C)', 'Document trimming action and disposal', 'If contamination excessive: REJECT entire carcase']

  const showTemp   = tempStatus === 'urgent' || tempStatus === 'fail'
  const showContam = contaminated === 'yes' || contaminated === 'yes_actioned'
  const isConditional = tempStatus === 'urgent'

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{position:'fixed'}}>
      <div className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <p className={`text-xs font-bold tracking-widest uppercase ${isConditional ? 'text-[#EB6619]' : 'text-red-600'}`}>
              {isConditional ? 'CCP 1 — Conditional accept' : 'CCP 1 — Reject required'}
            </p>
            <h2 className="text-slate-900 text-xl font-bold mt-0.5">
              {isConditional ? 'Do NOT reject — take action below' : 'Corrective Action Required'}
            </h2>
          </div>
          <button onClick={onBack} className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 pb-6 space-y-5">
          {showTemp && (
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">
                {isConditional ? 'Required actions — conditional accept (CA-001)' : 'Required actions — reject (CA-001)'}
              </p>
              <div className="space-y-2">
                {(isConditional ? conditionalAcceptActions : rejectActions).map((a) => (
                  <div key={a} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
                    isConditional ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isConditional ? 'bg-[#EB6619]' : 'bg-red-300'}`}/>
                    <p className="text-slate-700 text-sm">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {showContam && (
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Contamination — required actions (CA-001)</p>
              <div className="space-y-2">
                {contamActions.map((a) => (
                  <div key={a} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-[#EB6619]"/>
                    <p className="text-slate-700 text-sm">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-slate-400 text-xs">By confirming, you acknowledge these actions have been taken or are in progress. This record is immutable once submitted.</p>
          <button onClick={onConfirm}
            className={`w-full text-white font-bold py-4 rounded-xl text-base ${isConditional ? 'bg-[#EB6619]' : 'bg-red-600'}`}>
            Confirm &amp; submit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delivery Detail Sheet ────────────────────────────────────────────────────

function DeliveryDetail({ d, onClose }: { d: Delivery; onClose: () => void }) {
  const bornLabel   = COUNTRIES.find((c) => c.code === d.born_in)?.label   ?? d.born_in
  const rearedLabel = COUNTRIES.find((c) => c.code === d.reared_in)?.label ?? d.reared_in
  const catLabel    = CATEGORIES.find((c) => c.key === d.product_category)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" style={{ position: 'fixed' }}>
      <div className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            {d.delivery_number && (
              <span className="text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded font-mono flex-shrink-0">#{d.delivery_number}</span>
            )}
            <h2 className="text-slate-900 font-bold text-lg">{d.supplier}</h2>
          </div>
          <button onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 pb-8">

          {/* Batch number — prominent */}
          {d.batch_number && (
            <div className="bg-slate-900 rounded-xl px-4 py-3">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Batch reference</p>
              <p className="text-white text-xl font-bold font-mono tracking-widest">{d.batch_number}</p>
            </div>
          )}

          {/* Temperature */}
          <div className={`rounded-xl px-4 py-3 border ${
            d.temp_status === 'pass'   ? 'bg-green-50 border-green-200' :
            d.temp_status === 'urgent' ? 'bg-amber-50 border-amber-200' :
                                         'bg-red-50 border-red-200'
          }`}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Temperature — CCP 1</p>
            <div className="flex items-center justify-between">
              <p className={`text-2xl font-bold font-mono ${
                d.temp_status === 'pass'   ? 'text-green-700' :
                d.temp_status === 'urgent' ? 'text-amber-700' : 'text-red-700'
              }`}>{d.temperature_c}°C</p>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_BADGE[d.temp_status]}`}>
                {STATUS_LABEL[d.temp_status]}
              </span>
            </div>
            {catLabel && <p className="text-slate-500 text-xs mt-1">{catLabel.label} · limit {catLabel.limit}</p>}
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-2 gap-3">

            <div className="bg-slate-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Slaughter site</p>
              <p className="text-slate-900 font-mono font-bold text-sm">{d.slaughter_site ?? '—'}</p>
            </div>

            <div className="bg-slate-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Cut site</p>
              <p className="text-slate-900 font-mono font-bold text-sm">
                {d.cut_site
                  ? d.cut_site === d.slaughter_site ? <span className="font-sans font-normal text-slate-500 text-xs">Same</span> : d.cut_site
                  : '—'}
              </p>
            </div>

            <div className="bg-slate-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Born in</p>
              <p className="text-slate-900 font-semibold text-sm">{bornLabel ?? '—'}</p>
            </div>

            <div className="bg-slate-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Reared in</p>
              <p className="text-slate-900 font-semibold text-sm">
                {d.reared_in
                  ? d.reared_in === d.born_in ? <span className="text-slate-500 font-normal text-xs">Same</span> : rearedLabel
                  : '—'}
              </p>
            </div>

            <div className="bg-slate-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Time</p>
              <p className="text-slate-900 font-semibold text-sm">{deliveryTime(d.time_of_delivery)}</p>
            </div>

            <div className="bg-slate-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Logged by</p>
              <p className="text-slate-900 font-semibold text-sm truncate">{d.users?.name ?? '—'}</p>
            </div>

          </div>

          {/* Product */}
          <div className="bg-slate-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Product</p>
            <p className="text-slate-900 text-sm font-medium">{d.product}</p>
            <p className="text-slate-500 text-xs mt-0.5">{catLabel?.label ?? d.product_category}</p>
          </div>

          {/* Contamination */}
          {d.covered_contaminated !== 'no' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-1">
                Contamination — {d.covered_contaminated === 'yes_actioned' ? 'actioned' : 'rejected'}
              </p>
              {d.contamination_notes && (
                <p className="text-slate-700 text-xs leading-relaxed">{d.contamination_notes}</p>
              )}
            </div>
          )}

          {/* Corrective action required */}
          {d.corrective_action_required && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-700 text-[10px] font-bold uppercase tracking-widest mb-1">Corrective action required</p>
              <p className="text-slate-600 text-xs leading-relaxed">A temperature deviation or contamination issue was recorded. Corrective action was documented at time of logging.</p>
            </div>
          )}

          {/* Notes */}
          {d.notes && (
            <div className="bg-slate-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Notes</p>
              <p className="text-slate-700 text-xs leading-relaxed">{d.notes}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading,    setLoading]    = useState(true)
  const [nextNumber, setNextNumber] = useState(1)

  // Form state
  const [supplierSel, setSupplierSel] = useState('')    // selected preset or 'other'
  const [supplierOther, setSupplierOther] = useState('') // free text when 'other'
  const [product,    setProduct]    = useState('')
  const [category,   setCategory]   = useState('')
  const [tempVal,    setTempVal]    = useState('')
  const [contam,     setContam]     = useState('')
  const [contamType, setcontamType] = useState('')   // sub-type when yes_actioned
  const [contamNote, setContamNote] = useState('')
  const [bornIn,     setBornIn]     = useState('')
  const [rearedIn,   setRearedIn]   = useState('')
  const [rearedSame, setRearedSame] = useState(false)
  const [slaughter,  setSlaughter]  = useState('')
  const [cutSite,    setCutSite]    = useState('')     // '' = not set, 'same' = same as slaughter, else numeric code
  const [cutSameAs,  setCutSameAs]  = useState(false)
  const [notes,      setNotes]      = useState('')

  // UI state
  const [showNumpad,       setShowNumpad]       = useState(false)
  const [showCCA,          setShowCCA]          = useState(false)
  const [showQuick,        setShowQuick]        = useState(false)
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitErr,   setSubmitErr]   = useState('')
  const [flash,       setFlash]       = useState(false)
  const [timeNow,     setTimeNow]     = useState(nowDisplay())

  useEffect(() => {
    const t = setInterval(() => setTimeNow(nowDisplay()), 30000)
    return () => clearInterval(t)
  }, [])

  const loadData = useCallback(() => {
    fetch('/api/haccp/delivery')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => {
        setSuppliers(d.suppliers ?? [])
        setDeliveries(d.deliveries ?? [])
        setNextNumber(d.next_number ?? 1)
      })
      .catch((e) => setSubmitErr(`Could not load data — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const tempNum    = parseFloat(tempVal)
  const tempStat   = category ? calcStatus(tempNum, category) : null
  const supplierFinal = supplierSel === 'other' ? supplierOther.trim() : supplierSel

  const needsCCA = (tempStat === 'urgent' || tempStat === 'fail') ||
                   (contam === 'yes' || contam === 'yes_actioned')

  const isValid = supplierFinal && product.trim() && category &&
                  tempVal !== '' && !isNaN(tempNum) && contam

  function resetForm() {
    setSupplierSel(''); setSupplierOther(''); setProduct('')
    setCategory(''); setTempVal(''); setContam('')
    setcontamType(''); setContamNote(''); setNotes(''); setSubmitErr('')
    setBornIn(''); setRearedIn(''); setRearedSame(false); setSlaughter(''); setCutSite(''); setCutSameAs(false)
  }

  async function doSubmit() {
    setShowCCA(false); setSubmitting(true); setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/delivery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: supplierFinal, product: product.trim(),
          product_category: category, temperature_c: tempNum,
          covered_contaminated: contam,
          contamination_notes: contamNote || undefined,
          notes: notes || undefined,
          born_in:           bornIn || undefined,
          reared_in:         rearedIn || undefined,
          slaughter_site:    slaughter || undefined,
          cut_site:          cutSite || undefined,
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

  function handleSubmit() {
    if (!isValid) return
    if (needsCCA) { setShowCCA(true); return }
    doSubmit()
  }

  const catDef = CATEGORIES.find((c) => c.key === category)

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">CCP 1 — Delivery Intake</p>
          <h1 className="text-white text-lg font-bold leading-tight">Goods In Check</h1>
        </div>
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/18 border border-white/15 rounded-xl px-3 py-2 text-white/60 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/delivery' }}
          className="flex items-center gap-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40 rounded-xl px-3 py-2 text-orange-300 transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* SOP 5B banner */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-[#EB6619] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          <div>
            <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-1">SOP 5B — Receiving rule</p>
            <p className="text-slate-500 text-xs leading-relaxed">Boxed / packaged meat only — NO exposed meat. Driver stays in receiving area and does NOT enter production.</p>
          </div>
        </div>

        {/* Flash */}
        {flash && (
          <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="text-green-600 font-bold text-sm">Delivery logged — ready for next entry</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100">
            <p className="text-slate-900 font-semibold text-sm">Log a delivery</p>
            <p className="text-slate-400 text-xs mt-0.5">CCP 1 · one record per delivery</p>
          </div>

          <div className="px-4 py-3 space-y-4">

            {/* Supplier */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Supplier</p>
              {/* Preset supplier chips */}
              <div className="flex flex-wrap gap-2 mb-2">
                {suppliers.map((s) => (
                  <button key={s.id}
                    onPointerDown={(e) => { e.preventDefault(); setSupplierSel(s.name); setSupplierOther('') }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      supplierSel === s.name ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-400'
                    }`}>
                    {s.name}
                  </button>
                ))}
                <button
                  onPointerDown={(e) => { e.preventDefault(); setSupplierSel('other') }}
                  className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                    supplierSel === 'other' ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-400'
                  }`}>
                  Other
                </button>
              </div>
              {/* Free text when Other selected */}
              {supplierSel === 'other' && (
                <input type="text" value={supplierOther} onChange={(e) => setSupplierOther(e.target.value)}
                  placeholder="Enter supplier name…"
                  className="w-full bg-slate-100 border border-amber-400 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-[#EB6619]" />
              )}
            </div>

            {/* Born in */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Born in</p>
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map((c) => (
                  <button key={c.code}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      setBornIn(c.code)
                      // If reared was set to same, keep it in sync
                      if (rearedSame) setRearedIn(c.code)
                    }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      bornIn === c.code
                        ? 'border-[#EB6619] bg-[#EB6619]/15 text-[#EB6619]'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reared in */}
            {bornIn && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Reared in</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); setRearedSame(true); setRearedIn(bornIn) }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      rearedSame
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}>
                    ✓ Same as born in ({COUNTRIES.find((c) => c.code === bornIn)?.label})
                  </button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); setRearedSame(false); setRearedIn('') }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      !rearedSame && rearedIn !== ''
                        ? 'border-[#EB6619] bg-[#EB6619]/15 text-[#EB6619]'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}>
                    Different country
                  </button>
                </div>
                {!rearedSame && (
                  <div className="flex flex-wrap gap-2">
                    {COUNTRIES.map((c) => (
                      <button key={c.code}
                        onPointerDown={(e) => { e.preventDefault(); setRearedIn(c.code) }}
                        className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                          rearedIn === c.code
                            ? 'border-[#EB6619] bg-[#EB6619]/15 text-[#EB6619]'
                            : 'border-slate-300 bg-white text-slate-600'
                        }`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Slaughter site */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Slaughter site code</p>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                value={slaughter}
                onChange={(e) => {
                  setSlaughter(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
                  // If "same" was selected, keep cut in sync
                  if (cutSameAs) setCutSite(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
                }}
                placeholder="e.g. GB1234 or 1234"
                maxLength={8}
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 tracking-widest font-mono" />
            </div>

            {/* Cut site */}
            {slaughter.length > 0 && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Cut site code</p>
                <div className="flex gap-2 mb-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); setCutSameAs(true); setCutSite(slaughter) }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      cutSameAs ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-300 bg-white text-slate-600'
                    }`}>
                    ✓ Same as slaughter ({slaughter})
                  </button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); setCutSameAs(false); setCutSite('') }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      !cutSameAs && cutSite !== '' ? 'border-[#EB6619] bg-[#EB6619]/10 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-600'
                    }`}>
                    Different site
                  </button>
                </div>
                {!cutSameAs && (
                  <input
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    value={cutSite}
                    onChange={(e) => setCutSite(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                    placeholder="e.g. AU1234 or 5678"
                    maxLength={8}
                    className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 tracking-widest font-mono" />
                )}
              </div>
            )}

            {/* Batch number — auto-generated once born in + slaughter set */}
            {bornIn && rearedIn && slaughter && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">Batch reference (auto-generated)</p>
                <p className="text-white text-lg font-bold font-mono tracking-widest">
                  {buildBatchNumber(
                    new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }),
                    bornIn,
                    slaughter
                  )}-{nextNumber}
                </p>
                <div className="flex gap-3 mt-1.5">
                  <p className="text-slate-500 text-[10px]">DDMM · born-in · slaughter · delivery #{nextNumber}</p>
                </div>
                {bornIn !== rearedIn && (
                  <p className="text-amber-400 text-[10px] mt-1">
                    Born: {COUNTRIES.find((c) => c.code === bornIn)?.label} · Reared: {COUNTRIES.find((c) => c.code === rearedIn)?.label}
                  </p>
                )}
              </div>
            )}

            {/* Product description */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Product description</p>
              <input type="text" value={product} onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Whole lamb carcasses — 24 units"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>

            {/* Product category */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Product category</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.key}
                    onPointerDown={(e) => { e.preventDefault(); setCategory(c.key); setTempVal('') }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      category === c.key ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-400'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {catDef && <p className="text-slate-300 text-[10px] mt-1.5 ml-1">{catDef.detail}</p>}
            </div>

            {/* Temperature */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Temperature — tap to enter</p>
              <button
                onClick={() => category && setShowNumpad(true)}
                disabled={!category}
                className={`w-full rounded-2xl p-4 border-2 flex items-center justify-between transition-all disabled:opacity-40 ${
                  !tempVal        ? STATUS_BORDER.empty  :
                  tempStat === 'pass'   ? STATUS_BORDER.pass  :
                  tempStat === 'urgent' ? STATUS_BORDER.urgent :
                                          STATUS_BORDER.fail
                }`}>
                <div>
                  <p className="text-slate-400 text-xs mb-1">{category ? `Probe reading · limit ${catDef?.limit}` : 'Select a category first'}</p>
                  <p className={`text-2xl font-bold ${!tempVal ? 'text-slate-300' : tempStat ? STATUS_COLOUR[tempStat] : 'text-slate-300'}`}>
                    {tempVal && !isNaN(tempNum) ? `${tempNum}°C` : 'Tap to enter'}
                  </p>
                </div>
                {tempStat && tempVal && (
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${STATUS_BADGE[tempStat]}`}>
                    {STATUS_LABEL[tempStat]}
                  </span>
                )}
              </button>

              {/* Inline urgent note */}
              {tempStat === 'urgent' && (
                <div className="mt-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                  <p className="text-amber-700 text-xs font-bold uppercase tracking-widest mb-1.5">Conditional accept — do NOT reject (CA-001)</p>
                  {category === 'frozen' ? (
                    <p className="text-slate-500 text-xs leading-relaxed">Acceptable short-term only if product is re-frozen immediately. Document decision. Monitor closely.</p>
                  ) : (
                    <p className="text-slate-500 text-xs leading-relaxed">Place into coldest chiller area immediately. Use within reduced shelf life — halve remaining use-by. Document assessment. Review supplier performance.</p>
                  )}
                </div>
              )}
              {tempStat === 'fail' && (
                <div className="mt-2 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                  <p className="text-red-600 text-xs font-bold uppercase tracking-widest mb-1">Reject delivery</p>
                  <p className="text-slate-500 text-xs leading-relaxed">Do NOT accept. Photograph and complete non-conformance report. Notify supplier within 24 hours.</p>
                </div>
              )}
            </div>

            {/* Covered / contaminated */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Covered / contaminated?</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'no',           label: 'No — all clear' },
                  { val: 'yes',          label: 'Yes — rejected' },
                  { val: 'yes_actioned', label: 'Yes — actioned' },
                ].map((o) => (
                  <button key={o.val} onClick={() => { setContam(o.val); setcontamType(''); setContamNote('') }}
                    className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                      contam === o.val
                        ? o.val === 'no'
                          ? 'border-green-300 bg-green-50 text-green-600'
                          : 'border-[#EB6619] bg-amber-50 text-[#EB6619]'
                        : 'border-slate-300 bg-white text-slate-400'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {contam === 'yes_actioned' && (
                <div className="mt-3 space-y-3">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Type of contamination (CA-001)</p>
                  <div className="space-y-2">
                    {[
                      {
                        key: 'uncovered',
                        label: 'Product uncovered / exposed',
                        actions: ['REJECT if visible contamination or cross-contamination risk','If minor exposure only: assess quality, re-cover immediately, use for immediate processing only','Document incident and notify supplier'],
                      },
                      {
                        key: 'faecal_wool_hide',
                        label: 'Contamination — faecal, wool, or hide',
                        actions: ['TRIM contaminated area using clean knife','Dispose of trimmings as Category 2/3 ABP','Sterilise knife immediately after trimming (≥82°C)','Document trimming action and disposal','If contamination excessive: REJECT entire carcase'],
                      },
                      {
                        key: 'packaging',
                        label: 'Packaging damaged',
                        actions: ['If seal broken on vacuum pack or visible ingress: REJECT and dispose','Minor outer damage with intact inner seal: re-pack and use immediately','Document and notify supplier'],
                      },
                      {
                        key: 'missing_docs',
                        label: 'Missing documentation',
                        actions: ['Hold product in segregated area','Request traceability documents from supplier within 2 hours','If not received: reject delivery'],
                      },
                    ].map((t) => (
                      <div key={t.key}>
                        <button onClick={() => { setcontamType(t.key); setContamNote(t.actions.join(' | ')) }}
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                            contamType === t.key ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-slate-600'
                          }`}>
                          {t.label}
                        </button>
                        {contamType === t.key && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
                            {t.actions.map((a, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#EB6619] flex-shrink-0 mt-1.5"/>
                                <p className="text-slate-600 text-xs leading-relaxed">{a}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {contamType && (
                    <textarea value={contamNote} onChange={(e) => setContamNote(e.target.value)} rows={2}
                      placeholder="Additional details (optional)…"
                      className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
                  )}
                </div>
              )}
              {contam === 'yes' && (
                <textarea value={contamNote} onChange={(e) => setContamNote(e.target.value)} rows={2}
                  placeholder="Describe reason for rejection…"
                  className="mt-2 w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
              )}
            </div>

            {/* Optional notes */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Notes (optional)</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Any additional notes…"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
            </div>

            {/* Meta */}
            <div className="flex items-center justify-between">
              <p className="text-slate-300 text-xs">{new Date().toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric', timeZone:'Europe/London' })}</p>
              <p className="text-slate-300 text-xs">Auto-time: {timeNow}</p>
            </div>

          </div>

          {submitErr && <p className="px-4 pb-2 text-red-600 text-xs">{submitErr}</p>}

          <button onClick={handleSubmit} disabled={!isValid || submitting}
            className={`w-full text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all ${
              needsCCA && isValid ? 'bg-red-600' : 'bg-[#EB6619]'
            }`}>
            {submitting
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Submitting…</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                {needsCCA && isValid ? 'Submit — corrective action required' : 'Submit delivery'}</>
            }
          </button>
        </div>

        {/* Today's log */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Today's deliveries</p>
            {deliveries.length > 0 && (
              <span className="bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs font-bold text-green-600">
                {deliveries.length} logged
              </span>
            )}
          </div>
          {loading ? (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-4">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Loading…
            </div>
          ) : deliveries.length === 0 ? (
            <div className="bg-slate-50 border border-blue-100 rounded-xl px-4 py-5 text-center">
              <p className="text-slate-400 text-sm">No deliveries logged today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deliveries.map((d) => (
                <button key={d.id}
                  onClick={() => setSelectedDelivery(d)}
                  className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-left transition-all hover:border-slate-300 hover:shadow-sm active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {d.delivery_number && (
                          <span className="text-[10px] font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded font-mono flex-shrink-0">#{d.delivery_number}</span>
                        )}
                        <p className="text-slate-900 font-semibold text-sm truncate">{d.supplier}</p>
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5 truncate">{d.product} · {CATEGORY_LABELS[d.product_category] ?? d.product_category}</p>
                      {d.batch_number && (
                        <p className="text-slate-800 text-xs mt-0.5 font-mono font-bold tracking-wider">{d.batch_number}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 mt-0.5">
                        {d.slaughter_site && (
                          <p className="text-slate-400 text-[10px]">Slaughter: <span className="font-mono font-bold text-slate-600">{d.slaughter_site}</span></p>
                        )}
                        {d.born_in && (
                          <p className="text-slate-400 text-[10px]">
                            Born: {COUNTRIES.find((c) => c.code === d.born_in)?.label ?? d.born_in}
                            {d.reared_in && d.reared_in !== d.born_in && <> · Reared: {COUNTRIES.find((c) => c.code === d.reared_in)?.label ?? d.reared_in}</>}
                          </p>
                        )}
                      </div>
                      {d.covered_contaminated !== 'no' && (
                        <p className="text-amber-600 text-xs mt-1">⚠ Contamination {d.covered_contaminated === 'yes_actioned' ? 'actioned' : 'rejected'}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="text-slate-400 text-xs">{deliveryTime(d.time_of_delivery)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[d.temp_status] ?? 'bg-slate-100 text-slate-400'}`}>
                        {STATUS_LABEL[d.temp_status] ?? d.temp_status} · {d.temperature_c}°C
                      </span>
                      <svg className="w-3.5 h-3.5 text-slate-300 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Delivery detail sheet */}
      {selectedDelivery && (
        <DeliveryDetail
          d={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
        />
      )}
      {showNumpad && (
        <Numpad value={tempVal} onChange={setTempVal} onClose={() => setShowNumpad(false)} category={category} />
      )}

      {/* CCA popup */}
      {showCCA && (
        <CCAPopup tempStatus={tempStat} contaminated={contam} onConfirm={doSubmit} onBack={() => setShowCCA(false)} />
      )}

      {/* Quick reference */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-900 font-bold text-lg">CCP 1 — Quick Reference</h3>
              <button onClick={() => setShowQuick(false)} className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-3">Temperature limits (CA-001)</p>
                <div className="space-y-2">
                  {CATEGORIES.map((c) => (
                    <div key={c.key} className="flex gap-3 items-start">
                      <span className="text-slate-500 text-xs w-32 flex-shrink-0 pt-0.5">{c.label}</span>
                      <span className="text-slate-400 text-xs leading-relaxed">{c.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-700 font-bold text-xs uppercase tracking-widest mb-2">Key rule — do NOT auto-reject (CA-001)</p>
                <p className="text-slate-600 text-xs leading-relaxed">5–8°C for chilled meat is <span className="text-slate-900 font-semibold">NOT a reject</span> — it is a conditional accept. Place into coldest chiller immediately, halve shelf life, document, review supplier. Only {">"}8°C is a hard reject.</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-700 font-bold text-xs uppercase tracking-widest mb-2">Frozen special rule</p>
                <p className="text-slate-600 text-xs leading-relaxed">-15 to -18°C is acceptable short-term <span className="text-slate-900 font-semibold">only if product is re-frozen immediately</span>. Do NOT refreeze if product has thawed. {">-15°C"} = reject.</p>
              </div>
              <div className="bg-white rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Contamination (CA-001)</p>
                <p className="text-slate-500 text-xs leading-relaxed">Trim contaminated area with clean knife. Sterilise knife ≥82°C immediately. Dispose trimmings as Category 3 ABP. Document everything.</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
