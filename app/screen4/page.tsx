'use client'

import { useState } from 'react'
import BottomNav, { Icons } from '@/components/BottomNav'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenComplaint {
  id:         string
  customer:   string
  category:   string
  loggedBy:   string
  hoursAgo:   number
}

interface AtRiskAccount {
  id:       string
  customer: string
  outcome:  'at_risk' | 'lost'
  rep:      string
  hoursAgo: number
}

interface UnreviewedCommitment {
  id:         string
  customer:   string
  detail:     string
  rep:        string
  hoursAgo:   number
}

interface Discrepancy {
  id:       string
  customer: string
  product:  string
  status:   'short' | 'not_sent'
  reason:   string
}

interface TodayComplaint {
  id:       string
  customer: string
  category: string
  status:   'open' | 'resolved'
  loggedBy: string
}

interface TodayVisit {
  rep:      string
  count:    number
  outcomes: { positive: number; neutral: number; at_risk: number; lost: number }
}

interface WeekDiscrepancyByReason {
  reason: string
  count:  number
}

interface WeekDiscrepancyByProduct {
  product: string
  count:   number
}

interface WeekComplaintByCategory {
  category: string
  count:    number
}

interface WeekVisitByRep {
  rep:      string
  total:    number
  types:    { routine: number; new_pitch: number; complaint_followup: number; delivery_issue: number }
}

interface Prospect {
  name:     string
  postcode: string
  outcome:  string
  rep:      string
}

