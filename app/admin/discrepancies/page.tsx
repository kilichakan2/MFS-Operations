'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import RoleNav   from '@/components/RoleNav'
import AppHeader from '@/components/AppHeader'
import {
  Card, CardHead, RangeTabs, RangeLabel, PageHeading,
  EmptyState, RowHead, TableRow, ListRow,
} from '@/app/dashboard/admin/_components/primitives'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Discrepancy {
  id: string
  customer: string
  product: string
  status: 'short' | 'not_sent'
  reason: string
  orderedQty: number | null
  sentQty:    number | null
  loggedBy:   string
  createdAt:  string
}

// ─── Range helpers (mirrored from /dashboard/admin) ──────────────────────────

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

// ─── Spinner (matches /dashboard/admin) ──────────────────────────────────────

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

function cap(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDiscrepanciesPage() {
  return (
    <Suspense fallback={null}>
      <AdminDiscrepanciesPageBody />
    </Suspense>
  )
}

function AdminDiscrepanciesPageBody() {
  const [rows,      setRows]      = useState<Discrepancy[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [preset,    setPreset]    = useState<Preset>('today')

  const range = useMemo(() => buildRange(preset), [preset])

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `HTTP ${res.status}`); return
      }
      const data = await res.json()
      setRows((data.discrepanciesToday ?? []) as Discrepancy[])
      setLastFetch(new Date())
    } catch { setError('Network error — check your connection') }
    finally { setLoading(false) }
  }, [range.from, range.to])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="min-h-screen bg-mfs-soft-neutral">
      <AppHeader title="Discrepancies" maxWidth="4xl"
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

        <PageHeading>Admin · Discrepancies</PageHeading>

        {/* Range tabs + caption */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] md:text-[11px] font-semibold tracking-[0.12em] uppercase text-mfs-neutral-500">
            Range
          </span>
          <RangeTabs<Preset> value={preset} onChange={setPreset} ranges={RANGES} scrollOnSmall />
          <RangeLabel from={range.from} to={range.to} />
        </div>

        {/* Single list card */}
        <Card>
          <CardHead title={`Discrepancies — ${range.label}`} count={rows.length} />
          {rows.length === 0 ? <EmptyState rangeLabel={range.label} /> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <RowHead
                  cols={['Customer', 'Product', 'Status', 'Reason', 'Ordered', 'Sent', 'Logged by', 'When']}
                  widths={['1fr', '1fr', '90px', '120px', '80px', '70px', '110px', '110px']}
                />
                {rows.map((d, i) => (
                  <TableRow
                    key={d.id}
                    last={i === rows.length - 1}
                    widths={['1fr', '1fr', '90px', '120px', '80px', '70px', '110px', '110px']}
                    cells={[
                      <strong className="font-semibold text-mfs-black">{d.customer}</strong>,
                      <span className="text-mfs-neutral-700 truncate block">{d.product}</span>,
                      <span className={
                        d.status === 'not_sent'
                          ? 'text-mfs-danger font-semibold'
                          : 'text-mfs-warning font-semibold'
                      }>{d.status === 'not_sent' ? 'Not sent' : 'Short'}</span>,
                      <span className="text-mfs-neutral-700">{cap(d.reason)}</span>,
                      <span className="text-mfs-black">{d.orderedQty ?? '—'}</span>,
                      <span className="text-mfs-black">{d.sentQty ?? '—'}</span>,
                      <span className="text-mfs-neutral-700">{d.loggedBy}</span>,
                      <span className="text-mfs-neutral-500 text-xs">{fmtTime(d.createdAt)}</span>,
                    ]}
                  />
                ))}
              </div>

              {/* Mobile list-row stack */}
              <div className="md:hidden">
                {rows.map((d, i) => (
                  <ListRow
                    key={d.id}
                    accentClassName={d.status === 'not_sent' ? 'bg-mfs-danger' : 'bg-mfs-warning'}
                    last={i === rows.length - 1}
                    cells={
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-sm text-mfs-black truncate flex-1 min-w-0">
                            {d.customer}
                          </span>
                          <span className={
                            d.status === 'not_sent'
                              ? 'text-xs font-semibold text-mfs-danger flex-shrink-0'
                              : 'text-xs font-semibold text-mfs-warning flex-shrink-0'
                          }>
                            {d.status === 'not_sent' ? 'NOT SENT' : 'SHORT'}
                          </span>
                        </div>
                        <div className="text-xs text-mfs-neutral-500 mt-0.5 truncate">
                          {d.product} · {cap(d.reason)}
                        </div>
                        {d.status === 'short' && d.orderedQty != null && d.sentQty != null && (
                          <div className="text-xs text-mfs-warning font-medium mt-0.5">
                            Ordered {d.orderedQty} · Sent {d.sentQty}
                          </div>
                        )}
                        <div className="text-[11px] text-mfs-neutral-500 mt-0.5">
                          {d.loggedBy} · {fmtTime(d.createdAt)}
                        </div>
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
