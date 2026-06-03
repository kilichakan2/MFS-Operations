'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { AlertCircle, MapPin, ClipboardList, Tags, ShoppingBag } from 'lucide-react'
import RoleNav   from '@/components/RoleNav'
import AppHeader from '@/components/AppHeader'
import {
  KpiTile, RangeTabs, PageHeading,
} from './_components/primitives'
import {
  OpenComplaintsCard, AtRiskCard, CommitmentsCard,
  VisitsByRepCard, ComplaintCategoriesCard, ProspectsCard,
} from './_components/cards'
import {
  HunterFarmerSplitBlock, ValueStatBlock,
} from './_components/stat-blocks'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenComplaint        { id: string; customer: string; category: string; description: string; loggedBy: string; hoursAgo: number }
interface AtRiskAccount        { id: string; customer: string; outcome: 'at_risk'|'lost'; rep: string; hoursAgo: number }
interface UnreviewedCommitment { id: string; customer: string; detail: string; rep: string; hoursAgo: number }
interface Discrepancy          { id: string; customer: string; product: string; status: 'short'|'not_sent'; reason: string; orderedQty: number|null; sentQty: number|null; loggedBy: string; createdAt: string }
interface TodayComplaint       { id: string; customer: string; category: string; status: 'open'|'resolved'; description: string; resolutionNote: string|null; loggedBy: string; createdAt: string }
interface TodayVisit           { rep: string; count: number; outcomes: { positive: number; neutral: number; at_risk: number; lost: number } }
interface WeekDiscrepancyByReason   { reason: string; count: number }
interface WeekDiscrepancyByProduct  { product: string; count: number }
interface WeekComplaintByCategory   { category: string; count: number }
interface WeekVisitByRep       { rep: string; total: number; types: { routine: number; new_pitch: number; complaint_followup: number; delivery_issue: number } }
interface Prospect             { name: string; postcode: string; outcome: string; visitType: string; rep: string }

interface DashboardData {
  openComplaints48h:       OpenComplaint[]
  atRiskAccounts:          AtRiskAccount[]
  unreviewedCommitments:   UnreviewedCommitment[]
  discrepanciesToday:      Discrepancy[]
  complaintsTodayList:     TodayComplaint[]
  visitsToday:             TodayVisit[]
  weekDiscrepancyReasons:  WeekDiscrepancyByReason[]
  weekDiscrepancyProducts: WeekDiscrepancyByProduct[]
  weekComplaintCategories: WeekComplaintByCategory[]
  weekVisitsByRep:         WeekVisitByRep[]
  prospectsThisWeek:       Prospect[]
  hunterFarmer:            { existing: number; prospects: number }
  activePricing:           number
  draftPricing:            number
  expiredPricing:          number
  ordersToday:             { placed: number; printed: number; completed: number; total: number }
  avgResolutionHours:      number | null
  totalComplaintsWeek:     number
  openComplaintsWeek:      number
}

const EMPTY: DashboardData = {
  openComplaints48h: [], atRiskAccounts: [], unreviewedCommitments: [],
  discrepanciesToday: [], complaintsTodayList: [], visitsToday: [],
  weekDiscrepancyReasons: [], weekDiscrepancyProducts: [], weekComplaintCategories: [],
  weekVisitsByRep: [], prospectsThisWeek: [], hunterFarmer: { existing: 0, prospects: 0 },
  activePricing: 0, draftPricing: 0, expiredPricing: 0,
  ordersToday: { placed: 0, printed: 0, completed: 0, total: 0 },
  avgResolutionHours: null, totalComplaintsWeek: 0, openComplaintsWeek: 0,
}

// ─── Range helpers ────────────────────────────────────────────────────────────

type Preset = 'today' | 'week' | 'month' | 'quarter'

interface DateRange { from: string; to: string; label: string }

const RANGES: { id: Preset; label: string }[] = [
  { id: 'today',   label: 'Today'         },
  { id: 'week',    label: 'This week'     },
  { id: 'month',   label: 'This month'    },
  { id: 'quarter', label: 'This quarter'  },
]

