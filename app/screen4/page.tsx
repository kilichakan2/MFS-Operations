'use client'

import { useState, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import BottomNav, { Icons } from '@/components/BottomNav'
import AppHeader             from '@/components/AppHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenComplaint        { id: string; customer: string; category: string; description: string; loggedBy: string; hoursAgo: number }
interface AtRiskAccount        { id: string; customer: string; outcome: 'at_risk'|'lost'; rep: string; hoursAgo: number }
interface UnreviewedCommitment { id: string; customer: string; detail: string; rep: string; hoursAgo: number }
interface Discrepancy          { id: string; customer: string; product: string; status: 'short'|'not_sent'; reason: string; orderedQty: number|null; sentQty: number|null; loggedBy: string; createdAt: string }
interface TodayComplaint       { id: string; customer: string; category: string; status: 'open'|'resolved'; description: string; resolutionNote: string|null; loggedBy: string; createdAt: string }
interface TodayVisitItem       { id: string; customer: string; visitType: string; outcome: string }
interface TodayVisit           { rep: string; count: number; outcomes: { positive: number; neutral: number; at_risk: number; lost: number }; visits: TodayVisitItem[] }
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
  avgResolutionHours:      number | null
  totalComplaintsWeek:     number
  openComplaintsWeek:      number
}

const EMPTY: DashboardData = {
  openComplaints48h: [], atRiskAccounts: [], unreviewedCommitments: [],
  discrepanciesToday: [], complaintsTodayList: [], visitsToday: [],
  weekDiscrepancyReasons: [], weekDiscrepancyProducts: [], weekComplaintCategories: [],
  weekVisitsByRep: [], prospectsThisWeek: [], hunterFarmer: { existing: 0, prospects: 0 },
  avgResolutionHours: null, totalComplaintsWeek: 0, openComplaintsWeek: 0,
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/London',
    }).replace(',', '')
  } catch { return '' }
}

