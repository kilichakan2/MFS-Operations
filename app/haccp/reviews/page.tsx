/**
 * app/haccp/reviews/page.tsx
 * Weekly + Monthly HACCP Reviews
 * Source: MF-001 p.12-15 · HB-001 SOP 5, 9, 11 · CA-001 weekly/monthly section
 * Role: Admin only
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemState = 'unchecked' | 'yes' | 'problem'

interface AssessmentItem {
  id:      string
  label:   string
  state:   ItemState
  action?: string
  caHint?: string  // CA-001 action hint shown when problem
}

interface WeeklyRecord {
  id:          string
  week_ending: string
  date:        string
  assessments: AssessmentItem[]
  submitted_at:string
  users:       { name: string }
}

interface MonthlyRecord {
  id:                  string
  month_year:          string
  date:                string
  equipment_checks:    Record<string, boolean | string>
  facilities_checks:   Record<string, boolean | string>
  haccp_system_review: { id: string; label: string; result: string; notes?: string }[]
  further_notes:       string | null
  submitted_at:        string
  users:               { name: string }
}

// ─── Weekly assessment items (MF-001 p.13 — verbatim) ────────────────────────

function defaultWeeklyItems(): AssessmentItem[] {
  return [
    // Records & compliance
    { id: 'ccp_complete',      label: 'Daily CCP monitoring complete and signed?',           state: 'unchecked', caHint: 'Investigate immediately. Retrain responsible staff. Implement secondary verification checks.' },
    { id: 'ca_documented',     label: 'Corrective actions fully documented?',                 state: 'unchecked', caHint: 'Review all open corrective actions. Ensure each has a documented outcome and closure.' },
    { id: 'training_current',  label: 'Staff training records current?',                     state: 'unchecked', caHint: 'Schedule refresher training. Update training register. Consider increased supervision.' },
    { id: 'supplier_certs',    label: 'Supplier certificates valid?',                         state: 'unchecked', caHint: 'Contact supplier immediately for renewal. If not received in 7 days, consider temporary suspension of supply.' },
    { id: 'complaints_logged', label: 'Customer complaints logged and addressed?',            state: 'unchecked', caHint: 'Escalate to management. Complete root cause analysis. Document closure actions.' },
    { id: 'emergency_contacts',label: 'Emergency contacts and procedures current?',           state: 'unchecked', caHint: 'Update contact list. Confirm out-of-hours emergency cover in place.' },
    // Operational checks (SOP 9)
    { id: 'water_supply',      label: 'Water supply — no issues?',                           state: 'unchecked', caHint: 'Contact utilities provider. Arrange temporary supply if required.' },
    { id: 'maintenance',       label: 'Maintenance — no outstanding issues?',                state: 'unchecked', caHint: 'Log in maintenance register. Prioritise by food safety risk. Arrange repairs before next production if critical.' },
    { id: 'pest_control',      label: 'Pest control — no signs of activity?',                state: 'unchecked', caHint: 'Contact pest control contractor immediately. Do not continue production in affected areas.' },
    { id: 'waste_management',  label: 'Waste management — collected and secure?',            state: 'unchecked', caHint: 'Review waste collection schedule. Ensure ABP waste secured and labelled.' },
    // SOP 5 one-way traffic
    { id: 'traffic_compliance',label: 'One-way traffic compliance observed?',                state: 'unchecked', caHint: 'Reinforce physical barriers. Retrain staff on workflow. Consider additional signage. Cross-contamination risk.' },
    { id: 'staff_awareness',   label: 'Staff awareness of zone separation — satisfactory?',  state: 'unchecked', caHint: 'Deliver immediate refresher briefing. Document in training records.' },
    // SOP 9 fabric walkthrough
    { id: 'floors_walls',      label: 'Floors and walls — no new damage, cracks or peeling?',state: 'unchecked', caHint: 'Log in maintenance register. If hygiene risk: arrange repair before next shift. Temporary measure if immediate repair not possible.' },
    { id: 'equipment',         label: 'Equipment — no visible damage or leaks?',             state: 'unchecked', caHint: 'Remove affected equipment from service. Arrange repair or replacement before resuming production.' },
    { id: 'doors_seals',       label: 'Doors and seals — closing properly?',                 state: 'unchecked', caHint: 'Address defects within 24 hours (SOP 9). Temporary measures while repair arranged.' },
    { id: 'emergency_items',   label: 'Emergency items (first aid, spill kits) — accessible?',state:'unchecked', caHint: 'Replenish immediately. Document shortfall. Check stock levels against requirements.' },
  ]
}

// ─── Monthly equipment items (MF-001 p.14 — verbatim) ────────────────────────

const EQUIPMENT_ITEMS = [
  // Thermometers
  { id: 'therm_calibration',   section: 'Thermometers', label: 'Calibration check completed (ice water + boiling water test)' },
  { id: 'therm_in_cal',        section: 'Thermometers', label: 'All thermometers in calibration (no units out of range)' },
  // Chillers/Freezers
  { id: 'chiller_temp',        section: 'Chillers / Freezers', label: 'Temperature verified at multiple locations' },
  { id: 'chiller_seals',       section: 'Chillers / Freezers', label: 'Door seals intact' },
  { id: 'chiller_clean',       section: 'Chillers / Freezers', label: 'Interior cleanliness satisfactory' },
  { id: 'chiller_sounds',      section: 'Chillers / Freezers', label: 'No unusual sounds or performance issues' },
  // Sterilizers
  { id: 'steril_temp',         section: 'Sterilizers', label: 'Temperature verification reached ≥82°C' },
  { id: 'steril_water',        section: 'Sterilizers', label: 'Water supply adequate' },
  { id: 'steril_scale',        section: 'Sterilizers', label: 'No excessive mineral build-up' },
]

const FACILITIES_ITEMS = [
  // Staff entrance (SOP 11)
  { id: 'overalls',            section: 'Staff Entrance', label: 'Clean overalls / smocks available' },
  { id: 'hair_nets',           section: 'Staff Entrance', label: 'Hair nets / hats available' },
  { id: 'gloves',              section: 'Staff Entrance', label: 'Disposable gloves supplied' },
  { id: 'aprons',              section: 'Staff Entrance', label: 'Clean aprons available' },
  { id: 'footwear',            section: 'Staff Entrance', label: 'Clean safety footwear available' },
  { id: 'no_personal_items',   section: 'Staff Entrance', label: 'No personal items stored in production clothing area' },
  // Facilities
  { id: 'handwash_basin',      section: 'Facilities', label: 'Hand wash basin functioning with warm water' },
  { id: 'soap_towels',         section: 'Facilities', label: 'Soap, sanitiser, and paper towels stocked' },
  { id: 'boot_wash',           section: 'Facilities', label: 'Boot wash station working' },
  { id: 'hand_sanitiser',      section: 'Facilities', label: 'Hand sanitising station stocked' },
]

// ─── Monthly HACCP system review (MF-001 p.15 — verbatim) ────────────────────

function defaultSystemReview() {
  return [
    { id: 'limits_valid',      label: 'Critical limits scientifically valid and appropriate?',   result: '', notes: '', caHint: 'Convene HACCP team for full review. Update HACCP plan with revised limits based on scientific justification. Retrain all staff.' },
    { id: 'ccps_same',         label: 'Do CCPs/CPs remain the same?',                            result: '', notes: '', caHint: 'Document any changes. Update hazard analysis. Retrain staff on any revised CCPs.' },
    { id: 'limits_adequate',   label: 'Are critical/legal limits adequate?',                     result: '', notes: '', caHint: 'Review against current FSA guidance. Update limits if necessary. Document scientific justification.' },
    { id: 'monitoring_ok',     label: 'Are monitoring procedures still effective?',              result: '', notes: '', caHint: 'Review monitoring frequency and methods. Update procedures if gaps identified.' },
    { id: 'staff_competent',   label: 'Staff competency adequate for assigned tasks?',           result: '', notes: '', caHint: 'Schedule refresher training. Consider increased supervision until competency demonstrated. Update training records.' },
    { id: 'calibration_ok',    label: 'Equipment calibration current and accurate?',             result: '', notes: '', caHint: 'Budget and schedule recalibration or replacement. Arrange temporary measures. Document interim controls.' },
    { id: 'records_complete',  label: 'Records complete, accurate, and properly maintained?',   result: '', notes: '', caHint: 'Investigate gaps. Retrain relevant staff. Implement secondary sign-off for incomplete records.' },
    { id: 'regulatory_ok',     label: 'Regulatory compliance maintained throughout month?',      result: '', notes: '', caHint: 'Identify specific compliance gaps. Seek legal/technical advice. Document remedial plan.' },
    { id: 'plan_current',      label: 'HACCP plan remains current and effective?',               result: '', notes: '', caHint: 'Conduct full HACCP review. Update for any operational changes. Validate revised plan. FSA requires annual minimum review.' },
    { id: 'procedures_revise', label: 'Monitoring procedures require revision?',                 result: '', notes: '', caHint: 'Document proposed revisions. Review with HACCP team. Implement and retrain before next production.' },
    { id: 'equipment_upgrade', label: 'Equipment upgrades or replacements needed?',              result: '', notes: '', caHint: 'Budget and schedule replacement. Arrange temporary measures (increased monitoring, backup equipment). Document interim controls.' },
  ]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function countProblems(items: AssessmentItem[]) {
  return items.filter((i) => i.state === 'problem').length
}

function weekEndingDefault(): string {
  const today = new Date()
  const day   = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const sun   = new Date(today)
  sun.setDate(today.getDate() + day)
  return sun.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function monthYearDefault(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7) + '-01'
}

// ─── Item check component ──────────────────────────────────────────────────────

function CheckItem({ item, onChange }: {
  item:     AssessmentItem
  onChange: (id: string, state: ItemState, action?: string) => void
}) {
  function cycle() {
    const next: ItemState = item.state === 'unchecked' ? 'yes' : item.state === 'yes' ? 'problem' : 'unchecked'
    onChange(item.id, next, item.action)
  }

  return (
    <div className={`border-b border-slate-100 last:border-0 ${item.state === 'problem' ? 'bg-red-50' : item.state === 'yes' ? 'bg-green-50' : 'bg-white'}`}>
      <button onClick={cycle} className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all hover:bg-slate-50">
        <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
          item.state === 'yes'     ? 'border-green-500 bg-green-500' :
          item.state === 'problem' ? 'border-red-500 bg-red-500'     :
                                     'border-slate-300 bg-white'
        }`}>
          {item.state === 'yes'     && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
          {item.state === 'problem' && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${
            item.state === 'yes'     ? 'text-green-700 line-through decoration-green-400' :
            item.state === 'problem' ? 'text-red-700 font-medium'   :
                                       'text-slate-700'
          }`}>{item.label}</p>
          {item.state === 'unchecked' && (
            <p className="text-slate-400 text-[10px] mt-0.5">Tap to mark — once for OK, twice for problem</p>
          )}
        </div>
      </button>
      {item.state === 'problem' && (
        <div className="px-4 pb-3 space-y-2">
          {item.caHint && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-1">CA-001 action required</p>
              <p className="text-slate-600 text-xs leading-relaxed">{item.caHint}</p>
            </div>
          )}
          <textarea value={item.action ?? ''} onChange={(e) => onChange(item.id, 'problem', e.target.value)} rows={2}
            placeholder="Describe action taken / planned…"
            className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 text-slate-900 text-xs focus:outline-none focus:border-red-400 resize-none" />
        </div>
      )}
    </div>
  )
}

// ─── Tick item for monthly equipment/facilities ───────────────────────────────

function TickItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-slate-100 last:border-0 transition-all ${checked ? 'bg-green-50' : 'bg-white hover:bg-slate-50'}`}>
      <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${checked ? 'border-green-500 bg-green-500' : 'border-slate-300 bg-white'}`}>
        {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      <p className={`text-sm ${checked ? 'text-green-700 line-through decoration-green-400' : 'text-slate-700'}`}>{label}</p>
    </button>
  )
}

// ─── System review item ───────────────────────────────────────────────────────

function SystemItem({ item, onChange }: {
  item:     ReturnType<typeof defaultSystemReview>[0]
  onChange: (id: string, result: string, notes?: string) => void
}) {
  return (
    <div className={`border-b border-slate-100 last:border-0 ${item.result === 'NO' ? 'bg-red-50' : item.result === 'YES' ? 'bg-green-50' : 'bg-white'}`}>
      <div className="px-4 py-3">
        <p className="text-slate-700 text-sm mb-2">{item.label}</p>
        <div className="flex gap-2">
          {['YES', 'NO', 'N/A'].map((opt) => (
            <button key={opt} onClick={() => onChange(item.id, opt, item.notes)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                item.result === opt
                  ? opt === 'YES' ? 'border-green-500 bg-green-100 text-green-700'
                  : opt === 'NO'  ? 'border-red-500 bg-red-100 text-red-700'
                  :                  'border-slate-400 bg-slate-100 text-slate-600'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
              {opt}
            </button>
          ))}
        </div>
      </div>
      {item.result === 'NO' && (
        <div className="px-4 pb-3 space-y-2">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mb-1">CA-001 action required</p>
            <p className="text-slate-600 text-xs leading-relaxed">{item.caHint}</p>
          </div>
          <textarea value={item.notes ?? ''} onChange={(e) => onChange(item.id, 'NO', e.target.value)} rows={2}
            placeholder="Notes / action planned…"
            className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 text-slate-900 text-xs focus:outline-none focus:border-red-400 resize-none" />
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [tab,           setTab]          = useState<'weekly' | 'monthly'>('weekly')
  const [weeklyRecs,    setWeeklyRecs]   = useState<WeeklyRecord[]>([])
  const [monthlyRecs,   setMonthlyRecs]  = useState<MonthlyRecord[]>([])
  const [weeklyDone,    setWeeklyDone]   = useState(false)
  const [monthlyDone,   setMonthlyDone]  = useState(false)
  const [loading,       setLoading]      = useState(true)
  const [unauthorized,  setUnauthorized] = useState(false)

  // Weekly form
  const [weekEnding,    setWeekEnding]   = useState(weekEndingDefault)
  const [weekItems,     setWeekItems]    = useState<AssessmentItem[]>(defaultWeeklyItems)

  // Monthly form
  const [monthYear,     setMonthYear]    = useState(monthYearDefault)
  const [equipChecks,   setEquipChecks]  = useState<Record<string, boolean>>(() =>
    Object.fromEntries(EQUIPMENT_ITEMS.map((i) => [i.id, false]))
  )
  const [facilChecks,   setFacilChecks]  = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FACILITIES_ITEMS.map((i) => [i.id, false]))
  )
  const [sysReview,     setSysReview]    = useState(defaultSystemReview)
  const [furtherNotes,  setFurtherNotes] = useState('')

  // UI
  const [submitting,    setSubmitting]   = useState(false)
  const [submitErr,     setSubmitErr]    = useState('')
  const [flash,         setFlash]        = useState('')

  const loadData = useCallback(() => {
    fetch('/api/haccp/reviews')
      .then((r) => {
        if (r.status === 401) { setUnauthorized(true); setLoading(false); return null }
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (!d) return
        setWeeklyRecs(d.weekly ?? [])
        setMonthlyRecs(d.monthly ?? [])
        setWeeklyDone(d.weekly_done)
        setMonthlyDone(d.monthly_done)
      })
      .catch((e) => setSubmitErr(`Could not load data — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Weekly item change
  function updateWeekItem(id: string, state: ItemState, action?: string) {
    setWeekItems((prev) => prev.map((i) => i.id === id ? { ...i, state, action } : i))
  }

  // Monthly equipment/facilities
  function toggleEquip(id: string, v: boolean) { setEquipChecks((p) => ({ ...p, [id]: v })) }
  function toggleFacil(id: string, v: boolean) { setFacilChecks((p) => ({ ...p, [id]: v })) }

  // Monthly system review
  function updateSysItem(id: string, result: string, notes?: string) {
    setSysReview((prev) => prev.map((i) => i.id === id ? { ...i, result, notes: notes ?? i.notes } : i))
  }

  const weeklyAllChecked  = weekItems.every((i) => i.state !== 'unchecked')
  const monthlyAllChecked = sysReview.every((i) => i.result !== '')

  async function submitWeekly() {
    setSubmitErr(''); setSubmitting(true)
    try {
      const res = await fetch('/api/haccp/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'weekly', week_ending: weekEnding, assessments: weekItems }),
      })
      if (res.ok) {
        setFlash('Weekly review submitted')
        setWeekItems(defaultWeeklyItems())
        loadData()
        setTimeout(() => setFlash(''), 2500)
      } else {
        const d = await res.json(); setSubmitErr(d.error ?? 'Failed')
      }
    } catch { setSubmitErr('Connection error') }
    finally { setSubmitting(false) }
  }

  async function submitMonthly() {
    setSubmitErr(''); setSubmitting(true)
    try {
      const res = await fetch('/api/haccp/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'monthly', month_year: monthYear,
          equipment_checks: equipChecks, facilities_checks: facilChecks,
          haccp_system_review: sysReview, further_notes: furtherNotes,
        }),
      })
      if (res.ok) {
        setFlash('Monthly review submitted')
        setEquipChecks(Object.fromEntries(EQUIPMENT_ITEMS.map((i) => [i.id, false])))
        setFacilChecks(Object.fromEntries(FACILITIES_ITEMS.map((i) => [i.id, false])))
        setSysReview(defaultSystemReview())
        setFurtherNotes('')
        loadData()
        setTimeout(() => setFlash(''), 2500)
      } else {
        const d = await res.json(); setSubmitErr(d.error ?? 'Failed')
      }
    } catch { setSubmitErr('Connection error') }
    finally { setSubmitting(false) }
  }

  // Section grouping helper
  function renderSection(title: string, items: typeof EQUIPMENT_ITEMS, checks: Record<string, boolean>, toggle: (id: string, v: boolean) => void) {
    const sectionItems = items.filter((i) => i.section === title)
    const allDone = sectionItems.every((i) => checks[i.id])
    return (
      <div key={title} className="bg-white border border-blue-100 rounded-xl overflow-hidden mb-3">
        <div className={`px-4 py-2.5 border-b border-slate-100 flex items-center justify-between ${allDone ? 'bg-green-50' : 'bg-slate-50'}`}>
          <p className="text-slate-700 text-xs font-bold uppercase tracking-widest">{title}</p>
          {allDone && <span className="text-green-600 text-[10px] font-bold">✓ Complete</span>}
        </div>
        {sectionItems.map((i) => (
          <TickItem key={i.id} label={i.label} checked={checks[i.id]} onChange={(v) => toggle(i.id, v)} />
        ))}
      </div>
    )
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
          <button onClick={() => { window.location.href = '/haccp' }} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div><p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">Reviews</p><h1 className="text-white text-lg font-bold">Weekly &amp; Monthly Reviews</h1></div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white border border-blue-100 rounded-2xl px-8 py-10 text-center max-w-xs">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <p className="text-slate-900 font-bold text-base mb-1">Admin access only</p>
            <p className="text-slate-500 text-sm">Weekly and monthly reviews are completed by Hakan or Ege. Sign in with an admin account to access this section.</p>
          </div>
        </div>
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
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">SOP 5 · 9 · 11 — Admin</p>
          <h1 className="text-white text-lg font-bold leading-tight">Weekly &amp; Monthly Reviews</h1>
        </div>
        <button onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/reviews' }}
          className="flex items-center gap-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40 rounded-xl px-3 py-2 text-orange-300 transition-all text-xs font-bold flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Handbook
        </button>
      </div>

      {/* Tab selector */}
      <div className="px-5 pt-4 pb-0 flex gap-2">
        {(['weekly', 'monthly'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
              tab === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-600'
            }`}>
            {t === 'weekly' ? '📋 Weekly Review' : '📅 Monthly Review'}
            {t === 'weekly' && !weeklyDone  && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">Due</span>}
            {t === 'monthly' && !monthlyDone && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">Due</span>}
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

        {/* ── WEEKLY TAB ─────────────────────────────────────────────────── */}
        {tab === 'weekly' && (
          <>
            <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-slate-900 font-semibold text-sm">Weekly Office Review</p>
                  <p className="text-slate-500 text-xs mt-0.5">SOP 5 · SOP 5B · SOP 9 · MF-001 p.13</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-[10px] mb-1">Week ending</p>
                  <input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-900 text-xs focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              <div>
                {weekItems.map((item) => (
                  <CheckItem key={item.id} item={item} onChange={updateWeekItem} />
                ))}
              </div>
              <div className="px-4 py-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 text-xs">
                    {weekItems.filter((i) => i.state !== 'unchecked').length} / {weekItems.length} reviewed
                    {countProblems(weekItems) > 0 && <span className="text-red-600 font-bold ml-2">· {countProblems(weekItems)} problem(s)</span>}
                  </span>
                </div>
                {submitErr && <p className="text-red-600 text-xs mb-2">{submitErr}</p>}
              </div>
              <button onClick={submitWeekly} disabled={!weeklyAllChecked || submitting}
                className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Submit weekly review</>
                }
              </button>
            </div>

            {/* Weekly history */}
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Previous weekly reviews</p>
              {loading ? (
                <p className="text-slate-400 text-sm">Loading…</p>
              ) : weeklyRecs.length === 0 ? (
                <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center"><p className="text-slate-400 text-sm">No previous reviews</p></div>
              ) : (
                <div className="space-y-2">
                  {weeklyRecs.map((r) => {
                    const items = r.assessments as AssessmentItem[]
                    const probs = items?.filter((i) => i.state === 'problem').length ?? 0
                    return (
                      <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-slate-900 font-semibold text-sm">Week ending {fmtDate(r.week_ending)}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{r.users?.name} · {new Date(r.submitted_at).toLocaleDateString('en-GB')}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${probs > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                          {probs > 0 ? `${probs} problem${probs > 1 ? 's' : ''}` : 'All clear'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── MONTHLY TAB ────────────────────────────────────────────────── */}
        {tab === 'monthly' && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              <p className="text-amber-800 text-xs leading-relaxed"><strong>Legal requirement.</strong> The monthly HACCP review is mandated by the FSA as part of the verification principle. Records must be retained for minimum 2 years and available on demand to FSA officers and EHOs.</p>
            </div>

            {/* Month selector */}
            <div className="bg-white border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-slate-700 text-sm font-medium">Review month</p>
              <input type="month" value={monthYear.slice(0, 7)}
                onChange={(e) => setMonthYear(e.target.value + '-01')}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>

            {/* Equipment checks */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Equipment checks (MF-001 p.14)</p>
              {['Thermometers', 'Chillers / Freezers', 'Sterilizers'].map((s) =>
                renderSection(s, EQUIPMENT_ITEMS, equipChecks, toggleEquip)
              )}
            </div>

            {/* Facilities checks */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Facilities checks — SOP 11 (MF-001 p.14)</p>
              {['Staff Entrance', 'Facilities'].map((s) =>
                renderSection(s, FACILITIES_ITEMS, facilChecks, toggleFacil)
              )}
            </div>

            {/* HACCP system review */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">HACCP system review (MF-001 p.15)</p>
              <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
                {sysReview.map((item) => (
                  <SystemItem key={item.id} item={item} onChange={updateSysItem} />
                ))}
              </div>
            </div>

            {/* Further notes */}
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Further details &amp; notes (optional)</p>
              <textarea value={furtherNotes} onChange={(e) => setFurtherNotes(e.target.value)} rows={3}
                placeholder="Any additional notes for this month's review…"
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-orange-500 resize-none" />
            </div>

            <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-500 text-xs">
                  Equipment: {Object.values(equipChecks).filter(Boolean).length}/{EQUIPMENT_ITEMS.length} ·
                  Facilities: {Object.values(facilChecks).filter(Boolean).length}/{FACILITIES_ITEMS.length} ·
                  System: {sysReview.filter((i) => i.result).length}/{sysReview.length}
                </span>
              </div>
              {submitErr && <p className="text-red-600 text-xs">{submitErr}</p>}
            </div>

            <button onClick={submitMonthly} disabled={!monthlyAllChecked || submitting}
              className="w-full bg-orange-600 text-white font-bold py-4 text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
              {submitting
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Submit monthly review</>
              }
            </button>

            {/* Monthly history */}
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Previous monthly reviews</p>
              {loading ? (
                <p className="text-slate-400 text-sm">Loading…</p>
              ) : monthlyRecs.length === 0 ? (
                <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center"><p className="text-slate-400 text-sm">No previous reviews</p></div>
              ) : (
                <div className="space-y-2">
                  {monthlyRecs.map((r) => {
                    const probs = (r.haccp_system_review as { result: string }[])?.filter((i) => i.result === 'NO').length ?? 0
                    return (
                      <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-slate-900 font-semibold text-sm">{new Date(r.month_year + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{r.users?.name} · {new Date(r.submitted_at).toLocaleDateString('en-GB')}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${probs > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                          {probs > 0 ? `${probs} concern${probs > 1 ? 's' : ''}` : 'All clear'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