interface DashboardData {
  // Zone 1 — Alerts
  openComplaints48h:      OpenComplaint[]
  atRiskAccounts:         AtRiskAccount[]
  unreviewedCommitments:  UnreviewedCommitment[]
  // Zone 2 — Today
  discrepanciesToday:     Discrepancy[]
  complaintsTodayList:    TodayComplaint[]
  visitsToday:            TodayVisit[]
  // Zone 3 — This week
  weekDiscrepancyReasons: WeekDiscrepancyByReason[]
  weekDiscrepancyProducts: WeekDiscrepancyByProduct[]
  weekComplaintCategories: WeekComplaintByCategory[]
  weekVisitsByRep:         WeekVisitByRep[]
  prospectsThisWeek:       Prospect[]
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const BUSY_DATA: DashboardData = {
  openComplaints48h: [
    { id: 'c1', customer: 'The Manor Hotel',    category: 'Weight',   loggedBy: 'Omer',  hoursAgo: 61 },
    { id: 'c2', customer: 'Milano Steakhouse',  category: 'Quality',  loggedBy: 'Emre',  hoursAgo: 73 },
  ],
  atRiskAccounts: [
    { id: 'v1', customer: 'Taj Brasserie',      outcome: 'at_risk', rep: 'Mehmet', hoursAgo: 5  },
    { id: 'v2', customer: 'Cornerhouse Leeds',  outcome: 'lost',    rep: 'Omer',   hoursAgo: 11 },
  ],
  unreviewedCommitments: [
    { id: 'v3', customer: 'Al Turka Restaurant', detail: 'Agreed 10% discount on lamb shanks for next 4 weeks', rep: 'Omer',   hoursAgo: 26 },
    { id: 'v4', customer: 'The Victoria',        detail: 'Free delivery on orders over £400 until end of month',  rep: 'Mehmet', hoursAgo: 31 },
  ],
  discrepanciesToday: [
    { id: 'd1', customer: 'Al Turka Restaurant', product: 'Lamb Shoulder',  status: 'short',    reason: 'Supplier short' },
    { id: 'd2', customer: 'The Victoria',        product: 'Chicken Breast', status: 'not_sent', reason: 'Out of stock'   },
    { id: 'd3', customer: 'Shiraz Kitchen',      product: 'Lamb Shank',     status: 'short',    reason: 'Butcher error'  },
  ],
  complaintsTodayList: [
    { id: 'ct1', customer: 'The Manor Hotel',   category: 'Delivery', status: 'open',     loggedBy: 'Daz'   },
    { id: 'ct2', customer: 'Naz Restaurant',    category: 'Weight',   status: 'resolved', loggedBy: 'Emre'  },
  ],
  visitsToday: [
    { rep: 'Omer',   count: 4, outcomes: { positive: 2, neutral: 1, at_risk: 0, lost: 1 } },
    { rep: 'Mehmet', count: 3, outcomes: { positive: 1, neutral: 1, at_risk: 1, lost: 0 } },
  ],
  weekDiscrepancyReasons: [
    { reason: 'Supplier short', count: 7  },
    { reason: 'Out of stock',   count: 5  },
    { reason: 'Butcher error',  count: 3  },
    { reason: 'Other',          count: 1  },
  ],
  weekDiscrepancyProducts: [
    { product: 'Lamb Shoulder',  count: 6 },
    { product: 'Chicken Breast', count: 4 },
    { product: 'Lamb Shank',     count: 3 },
  ],
  weekComplaintCategories: [
    { category: 'Weight',       count: 5 },
    { category: 'Delivery',     count: 4 },
    { category: 'Quality',      count: 2 },
    { category: 'Missing item', count: 1 },
  ],
  weekVisitsByRep: [
    {
      rep:   'Omer',
      total: 14,
      types: { routine: 7, new_pitch: 4, complaint_followup: 2, delivery_issue: 1 },
    },
    {
      rep:   'Mehmet',
      total: 11,
      types: { routine: 6, new_pitch: 2, complaint_followup: 2, delivery_issue: 1 },
    },
  ],
  prospectsThisWeek: [
    { name: 'Orion Events Ltd',     postcode: 'LS1 4AP', outcome: 'Positive',  rep: 'Omer'   },
    { name: 'The Copper Kettle',    postcode: 'M2 3BW',  outcome: 'Neutral',   rep: 'Mehmet' },
    { name: 'Yorkshire Grill Co.',  postcode: 'BD1 1HX', outcome: 'Positive',  rep: 'Omer'   },
  ],
}

const CLEAR_DATA: DashboardData = {
  openComplaints48h:       [],
  atRiskAccounts:          [],
  unreviewedCommitments:   [],
  discrepanciesToday:      [],
  complaintsTodayList:     [],
  visitsToday: [
    { rep: 'Omer',   count: 3, outcomes: { positive: 2, neutral: 1, at_risk: 0, lost: 0 } },
    { rep: 'Mehmet', count: 2, outcomes: { positive: 2, neutral: 0, at_risk: 0, lost: 0 } },
  ],
  weekDiscrepancyReasons:  [],
  weekDiscrepancyProducts: [],
  weekComplaintCategories: [],
  weekVisitsByRep: [
    {
      rep:   'Omer',
      total: 8,
      types: { routine: 4, new_pitch: 3, complaint_followup: 1, delivery_issue: 0 },
    },
    {
      rep:   'Mehmet',
      total: 7,
      types: { routine: 4, new_pitch: 2, complaint_followup: 1, delivery_issue: 0 },
    },
  ],
  prospectsThisWeek: [
    { name: 'Orion Events Ltd', postcode: 'LS1 4AP', outcome: 'Positive', rep: 'Omer' },
  ],
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold tracking-[0.25em] uppercase text-gray-400 mb-3 px-0.5">
      {children}
    </h2>
  )
}