function cap(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Badge({ label, tone }: { label: string; tone: 'red'|'amber'|'green'|'gray'|'navy' }) {
  const s = tone==='red' ? 'bg-red-100 text-red-700' : tone==='amber' ? 'bg-amber-100 text-amber-700'
    : tone==='green' ? 'bg-green-100 text-green-700' : tone==='navy' ? 'bg-blue-100 text-[#16205B]'
    : 'bg-gray-100 text-gray-600'
  return <span className={`inline-block text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${s}`}>{label}</span>
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <svg className="animate-spin w-6 h-6 text-gray-300" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-gray-400 mb-3">{children}</p>
}

function BreakdownRow({ label, count, max, colour='navy' }: {
  label: string; count: number; max: number; colour?: 'navy'|'maroon'|'amber'|'red'
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  const bar = colour==='maroon' ? 'bg-[#590129]' : colour==='amber' ? 'bg-amber-500'
    : colour==='red' ? 'bg-red-500' : 'bg-[#16205B]'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-36 flex-shrink-0 truncate capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-900 w-5 text-right flex-shrink-0">{count}</span>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ value, label, sub, icon, accent }: {
  value: string|number; label: string; sub?: string
  accent: 'red'|'amber'|'blue'|'green'; icon: React.ReactNode
}) {
  const ring   = accent==='red' ? 'bg-red-50' : accent==='amber' ? 'bg-amber-50' : accent==='green' ? 'bg-green-50' : 'bg-blue-50'
  const icClr  = accent==='red' ? 'text-red-500' : accent==='amber' ? 'text-amber-500' : accent==='green' ? 'text-green-600' : 'text-blue-600'
  const valClr = accent==='red' ? 'text-red-700' : accent==='amber' ? 'text-amber-700' : accent==='green' ? 'text-green-700' : 'text-[#16205B]'
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ring}`}>
        <span className={`w-4 h-4 ${icClr}`}>{icon}</span>
      </div>
      <span className={`text-3xl font-bold leading-none ${valClr}`}>{value}</span>
      <div>
        <p className="text-xs font-semibold text-gray-700 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({ tone, children }: { tone: 'red'|'amber'; children: React.ReactNode }) {
  const dot  = tone==='red' ? 'bg-red-500' : 'bg-amber-500'
  const text = tone==='red' ? 'text-red-800' : 'text-amber-900'
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className={`flex flex-col gap-0.5 min-w-0 flex-1 ${text}`}>{children}</div>
    </div>
  )
}

// ─── Tabbed today feed ────────────────────────────────────────────────────────

type TodayTab = 'visits'|'complaints'|'discrepancies'

function TodayTabs({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<TodayTab>('visits')
  const totalVisits    = data.visitsToday.reduce((s, v) => s + v.count, 0)
  const openComplaints = data.complaintsTodayList.filter(c => c.status === 'open').length

  const TABS: { id: TodayTab; label: string; n: number; warn?: boolean }[] = [
    { id: 'visits',        label: 'Visits',        n: totalVisits },
    { id: 'complaints',    label: 'Complaints',    n: openComplaints, warn: openComplaints > 0 },
    { id: 'discrepancies', label: 'Discrepancies', n: data.discrepanciesToday.length, warn: data.discrepanciesToday.length > 0 },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={['flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors',
              tab === t.id ? 'border-[#EB6619] text-[#EB6619] bg-orange-50/40' : 'border-transparent text-gray-400 hover:text-gray-600'
            ].join(' ')}
          >
            {t.label}
            {t.n > 0 && (
              <span className={['w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center',
                t.warn ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              ].join(' ')}>{t.n}</span>
            )}
          </button>
        ))}
      </div>

      {/* Visits */}
      {tab === 'visits' && (
        <div className="divide-y divide-gray-50">
          {data.visitsToday.length === 0
            ? <p className="px-4 py-6 text-sm text-gray-400 text-center">No visits logged today</p>
            : data.visitsToday.map(v => {
                const warn = v.outcomes.at_risk > 0 || v.outcomes.lost > 0
                return (
                  <div key={v.rep} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{v.rep}</span>
                        {warn && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
                      </div>
                      <span className="text-sm font-bold text-[#16205B]">{v.count} visits</span>
                    </div>
                    <div className="space-y-0">
                      {v.visits.map(vi => {
                        const oc = vi.outcome==='positive' ? 'text-green-600 bg-green-50'
                                 : vi.outcome==='at_risk'  ? 'text-amber-700 bg-amber-50'
                                 : vi.outcome==='lost'     ? 'text-red-700 bg-red-50'
                                 : 'text-gray-500 bg-gray-50'
                        return (
                          <div key={vi.id} className="flex items-center justify-between gap-3 py-1.5 border-t border-gray-50 first:border-0">
                            <span className="text-xs text-gray-800 truncate flex-1 capitalize">{vi.customer}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] text-gray-400 capitalize">{vi.visitType}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize ${oc}`}>{vi.outcome.replace(/_/g,' ')}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
          }
        </div>
      )}

      {/* Complaints */}
      {tab === 'complaints' && (
        <div className="divide-y divide-gray-50">
          {data.complaintsTodayList.length === 0
            ? <p className="px-4 py-6 text-sm text-gray-400 text-center">No complaints today</p>
            : data.complaintsTodayList.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.customer}</p>
                    <p className="text-xs text-gray-400">{cap(c.category)} · {c.loggedBy} · {fmtTime(c.createdAt)}</p>
                    {c.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">"{c.description}"</p>}
                    {c.status === 'resolved' && c.resolutionNote && (
                      <p className="text-xs text-green-700 mt-0.5 line-clamp-1">↳ {c.resolutionNote}</p>
                    )}
                  </div>
                  <Badge label={c.status === 'open' ? 'OPEN' : 'RESOLVED'} tone={c.status === 'open' ? 'amber' : 'green'} />
                </div>
              ))
          }
        </div>
      )}

      {/* Discrepancies */}
      {tab === 'discrepancies' && (
        <div className="divide-y divide-gray-50">
          {data.discrepanciesToday.length === 0
            ? <p className="px-4 py-6 text-sm text-gray-400 text-center">No discrepancies today</p>
            : data.discrepanciesToday.map(d => (
                <div key={d.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{d.customer}</p>
                    <p className="text-xs text-gray-400 truncate">{d.product} · {cap(d.reason)}</p>
                    {d.status === 'short' && d.orderedQty != null && d.sentQty != null && (
                      <p className="text-xs text-amber-700 font-medium mt-0.5">Ordered {d.orderedQty} · Sent {d.sentQty}</p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-0.5">{d.loggedBy} · {fmtTime(d.createdAt)}</p>
                  </div>
                  <Badge label={d.status === 'not_sent' ? 'NOT SENT' : 'SHORT'} tone={d.status === 'not_sent' ? 'red' : 'amber'} />
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Screen4Page() {
  const [data,      setData]      = useState<DashboardData>(EMPTY)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `HTTP ${res.status}`); return }
      setData(await res.json()); setLastFetch(new Date())
    } catch { setError('Network error — check your connection') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const totalVisitsToday = data.visitsToday.reduce((s, v) => s + v.count, 0)
  const openAlertsCount  = data.openComplaints48h.length
  const totalDiscToday   = data.discrepanciesToday.length
  const hasAlerts        = openAlertsCount > 0 || data.atRiskAccounts.length > 0 || data.unreviewedCommitments.length > 0
  const totalDiscWeek    = data.weekDiscrepancyReasons.reduce((s, r) => s + r.count, 0)
  const maxDiscCount     = Math.max(...data.weekDiscrepancyReasons.map(r => r.count), 1)
  const maxCompCount     = Math.max(...data.weekComplaintCategories.map(r => r.count), 1)
  const { existing, prospects } = data.hunterFarmer
  const hfTotal = existing + prospects
  const hfData  = hfTotal > 0
    ? [{ name: 'Existing', value: existing }, { name: 'Prospects', value: prospects }]
    : []

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title="Dashboard" maxWidth="2xl"
        actions={
          <button type="button" onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-40">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
            {loading ? 'Loading…' : lastFetch ? lastFetch.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Refresh'}
          </button>
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
      <main className="max-w-2xl mx-auto px-4 py-5 pb-24 space-y-5">

        {/* KPI Row */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard value={openAlertsCount} label="Open complaints" sub=">48h unresolved" accent={openAlertsCount > 0 ? 'red' : 'green'}
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-full h-full"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>}
          />
          <KpiCard value={totalVisitsToday} label="Visits today" sub={`${data.visitsToday.length} rep${data.visitsToday.length !== 1 ? 's' : ''} active`} accent="blue"
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-full h-full"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z"/></svg>}
          />
          <KpiCard value={totalDiscToday} label="Discrepancies" sub="logged today" accent={totalDiscToday > 0 ? 'amber' : 'green'}
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="w-full h-full"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>}
          />
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 pt-4 pb-1 flex items-center justify-between">
            <SectionLabel>Alerts</SectionLabel>
            {!hasAlerts && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full -mt-3">All clear</span>}
          </div>
          {!hasAlerts ? (
            <p className="px-4 pb-4 text-xs text-gray-400">No open complaints &gt;48h · No at-risk accounts · No unreviewed commitments</p>
          ) : (
            <div className="px-4 pb-2">
              {data.openComplaints48h.map(c => (
                <AlertRow key={c.id} tone="amber">
                  <span className="text-sm font-bold">{c.customer}<span className="font-normal"> — {c.category} open {c.hoursAgo}h</span></span>
                  {c.description && <span className="text-xs opacity-80">"{c.description}"</span>}
                  <span className="text-xs opacity-60">By {c.loggedBy}</span>
                </AlertRow>
              ))}
              {data.atRiskAccounts.map(a => (
                <AlertRow key={a.id} tone={a.outcome === 'lost' ? 'red' : 'amber'}>
                  <span className="text-sm font-bold flex items-center gap-2">{a.customer} <Badge label={a.outcome === 'lost' ? 'LOST' : 'AT RISK'} tone={a.outcome === 'lost' ? 'red' : 'amber'} /></span>
                  <span className="text-xs opacity-60">{a.rep} · {a.hoursAgo}h ago</span>
                </AlertRow>
              ))}
              {data.unreviewedCommitments.map(u => (
                <AlertRow key={u.id} tone="amber">
                  <span className="text-sm font-bold">{u.customer}<span className="font-normal"> — unreviewed commitment</span></span>
                  <span className="text-xs opacity-80">"{u.detail}"</span>
                  <span className="text-xs opacity-60">{u.rep} · {u.hoursAgo}h ago</span>
                </AlertRow>
              ))}
            </div>
          )}
        </div>

        {/* Today — tabbed */}
        <div>
          <SectionLabel>Today</SectionLabel>
          <TodayTabs data={data} />
        </div>

        {/* This Week */}
        <div>
          <SectionLabel>This week</SectionLabel>

          {/* Week KPI mini-row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <span className={`text-2xl font-bold leading-none block ${totalDiscWeek > 5 ? 'text-amber-700' : 'text-[#16205B]'}`}>{totalDiscWeek}</span>
              <p className="text-xs font-semibold text-gray-700 mt-1">Discrepancies</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <span className={`text-2xl font-bold leading-none block ${data.openComplaintsWeek > 0 ? 'text-amber-700' : 'text-[#16205B]'}`}>{data.totalComplaintsWeek}</span>
              <p className="text-xs font-semibold text-gray-700 mt-1">Complaints</p>
              {data.openComplaintsWeek > 0 && <p className="text-[10px] text-amber-600">{data.openComplaintsWeek} open</p>}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <span className="text-2xl font-bold leading-none block text-[#16205B]">{data.avgResolutionHours !== null ? `${data.avgResolutionHours}h` : '—'}</span>
              <p className="text-xs font-semibold text-gray-700 mt-1">Avg resolve</p>
            </div>
          </div>

          {/* Discrepancy breakdown */}
          {totalDiscWeek > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-800">Discrepancies by reason</p>
                <span className="text-base font-bold text-[#16205B]">{totalDiscWeek}</span>
              </div>
              <div className="space-y-2">
                {data.weekDiscrepancyReasons.map(r => <BreakdownRow key={r.reason} label={r.reason} count={r.count} max={maxDiscCount} colour="maroon" />)}
              </div>
              {data.weekDiscrepancyProducts.length > 0 && (
                <>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mt-4 mb-2">Most affected products</p>
                  <div className="space-y-1.5">
                    {data.weekDiscrepancyProducts.map((p, i) => (
                      <div key={p.product} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-gray-300 font-bold w-4 flex-shrink-0">{i + 1}</span>
                          <span className="text-xs text-gray-700 truncate">{p.product}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-900 ml-2">{p.count}×</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Complaints breakdown */}
          {data.totalComplaintsWeek > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3">
              <p className="text-xs font-bold text-gray-800 mb-3">Complaints by category</p>
              <div className="space-y-2">
                {data.weekComplaintCategories.map(c => <BreakdownRow key={c.category} label={c.category} count={c.count} max={maxCompCount} colour="navy" />)}
              </div>
            </div>
          )}

          {/* Sales activity by rep */}
          {data.weekVisitsByRep.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3">
              <p className="text-xs font-bold text-gray-800 mb-3">Sales activity by rep</p>
              <div className="space-y-4">
                {data.weekVisitsByRep.map(r => {
                  const mx = Math.max(r.types.routine, r.types.new_pitch, r.types.complaint_followup, r.types.delivery_issue, 1)
                  return (
                    <div key={r.rep}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-bold text-gray-900">{r.rep}</span>
                        <span className="text-sm font-bold text-[#16205B]">{r.total}</span>
                      </div>
                      <div className="space-y-1.5">
                        {([
                          { key: 'routine',            label: 'Routine',       colour: 'navy'  },
                          { key: 'new_pitch',          label: 'New pitch',     colour: 'navy'  },
                          { key: 'complaint_followup', label: 'Complaint f/u', colour: 'amber' },
                          { key: 'delivery_issue',     label: 'Delivery issue',colour: 'red'   },
                        ] as const).map(({ key, label, colour }) => (
                          <BreakdownRow key={key} label={label} count={r.types[key]} max={mx} colour={colour} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Prospects */}
          {data.prospectsThisWeek.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-800">Prospects visited</p>
                <Badge label={`${data.prospectsThisWeek.length}`} tone="navy" />
              </div>
              <div>
                {data.prospectsThisWeek.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400">{p.postcode} · {p.rep}{p.visitType ? ` · ${p.visitType}` : ''}</p>
                    </div>
                    <Badge label={cap(p.outcome)} tone={p.outcome==='positive' ? 'green' : p.outcome==='neutral' ? 'gray' : 'red'} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hunter / Farmer donut */}
          {hfTotal > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-800">This week's focus</p>
                <span className="text-[10px] text-gray-400">{hfTotal} total visits</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={hfData} cx="50%" cy="50%" innerRadius={28} outerRadius={42}
                        paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                        <Cell fill="#16205B" />
                        <Cell fill="#EB6619" />
                      </Pie>
                      <Tooltip formatter={(val: number, name: string) => [`${val} visits`, name]}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', padding: '4px 8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2.5 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#16205B] flex-shrink-0" />
                      <span className="text-xs text-gray-700 font-medium">Existing</span>
                    </div>
                    <span className="text-xs font-bold text-[#16205B]">{Math.round((existing / hfTotal) * 100)}% <span className="font-normal text-gray-400">({existing})</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#EB6619] flex-shrink-0" />
                      <span className="text-xs text-gray-700 font-medium">Prospects</span>
                    </div>
                    <span className="text-xs font-bold text-[#EB6619]">{Math.round((prospects / hfTotal) * 100)}% <span className="font-normal text-gray-400">({prospects})</span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="h-4" aria-hidden="true" />
      </main>
      )}

      <BottomNav items={[
        { href: '/screen4', label: 'Dashboard', icon: Icons.dashboard },
        { href: '/screen5', label: 'Admin',     icon: Icons.admin     },
      ]} />
    </div>
  )
}
