/**
 * app/haccp/delivery/page.tsx
 *
 * CCP 1 — Delivery Intake (Goods In Temperature Check)
 * Event-driven: one record per delivery. Form resets after submit.
 * Supplier: dropdown from DB + "Other" free text fallback.
 *
 * Batch 2:
 *   C1  — CCAPopup rewritten: structured 2-track (temp + contam) with
 *          cause / action / disposition / recurrence / notes. One CAPayload
 *          per active track sent to server.
 *   C8  — born_in / reared_in / slaughter_site / cut_site required on every
 *          submission (all categories). isValid gated + required indicators.
 *   fmt — batch code DDMM-CC-N. COUNTRIES expanded to 14 ISO alpha-2 +
 *          full search over extended ISO list.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Prints a label without opening a new tab.
 *
 * Fetches the label HTML from the API, injects it into a hidden iframe,
 * triggers the native print dialog (AirPrint on iOS), then removes the iframe.
 *
 * Works on: desktop browser, iOS Safari, iOS PWA standalone mode.
 */
async function printLabelInApp(url: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error('[printLabelInApp] API error', res.status)
      return
    }
    const html = await res.text()

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }

    doc.open()
    doc.write(html)
    doc.close()

    // Wait for iframe content (including SVG barcodes) to render before printing
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print()
        // Clean up after print dialog closes (or after timeout on iOS)
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe)
        }, 2000)
      }, 300)
    }
  } catch (err) {
    console.error('[printLabelInApp]', err)
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TempStatus = 'pass' | 'urgent' | 'fail' | null

// action is NOT in the payload — server derives it from deviation + cause
type CAPayload = {
  cause:       string
  disposition: string
  recurrence:  string
  notes:       string
}

interface Supplier  { id: string; name: string }
interface Delivery  {
  id:                   string
  date:                 string
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
  { key: 'lamb',       label: 'Lamb',              limit: '≤8°C (target ≤5°C)', detail: '≤5°C pass · 5–8°C conditional accept · >8°C reject' },
  { key: 'beef',       label: 'Beef',              limit: '≤8°C (target ≤5°C)', detail: '≤5°C pass · 5–8°C conditional accept · >8°C reject' },
  { key: 'offal',      label: 'Offal',             limit: '≤3°C',               detail: '≤3°C pass · >3°C reject' },
  { key: 'mince_prep', label: 'Mince / meat prep', limit: '≤4°C',               detail: '≤4°C pass · >4°C reject' },
  { key: 'frozen',     label: 'Frozen',            limit: '≤-18°C',             detail: '≤-18°C pass · -15 to -18°C conditional (refreeze immediately) · >-15°C reject' },
]

const CATEGORY_LABELS: Record<string, string> = {
  lamb: 'Lamb', beef: 'Beef', red_meat: 'Red meat',
  offal: 'Offal', mince_prep: 'Mince / prep', frozen: 'Frozen',
}

// ─── Countries ────────────────────────────────────────────────────────────────

// Curated 14 — shown as chips. ISO 3166-1 alpha-2.
const CURATED_CODES = ['GB','IE','AU','NZ','BR','US','AR','UY','ZA','NL','DE','FR','ES','PL']

// Full list for search (curated + common additional countries)
const ALL_COUNTRIES: { label: string; code: string }[] = [
  { label: 'United Kingdom',   code: 'GB' },
  { label: 'Ireland',          code: 'IE' },
  { label: 'Australia',        code: 'AU' },
  { label: 'New Zealand',      code: 'NZ' },
  { label: 'Brazil',           code: 'BR' },
  { label: 'United States',    code: 'US' },
  { label: 'Argentina',        code: 'AR' },
  { label: 'Uruguay',          code: 'UY' },
  { label: 'South Africa',     code: 'ZA' },
  { label: 'Netherlands',      code: 'NL' },
  { label: 'Germany',          code: 'DE' },
  { label: 'France',           code: 'FR' },
  { label: 'Spain',            code: 'ES' },
  { label: 'Poland',           code: 'PL' },
  { label: 'Austria',          code: 'AT' },
  { label: 'Belgium',          code: 'BE' },
  { label: 'Canada',           code: 'CA' },
  { label: 'Chile',            code: 'CL' },
  { label: 'China',            code: 'CN' },
  { label: 'Czech Republic',   code: 'CZ' },
  { label: 'Denmark',          code: 'DK' },
  { label: 'Finland',          code: 'FI' },
  { label: 'Greece',           code: 'GR' },
  { label: 'Hungary',          code: 'HU' },
  { label: 'India',            code: 'IN' },
  { label: 'Italy',            code: 'IT' },
  { label: 'Japan',            code: 'JP' },
  { label: 'Lithuania',        code: 'LT' },
  { label: 'Mexico',           code: 'MX' },
  { label: 'Norway',           code: 'NO' },
  { label: 'Pakistan',         code: 'PK' },
  { label: 'Paraguay',         code: 'PY' },
  { label: 'Portugal',         code: 'PT' },
  { label: 'Romania',          code: 'RO' },
  { label: 'Slovakia',         code: 'SK' },
  { label: 'Sweden',           code: 'SE' },
  { label: 'Switzerland',      code: 'CH' },
  { label: 'Thailand',         code: 'TH' },
  { label: 'Turkey',           code: 'TR' },
  { label: 'Ukraine',          code: 'UA' },
  { label: 'Viet Nam',         code: 'VN' },
]

const CURATED_COUNTRIES = ALL_COUNTRIES.filter((c) => CURATED_CODES.includes(c.code))

function countryLabel(code: string | null): string {
  if (!code) return '—'
  return ALL_COUNTRIES.find((c) => c.code === code)?.label ?? code
}

// ─── Batch number preview (client-side, no delivery number) ──────────────────
// Format: DDMM-CC   (server appends -N)
function buildBatchPrefix(date: string, countryCode: string): string {
  if (!date || !countryCode) return ''
  const d  = new Date(date + 'T00:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}${mm}-${countryCode}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcStatus(temp: number, category: string): TempStatus {
  if (isNaN(temp)) return null
  switch (category) {
    case 'lamb':
    case 'beef':
    case 'red_meat':   return temp <= 5.0   ? 'pass' : temp <= 8.0   ? 'urgent' : 'fail'
    case 'offal':      return temp <= 3.0   ? 'pass' : 'fail'
    case 'mince_prep': return temp <= 4.0   ? 'pass' : 'fail'
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

// ─── CA constants (Batch 3 — adaptive/smart redesign) ─────────────────────────

// Track-specific cause lists
const TEMP_CAUSES = [
  'Cold chain break in transport',
  'Inadequate pre-chilling at supplier',
  'Vehicle refrigeration failure',
  'Delivery delayed — product held too long',
  'Probe / thermometer fault — reading may be inaccurate',
  'Other',
]

const CONTAM_CAUSES = [
  'Contamination during handling',
  'Packaging damaged in transit',
  'Supplier loading error',
  'Missing documentation',
  'Other',
]

// Cause-aware recurrence options — 3-4 items per cause, not a generic list of 7
const RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  'Cold chain break in transport':            ['Contact supplier — cold chain audit', 'Request supplier corrective action plan', 'Add supplier to watch list', 'Other'],
  'Inadequate pre-chilling at supplier':      ['Contact supplier — cold chain audit', 'Request supplier corrective action plan', 'Arrange supplier site visit', 'Other'],
  'Vehicle refrigeration failure':            ['Report equipment failure to supplier in writing', 'Do not use vehicle until fault rectified', 'Request replacement vehicle arrangement', 'Other'],
  'Delivery delayed — product held too long': ['Review delivery window / timing with supplier', 'Contact supplier — scheduling discussion', 'Other'],
  'Contamination during handling':            ['Retrain receiving staff', 'Review intake procedures', 'Contact supplier', 'Other'],
  'Packaging damaged in transit':             ['Request supplier corrective action plan', 'Review packaging requirements with supplier', 'Other'],
  'Supplier loading error':                   ['Request supplier corrective action plan', 'Contact supplier — loading procedure review', 'Other'],
  'Missing documentation':                    ['Contact supplier — documentation requirements', 'Add to documentation watch list', 'Other'],
  'Probe / thermometer fault — reading may be inaccurate': ['Calibrate probe immediately', 'Verify product core temp with second probe', 'Replace probe if fault confirmed', 'Other'],
  'Other':                                    ['Contact supplier', 'Retrain receiving staff', 'Review intake procedures', 'Other'],
}

// Predetermined action protocols (CA-001) — shown read-only, stored server-side
const PROTOCOL_STEPS: Record<string, string[]> = {
  temp_urgent: [
    'Accept conditionally — do NOT reject the delivery',
    'Place immediately into coldest chiller area',
    'Use within reduced shelf life — halve remaining use-by',
    'Document assessment and accelerated use decision',
    'Review supplier performance',
  ],
  temp_fail: [
    'REJECT delivery immediately — do NOT accept product',
    'Photograph product and temperature reading',
    'Complete Non-Conformance Report',
    'Notify supplier in writing within 24 hours',
    'Segregate and arrange return or disposal',
  ],
  temp_equipment: [
    'Verify product core temperature with calibrated probe',
    'If within conditional limits: accept with reduced shelf life',
    'If exceeds legal limit: REJECT immediately',
    'Document refrigeration failure and photograph vehicle thermometer',
    'Report equipment failure to supplier in writing',
    'Do not use this vehicle until fault is rectified',
  ],
  contam_uncovered: [
    'If minor exposure only: re-cover immediately, use for immediate processing only',
    'If visible contamination or cross-contamination risk: REJECT',
    'Document incident and notify supplier',
  ],
  contam_contaminated_faecal: [
    'Trim contaminated area using clean knife',
    'Dispose of trimmings as Category 2/3 ABP',
    'Sterilise knife immediately after trimming (\u226582\u00b0C)',
    'Document trimming action and disposal',
    'If contamination excessive: REJECT entire carcase',
  ],
  contam_packaging_damaged: [
    'If seal broken on vacuum pack or visible ingress: REJECT and dispose',
    'Minor outer damage with intact inner seal: re-pack and use immediately',
    'Document and notify supplier',
  ],
  contam_missing_docs: [
    'Hold product in segregated area',
    'Request traceability documents from supplier within 2 hours',
    'If not received within 2 hours: REJECT delivery',
  ],
}

function getTempProtocolKey(tempStatus: TempStatus, cause: string): string {
  if (cause === 'Vehicle refrigeration failure') return 'temp_equipment'
  return tempStatus === 'urgent' ? 'temp_urgent' : 'temp_fail'
}

// Disposition: limited options per scenario (not full 5-picker)
function getDispositionOptions(track: 'temp' | 'contam', tempStatus: TempStatus, contaminated: string): string[] {
  if (track === 'temp') {
    if (tempStatus === 'fail') return ['Reject']
    return ['Conditional accept', 'Reject']
  }
  return contaminated === 'yes_actioned'
    ? ['Accept', 'Assess', 'Reject']
    : ['Assess', 'Reject']
}

const CONTAM_TYPE_LABELS: Record<string, string> = {
  uncovered:           'Product uncovered / exposed',
  contaminated_faecal: 'Faecal, wool, or hide contamination',
  packaging_damaged:   'Packaging damaged',
  missing_docs:        'Missing documentation',
}

// ─── CCAPopup ─────────────────────────────────────────────────────────────────

function CCAPopup({ tempStatus, contaminated, contamType, onSubmit, onBack }: {
  tempStatus:   TempStatus
  contaminated: string
  contamType:   string
  onSubmit:     (caTemp: CAPayload | null, caContam: CAPayload | null) => void
  onBack:       () => void
}) {
  const activeTempTrack   = tempStatus === 'urgent' || tempStatus === 'fail'
  const activeContamTrack = contaminated === 'yes' || contaminated === 'yes_actioned'

  const [tempCause,      setTempCause]      = useState('')
  const [tempDisp,       setTempDisp]       = useState(
    tempStatus === 'fail' ? 'Reject' : 'Conditional accept',
  )
  const [tempRecurrence, setTempRecurrence] = useState('')

  const [contamCause,      setContamCause]      = useState('')
  const [contamDisp,       setContamDisp]       = useState(
    contaminated === 'yes_actioned' ? 'Accept' : 'Assess',
  )
  const [contamRecurrence, setContamRecurrence] = useState('')

  const [notes, setNotes] = useState('')

  const tempProtocolKey     = getTempProtocolKey(tempStatus, tempCause)
  const tempProtocolSteps   = PROTOCOL_STEPS[tempProtocolKey] ?? PROTOCOL_STEPS['temp_urgent']
  const contamProtocolKey   = contamType ? `contam_${contamType}` : ''
  const contamProtocolSteps = contamProtocolKey ? (PROTOCOL_STEPS[contamProtocolKey] ?? []) : []

  const tempDispOptions   = getDispositionOptions('temp',   tempStatus,  contaminated)
  const contamDispOptions = getDispositionOptions('contam', tempStatus,  contaminated)

  const isSubmittable =
    (!activeTempTrack   || (tempCause   !== '' && tempDisp   !== '' && tempRecurrence   !== '')) &&
    (!activeContamTrack || (contamCause !== '' && contamDisp !== '' && contamRecurrence !== ''))

  function handleSubmit() {
    if (!isSubmittable) return
    const caTemp: CAPayload | null = activeTempTrack ? {
      cause: tempCause, disposition: tempDisp, recurrence: tempRecurrence, notes,
    } : null
    const caContam: CAPayload | null = activeContamTrack ? {
      cause: contamCause, disposition: contamDisp, recurrence: contamRecurrence, notes,
    } : null
    onSubmit(caTemp, caContam)
  }

  const headerColour = tempStatus === 'fail' ? 'text-red-600' : 'text-[#EB6619]'
  const submitBg     = tempStatus === 'fail' ? 'bg-red-600'   : 'bg-[#EB6619]'

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{position:'fixed'}}>
      <div className="bg-white rounded-t-3xl w-full max-h-[90vh] overflow-y-auto">

        <div className="flex items-start justify-between p-6 pb-4 sticky top-0 bg-white border-b border-slate-100 z-10">
          <div>
            <p className={`text-xs font-bold tracking-widest uppercase ${headerColour}`}>CCP 1 — Corrective Action</p>
            <h2 className="text-slate-900 text-xl font-bold mt-0.5">Record what happened</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {activeTempTrack && activeContamTrack
                ? 'Two deviations — complete both sections below'
                : 'Complete all fields to submit'}
            </p>
          </div>
          <button onClick={onBack} className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-95 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-6 pb-8 pt-5 space-y-5">

          {activeTempTrack && (
            <div className={`border rounded-2xl overflow-hidden ${tempStatus === 'fail' ? 'border-red-200' : 'border-amber-200'}`}>
              <div className={`px-4 py-3 ${tempStatus === 'fail' ? 'bg-red-50' : 'bg-amber-50'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest ${tempStatus === 'fail' ? 'text-red-600' : 'text-amber-700'}`}>
                  Temperature deviation
                </p>
                <p className="text-slate-600 text-xs mt-0.5">
                  {tempStatus === 'fail' ? 'Reject required (>8\u00b0C)' : 'Conditional accept (5\u20138\u00b0C)'}
                  {tempCause === 'Vehicle refrigeration failure' && ' \u2014 equipment failure override'}
                </p>
              </div>
              <div className="px-4 py-4 space-y-5 bg-white">
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Required action (CA-001)</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                    {tempProtocolSteps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 ${tempStatus === 'fail' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{i + 1}</div>
                        <p className="text-slate-700 text-xs leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">What caused this?</p>
                  <div className="space-y-1.5">
                    {TEMP_CAUSES.map((c) => (
                      <button key={c} onClick={() => { setTempCause(c); setTempRecurrence('') }}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                          tempCause === c ? 'border-[#EB6619] bg-amber-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600'
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                    Product disposition{tempStatus === 'fail' && <span className="ml-1 text-red-500 normal-case font-normal">\u2014 locked</span>}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {tempDispOptions.map((d) => (
                      <button key={d} onClick={() => { if (tempStatus !== 'fail') setTempDisp(d) }}
                        disabled={tempStatus === 'fail'}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                          tempDisp === d
                            ? tempStatus === 'fail' ? 'border-red-400 bg-red-50 text-red-600' : 'border-[#EB6619] bg-amber-50 text-[#EB6619]'
                            : 'border-slate-200 bg-white text-slate-400'
                        }`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                {tempCause && (
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Recurrence prevention</p>
                    <div className="space-y-1.5">
                      {(RECURRENCE_BY_CAUSE[tempCause] ?? RECURRENCE_BY_CAUSE['Other']).map((r) => (
                        <button key={r} onClick={() => setTempRecurrence(r)}
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                            tempRecurrence === r ? 'border-[#EB6619] bg-amber-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600'
                          }`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeContamTrack && (
            <div className="border border-amber-200 rounded-2xl overflow-hidden">
              <div className="bg-amber-50 px-4 py-3">
                <p className="text-amber-700 text-xs font-bold uppercase tracking-widest">Contamination deviation</p>
                <p className="text-slate-600 text-xs mt-0.5">
                  {CONTAM_TYPE_LABELS[contamType] ?? contamType}
                  {' \u00b7 '}
                  {contaminated === 'yes_actioned' ? 'Actioned at intake' : 'Not yet actioned'}
                </p>
              </div>
              <div className="px-4 py-4 space-y-5 bg-white">
                {contamProtocolSteps.length > 0 && (
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Required action (CA-001)</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                      {contamProtocolSteps.map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 bg-amber-100 text-amber-700">{i + 1}</div>
                          <p className="text-slate-700 text-xs leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">What caused this?</p>
                  <div className="space-y-1.5">
                    {CONTAM_CAUSES.map((c) => (
                      <button key={c} onClick={() => { setContamCause(c); setContamRecurrence('') }}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                          contamCause === c ? 'border-[#EB6619] bg-amber-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600'
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Product disposition</p>
                  <div className="flex flex-wrap gap-2">
                    {contamDispOptions.map((d) => (
                      <button key={d} onClick={() => setContamDisp(d)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                          contamDisp === d ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-200 bg-white text-slate-400'
                        }`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                {contamCause && (
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Recurrence prevention</p>
                    <div className="space-y-1.5">
                      {(RECURRENCE_BY_CAUSE[contamCause] ?? RECURRENCE_BY_CAUSE['Other']).map((r) => (
                        <button key={r} onClick={() => setContamRecurrence(r)}
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                            contamRecurrence === r ? 'border-[#EB6619] bg-amber-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600'
                          }`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Additional notes <span className="normal-case font-normal">(optional)</span></p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Any additional context\u2026"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
          </div>

          <p className="text-slate-400 text-xs">This record is immutable once submitted. Protocol per CA-001.</p>

          <button onClick={handleSubmit} disabled={!isSubmittable}
            className={`w-full text-white font-bold py-4 rounded-xl text-base disabled:opacity-40 transition-all ${submitBg}`}>
            Confirm &amp; submit delivery
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delivery Detail Sheet ────────────────────────────────────────────────────

function DeliveryDetail({ d, onClose }: { d: Delivery; onClose: () => void }) {
  const bornLabel   = countryLabel(d.born_in)
  const rearedLabel = countryLabel(d.reared_in)
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

          {/* Batch number + Print label */}
          {d.batch_number && (
            <div className="bg-slate-900 rounded-xl px-4 py-3">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Batch reference</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-white text-xl font-bold font-mono tracking-widest">{d.batch_number}</p>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    printLabelInApp(`/api/labels?type=delivery&id=${d.id}&format=html&copies=1`)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold transition-colors flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Print label
                </button>
              </div>
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
              <p className="text-slate-900 font-semibold text-sm">{bornLabel}</p>
            </div>

            <div className="bg-slate-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Reared in</p>
              <p className="text-slate-900 font-semibold text-sm">
                {d.reared_in
                  ? d.reared_in === d.born_in
                    ? <span className="text-slate-500 font-normal text-xs">Same</span>
                    : rearedLabel
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

// ─── Country Picker (shared component for born_in / reared_in) ───────────────

function CountryPicker({ value, onChange, label, required }: {
  value:    string
  onChange: (code: string) => void
  label:    string
  required?: boolean
}) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()

  const searchResults = q.length >= 1
    ? ALL_COUNTRIES.filter(
        (c) => !CURATED_CODES.includes(c.code) &&
               (c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      ).slice(0, 8)
    : []

  return (
    <div>
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </p>
      {/* Curated chips */}
      <div className="flex flex-wrap gap-2 mb-2">
        {CURATED_COUNTRIES.map((c) => (
          <button key={c.code}
            onPointerDown={(e) => { e.preventDefault(); onChange(c.code); setSearch('') }}
            className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
              value === c.code
                ? 'border-[#EB6619] bg-[#EB6619]/15 text-[#EB6619]'
                : 'border-slate-300 bg-white text-slate-600'
            }`}>
            {c.code}
            <span className="ml-1 font-normal text-slate-400 text-[10px]">{c.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>
      {/* Search for others */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search other countries…"
        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-orange-400"
      />
      {searchResults.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {searchResults.map((c) => (
            <button key={c.code}
              onPointerDown={(e) => { e.preventDefault(); onChange(c.code); setSearch('') }}
              className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                value === c.code
                  ? 'border-[#EB6619] bg-[#EB6619]/15 text-[#EB6619]'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}>
              {c.code}
              <span className="ml-1 font-normal text-slate-400 text-[10px]">{c.label}</span>
            </button>
          ))}
        </div>
      )}
      {q.length >= 1 && searchResults.length === 0 && (
        <p className="text-slate-400 text-xs mt-2">No results for &quot;{search}&quot;</p>
      )}
      {/* Show selected value if it came from search (not in curated chips) */}
      {value && !CURATED_CODES.includes(value) && (
        <p className="text-[#EB6619] text-xs mt-1.5 font-medium">Selected: {value} — {countryLabel(value)}</p>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading,    setLoading]    = useState(true)
  const [nextNumber, setNextNumber] = useState(1)
  const [dateFilter, setDateFilter] = useState<'today' | 'week'>('today')

  // Form state
  const [supplierSel,   setSupplierSel]   = useState('')
  const [supplierOther, setSupplierOther] = useState('')
  const [product,       setProduct]       = useState('')
  const [category,      setCategory]      = useState('')
  const [tempVal,       setTempVal]       = useState('')
  const [contam,        setContam]        = useState('')
  const [contamType,    setContamType]    = useState('')
  const [contamNote,    setContamNote]    = useState('')
  const [bornIn,        setBornIn]        = useState('')
  const [rearedIn,      setRearedIn]      = useState('')
  const [rearedSame,    setRearedSame]    = useState(false)
  const [slaughter,     setSlaughter]     = useState('')
  const [cutSite,       setCutSite]       = useState('')
  const [cutSameAs,     setCutSameAs]     = useState(false)
  const [notes,         setNotes]         = useState('')

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
    setLoading(true)
    fetch(`/api/haccp/delivery?range=${dateFilter}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => {
        setSuppliers(d.suppliers ?? [])
        setDeliveries(d.deliveries ?? [])
        setNextNumber(d.next_number ?? 1)
      })
      .catch((e) => setSubmitErr(`Could not load data — ${e.message}`))
      .finally(() => setLoading(false))
  }, [dateFilter])

  useEffect(() => { loadData() }, [loadData])

  const tempNum  = parseFloat(tempVal)
  const tempStat = category ? calcStatus(tempNum, category) : null

  const supplierIdSel     = supplierSel && supplierSel !== 'other' ? supplierSel : ''
  const supplierOtherTrim = supplierOther.trim()
  const supplierChosen    = Boolean(supplierIdSel || (supplierSel === 'other' && supplierOtherTrim))

  const needsCCA = (tempStat === 'urgent' || tempStat === 'fail') ||
                   (contam === 'yes' || contam === 'yes_actioned')

  // C8: all 4 traceability fields mandatory
  const isValid =
    supplierChosen &&
    product.trim() &&
    category &&
    tempVal !== '' && !isNaN(tempNum) &&
    contam &&
    (contam === 'no' || Boolean(contamType)) &&
    Boolean(bornIn) &&
    Boolean(rearedIn) &&
    slaughter.trim() !== '' &&
    Boolean(cutSite)

  function resetForm() {
    setSupplierSel(''); setSupplierOther(''); setProduct('')
    setCategory(''); setTempVal(''); setContam('')
    setContamType(''); setContamNote(''); setNotes(''); setSubmitErr('')
    setBornIn(''); setRearedIn(''); setRearedSame(false)
    setSlaughter(''); setCutSite(''); setCutSameAs(false)
  }

  async function doSubmit(caTemp?: CAPayload | null, caContam?: CAPayload | null) {
    setShowCCA(false); setSubmitting(true); setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/delivery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:   supplierIdSel || undefined,
          supplier_name: supplierSel === 'other' ? supplierOtherTrim : undefined,
          product:       product.trim(),
          product_category:     category,
          temperature_c:        tempNum,
          covered_contaminated: contam,
          contamination_type:   (contam !== 'no' && contamType) ? contamType : undefined,
          contamination_notes:  contamNote || undefined,
          notes:                notes || undefined,
          born_in:              bornIn   || undefined,
          reared_in:            rearedIn || undefined,
          slaughter_site:       slaughter || undefined,
          cut_site:             cutSite   || undefined,
          corrective_action_temp:   caTemp   ?? undefined,
          corrective_action_contam: caContam ?? undefined,
        }),
      })
      const d = await res.json()
      if (res.ok) {
        if (d.ca_write_failed) {
          setSubmitErr('Delivery saved — but corrective action record failed to write. Notify admin to log manually.')
        } else {
          setFlash(true)
          setTimeout(() => setFlash(false), 2500)
        }
        resetForm(); loadData()
      } else {
        setSubmitErr(d.error ?? 'Submission failed')
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

  // Batch number preview (shown once bornIn is set)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const batchPreview = bornIn ? `${buildBatchPrefix(todayStr, bornIn)}-${nextNumber}` : ''

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
              <div className="flex flex-wrap gap-2 mb-2">
                {suppliers.map((s) => (
                  <button key={s.id}
                    onPointerDown={(e) => { e.preventDefault(); setSupplierSel(s.id); setSupplierOther('') }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      supplierSel === s.id ? 'border-[#EB6619] bg-amber-50 text-[#EB6619]' : 'border-slate-300 bg-white text-slate-400'
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
              {supplierSel === 'other' && (
                <input type="text" value={supplierOther} onChange={(e) => setSupplierOther(e.target.value)}
                  placeholder="Enter supplier name…"
                  className="w-full bg-slate-100 border border-amber-400 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-[#EB6619]" />
              )}
            </div>

            {/* Born in (C8: required) */}
            <CountryPicker
              value={bornIn}
              onChange={(code) => {
                setBornIn(code)
                if (rearedSame) setRearedIn(code)
              }}
              label="Born in"
              required
            />

            {/* Reared in (C8: required) */}
            {bornIn && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                  Reared in<span className="text-red-500 ml-0.5">*</span>
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); setRearedSame(true); setRearedIn(bornIn) }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      rearedSame ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-300 bg-white text-slate-600'
                    }`}>
                    ✓ Same as born in ({countryLabel(bornIn)})
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
                  <CountryPicker
                    value={rearedIn}
                    onChange={setRearedIn}
                    label="Reared in country"
                    required
                  />
                )}
              </div>
            )}

            {/* Slaughter site (C8: required) */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                Slaughter site code<span className="text-red-500 ml-0.5">*</span>
              </p>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                value={slaughter}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                  setSlaughter(v)
                  if (cutSameAs) setCutSite(v)
                }}
                placeholder="e.g. GB1234"
                maxLength={10}
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 tracking-widest font-mono" />
              <p className="text-slate-400 text-[10px] mt-1 ml-1">Format: GB XXXX (UK approval number) or local code</p>
            </div>

            {/* Cut site (C8: required) */}
            {slaughter.length > 0 && (
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                  Cut site code<span className="text-red-500 ml-0.5">*</span>
                </p>
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
                    placeholder="e.g. AU1234"
                    maxLength={10}
                    className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 tracking-widest font-mono" />
                )}
              </div>
            )}

            {/* Batch number preview */}
            {batchPreview && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">Batch reference (auto-generated)</p>
                <p className="text-white text-lg font-bold font-mono tracking-widest">{batchPreview}</p>
                <p className="text-slate-500 text-[10px] mt-1">DDMM · country code (ISO) · delivery #{nextNumber}</p>
                {bornIn && rearedIn && rearedIn !== bornIn && (
                  <p className="text-amber-400 text-[10px] mt-1">
                    Born: {countryLabel(bornIn)} · Reared: {countryLabel(rearedIn)}
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
                  <button key={o.val} onClick={() => { setContam(o.val); setContamType(''); setContamNote('') }}
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
              {(contam === 'yes' || contam === 'yes_actioned') && (
                <div className="mt-3 space-y-3">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                    Type of contamination <span className="text-red-400">*</span>
                  </p>
                  <div className="space-y-2">
                    {[
                      { key: 'uncovered',           label: 'Product uncovered / exposed' },
                      { key: 'contaminated_faecal', label: 'Faecal, wool, or hide contamination' },
                      { key: 'packaging_damaged',   label: 'Packaging damaged' },
                      { key: 'missing_docs',        label: 'Missing documentation' },
                    ].map((t) => (
                      <button key={t.key} onClick={() => setContamType(t.key)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                          contamType === t.key ? 'border-[#EB6619] bg-amber-50 text-slate-900' : 'border-slate-300 bg-white text-slate-600'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {contamType && (
                    <textarea value={contamNote} onChange={(e) => setContamNote(e.target.value)} rows={2}
                      placeholder="Additional details (optional)…"
                      className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
                  )}
                </div>
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
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              {dateFilter === 'today' ? "Today's deliveries" : "This week's deliveries"}
            </p>
            <div className="flex items-center gap-2">
              {deliveries.length > 0 && (
                <span className="bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs font-bold text-green-600">
                  {deliveries.length} logged
                </span>
              )}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setDateFilter('today')}
                  className={`px-3 py-1 text-xs font-bold transition-colors ${dateFilter === 'today' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>
                  Today
                </button>
                <button
                  onClick={() => setDateFilter('week')}
                  className={`px-3 py-1 text-xs font-bold transition-colors border-l border-slate-200 ${dateFilter === 'week' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>
                  This week
                </button>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-4">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Loading…
            </div>
          ) : deliveries.length === 0 ? (
            <div className="bg-slate-50 border border-blue-100 rounded-xl px-4 py-5 text-center">
              <p className="text-slate-400 text-sm">No deliveries logged {dateFilter === 'today' ? 'today' : 'this week'}</p>
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
                        {dateFilter === 'week' && (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex-shrink-0">
                            {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        )}
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
                            Born: {countryLabel(d.born_in)}
                            {d.reared_in && d.reared_in !== d.born_in && <> · Reared: {countryLabel(d.reared_in)}</>}
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
                      {d.batch_number && (
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            printLabelInApp(`/api/labels?type=delivery&id=${d.id}&format=html&copies=1`)
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 text-white text-[10px] font-bold"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                          </svg>
                          Print
                        </button>
                      )}
                      <svg className="w-3.5 h-3.5 text-slate-300 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Overlays */}
      {selectedDelivery && (
        <DeliveryDetail d={selectedDelivery} onClose={() => setSelectedDelivery(null)} />
      )}
      {showNumpad && (
        <Numpad value={tempVal} onChange={setTempVal} onClose={() => setShowNumpad(false)} category={category} />
      )}
      {showCCA && (
        <CCAPopup
          tempStatus={tempStat}
          contaminated={contam}
          contamType={contamType}
          onSubmit={(caTemp, caContam) => doSubmit(caTemp, caContam)}
          onBack={() => setShowCCA(false)}
        />
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
