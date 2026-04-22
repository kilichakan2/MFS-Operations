/**
 * app/haccp/page.tsx
 *
 * HACCP kiosk — two states:
 *   1. No session  → Login door (name cards + PIN)
 *   2. Valid session → Home screen (tile grid + status panel)
 *
 * Corrective Action is a modal popup used everywhere.
 * Each tile has a help icon that slides open SOP text.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AuthKeypad from '@/components/AuthKeypad'
import MfsLogo    from '@/components/MfsLogo'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember { id: string; name: string; role: string }

interface TodayStatus {
  cold_storage:       { am_done: boolean; pm_done: boolean; am_overdue: boolean; pm_overdue: boolean }
  processing_room:    { am_done: boolean; pm_done: boolean; am_overdue: boolean; pm_overdue: boolean }
  daily_diary:        { opening: boolean; operational: boolean; closing: boolean; opening_overdue: boolean; operational_overdue: boolean; closing_overdue: boolean }
  cleaning:           { count_today: number; has_issues_today: boolean; overdue: boolean; last_logged_at: string | null }
  deliveries:         { count_today: number; deviations: number }
  mince_runs:         { count_today: number; has_deviations: boolean }
  product_returns:    { count_today: number }
  calibration_due:    boolean
  weekly_review_due:  boolean
  monthly_review_due: boolean
  total_checks:       number
  completed_checks:   number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function fmtTime(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function useLiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const Icon = {
  cold:     <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/></svg>,
  room:     <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M9 8h6M9 16h4"/></svg>,
  clean:    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  delivery: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h5l2 3v4h-7V8zM5.5 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18.5 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>,
  mince:    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
  ret:      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.9L1 10"/></svg>,
  warn:     <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  cal:      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  review:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  people:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  help:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  close:    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  tick:     <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
}

// ─── Tile state helpers ───────────────────────────────────────────────────────

type TileState = 'complete' | 'overdue' | 'due' | 'deviation' | 'neutral'

function tileClasses(state: TileState): string {
  const base = 'rounded-2xl p-4 flex flex-col gap-2.5 cursor-pointer select-none transition-all duration-150 active:scale-[0.97]'
  switch (state) {
    case 'complete':  return `${base} bg-white border-2 border-green-400`
    case 'overdue':   return `${base} bg-red-50 border-2 border-red-500`
    case 'due':       return `${base} bg-amber-50 border-2 border-amber-400`
    case 'deviation': return `${base} bg-red-50 border-2 border-red-500`
    default:          return `${base} bg-white border-2 border-blue-200`
  }
}

function Badge({ state, label }: { state: TileState; label: string }) {
  const cls = {
    complete:  'bg-green-100 text-green-700',
    overdue:   'bg-red-100 text-red-700',
    due:       'bg-amber-100 text-amber-700',
    deviation: 'bg-red-100 text-red-700',
    neutral:   'bg-blue-50 text-blue-600',
  }[state]
  return <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

// ─── Help Slideout ────────────────────────────────────────────────────────────

const SOP_CONTENT: Record<string, { title: string; ref: string; text: string }> = {
  cold_storage: {
    title: 'Cold Storage Temperature — CCP 2',
    ref: 'SOP 3 | HB-001 V4.1',
    text: 'Critical limits: Chillers ≤5°C target (≤8°C legal max). Freezer ≤-18°C.\n\nMonitor AM and PM daily. If chiller 5–8°C: check door seals, reduce loading, recheck within 30 minutes, transfer product if rising.\n\nIf chiller >8°C: CRITICAL — minimise door openings, transfer all product to backup immediately, contact refrigeration engineer, assess all product before release.\n\nFreezer >-15°C: assess product for thawing. Do not refreeze thawed product.',
  },
  processing_room: {
    title: 'Processing Room Temperature — CCP 3',
    ref: 'SOP 3 | HB-001 V4.1',
    text: 'Critical limits: Product ≤4°C. Room ambient ≤12°C.\n\nIf room temperature exceeds 12°C: DO NOT stop cutting.\nBring product to production area progressively in small quantities to ensure core temperature does not exceed ≤4°C.\nMonitor product core temperature more frequently.\nInvestigate cause of room temperature rise.\n\nIf product >4°C: return to chilled storage immediately. If <2 hours at <8°C: complete processing within 30 minutes then chill.',
  },
  cleaning: {
    title: 'Cleaning Diary — SOP 2',
    ref: 'SOP 2, 2B | HB-001 V4.1',
    text: '4-step cleaning process:\n1. Pre-cleaning — remove all visible soil, rinse with cold water\n2. Cleaning — apply alkaline detergent at correct concentration, scrub all surfaces\n3. Sanitisation — hot water ≥82°C for 30 seconds OR approved chemical sanitiser\n4. Verification — visual inspection, check temperature/concentration\n\nFrequencies:\nKnives & small tools: start and end of shift (82°C)\nCutting boards: between products and EOD\nWork surfaces: every 2 hours and EOD\n\nMeat and mince require TIME SEPARATION — full 4-step clean between categories.',
  },
  delivery: {
    title: 'Delivery Intake — CCP 1',
    ref: 'SOP 5B | HB-001 V4.1 | CA-001 V1.1',
    text: 'Critical limits: Red meat ≤7°C. Poultry ≤4°C. Offal ≤3°C. Frozen ≤-12°C.\n\nCA-001 three-band system:\n≤5°C = pass\n5–8°C = conditional accept — urgent placement into coldest chiller, halve remaining shelf life\n>8°C = REJECT immediately\n\nIf product contaminated (faecal, wool, hide): trim using clean knife, dispose trimmings as Cat 3 ABP, sterilise knife ≥82°C.\n\nBoxed/packaged meat only — NO exposed meat in receiving area.',
  },
  mince: {
    title: 'Mince & Meat Prep — CCP-M1, M2, MP2',
    ref: 'MMP-001 V1.0 | MMP-HA-001 V1.0',
    text: 'Kill date limits (from kill date):\nPoultry: ≤3 days\nBeef / Lamb: ≤6 days\nVac-pac beef: ≤15 days\n\nIf kill date cannot be verified — DO NOT USE for mincing.\nIf limit exceeded — DO NOT MINCE. Segregate, return to supplier or dispose as Cat 3 ABP.\n\nTemperatures:\nInput: meat ≤7°C, poultry ≤4°C\nOutput (mince): must be ≤2°C immediately after\nOutput (meat prep): must be ≤4°C\n\nNO re-freezing after thawing — legal requirement.\n\nTime separation: plain products BEFORE allergen products. Full 4-step clean between categories.',
  },
  product_return: {
    title: 'Product Return — SOP 12',
    ref: 'SOP 12 | HB-001 V4.1',
    text: 'Return codes: RC01 Temperature complaint · RC02 Quality issue · RC03 Incorrect product · RC04 Short shelf life · RC05 Packaging damage · RC06 Quantity discrepancy · RC07 Customer cancelled · RC08 Other\n\nNEVER resell:\n— Product previously frozen then thawed\n— Broken packaging/seals\n— Unknown temperature history\n— Exceeded temperature limits at any point\n— Past use-by date\n— Returned from consumers (non-trade)\n\nAcceptance temps on return: Red meat ≤7°C (else dispose). Frozen ≤-18°C no thawing signs (else dispose).',
  },
  calibration: {
    title: 'Thermometer Calibration — SOP 3',
    ref: 'SOP 3 | HB-001 V4.1',
    text: 'Calibrate monthly, before shift.\n\nIce water test: fill with crushed ice + small amount water, stir, wait 2 minutes. Reading must be 0°C ±1°C.\n\nBoiling water test: insert probe 2 inches into rolling boil. Reading must be 100°C ±1°C.\n\nIf out of calibration: remove from service immediately, use backup thermometer, send for professional calibration or replace.\nReview all readings taken with faulty thermometer.\n\nAnnually: buy new calibrated probe — do not rely on a probe more than 12 months old.',
  },
  reviews: {
    title: 'Weekly & Monthly Reviews',
    ref: 'SOP 5, 5B, 9, 11 | MF-001 V4.1',
    text: 'Weekly review: Check all CCP monitoring records are complete and signed. Verify corrective actions documented. Check supplier certificates, staff training current, pest control, water supply, maintenance, waste management. One-way traffic compliance check. Structural walkthrough (floors, walls, equipment, doors, emergency items).\n\nMonthly review (legal requirement — FSA): Thermometer calibration completed. Chiller/freezer temps verified at multiple locations, door seals checked. Steriliser ≥82°C verified. Staff entrance PPE stocks checked. Facilities: handwash, soap, boot wash, hand sanitiser all stocked. Full HACCP system review — confirm CCPs still valid, limits adequate, monitoring effective.',
  },
  people: {
    title: 'Health Monitoring — SOP 8',
    ref: 'SOP 8 | HB-001 V4.1 | HM-001 V1.0',
    text: 'New staff — before first shift: health declaration mandatory. Send home immediately if: diarrhoea/vomiting, jaundice, skin infections, open wounds. Must be symptom-free for 48 hours before returning after gastrointestinal illness.\n\nReturn to work: GI illness — 48 hours symptom-free minimum. If >5 days: medical certificate required. Serious illness/hospitalisation: GP clearance required.\n\nVisitors: complete questionnaire before entering production. Reject entry if: sickness/vomiting in past 24h, skin conditions, boils, discharge from eyes/ears, heavy cold, contact with enteric fever. Visitor must confirm: no infection, jewellery removed, equipment clean, lubricants food-grade.',
  },
  corrective_action: {
    title: 'Corrective Action Reference — CA-001',
    ref: 'CA-001 V1.1',
    text: 'FSA requirement: every CCP deviation must be documented with: date/time of deviation, description of issue, cause (root cause analysis), action taken, product disposition, measures to prevent recurrence, operator signature, management verification for significant deviations.\n\nRecord retention: 2 years minimum. Available for FSA officers and EHOs on demand.\n\nCommon actions: Urgent chill (5–8°C receipt) · Reject >8°C · Transfer to backup (CCP 2 failure) · Progressive batches (CCP 3 room >12°C) · Remove thermometer from service · Trim contaminated product · Halt and deep clean (time separation breach).',
  },
}

function HelpPanel({ section, onClose }: { section: string; onClose: () => void }) {
  const content = SOP_CONTENT[section]
  if (!content) return null
  return (
    <div style={{minHeight:400,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div className="bg-white rounded-t-3xl w-full max-w-2xl p-6 max-h-96 overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">{content.ref}</p>
            <h3 className="text-slate-900 font-bold text-lg mt-0.5">{content.title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-1">{Icon.close}</button>
        </div>
        <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{content.text}</div>
      </div>
    </div>
  )
}

// ─── Large Tile ───────────────────────────────────────────────────────────────

function LargeTile({
  id, icon, label, sub, state, badge, onTap, onHelp,
}: {
  id: string; icon: React.ReactNode; label: string; sub: string
  state: TileState; badge: string
  onTap: () => void; onHelp: () => void
}) {
  return (
    <div className={`${tileClasses(state)} flex-1`} onPointerDown={(e) => { e.preventDefault(); onTap() }}>
      {/* Top row: icon + help — no badge here, no overlap */}
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
          state === 'overdue' || state === 'deviation' ? 'bg-red-100 text-red-600' :
          state === 'complete' ? 'bg-green-100 text-green-700' :
          state === 'due' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
        }`}>
          {icon}
        </div>
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onHelp() }}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mt-0.5 -mr-0.5"
          aria-label={`Help for ${label}`}>
          {Icon.help}
        </button>
      </div>
      {/* Label + sub */}
      <div className="flex-1">
        <p className="text-slate-900 font-semibold text-sm leading-tight">{label}</p>
        <p className="text-slate-600 text-[11px] mt-0.5 leading-snug">{sub}</p>
      </div>
      {/* Badge at bottom — no longer absolute, no overlap */}
      <div className="mt-1">
        <Badge state={state} label={badge} />
      </div>
    </div>
  )
}

// ─── Small Tile ───────────────────────────────────────────────────────────────

function SmallTile({
  id, icon, label, sub, badge, due, onTap, onHelp,
}: {
  id: string; icon: React.ReactNode; label: string; sub: string; badge: string; due: boolean
  onTap: () => void; onHelp: () => void
}) {
  return (
    <div
      className={`flex-1 rounded-xl px-3 py-2.5 flex items-center gap-3 cursor-pointer border transition-all active:scale-[0.97] ${
        due ? 'bg-amber-50 border-2 border-amber-400' : 'bg-white border-2 border-blue-200'
      }`}
      onPointerDown={(e) => { e.preventDefault(); onTap() }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-500 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-900 text-[12px] font-semibold leading-tight">{label}</p>
        <p className="text-slate-600 text-[10px] mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${due ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{badge}</span>
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onHelp() }}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label={`Help for ${label}`}>
          {Icon.help}
        </button>
      </div>
    </div>
  )
}


// ─── Home Screen ─────────────────────────────────────────────────────────────

function HomeScreen({ userName, userRole }: { userName: string; userRole: string }) {
  const isAdmin     = userRole === 'admin'
  const now         = useLiveClock()
  const [status, setStatus]   = useState<TodayStatus | null>(null)
  const [helpSection, setHelp] = useState<string | null>(null)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadStatus = useCallback(() => {
    fetch('/api/haccp/today-status')
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStatus(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadStatus()
    refreshRef.current = setInterval(loadStatus, 5 * 60 * 1000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [loadStatus])

  const s = status

  const coldState: TileState = !s ? 'neutral'
    : (s.cold_storage.am_done && s.cold_storage.pm_done) ? 'complete'
    : (s.cold_storage.pm_overdue || s.cold_storage.am_overdue) ? 'overdue'
    : s.cold_storage.am_done ? 'due'
    : 'neutral'

  const roomState: TileState = !s ? 'neutral'
    : (s.processing_room.am_done && s.processing_room.pm_done &&
       s.daily_diary.opening && s.daily_diary.closing) ? 'complete'
    : (s.processing_room.pm_overdue || s.processing_room.am_overdue ||
       s.daily_diary.opening_overdue || s.daily_diary.closing_overdue) ? 'overdue'
    : (s.processing_room.am_done || s.daily_diary.opening) ? 'due'
    : 'neutral'

  const cleaningState: TileState = !s ? 'neutral'
    : s.cleaning.count_today > 0 && s.cleaning.has_issues_today ? 'deviation'
    : s.cleaning.count_today > 0 ? 'complete'
    : s.cleaning.overdue ? 'overdue'
    : 'neutral'

  const diaryState: TileState = !s ? 'neutral'
    : (s.daily_diary.opening && s.daily_diary.closing) ? 'complete'
    : s.daily_diary.opening_overdue ? 'overdue'
    : s.daily_diary.opening ? 'due'
    : 'neutral'

  const delivState: TileState = !s ? 'neutral'
    : s.deliveries.deviations > 0 ? 'deviation'
    : s.deliveries.count_today > 0 ? 'complete'
    : 'neutral'

  const coldBadge = !s ? '—'
    : (s.cold_storage.am_done && s.cold_storage.pm_done) ? 'Done ✓'
    : s.cold_storage.pm_overdue ? 'PM overdue'
    : s.cold_storage.am_overdue ? 'AM overdue'
    : s.cold_storage.am_done    ? 'PM due'
    : 'AM due'
  const roomBadge = !s ? '—'
    : (s.processing_room.am_done && s.processing_room.pm_done && s.daily_diary.opening && s.daily_diary.closing) ? 'Done ✓'
    : s.processing_room.pm_overdue    ? 'Temp PM overdue'
    : s.daily_diary.closing_overdue   ? 'Closing overdue'
    : s.processing_room.am_overdue    ? 'Temp AM overdue'
    : s.daily_diary.opening_overdue   ? 'Opening overdue'
    : s.processing_room.am_done       ? 'Temp PM due'
    : s.daily_diary.opening           ? 'Opening ✓'
    : 'Opening due'
  const diaryBadge = !s ? '—'
    : (s.daily_diary.opening && s.daily_diary.closing) ? 'Done ✓'
    : s.daily_diary.closing_overdue   ? 'Closing overdue'
    : s.daily_diary.opening_overdue   ? 'Opening overdue'
    : s.daily_diary.opening           ? 'Open ✓ · Closing due'
    : 'Opening due'
  const delivBadge = !s ? '—'
    : s.deliveries.deviations > 0 ? `${s.deliveries.count_today} logged · ${s.deliveries.deviations} fail`
    : s.deliveries.count_today > 0 ? `${s.deliveries.count_today} logged`
    : 'None yet'
  const cleaningBadge = !s ? '—'
    : s.cleaning.count_today > 0 && s.cleaning.has_issues_today ? `${s.cleaning.count_today} logged · issue`
    : s.cleaning.count_today > 0 ? `${s.cleaning.count_today} logged`
    : s.cleaning.overdue ? 'Overdue'
    : 'None yet'

  const pct   = s ? Math.round((s.completed_checks / s.total_checks) * 100) : 0

  function signOut() { window.location.href = '/api/auth/logout' }

  const overdue: string[] = []
  if (s?.cold_storage.am_overdue)         overdue.push('Cold Storage AM')
  if (s?.cold_storage.pm_overdue)         overdue.push('Cold Storage PM')
  if (s?.processing_room.am_overdue)      overdue.push('Process Room Temp AM')
  if (s?.processing_room.pm_overdue)      overdue.push('Process Room Temp PM')
  if (s?.daily_diary.opening_overdue)     overdue.push('Process Room Opening checks')
  if (s?.daily_diary.closing_overdue)     overdue.push('Process Room Closing checks')
  if (s?.cleaning.overdue)                overdue.push('Cleaning log')

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-[#1E293B] flex-shrink-0">
        <div className="flex items-center gap-3">
          <MfsLogo className="h-6 w-auto text-white" />
          <div className="w-px h-6 bg-slate-600" />
          <span className="text-slate-300 text-sm font-medium">HACCP</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Documents register link */}
          <button onClick={() => { window.location.href = '/haccp/documents' }}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/18 border border-white/15 rounded-xl px-3 py-2 text-slate-200 hover:text-white transition-all text-xs font-bold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            Documents
          </button>
          <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3 py-1.5">
            <div className="w-6 h-6 rounded-full bg-[#EB6619] flex items-center justify-center text-white text-[9px] font-bold">
              {initials(userName)}
            </div>
            <span className="text-white text-xs font-medium">{userName}</span>
            <button onClick={signOut} className="text-slate-400 hover:text-slate-200 text-[10px] ml-1 transition-colors">Sign out</button>
          </div>
        </div>
      </div>

      {/* Admin panel strip — only visible when logged in as admin */}
      {isAdmin && (
        <div className="bg-orange-600 px-5 py-2 flex items-center gap-3 flex-shrink-0">
          <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span className="text-white text-xs font-bold flex-1">Admin mode — additional controls active</span>
          <div className="flex items-center gap-2">
            <button onClick={() => { window.location.href = '/haccp/admin' }}
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1 rounded-lg transition-all">
              Admin panel
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Tile grid */}
        <div className="flex-1 p-4 flex flex-col gap-3">

          {/* Row 1 — 4 large tiles */}
          <div className="flex gap-3">
            <LargeTile id="cold_storage" icon={Icon.cold} label="Cold Storage" state={coldState} badge={coldBadge}
              sub={s ? `CCP 2 · 5 units${s.cold_storage.am_done ? ' · AM done' : ''}` : 'CCP 2 · 5 units'}
              onTap={() => { window.location.href = '/haccp/cold-storage' }} onHelp={() => setHelp('cold_storage')} />
            <LargeTile id="processing_room" icon={Icon.room} label="Process Room" state={roomState} badge={roomBadge}
              sub={s ? `CCP 3 · Daily Diary${s.daily_diary.opening ? ' · Opening ✓' : ''}` : 'CCP 3 · Daily Diary'}
              onTap={() => { window.location.href = '/haccp/process-room' }} onHelp={() => setHelp('processing_room')} />
            <LargeTile id="cleaning" icon={Icon.clean} label="Cleaning" state={cleaningState} badge={cleaningBadge}
              sub={s?.cleaning.last_logged_at ? `Last: ${fmtTime(s.cleaning.last_logged_at)}` : 'SOP 2 — log each clean'}
              onTap={() => { window.location.href = '/haccp/cleaning' }} onHelp={() => setHelp('cleaning')} />
            <LargeTile id="delivery" icon={Icon.delivery} label="Delivery" state={delivState} badge={delivBadge}
              sub={`CCP 1 · SOP 5B${s?.deliveries.deviations ? ` · ${s.deliveries.deviations} CCA` : ''}`}
              onTap={() => { window.location.href = '/haccp/delivery' }} onHelp={() => setHelp('delivery')} />
          </div>

          {/* Row 2 — 2 standard + wide CCA */}
          <div className="flex gap-3">
            <LargeTile id="mince" icon={Icon.mince} label="Mince / Prep"
              state={!s ? 'neutral' : s.mince_runs.has_deviations ? 'deviation' : s.mince_runs.count_today > 0 ? 'complete' : 'neutral'}
              badge={!s ? '—' : s.mince_runs.has_deviations ? `${s.mince_runs.count_today} runs · deviation` : s.mince_runs.count_today > 0 ? `${s.mince_runs.count_today} runs` : 'None today'}
              sub="CCP-M1 M2 · Kill date"
              onTap={() => { window.location.href = '/haccp/mince' }} onHelp={() => setHelp('mince')} />
            <LargeTile id="product_return" icon={Icon.ret} label="Product Return" state="neutral" badge={s ? (s.product_returns.count_today > 0 ? `${s.product_returns.count_today} logged` : 'None') : '—'}
              sub="SOP 12 · RC01–RC08"
              onTap={() => { window.location.href = '/haccp/product-return' }} onHelp={() => setHelp('product_return')} />
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-300 mx-1" />

          {/* Small tile row */}
          <div className="flex gap-3">
            <SmallTile id="calibration" icon={Icon.cal} label="Calibration" sub="Monthly · SOP 3"
              badge={s?.calibration_due ? 'Due this month' : 'Not due'} due={s?.calibration_due ?? false}
              onTap={() => { window.location.href = '/haccp/calibration' }} onHelp={() => setHelp('calibration')} />
            <SmallTile id="reviews" icon={Icon.review} label="Reviews" sub="Weekly + Monthly"
              badge={s?.weekly_review_due ? 'Weekly due' : s?.monthly_review_due ? 'Monthly due' : 'Up to date'} due={s?.weekly_review_due || s?.monthly_review_due ? true : false}
              onTap={() => { window.location.href = '/haccp/reviews' }} onHelp={() => setHelp('reviews')} />
            <SmallTile id="people" icon={Icon.people} label="People" sub="Health · Visitor · Training"
              badge="Event only" due={false}
              onTap={() => { window.location.href = '/haccp/people' }} onHelp={() => setHelp('people')} />
          </div>

        </div>

        {/* Status panel */}
        <div className="w-44 flex-shrink-0 border-l border-blue-100 bg-white p-4 flex flex-col gap-4">

          <div>
            <div className="text-slate-900 text-2xl font-bold tracking-wide">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-slate-500 text-[11px] mt-0.5">
              {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>

          <div className="h-px bg-slate-200" />

          <div>
            <p className="text-slate-600 text-[9px] font-bold tracking-[.1em] uppercase mb-2">Today</p>
            <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-[#EB6619] h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-slate-500 text-[10px]">{s ? `${s.completed_checks} of ${s.total_checks}` : '—'}</span>
              <span className="text-slate-700 text-[10px] font-bold">{pct}%</span>
            </div>
          </div>

          {overdue.length > 0 && (
            <div>
              <p className="text-slate-600 text-[9px] font-bold tracking-[.1em] uppercase mb-2">Overdue</p>
              <div className="space-y-1.5">
                {overdue.map((item) => (
                  <div key={item} className="border-l-2 border-red-500 pl-2">
                    <p className="text-red-600 text-[11px] font-medium">{item}</p>
                    <p className="text-slate-500 text-[9px]">PM check due</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-slate-200" />

          <div>
            <p className="text-slate-600 text-[9px] font-bold tracking-[.1em] uppercase mb-1.5">Sync</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-slate-500 text-[10px]">Online</span>
            </div>
          </div>

        </div>
      </div>

      {/* Popups — faux viewport pattern (no position:fixed) */}

      {helpSection && (
        <div className="absolute inset-0 z-50" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <HelpPanel section={helpSection} onClose={() => setHelp(null)} />
        </div>
      )}

    </div>
  )
}

// ─── Login Door ───────────────────────────────────────────────────────────────

function StaffCard({ member, onSelect }: { member: StaffMember; onSelect: (m: StaffMember) => void }) {
  const isWh = member.role === 'warehouse'
  return (
    <button type="button" aria-label={`Select ${member.name}`}
      onPointerDown={(e) => { e.preventDefault(); if ('vibrate' in navigator) navigator.vibrate(8); onSelect(member) }}
      className="flex flex-col items-center gap-3 rounded-2xl p-5 ring-1 ring-white/20 bg-slate-100 active:bg-slate-200 active:ring-[#EB6619]/60 transition-all select-none">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${isWh ? 'bg-[#EB6619]' : 'bg-pink-900'}`}>
        {initials(member.name)}
      </div>
      <p className="text-slate-900 font-semibold text-sm">{member.name}</p>
      <span className={`text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full ${isWh ? 'bg-amber-50 text-[#EB6619]' : 'bg-pink-100 text-slate-700'}`}>
        {isWh ? 'Warehouse' : 'Butcher'}
      </span>
    </button>
  )
}