/** Stat card — large number with a label */
function StatCard({
  value,
  label,
  accent,
  sub,
}: {
  value:   string | number
  label:   string
  accent?: 'red' | 'amber' | 'green' | 'neutral'
  sub?:    string
}) {
  const valueColour =
    accent === 'red'     ? 'text-red-700'
    : accent === 'amber' ? 'text-amber-700'
    : accent === 'green' ? 'text-green-700'
    : 'text-[#16205B]'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1">
      <span className={`text-3xl font-bold leading-none ${valueColour}`}>
        {value}
      </span>
      <span className="text-xs font-semibold text-gray-500 leading-tight">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

/** Alert card — tinted background, used for Zone 1 entries */
function AlertCard({
  tone,
  children,
}: {
  tone:     'red' | 'amber'
  children: React.ReactNode
}) {
  const bg     = tone === 'red' ? 'bg-red-50 border-red-200'   : 'bg-amber-50 border-amber-200'
  const dot    = tone === 'red' ? 'bg-red-500'                 : 'bg-amber-500'
  const label  = tone === 'red' ? 'text-red-800'               : 'text-amber-800'
  const sub    = tone === 'red' ? 'text-red-600'               : 'text-amber-700'

  return (
    <div className={`border rounded-2xl p-4 flex items-start gap-3 ${bg}`}>
      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
      <div className={`flex flex-col gap-0.5 min-w-0 ${label}`}>
        {children}
      </div>
    </div>
  )
}

/** All-clear state for Zone 1 */
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

/** Horizontal bar for breakdown rows */
function BreakdownRow({
  label,
  count,
  max,
  colour = 'navy',
}: {
  label:   string
  count:   number
  max:     number
  colour?: 'navy' | 'maroon' | 'amber' | 'red'
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  const barColour =
    colour === 'maroon' ? 'bg-[#590129]'
    : colour === 'amber'? 'bg-amber-500'
    : colour === 'red'  ? 'bg-red-500'
    : 'bg-[#16205B]'

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-32 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-gray-900 w-5 text-right flex-shrink-0">{count}</span>
    </div>
  )
}

/** Divider between zones */
function ZoneDivider() {
  return <div className="h-px bg-gray-100 my-2" />
}

/** Badge pill */
function Badge({
  label,
  tone,
}: {
  label: string
  tone:  'red' | 'amber' | 'green' | 'gray' | 'navy'
}) {
  const styles =
    tone === 'red'   ? 'bg-red-100 text-red-700'
    : tone === 'amber' ? 'bg-amber-100 text-amber-700'
    : tone === 'green' ? 'bg-green-100 text-green-700'
    : tone === 'navy'  ? 'bg-blue-100 text-[#16205B]'
    : 'bg-gray-100 text-gray-600'

  return (
    <span className={`inline-block text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${styles}`}>
      {label}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Screen4Page() {
  const [mode, setMode] = useState<'busy' | 'clear'>('busy')
  const data = mode === 'busy' ? BUSY_DATA : CLEAR_DATA

  const hasAlerts =
    data.openComplaints48h.length > 0     ||
    data.atRiskAccounts.length > 0        ||
    data.unreviewedCommitments.length > 0

  const totalDiscrepanciesWeek = data.weekDiscrepancyReasons.reduce((s, r) => s + r.count, 0)
  const maxDiscrepancyCount    = Math.max(...data.weekDiscrepancyReasons.map((r) => r.count), 1)
  const totalComplaintsWeek    = data.weekComplaintCategories.reduce((s, r) => s + r.count, 0)
  const maxComplaintCount      = Math.max(...data.weekComplaintCategories.map((r) => r.count), 1)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-[#16205B] px-5 pt-14 pb-5 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase">
              MFS Global
            </p>
            <h1 className="text-white text-lg font-bold leading-tight mt-0.5">
              Operations
            </h1>
          </div>

          {/* Dev toggle — remove before production */}
          <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
            {(['busy', 'clear'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                  mode === m
                    ? 'bg-[#EB6619] text-white'
                    : 'text-white/60 hover:text-white',
                ].join(' ')}
              >
                {m === 'busy' ? 'Busy' : 'Clear'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-8">

        {/* ════════════════════════════════════════════════════════════════
            ZONE 1 — ALERTS
        ════════════════════════════════════════════════════════════════ */}
        <section aria-label="Alerts">
          <SectionTitle>Alerts</SectionTitle>

          {!hasAlerts && <AllClear />}

          {hasAlerts && (
            <div className="space-y-2.5">

              {/* Open complaints over 48h */}
              {data.openComplaints48h.map((c) => (
                <AlertCard key={c.id} tone="amber">
                  <span className="text-sm font-bold leading-snug">
                    {c.customer}
                    <span className="font-normal"> — {c.category} complaint open {c.hoursAgo}h</span>
                  </span>
                  <span className="text-xs">
                    Logged by {c.loggedBy} · needs resolution
                  </span>
                </AlertCard>
              ))}

              {/* At risk / Lost accounts */}
              {data.atRiskAccounts.map((a) => (
                <AlertCard key={a.id} tone={a.outcome === 'lost' ? 'red' : 'amber'}>
                  <span className="text-sm font-bold leading-snug flex items-center gap-2">
                    {a.customer}
                    <Badge
                      label={a.outcome === 'lost' ? 'LOST' : 'AT RISK'}
                      tone={a.outcome === 'lost' ? 'red' : 'amber'}
                    />
                  </span>
                  <span className="text-xs">
                    Logged by {a.rep} · {a.hoursAgo}h ago
                  </span>
                </AlertCard>
              ))}

              {/* Unreviewed commitments */}
              {data.unreviewedCommitments.map((u) => (
                <AlertCard key={u.id} tone="amber">
                  <span className="text-sm font-bold leading-snug">
                    {u.customer}
                    <span className="font-normal"> — unreviewed commitment</span>
                  </span>
                  <span className="text-xs leading-relaxed">
                    "{u.detail}"
                  </span>
                  <span className="text-xs mt-0.5">
                    {u.rep} · {u.hoursAgo}h ago
                  </span>
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

          {/* ── Discrepancies today ──────────────────────────────────────── */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-gray-900">Discrepancies</h3>
              <Badge
                label={`${data.discrepanciesToday.length} logged`}
                tone={data.discrepanciesToday.length === 0 ? 'green' : 'amber'}
              />
            </div>

            {data.discrepanciesToday.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-sm text-gray-400 font-medium">No discrepancies today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.discrepanciesToday.map((d) => (
                  <div
                    key={d.id}
                    className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{d.customer}</p>
                      <p className="text-xs text-gray-400 truncate">{d.product} · {d.reason}</p>
                    </div>
                    <Badge
                      label={d.status === 'not_sent' ? 'NOT SENT' : 'SHORT'}
                      tone={d.status === 'not_sent' ? 'red' : 'amber'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Complaints today ─────────────────────────────────────────── */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-gray-900">Complaints</h3>
              <div className="flex items-center gap-1.5">
                <Badge
                  label={`${data.complaintsTodayList.filter((c) => c.status === 'open').length} open`}
                  tone={data.complaintsTodayList.filter((c) => c.status === 'open').length > 0 ? 'amber' : 'green'}
                />
                <Badge
                  label={`${data.complaintsTodayList.filter((c) => c.status === 'resolved').length} resolved`}
                  tone="green"
                />
              </div>
            </div>

            {data.complaintsTodayList.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-sm text-gray-400 font-medium">No complaints today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.complaintsTodayList.map((c) => (
                  <div
                    key={c.id}
                    className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.customer}</p>
                      <p className="text-xs text-gray-400 truncate">{c.category} · logged by {c.loggedBy}</p>
                    </div>
                    <Badge
                      label={c.status === 'open' ? 'OPEN' : 'RESOLVED'}
                      tone={c.status === 'open' ? 'amber' : 'green'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Visits today ─────────────────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2.5">Visits</h3>
            {data.visitsToday.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-sm text-gray-400 font-medium">No visits logged today</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {data.visitsToday.map((v) => {
                  const hasWarning = v.outcomes.at_risk > 0 || v.outcomes.lost > 0
                  return (
                    <div
                      key={v.rep}
                      className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                          {v.rep}
                        </span>
                        {hasWarning && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-3xl font-bold text-[#16205B] leading-none">
                        {v.count}
                      </span>
                      <span className="text-xs text-gray-400">visits today</span>
                      {/* Outcome mini-summary */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {v.outcomes.positive > 0 && (
                          <Badge label={`${v.outcomes.positive} positive`} tone="green" />
                        )}
                        {v.outcomes.at_risk > 0 && (
                          <Badge label={`${v.outcomes.at_risk} at risk`} tone="amber" />
                        )}
                        {v.outcomes.lost > 0 && (
                          <Badge label={`${v.outcomes.lost} lost`} tone="red" />
                        )}
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

          {/* ── Discrepancies this week ──────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Discrepancies</h3>
              <span className="text-2xl font-bold text-[#16205B]">{totalDiscrepanciesWeek}</span>
            </div>

            {totalDiscrepanciesWeek === 0 ? (
              <p className="text-sm text-gray-400">None this week</p>
            ) : (
              <>
                <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">
                  By reason
                </p>
                <div className="space-y-2.5 mb-5">
                  {data.weekDiscrepancyReasons.map((r) => (
                    <BreakdownRow
                      key={r.reason}
                      label={r.reason}
                      count={r.count}
                      max={maxDiscrepancyCount}
                      colour="maroon"
                    />
                  ))}
                </div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">
                  Most affected products
                </p>
                <div className="space-y-1.5">
                  {data.weekDiscrepancyProducts.map((p, i) => (
                    <div key={p.product} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-300 font-bold w-4 flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-700 truncate">{p.product}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900 flex-shrink-0 ml-2">
                        {p.count}×
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Complaints this week ─────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Complaints</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-[#16205B]">{totalComplaintsWeek}</span>
              </div>
            </div>

            {totalComplaintsWeek === 0 ? (
              <p className="text-sm text-gray-400">None this week</p>
            ) : (
              <>
                <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">
                  By category
                </p>
                <div className="space-y-2.5">
                  {data.weekComplaintCategories.map((c) => (
                    <BreakdownRow
                      key={c.category}
                      label={c.category}
                      count={c.count}
                      max={maxComplaintCount}
                      colour="navy"
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Sales activity this week ─────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Sales activity</h3>
            <div className="space-y-5">
              {data.weekVisitsByRep.map((r) => {
                const maxType = Math.max(
                  r.types.routine,
                  r.types.new_pitch,
                  r.types.complaint_followup,
                  r.types.delivery_issue,
                  1
                )
                return (
                  <div key={r.rep}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-900">{r.rep}</span>
                      <span className="text-xl font-bold text-[#16205B]">
                        {r.total} visits
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { key: 'routine',            label: 'Routine'           },
                        { key: 'new_pitch',          label: 'New pitch'         },
                        { key: 'complaint_followup', label: 'Complaint follow-up'},
                        { key: 'delivery_issue',     label: 'Delivery issue'    },
                      ].map(({ key, label }) => {
                        const count = r.types[key as keyof typeof r.types]
                        return (
                          <BreakdownRow
                            key={key}
                            label={label}
                            count={count}
                            max={maxType}
                            colour={
                              key === 'new_pitch'          ? 'navy'
                              : key === 'complaint_followup' ? 'amber'
                              : key === 'delivery_issue'     ? 'red'
                              : 'navy'
                            }
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Prospects this week ──────────────────────────────────────── */}
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
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.postcode} · {p.rep}</p>
                    </div>
                    <Badge
                      label={p.outcome}
                      tone={
                        p.outcome === 'Positive' ? 'green'
                        : p.outcome === 'Neutral' ? 'gray'
                        : 'red'
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>

        {/* Bottom padding for home indicator */}
        <div className="h-8" aria-hidden="true" />

      </main>
      <BottomNav items={[
        { href: '/screen4', label: 'Dashboard', icon: Icons.dashboard },
        { href: '/screen5', label: 'Admin',     icon: Icons.admin     },
      ]} />
    </div>
  )
}
