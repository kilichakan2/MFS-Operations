'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import RoleNav   from '@/components/RoleNav'
import AppHeader from '@/components/AppHeader'
import {
  Card, CardHead, PageHeading,
  EmptyState, RowHead, TableRow, ListRow,
} from '@/app/dashboard/admin/_components/primitives'

// ─── Types (mirrors /api/admin/at-risk response shape) ───────────────────────

interface AtRiskRow {
  id:       string
  customer: string
  outcome:  'at_risk' | 'lost'
  rep:      string
  hoursAgo: number
  reason:   string
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

export default function AdminAtRiskPage() {
  return (
    <Suspense fallback={null}>
      <AdminAtRiskPageBody />
    </Suspense>
  )
}

function AdminAtRiskPageBody() {
  const [rows,      setRows]      = useState<AtRiskRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/at-risk')
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `HTTP ${res.status}`); return
      }
      const data = await res.json()
      setRows((data.rows ?? []) as AtRiskRow[])
      setLastFetch(new Date())
    } catch { setError('Network error — check your connection') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="min-h-screen bg-mfs-soft-neutral">
      <AppHeader title="At-risk accounts" maxWidth="4xl"
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

        <PageHeading>Admin · At-risk accounts</PageHeading>

        <Card>
          <CardHead title="At-risk accounts — last 7 days" count={rows.length} />
          {rows.length === 0 ? <EmptyState rangeLabel="last 7 days" /> : (
            <>
              {/* Desktop table — avg_order_value column dropped (no schema source) */}
              <div className="hidden md:block">
                <RowHead
                  cols={['Account', 'Outcome', 'Reason', 'Rep', 'Hours ago']}
                  widths={['1fr', '100px', '1fr', '140px', '110px']}
                />
                {rows.map((a, i) => (
                  <TableRow
                    key={a.id}
                    last={i === rows.length - 1}
                    widths={['1fr', '100px', '1fr', '140px', '110px']}
                    cells={[
                      <strong key="customer" className="font-semibold text-mfs-black">{a.customer}</strong>,
                      <span key="outcome" className={
                        a.outcome === 'lost'
                          ? 'text-mfs-danger font-semibold'
                          : 'text-mfs-warning font-semibold'
                      }>{a.outcome === 'lost' ? 'Lost' : 'At risk'}</span>,
                      <span key="reason" className="text-mfs-neutral-700">{a.reason}</span>,
                      <span key="rep" className="text-mfs-neutral-700">{a.rep}</span>,
                      <span key="hoursAgo" className="text-mfs-black">{a.hoursAgo}h</span>,
                    ]}
                  />
                ))}
              </div>

              {/* Mobile list-row stack */}
              <div className="md:hidden">
                {rows.map((a, i) => (
                  <ListRow
                    key={a.id}
                    accentClassName={a.outcome === 'lost' ? 'bg-mfs-danger' : 'bg-mfs-warning'}
                    last={i === rows.length - 1}
                    cells={
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-sm text-mfs-black truncate flex-1 min-w-0">
                            {a.customer}
                          </span>
                          <span className={
                            a.outcome === 'lost'
                              ? 'text-xs font-semibold text-mfs-danger flex-shrink-0'
                              : 'text-xs font-semibold text-mfs-warning flex-shrink-0'
                          }>
                            {a.outcome === 'lost' ? 'LOST' : 'AT RISK'}
                          </span>
                        </div>
                        <div className="text-xs text-mfs-neutral-500 mt-0.5">
                          {a.reason}
                        </div>
                        <div className="text-[11px] text-mfs-neutral-500 mt-0.5">
                          {a.rep} · {a.hoursAgo}h ago
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