function LoginDoor() {
  const [staff,      setStaff]      = useState<StaffMember[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<StaffMember | null>(null)
  const [pinError,   setPinError]   = useState<string | undefined>()
  const [reset,      setReset]      = useState(0)

  useEffect(() => {
    fetch('/api/auth/haccp-team')
      .then((r) => r.json())
      .then((d) => { setStaff(Array.isArray(d) ? d : []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handlePin = useCallback(async (pin: string) => {
    if (!selected) return
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selected.name, credential: pin }),
      })
      const data = await res.json()
      if (res.ok) {
        // Mark this as a HACCP kiosk session so the main app
        // doesn't redirect this user to /screen1 (dispatch log)
        document.cookie = 'mfs_haccp_session=1; path=/; max-age=86400; samesite=lax'
        window.location.href = '/haccp'
      }
      else { setPinError(data.error ?? 'Incorrect PIN — try again'); setReset((n) => n + 1) }
    } catch { setPinError('Connection error — try again'); setReset((n) => n + 1) }
  }, [selected])

  if (selected) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <button type="button" onPointerDown={() => { setSelected(null); setPinError(undefined); setReset((n) => n + 1) }}
          className="absolute top-5 left-5 flex items-center gap-2 text-slate-400 hover:text-slate-700 transition-colors z-10 select-none">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          <span className="text-sm">Back</span>
        </button>
        <AuthKeypad title={`${selected.name} — Enter PIN`} onComplete={handlePin} error={pinError} resetSignal={reset} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">
      {/* Top bar with back button */}
      <div className="flex items-center px-5 pt-5">
        <button
          onPointerDown={(e) => { e.preventDefault(); window.location.href = '/' }}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors text-xs font-medium select-none active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          Back to main app
        </button>
      </div>
      <div className="flex flex-col items-center pt-6 pb-6 px-6">
        <MfsLogo className="h-8 mb-4 text-white" />
        <p className="text-[#EB6619] text-xs font-bold tracking-[.35em] uppercase">Process Room</p>
        <h1 className="text-white text-2xl font-bold tracking-wide mt-1">HACCP Compliance</h1>
        <p className="text-slate-600 text-sm mt-2">Tap your name to continue</p>
      </div>
      <div className="mx-8 h-px bg-slate-100" />
      <div className="flex-1 flex items-start justify-center px-6 pt-8 pb-10">
        {loading ? (
          <div className="flex items-center gap-3 text-slate-600 text-sm mt-12">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Loading…
          </div>
        ) : staff.length === 0 ? (
          <p className="text-slate-600 text-sm mt-12 text-center px-8">No staff found. Add butcher or warehouse users via the admin panel.</p>
        ) : (
          <div className="w-full max-w-sm grid grid-cols-2 gap-4">
            {staff.map((m) => <StaffCard key={m.id} member={m} onSelect={setSelected} />)}
          </div>
        )}
      </div>
      <div className="text-center pb-8 text-slate-300 text-xs tracking-widest uppercase">MFS Global Ltd · Sheffield</div>
    </div>
  )
}

// ─── Root — checks session, shows door or home ────────────────────────────────

export default function HaccpRoot() {
  const [authState, setAuthState] = useState<'checking' | 'door' | 'home'>('checking')
  const [userName,  setUserName]  = useState('')
  const [userRole,  setUserRole]  = useState('')

  useEffect(() => {
    const role = document.cookie.split(';').find((c) => c.trim().startsWith('mfs_role='))?.split('=')[1]
    const name = document.cookie.split(';').find((c) => c.trim().startsWith('mfs_name='))?.split('=')[1]

    if (role && ['warehouse', 'butcher', 'admin'].includes(role) && name) {
      setUserName(decodeURIComponent(name))
      setUserRole(role)
      setAuthState('home')
    } else {
      setAuthState('door')
    }
  }, [])

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <MfsLogo className="h-10 text-white opacity-40" />
      </div>
    )
  }

  if (authState === 'home') return <HomeScreen userName={userName} userRole={userRole} />
  return <LoginDoor />
}
