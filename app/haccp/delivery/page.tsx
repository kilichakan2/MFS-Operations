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
  contamination_notes:  string | null
  notes:                string | null
  submitted_at:         string
  users:                { name: string }
}

// ─── Product categories ───────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string; limit: string; detail: string }[] = [
  { key: 'red_meat',   label: 'Red meat (beef / lamb)', limit: '≤7°C',  detail: '≤7.0 pass · 7.0–7.2 urgent · >7.2 fail' },
  { key: 'offal',      label: 'Offal',                  limit: '≤3°C',  detail: '≤3.0 pass · >3.0 fail' },
  { key: 'mince_prep', label: 'Mince / meat prep',      limit: '≤4°C',  detail: '≤4.0 pass · >4.0 fail' },
  { key: 'frozen',     label: 'Frozen',                 limit: '≤-12°C',detail: '≤-12.0 pass · >-12.0 fail' },
]

const CATEGORY_LABELS: Record<string, string> = {
  red_meat:   'Red meat', offal: 'Offal', mince_prep: 'Mince / prep', frozen: 'Frozen',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcStatus(temp: number, category: string): TempStatus {
  if (isNaN(temp)) return null
  switch (category) {
    case 'red_meat':   return temp <= 7.0 ? 'pass' : temp <= 7.2 ? 'urgent' : 'fail'
    case 'offal':      return temp <= 3.0 ? 'pass' : 'fail'
    case 'mince_prep': return temp <= 4.0 ? 'pass' : 'fail'
    case 'frozen':     return temp <= -12.0 ? 'pass' : 'fail'
    default:           return null
  }
}

function nowDisplay() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
}

function deliveryTime(t: string) { return t?.slice(0, 5) ?? '—' }

