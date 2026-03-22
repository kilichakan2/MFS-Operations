'use client'

import { useState, useEffect, useCallback } from 'react'
import BottomNav, { Icons } from '@/components/BottomNav'
import AppHeader             from '@/components/AppHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenComplaint       { id: string; customer: string; category: string; loggedBy: string; hoursAgo: number }
interface AtRiskAccount       { id: string; customer: string; outcome: 'at_risk'|'lost'; rep: string; hoursAgo: number }
interface UnreviewedCommitment{ id: string; customer: string; detail: string; rep: string; hoursAgo: number }
interface Discrepancy         { id: string; customer: string; product: string; status: 'short'|'not_sent'; reason: string; loggedBy: string; createdAt: string }
interface TodayComplaint      { id: string; customer: string; category: string; status: 'open'|'resolved'; loggedBy: string; createdAt: string }
interface TodayVisit          { rep: string; count: number; outcomes: { positive: number; neutral: number; at_risk: number; lost: number } }
interface WeekDiscrepancyByReason   { reason: string; count: number }
interface WeekDiscrepancyByProduct  { product: string; count: number }
interface WeekComplaintByCategory   { category: string; count: number }
interface WeekVisitByRep      { rep: string; total: number; types: { routine: number; new_pitch: number; complaint_followup: number; delivery_issue: number } }
interface Prospect            { name: string; postcode: string; outcome: string; rep: string }

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
  avgResolutionHours:      number | null
  totalComplaintsWeek:     number
  openComplaintsWeek:      number
}

/** Format ISO timestamp → "14:32" (24h UK time) */
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
  } catch { return '' }
}

const EMPTY: DashboardData = {
  openComplaints48h: [], atRiskAccounts: [], unreviewedCommitments: [],
  discrepanciesToday: [], complaintsTodayList: [], visitsToday: [],
  weekDiscrepancyReasons: [], weekDiscrepancyProducts: [], weekComplaintCategories: [],
  weekVisitsByRep: [], prospectsThisWeek: [],
  avgResolutionHours: null, totalComplaintsWeek: 0, openComplaintsWeek: 0,
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold tracking-[0.25em] uppercase text-gray-400 mb-3 px-0.5">
      {children}
    </h2>
  )
}

function StatCard({ value, label, accent, sub }: {
  value: string|number; label: string; accent?: 'red'|'amber'|'green'|'neutral'; sub?: string
}) {
  const vc = accent==='red' ? 'text-red-700' : accent==='amber' ? 'text-amber-700' : accent==='green' ? 'text-green-700' : 'text-[#16205B]'
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1">
      <span className={`text-3xl font-bold leading-none ${vc}`}>{value}</span>
      <span className="text-xs font-semibold text-gray-500 leading-tight">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function AlertCard({ tone, children }: { tone: 'red'|'amber'; children: React.ReactNode }) {
  const bg  = tone==='red' ? 'bg-red-50 border-red-200'   : 'bg-amber-50 border-amber-200'
  const dot = tone==='red' ? 'bg-red-500'                 : 'bg-amber-500'
  const lbl = tone==='red' ? 'text-red-800'               : 'text-amber-800'
  return (
    <div className={`border rounded-2xl p-4 flex items-start gap-3 ${bg}`}>
      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
      <div className={`flex flex-col gap-0.5 min-w-0 ${lbl}`}>{children}</div>
    </div>
  )
}

function AllClear() {
  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium text-green-800">
        No open complaints over 48 hours. No at-risk accounts this week. No unreviewed commitments.
      </p>
    </div>
  )
}

function BreakdownRow({ label, count, max, colour='navy' }: {
  label: string; count: number; max: number; colour?: 'navy'|'maroon'|'amber'|'red'
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  const bar = colour==='maroon' ? 'bg-[#590129]' : colour==='amber' ? 'bg-amber-500' : colour==='red' ? 'bg-red-500' : 'bg-[#16205B]'
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-32 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-900 w-5 text-right flex-shrink-0">{count}</span>
    </div>
  )
}

function ZoneDivider() { return <div className="h-px bg-gray-100 my-2" /> }

