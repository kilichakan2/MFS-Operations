'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import RoleNav   from '@/components/RoleNav'
import AppHeader from '@/components/AppHeader'
import {
  Card, CardHead, RangeTabs, RangeLabel, PageHeading,
  EmptyState, RowHead, TableRow, ListRow,
} from '@/app/dashboard/admin/_components/primitives'

// ─── Types (mirrors /api/admin/visits response shape) ────────────────────────

interface VisitRow {
  id:             string
  customer:       string
  rep:            string
  visitType:      string
  outcome:        string
  notes:          string | null
  pipelineStatus: string | null
  createdAt:      string
}

// ─── Range helpers (mirror /dashboard/admin) ─────────────────────────────────

type Preset = 'today' | 'week' | 'month' | 'quarter'

interface DateRange { from: string; to: string; label: string }

const RANGES: { id: Preset; label: string }[] = [
  { id: 'today',   label: 'Today'        },
  { id: 'week',    label: 'This week'    },
  { id: 'month',   label: 'This month'   },
  { id: 'quarter', label: 'This quarter' },
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

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/London',
    }).replace(',', '')
  } catch { return '' }
}

// ─── Filter chip strip (rep / type / outcome) ────────────────────────────────

type SecondaryFilter<T extends string> = { id: T; label: string }
function SecondaryChips<T extends string>({
  active, options, onChange,
}: { active: T; options: SecondaryFilter<T>[]; onChange: (v: T)=>void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {options.map(opt => (
        <button key={opt.id} type="button" onClick={() => onChange(opt.id)}
          className={[
            'flex-shrink-0 h-7 px-3 rounded-full text-xs font-bold transition-all',
            active === opt.id
              ? 'bg-mfs-navy text-white shadow-sm'
              : 'bg-white text-mfs-neutral-700 border border-mfs-neutral-200',
          ].join(' ')}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const TYPE_FILTERS: SecondaryFilter<'all' | 'routine' | 'new_pitch' | 'complaint_followup' | 'delivery_issue'>[] = [
  { id: 'all',                label: 'All types'      },
  { id: 'routine',            label: 'Routine'        },
  { id: 'new_pitch',          label: 'New pitch'      },
  { id: 'complaint_followup', label: 'Complaint f/u'  },
  { id: 'delivery_issue',     label: 'Delivery issue' },
]
const OUTCOME_FILTERS: SecondaryFilter<'all' | 'positive' | 'neutral' | 'at_risk' | 'lost'>[] = [
  { id: 'all',      label: 'All outcomes' },
  { id: 'positive', label: 'Positive'     },
  { id: 'neutral',  label: 'Neutral'      },
  { id: 'at_risk',  label: 'At risk'      },
  { id: 'lost',     label: 'Lost'         },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminVisitsPage() {
  return (
    <Suspense fallback={null}>
      <AdminVisitsPageBody />
    </Suspense>
  )
}

function AdminVisitsPageBody() {
  const [rows,      setRows]      = useState<VisitRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [preset,    setPreset]    = useState<Preset>('today')
  const [typeFilter,    setTypeFilter]    = useState<'all' | 'routine' | 'new_pitch' | 'complaint_followup' | 'delivery_issue'>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'positive' | 'neutral' | 'at_risk' | 'lost'>('all')

  const range = useMemo(() => buildRange(preset), [preset])

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to })
      if (typeFilter    !== 'all') qs.set('type',    typeFilter)
      if (outcomeFilter !== 'all') qs.set('outcome', outcomeFilter)
      const res = await fetch(`/api/admin/visits?${qs.toString()}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `HTTP ${res.status}`); return
      }
      const data = await res.json()
      setRows((data.rows ?? []) as VisitRow[])
      setLastFetch(new Date())
    } catch { setError('Network error — check your connection') }
    finally { setLoading(false) }
  }, [range.from, range.to, typeFilter, outcomeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="min-h-screen bg-mfs-soft-neutral">
      <AppHeader title="All visits" maxWidth="4xl"
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

        <PageHeading>Admin · All reps · Visits</PageHeading>

        {/* Range tabs + caption */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] md:text-[11px] font-semibold tracking-[0.12em] uppercase text-mfs-neutral-500">
            Range
          </span>
          <RangeTabs<Preset> value={preset} onChange={setPreset} ranges={RANGES} scrollOnSmall />
          <RangeLabel from={range.from} to={range.to} />
        </div>

        {/* Secondary filter chip strips */}
        <div className="flex flex-col gap-2">
          <SecondaryChips active={typeFilter}    options={TYPE_FILTERS}    onChange={setTypeFilter} />
          <SecondaryChips active={outcomeFilter} options={OUTCOME_FILTERS} onChange={setOutcomeFilter} />
        </div>

        <Card>
          <CardHead title={`Visits — ${range.label}`} count={rows.length} />
          {rows.length === 0 ? <EmptyState rangeLabel={range.label} /> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <RowHead
                  cols={['Customer', 'Rep', 'Type', 'Outcome', 'Notes', 'When']}
                  widths={['1fr', '140px', '120px', '110px', '1.4fr', '110px']}
                />
                {rows.map((v, i) => (
                  <TableRow
                    key={v.id}
                    last={i === rows.length - 1}
                    widths={['1fr', '140px', '120px', '110px', '1.4fr', '110px']}
                    cells={[
                      <strong className="font-semibold text-mfs-black">{v.customer}</strong>,
                      <span className="text-mfs-neutral-700">{v.rep}</span>,
                      <span className="text-mfs-neutral-700 capitalize">{v.visitType || '—'}</span>,
                      <span className={
                        v.outcome === 'lost' ? 'text-mfs-danger font-semibold capitalize' :
                        v.outcome === 'at risk' ? 'text-mfs-warning font-semibold capitalize' :
                        'text-mfs-neutral-700 capitalize'
                      }>{v.outcome || '—'}</span>,
                      <span className="text-mfs-neutral-700 text-xs truncate block">
                        {v.notes || <span className="text-mfs-neutral-500 italic">no notes</span>}
                      </span>,
                      <span className="text-mfs-neutral-500 text-xs">{fmtTime(v.createdAt)}</span>,
                    ]}
                  />
                ))}
              </div>

              {/* Mobile list-row stack */}
              <div className="md:hidden">
                {rows.map((v, i) => (
                  <ListRow
                    key={v.id}
                    last={i === rows.length - 1}
                    cells={
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-sm text-mfs-black truncate flex-1 min-w-0">
                            {v.customer}
                          </span>
                          <span className="text-xs text-mfs-neutral-500 whitespace-nowrap flex-shrink-0">
                            {fmtTime(v.createdAt)}
                          </span>
                        </div>
                        <div className="text-xs text-mfs-neutral-500 mt-0.5 capitalize">
                          {v.rep} · {v.visitType || '—'} · {v.outcome || '—'}
                        </div>
                        {v.notes && (
                          <div className="text-[11px] text-mfs-neutral-500 mt-0.5 line-clamp-2 italic">
                            {v.notes}
                          </div>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            </>
          )}
        </Card>

      </main>
      )}

      <RoleNav />
    </div>
  )
}