const STATUS_COLOUR: Record<string, string> = {
  pass:   'text-[#97C459]', urgent: 'text-[#EB6619]', fail: 'text-[#F09595]',
}
const STATUS_BADGE: Record<string, string> = {
  pass:   'bg-[#639922]/25 text-[#97C459]',
  urgent: 'bg-[#EB6619]/25 text-[#EB6619]',
  fail:   'bg-[#E24B4A]/28 text-[#F09595]',
}
const STATUS_BORDER: Record<string, string> = {
  pass:   'border-[#639922]/50 bg-[#639922]/10',
  urgent: 'border-[#EB6619]/55 bg-[#EB6619]/10',
  fail:   'border-[#E24B4A]/55 bg-[#E24B4A]/10',
  empty:  'border-white/12 bg-white/6',
}
const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass', urgent: 'Urgent', fail: 'Fail',
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
    <div className="fixed inset-0 bg-[#16205B] z-50 flex flex-col" style={{position:'fixed'}}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
        <div>
          <p className="text-[#EB6619] text-xs font-bold tracking-widest uppercase">CCP 1 — Delivery Intake</p>
          <h2 className="text-white text-xl font-bold mt-0.5">Probe temperature</h2>
          {cat && <p className="text-white/35 text-sm mt-0.5">{cat.label} · limit {cat.limit}</p>}
        </div>
        <button onClick={onClose} className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <div className={`text-6xl font-bold tracking-tight ${stat ? STATUS_COLOUR[stat] : 'text-white'}`}>
            {value || '—'}<span className="text-2xl ml-2 opacity-60">°C</span>
          </div>
          {stat && (
            <div className={`mt-3 inline-block px-5 py-1.5 rounded-full text-sm font-bold ${STATUS_BADGE[stat]}`}>
              {STATUS_LABEL[stat]}
            </div>
          )}
          {stat === 'urgent' && (
            <div className="mt-4 mx-2 bg-[#EB6619]/12 border border-[#EB6619]/40 rounded-xl px-4 py-3 text-left">
              <p className="text-[#EB6619] text-xs font-bold uppercase tracking-widest mb-1.5">Conditional accept</p>
              <p className="text-white/65 text-xs leading-relaxed">Place into coldest chiller immediately. Halve remaining shelf life. Notify supplier. Document corrective action.</p>
            </div>
          )}
          {stat === 'fail' && (
            <div className="mt-4 mx-2 bg-[#E24B4A]/12 border border-[#E24B4A]/40 rounded-xl px-4 py-3 text-left">
              <p className="text-[#F09595] text-xs font-bold uppercase tracking-widest mb-1.5">Reject delivery</p>
              <p className="text-white/65 text-xs leading-relaxed">Do NOT accept. Photograph product and temp reading. Complete non-conformance report. Notify supplier within 24 hours.</p>
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
          {/* Negative toggle for frozen */}
          {category === 'frozen' && (
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

// ─── CCA Popup ────────────────────────────────────────────────────────────────

function CCAPopup({ tempStatus, contaminated, onConfirm, onBack }: {
  tempStatus:   TempStatus
  contaminated: string
  onConfirm:    () => void
  onBack:       () => void
}) {
  const tempActions = {
    urgent: ['Place into coldest chiller immediately', 'Halve remaining shelf life', 'Notify supplier in writing', 'Document this corrective action'],
    fail:   ['Reject delivery — do NOT accept product', 'Photograph product and temperature reading', 'Complete non-conformance report', 'Notify supplier within 24 hours'],
  }
  const contamActions = ['Trim contaminated area with clean knife', 'Sterilise knife ≥82°C immediately after', 'Dispose trimmings as Category 3 ABP', 'Document trim area and quantity']

  const showTemp   = tempStatus === 'urgent' || tempStatus === 'fail'
  const showContam = contaminated === 'yes' || contaminated === 'yes_actioned'

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{position:'fixed'}}>
      <div className="bg-[#0f1840] rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <p className="text-[#F09595] text-xs font-bold tracking-widest uppercase">CCP 1 deviation</p>
            <h2 className="text-white text-xl font-bold mt-0.5">Corrective Action Required</h2>
          </div>
          <button onClick={onBack} className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 pb-6 space-y-5">
          {showTemp && (
            <div>
              <p className="text-white/45 text-xs font-bold uppercase tracking-widest mb-2">
                Temperature {tempStatus === 'fail' ? 'fail' : 'urgent'} — required actions (CA-001)
              </p>
              <div className="space-y-2">
                {tempActions[tempStatus as 'urgent' | 'fail'].map((a) => (
                  <div key={a} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${tempStatus === 'fail' ? 'bg-[#E24B4A]/10 border-[#E24B4A]/30' : 'bg-[#EB6619]/10 border-[#EB6619]/30'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${tempStatus === 'fail' ? 'bg-[#F09595]' : 'bg-[#EB6619]'}`}/>
                    <p className="text-white/75 text-sm">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {showContam && (
            <div>
              <p className="text-white/45 text-xs font-bold uppercase tracking-widest mb-2">Contamination — required actions (CA-001)</p>
              <div className="space-y-2">
                {contamActions.map((a) => (
                  <div key={a} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#EB6619]/10 border border-[#EB6619]/30">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-[#EB6619]"/>
                    <p className="text-white/75 text-sm">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-white/35 text-xs">By confirming, you acknowledge these actions have been taken or are in progress. This record is immutable once submitted.</p>
          <button onClick={onConfirm}
            className="w-full bg-[#E24B4A] text-white font-bold py-4 rounded-xl text-base">
            Confirm &amp; submit
          </button>
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

  // Form state
  const [supplierSel, setSupplierSel] = useState('')    // selected preset or 'other'
  const [supplierOther, setSupplierOther] = useState('') // free text when 'other'
  const [product,    setProduct]    = useState('')
  const [category,   setCategory]   = useState('')
  const [tempVal,    setTempVal]    = useState('')
  const [contam,     setContam]     = useState('')
  const [contamType, setcontamType] = useState('')   // sub-type when yes_actioned
  const [contamNote, setContamNote] = useState('')
  const [notes,      setNotes]      = useState('')

  // UI state
  const [showNumpad,  setShowNumpad]  = useState(false)
  const [showCCA,     setShowCCA]     = useState(false)
  const [showQuick,   setShowQuick]   = useState(false)
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
    <div className="min-h-screen bg-[#16205B] flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/9 hover:bg-white/14 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">CCP 1 — Delivery Intake</p>
          <h1 className="text-white text-lg font-bold leading-tight">Goods In Check</h1>
        </div>
        <button onClick={() => setShowQuick(true)}
          className="flex items-center gap-1.5 bg-white/9 hover:bg-white/14 border border-white/12 rounded-xl px-3 py-2 text-white/55 hover:text-white transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Quick ref
        </button>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/delivery' }}
          className="flex items-center gap-1.5 bg-[#EB6619]/15 hover:bg-[#EB6619]/25 border border-[#EB6619]/35 rounded-xl px-3 py-2 text-[#EB6619] transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* SOP 5B banner */}
        <div className="bg-[#EB6619]/10 border border-[#EB6619]/38 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-[#EB6619] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          <div>
            <p className="text-[#EB6619] text-[10px] font-bold uppercase tracking-widest mb-1">SOP 5B — Receiving rule</p>
            <p className="text-white/60 text-xs leading-relaxed">Boxed / packaged meat only — NO exposed meat. Driver stays in receiving area and does NOT enter production.</p>
          </div>
        </div>

        {/* Flash */}
        {flash && (
          <div className="bg-[#639922]/20 border border-[#639922]/45 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#639922]/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[#97C459]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="text-[#97C459] font-bold text-sm">Delivery logged — ready for next entry</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-white/6 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8">
            <p className="text-white font-semibold text-sm">Log a delivery</p>
            <p className="text-white/38 text-xs mt-0.5">CCP 1 · one record per delivery</p>
          </div>

          <div className="px-4 py-3 space-y-4">

            {/* Supplier */}
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Supplier</p>
              {/* Preset supplier chips */}
              <div className="flex flex-wrap gap-2 mb-2">
                {suppliers.map((s) => (
                  <button key={s.id}
                    onPointerDown={(e) => { e.preventDefault(); setSupplierSel(s.name); setSupplierOther('') }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      supplierSel === s.name ? 'border-[#EB6619] bg-[#EB6619]/18 text-[#EB6619]' : 'border-white/15 bg-white/6 text-white/50'
                    }`}>
                    {s.name}
                  </button>
                ))}
                <button
                  onPointerDown={(e) => { e.preventDefault(); setSupplierSel('other') }}
                  className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                    supplierSel === 'other' ? 'border-[#EB6619] bg-[#EB6619]/18 text-[#EB6619]' : 'border-white/15 bg-white/6 text-white/50'
                  }`}>
                  Other
                </button>
              </div>
              {/* Free text when Other selected */}
              {supplierSel === 'other' && (
                <input type="text" value={supplierOther} onChange={(e) => setSupplierOther(e.target.value)}
                  placeholder="Enter supplier name…"
                  className="w-full bg-white/10 border border-[#EB6619]/50 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#EB6619]" />
              )}
            </div>

            {/* Product description */}
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Product description</p>
              <input type="text" value={product} onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Whole lamb carcasses — 24 units"
                className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#EB6619]" />
            </div>

            {/* Product category */}
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Product category</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.key}
                    onPointerDown={(e) => { e.preventDefault(); setCategory(c.key); setTempVal('') }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      category === c.key ? 'border-[#EB6619] bg-[#EB6619]/18 text-[#EB6619]' : 'border-white/15 bg-white/6 text-white/50'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {catDef && <p className="text-white/28 text-[10px] mt-1.5 ml-1">{catDef.detail}</p>}
            </div>

            {/* Temperature */}
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Temperature — tap to enter</p>
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
                  <p className="text-white/40 text-xs mb-1">{category ? `Probe reading · limit ${catDef?.limit}` : 'Select a category first'}</p>
                  <p className={`text-2xl font-bold ${!tempVal ? 'text-white/25' : tempStat ? STATUS_COLOUR[tempStat] : 'text-white'}`}>
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
                <div className="mt-2 bg-[#EB6619]/10 border border-[#EB6619]/35 rounded-xl px-4 py-3">
                  <p className="text-[#EB6619] text-xs font-bold uppercase tracking-widest mb-1">Conditional accept</p>
                  <p className="text-white/60 text-xs leading-relaxed">Place into coldest chiller immediately. Halve remaining shelf life. Notify supplier. Corrective action required on submit.</p>
                </div>
              )}
              {tempStat === 'fail' && (
                <div className="mt-2 bg-[#E24B4A]/10 border border-[#E24B4A]/35 rounded-xl px-4 py-3">
                  <p className="text-[#F09595] text-xs font-bold uppercase tracking-widest mb-1">Reject delivery</p>
                  <p className="text-white/60 text-xs leading-relaxed">Do NOT accept. Photograph and complete non-conformance report. Notify supplier within 24 hours.</p>
                </div>
              )}
            </div>

            {/* Covered / contaminated */}
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Covered / contaminated?</p>
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
                          ? 'border-[#639922]/60 bg-[#639922]/15 text-[#97C459]'
                          : 'border-[#EB6619] bg-[#EB6619]/18 text-[#EB6619]'
                        : 'border-white/15 bg-white/6 text-white/45'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {contam === 'yes_actioned' && (
                <div className="mt-3 space-y-3">
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Type of contamination (CA-001)</p>
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
                            contamType === t.key ? 'border-[#EB6619] bg-[#EB6619]/15 text-white' : 'border-white/12 bg-white/6 text-white/60'
                          }`}>
                          {t.label}
                        </button>
                        {contamType === t.key && (
                          <div className="mt-2 bg-[#EB6619]/10 border border-[#EB6619]/30 rounded-xl px-4 py-3 space-y-1.5">
                            {t.actions.map((a, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#EB6619] flex-shrink-0 mt-1.5"/>
                                <p className="text-white/70 text-xs leading-relaxed">{a}</p>
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
                      className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#EB6619] resize-none" />
                  )}
                </div>
              )}
              {contam === 'yes' && (
                <textarea value={contamNote} onChange={(e) => setContamNote(e.target.value)} rows={2}
                  placeholder="Describe reason for rejection…"
                  className="mt-2 w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#EB6619] resize-none" />
              )}
            </div>

            {/* Optional notes */}
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Notes (optional)</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Any additional notes…"
                className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#EB6619] resize-none" />
            </div>

            {/* Meta */}
            <div className="flex items-center justify-between">
              <p className="text-white/28 text-xs">{new Date().toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric', timeZone:'Europe/London' })}</p>
              <p className="text-white/28 text-xs">Auto-time: {timeNow}</p>
            </div>

          </div>

          {submitErr && <p className="px-4 pb-2 text-[#F09595] text-xs">{submitErr}</p>}

          <button onClick={handleSubmit} disabled={!isValid || submitting}
            className={`w-full text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all ${
              needsCCA && isValid ? 'bg-[#E24B4A]' : 'bg-[#EB6619]'
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
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Today's deliveries</p>
            {deliveries.length > 0 && (
              <span className="bg-[#639922]/20 border border-[#639922]/35 rounded-full px-3 py-1 text-xs font-bold text-[#97C459]">
                {deliveries.length} logged
              </span>
            )}
          </div>
          {loading ? (
            <div className="flex items-center gap-3 text-white/40 text-sm py-4">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Loading…
            </div>
          ) : deliveries.length === 0 ? (
            <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-5 text-center">
              <p className="text-white/30 text-sm">No deliveries logged today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deliveries.map((d) => (
                <div key={d.id} className="bg-white/5 border border-white/9 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">{d.supplier}</p>
                      <p className="text-white/45 text-xs mt-0.5">{d.product} · {CATEGORY_LABELS[d.product_category] ?? d.product_category}</p>
                      {d.covered_contaminated !== 'no' && (
                        <p className="text-[#EB6619] text-xs mt-1">Contamination {d.covered_contaminated === 'yes_actioned' ? 'actioned' : 'rejected'}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="text-white/35 text-xs">{deliveryTime(d.time_of_delivery)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[d.temp_status] ?? 'bg-white/10 text-white/40'}`}>
                        {STATUS_LABEL[d.temp_status] ?? d.temp_status} · {d.temperature_c}°C
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Numpad */}
      {showNumpad && (
        <Numpad value={tempVal} onChange={setTempVal} onClose={() => setShowNumpad(false)} category={category} />
      )}

      {/* CCA popup */}
      {showCCA && (
        <CCAPopup tempStatus={tempStat} contaminated={contam} onConfirm={doSubmit} onBack={() => setShowCCA(false)} />
      )}

      {/* Quick reference */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-[#0f1840] rounded-t-3xl w-full p-6 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">CCP 1 — Quick Reference</h3>
              <button onClick={() => setShowQuick(false)} className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="bg-white/6 rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-3">Temperature limits (CA-001)</p>
                <div className="space-y-2">
                  {CATEGORIES.map((c) => (
                    <div key={c.key} className="flex gap-3">
                      <span className="text-white/55 text-xs w-32 flex-shrink-0">{c.label}</span>
                      <span className="text-white/40 text-xs">{c.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white/6 rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Red meat special rule</p>
                <p className="text-white/60 text-xs leading-relaxed">7.0–7.2°C is NOT an automatic reject. Conditional accept: urgent placement in coldest chiller, halve shelf life, notify supplier, document corrective action.</p>
              </div>
              <div className="bg-white/6 rounded-xl p-4">
                <p className="text-[#EB6619] font-bold text-xs uppercase tracking-widest mb-2">Contamination (CA-001)</p>
                <p className="text-white/60 text-xs leading-relaxed">Trim contaminated area with clean knife. Sterilise knife ≥82°C immediately. Dispose trimmings as Category 3 ABP. Document everything.</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