function buildRange(preset: Preset): DateRange {
  const now   = new Date()
  const start = new Date(now)

  if (preset === 'today') {
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString(), to: now.toISOString(), label: 'Today' }
  }
  if (preset === 'week') {
    start.setHours(0, 0, 0, 0)
    // Monday of current week
    start.setDate(start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1))
    return { from: start.toISOString(), to: now.toISOString(), label: 'This week' }
  }
  if (preset === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString(), to: now.toISOString(), label: 'This month' }
  }
  // quarter
  const q = Math.floor(now.getMonth() / 3)
  const qStart = new Date(now.getFullYear(), q * 3, 1)
  qStart.setHours(0, 0, 0, 0)
  return { from: qStart.toISOString(), to: now.toISOString(), label: 'This quarter' }
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <svg className="animate-spin w-6 h-6 text-mfs-navy/40" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [data,      setData]      = useState<DashboardData>(EMPTY)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [preset,    setPreset]    = useState<Preset>('today')

  const range = useMemo(() => buildRange(preset), [preset])

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `HTTP ${res.status}`); return }
      setData(await res.json()); setLastFetch(new Date())
    } catch { setError('Network error — check your connection') }
    finally { setLoading(false) }
  }, [range.from, range.to])

  // Re-fetch whenever range changes
  useEffect(() => { fetchData() }, [fetchData])

  // KPI tile data
  const totalVisits      = data.visitsToday.reduce((s, v) => s + v.count, 0)
  const activeReps       = data.visitsToday.length
  const openAlertsCount  = data.openComplaints48h.length
  const totalDiscToday   = data.discrepanciesToday.length

  return (
    <div className="min-h-screen bg-mfs-soft-neutral">
      <AppHeader title="Dashboard" maxWidth="4xl"
        actions={
          <div className="flex items-center gap-2">
            <a href="/haccp"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors border border-orange-400/30">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              HACCP
            </a>
            <button type="button" onClick={fetchData} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-40">
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
              </svg>
              {loading ? 'Loading…' : lastFetch ? lastFetch.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Refresh'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={fetchData} className="text-red-600 text-xs font-bold">Retry</button>
          </div>
        </div>
      )}

      {loading && !lastFetch ? <Spinner /> : (
      <main className="max-w-5xl mx-auto px-4 py-5 pb-24 space-y-5 md:space-y-6">

        {/* Page heading — eyebrow only, no H1 (Q4) */}
        <PageHeading />

        {/* KPI row — 2-col mobile + Orders full-width below / 5-col desktop */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
          <KpiTile
            value={openAlertsCount}
            label="Open complaints"
            sub=">48h unresolved"
            accent={openAlertsCount > 0 ? 'danger' : 'success'}
            href="/complaints"
            icon={<AlertCircle size={14} strokeWidth={2} />}
            compact
          />
          <KpiTile
            value={totalVisits}
            label="Visits"
            sub={`${activeReps} rep${activeReps !== 1 ? 's' : ''} active`}
            accent="navy"
            href="/visits"
            icon={<MapPin size={14} strokeWidth={2} />}
            compact
          />
          <KpiTile
            value={totalDiscToday}
            label="Discrepancies"
            sub={range.label}
            accent={totalDiscToday > 0 ? 'warning' : 'success'}
            href="/dispatch"
            icon={<ClipboardList size={14} strokeWidth={2} />}
            compact
          />
          <KpiTile
            value={data.activePricing}
            label="Active pricing"
            sub={data.draftPricing > 0 ? `${data.draftPricing} draft` : 'agreements'}
            accent={data.expiredPricing > 0 ? 'warning' : 'success'}
            href="/pricing"
            icon={<Tags size={14} strokeWidth={2} />}
            compact
          />
          <div className="col-span-2 md:col-auto">
            <KpiTile
              value={data.ordersToday.total}
              label="Orders today"
              sub={`${data.ordersToday.placed} placed / ${data.ordersToday.printed} printed / ${data.ordersToday.completed} completed`}
              accent="navy"
              href="/orders"
              icon={<ShoppingBag size={14} strokeWidth={2} />}
              tight
              compact
            />
          </div>
        </div>

        {/* Range tabs */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] md:text-[11px] font-semibold tracking-[0.12em] uppercase text-mfs-neutral-500">
            Range
          </span>
          <RangeTabs<Preset> value={preset} onChange={setPreset} ranges={RANGES} scrollOnSmall />
        </div>

        {/* Stat blocks — 2-col mobile + split-bar full-width / 3-col desktop */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
          <div className="col-span-2 md:col-auto">
            <HunterFarmerSplitBlock hunterFarmer={data.hunterFarmer} />
          </div>
          <ValueStatBlock label="Avg. resolution" value={data.avgResolutionHours} unit="hrs" />
          <ValueStatBlock label="Complaints this week" value={data.totalComplaintsWeek} />
        </div>

        {/* Operational cards — 1-col mobile stack / 2-col desktop grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 items-start">
          <OpenComplaintsCard         items={data.openComplaints48h}        rangeLabel={range.label} />
          <AtRiskCard                 items={data.atRiskAccounts}           rangeLabel={range.label} />
          <CommitmentsCard            items={data.unreviewedCommitments}    rangeLabel={range.label} />
          <ProspectsCard              items={data.prospectsThisWeek}        rangeLabel={range.label} />
          <VisitsByRepCard            reps={data.weekVisitsByRep}           rangeLabel={range.label} />
          <ComplaintCategoriesCard    categories={data.weekComplaintCategories} />
        </div>
      </main>
      )}

      <RoleNav />
    </div>
  )
}