function Badge({ label, tone }: { label: string; tone: 'red'|'amber'|'green'|'gray'|'navy' }) {
  const s = tone==='red' ? 'bg-red-100 text-red-700' : tone==='amber' ? 'bg-amber-100 text-amber-700'
    : tone==='green' ? 'bg-green-100 text-green-700' : tone==='navy' ? 'bg-blue-100 text-[#16205B]' : 'bg-gray-100 text-gray-600'
  return <span className={`inline-block text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${s}`}>{label}</span>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Screen4Page() {
  const [data,     setData]     = useState<DashboardData>(EMPTY)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `Failed to load dashboard (${res.status})`)
        return
      }
      setData(await res.json())
      setLastFetch(new Date())
    } catch {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => { fetchData() }, [fetchData])

  const hasAlerts =
    data.openComplaints48h.length > 0    ||
    data.atRiskAccounts.length > 0       ||
    data.unreviewedCommitments.length > 0

  const totalDiscrepanciesWeek = data.weekDiscrepancyReasons.reduce((s, r) => s + r.count, 0)
  const maxDiscrepancyCount    = Math.max(...data.weekDiscrepancyReasons.map((r) => r.count), 1)
  const maxComplaintCount      = Math.max(...data.weekComplaintCategories.map((r) => r.count), 1)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <AppHeader
        title="Operations"
        maxWidth="2xl"
        actions={
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            title="Refresh dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-40"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
            {loading ? 'Loading…' : lastFetch ? lastFetch.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Refresh'}
          </button>
        }
      />

      {/* Error banner */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={fetchData} className="text-red-600 text-xs font-bold hover:text-red-800">Retry</button>
          </div>
        </div>
      )}

      {loading && !lastFetch ? <Spinner /> : (

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-8">

        {/* ════════════════════════════════════════════════════════════════
            ZONE 1 — ALERTS
        ════════════════════════════════════════════════════════════════ */}
        <section aria-label="Alerts">
          <SectionTitle>Alerts</SectionTitle>

          {!hasAlerts && <AllClear />}

          {hasAlerts && (
            <div className="space-y-2.5">
              {data.openComplaints48h.map((c) => (
                <AlertCard key={c.id} tone="amber">
                  <span className="text-sm font-bold leading-snug">
                    {c.customer}
                    <span className="font-normal"> — {c.category} complaint open {c.hoursAgo}h</span>
                  </span>
                  <span className="text-xs">Logged by {c.loggedBy} · needs resolution</span>
                </AlertCard>
              ))}
              {data.atRiskAccounts.map((a) => (
                <AlertCard key={a.id} tone={a.outcome === 'lost' ? 'red' : 'amber'}>
                  <span className="text-sm font-bold leading-snug flex items-center gap-2">
                    {a.customer}
                    <Badge label={a.outcome === 'lost' ? 'LOST' : 'AT RISK'} tone={a.outcome === 'lost' ? 'red' : 'amber'} />
                  </span>
                  <span className="text-xs">Logged by {a.rep} · {a.hoursAgo}h ago</span>
                </AlertCard>
              ))}
              {data.unreviewedCommitments.map((u) => (
                <AlertCard key={u.id} tone="amber">
                  <span className="text-sm font-bold leading-snug">
                    {u.customer}<span className="font-normal"> — unreviewed commitment</span>
                  </span>
                  <span className="text-xs leading-relaxed">"{u.detail}"</span>
                  <span className="text-xs mt-0.5">{u.rep} · {u.hoursAgo}h ago</span>
                </AlertCard>
              ))}
            </div>
          )}
        </section>

        <ZoneDivider />

        {/* ════════════════════════════════════════════════════════════════
            ZONE 2 — TODAY
        ════════════════════════════════════════════════════════════════ */}
        <section aria-label="Today">
          <SectionTitle>Today</SectionTitle>

          {/* Discrepancies today */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-gray-900">Discrepancies</h3>
              <Badge label={`${data.discrepanciesToday.length} logged`} tone={data.discrepanciesToday.length === 0 ? 'green' : 'amber'} />
            </div>
            {data.discrepanciesToday.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-sm text-gray-400 font-medium">No discrepancies today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.discrepanciesToday.map((d) => (
                  <div key={d.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{d.customer}</p>
                      <p className="text-xs text-gray-400 truncate">{d.product} · {d.reason}</p>
                      <p className="text-xs text-gray-300 mt-0.5">{d.loggedBy} · {fmtTime(d.createdAt)}</p>
                    </div>
                    <Badge label={d.status === 'not_sent' ? 'NOT SENT' : 'SHORT'} tone={d.status === 'not_sent' ? 'red' : 'amber'} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Complaints today */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-gray-900">Complaints</h3>
              <div className="flex items-center gap-1.5">
                <Badge label={`${data.complaintsTodayList.filter(c => c.status==='open').length} open`} tone={data.complaintsTodayList.filter(c => c.status==='open').length > 0 ? 'amber' : 'green'} />
                <Badge label={`${data.complaintsTodayList.filter(c => c.status==='resolved').length} resolved`} tone="green" />
              </div>
            </div>
            {data.complaintsTodayList.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-sm text-gray-400 font-medium">No complaints today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.complaintsTodayList.map((c) => (
                  <div key={c.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.customer}</p>
                      <p className="text-xs text-gray-400 truncate">{c.category} · {c.loggedBy} · {fmtTime(c.createdAt)}</p>
                    </div>
                    <Badge label={c.status === 'open' ? 'OPEN' : 'RESOLVED'} tone={c.status === 'open' ? 'amber' : 'green'} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Visits today */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2.5">Visits</h3>
            {data.visitsToday.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-sm text-gray-400 font-medium">No visits logged today</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {data.visitsToday.map((v) => {
                  const warn = v.outcomes.at_risk > 0 || v.outcomes.lost > 0
                  return (
                    <div key={v.rep} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{v.rep}</span>
                        {warn && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                      </div>
                      <span className="text-3xl font-bold text-[#16205B] leading-none">{v.count}</span>
                      <span className="text-xs text-gray-400">visits today</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {v.outcomes.positive > 0 && <Badge label={`${v.outcomes.positive} positive`} tone="green" />}
                        {v.outcomes.at_risk  > 0 && <Badge label={`${v.outcomes.at_risk} at risk`}   tone="amber" />}
                        {v.outcomes.lost     > 0 && <Badge label={`${v.outcomes.lost} lost`}          tone="red"   />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <ZoneDivider />

        {/* ════════════════════════════════════════════════════════════════
            ZONE 3 — THIS WEEK
        ════════════════════════════════════════════════════════════════ */}
        <section aria-label="This week">
          <SectionTitle>This week</SectionTitle>

          {/* Summary stat row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard value={totalDiscrepanciesWeek} label="Discrepancies" accent={totalDiscrepanciesWeek > 5 ? 'amber' : 'neutral'} />
            <StatCard value={data.totalComplaintsWeek} label="Complaints" accent={data.openComplaintsWeek > 0 ? 'amber' : 'neutral'} sub={data.openComplaintsWeek > 0 ? `${data.openComplaintsWeek} open` : undefined} />
            <StatCard value={data.avgResolutionHours !== null ? `${data.avgResolutionHours}h` : '—'} label="Avg resolve time" accent="neutral" />
          </div>

          {/* Discrepancies this week */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Discrepancies</h3>
              <span className="text-2xl font-bold text-[#16205B]">{totalDiscrepanciesWeek}</span>
            </div>
            {totalDiscrepanciesWeek === 0 ? (
              <p className="text-sm text-gray-400">None this week</p>
            ) : (
              <>
                <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">By reason</p>
                <div className="space-y-2.5 mb-5">
                  {data.weekDiscrepancyReasons.map((r) => (
                    <BreakdownRow key={r.reason} label={r.reason} count={r.count} max={maxDiscrepancyCount} colour="maroon" />
                  ))}
                </div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">Most affected products</p>
                <div className="space-y-1.5">
                  {data.weekDiscrepancyProducts.map((p, i) => (
                    <div key={p.product} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-300 font-bold w-4 flex-shrink-0">{i + 1}</span>
                        <span className="text-sm text-gray-700 truncate">{p.product}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900 flex-shrink-0 ml-2">{p.count}×</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Complaints this week */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Complaints</h3>
              <span className="text-2xl font-bold text-[#16205B]">{data.totalComplaintsWeek}</span>
            </div>
            {data.totalComplaintsWeek === 0 ? (
              <p className="text-sm text-gray-400">None this week</p>
            ) : (
              <>
                <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">By category</p>
                <div className="space-y-2.5">
                  {data.weekComplaintCategories.map((c) => (
                    <BreakdownRow key={c.category} label={c.category} count={c.count} max={maxComplaintCount} colour="navy" />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sales activity this week */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Sales activity</h3>
            {data.weekVisitsByRep.length === 0 ? (
              <p className="text-sm text-gray-400">No visits logged this week</p>
            ) : (
              <div className="space-y-5">
                {data.weekVisitsByRep.map((r) => {
                  const mx = Math.max(r.types.routine, r.types.new_pitch, r.types.complaint_followup, r.types.delivery_issue, 1)
                  return (
                    <div key={r.rep}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-900">{r.rep}</span>
                        <span className="text-xl font-bold text-[#16205B]">{r.total} visits</span>
                      </div>
                      <div className="space-y-1.5">
                        {([
                          { key: 'routine',            label: 'Routine',            colour: 'navy'  },
                          { key: 'new_pitch',          label: 'New pitch',          colour: 'navy'  },
                          { key: 'complaint_followup', label: 'Complaint follow-up', colour: 'amber' },
                          { key: 'delivery_issue',     label: 'Delivery issue',     colour: 'red'   },
                        ] as const).map(({ key, label, colour }) => (
                          <BreakdownRow key={key} label={label} count={r.types[key]} max={mx} colour={colour} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Prospects this week */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Prospects</h3>
              <Badge label={`${data.prospectsThisWeek.length} visited`} tone="navy" />
            </div>
            {data.prospectsThisWeek.length === 0 ? (
              <p className="text-sm text-gray-400">No prospects visited this week</p>
            ) : (
              <div className="space-y-2">
                {data.prospectsThisWeek.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.postcode} · {p.rep}</p>
                    </div>
                    <Badge label={p.outcome} tone={p.outcome==='positive'||p.outcome==='Positive' ? 'green' : p.outcome==='neutral'||p.outcome==='Neutral' ? 'gray' : 'red'} />
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>

        <div className="h-8" aria-hidden="true" />
      </main>
      )}

      <BottomNav items={[
        { href: '/screen4', label: 'Dashboard', icon: Icons.dashboard },
        { href: '/screen5', label: 'Admin',     icon: Icons.admin     },
      ]} />
    </div>
  )
}
