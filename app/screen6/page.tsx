'use client'
export const dynamic = 'force-dynamic'

/**
 * Screen 6 — Map View (admin only)
 *
 * Auth is handled entirely by middleware.ts:
 *   - Unauthenticated → redirect to /login
 *   - Wrong role      → redirect to /screen4
 *   - Admin           → pass through, middleware injects x-mfs-user-id header
 *
 * No client-side cookie parsing needed — follows the same pattern as screen4.
 * The /api/map/data route reads x-mfs-user-id from the server-injected header.
 */

import dynamicImport from 'next/dynamic'
import { useState, useEffect, useCallback } from 'react'
import AppHeader  from '@/components/AppHeader'
import DetailModal from '@/components/DetailModal'
import RoleNav     from '@/components/RoleNav'

import type { MapCustomer, MapVisit } from '@/app/api/map/data/route'

// ── SSR-safe import — Leaflet reads window at module level ────────────────────
const MapView = dynamicImport(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#EDEAE1]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-[3px] border-[#16205B]/20 border-t-[#16205B] rounded-full animate-spin" />
        <p className="text-sm font-medium text-[#16205B]/60">Loading map…</p>
      </div>
    </div>
  ),
})

// ── Types ─────────────────────────────────────────────────────────────────────
type Layer = 'all' | 'customers' | 'visits'

const LAYER_OPTIONS: { value: Layer; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'customers', label: 'Customers' },
  { value: 'visits',    label: 'Visits'    },
]

const VISIT_LEGEND = [
  { colour: '#16205B', label: 'Routine'       },
  { colour: '#EB6619', label: 'New pitch'     },
  { colour: '#DC2626', label: 'Complaint f/u' },
  { colour: '#D97706', label: 'Delivery issue'},
]

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Screen6Page() {
  const [customers, setCustomers] = useState<MapCustomer[]>([])
  const [visits,    setVisits]    = useState<MapVisit[]>([])
  const [layer,     setLayer]     = useState<Layer>('all')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [modal,     setModal]     = useState<string | null>(null)
  const [fromDate,  setFromDate]  = useState('')
  const [toDate,    setToDate]    = useState('')

  // ── Fetch map data ─────────────────────────────────────────────────────────
  // No x-mfs-user-id header needed here — middleware injects it server-side.
  // The API route reads it from req.headers.get('x-mfs-user-id').
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ layer })
      if (fromDate) params.set('from', new Date(fromDate).toISOString())
      if (toDate)   params.set('to',   new Date(toDate + 'T23:59:59').toISOString())

      const res = await fetch(`/api/map/data?${params}`)
      if (!res.ok) {
        if (res.status === 401) { window.location.href = '/login'; return }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      setCustomers(data.customers ?? [])
      setVisits(data.visits ?? [])
    } catch (e) {
      setError('Failed to load map data')
      console.error('[screen6] fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [layer, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#EDEAE1] min-h-screen">

      <AppHeader title="Map View" maxWidth="full" />

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#EDEAE1] px-4 py-2.5 flex flex-wrap items-center gap-3">

        {/* Layer toggle */}
        <div className="flex rounded-lg overflow-hidden border border-[#16205B]/20">
          {LAYER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLayer(opt.value)}
              className={[
                'px-3 py-2 text-xs font-semibold transition-colors min-h-[36px]',
                layer === opt.value
                  ? 'bg-[#16205B] text-white'
                  : 'bg-white text-gray-600 hover:bg-[#EDEAE1]',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Date range — only when visits visible */}
        {(layer === 'all' || layer === 'visits') && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium hidden sm:block">Visits</label>
            <input
              type="date" value={fromDate} max={toDate || undefined}
              onChange={e => setFromDate(e.target.value)}
              className="text-xs border border-[#16205B]/20 rounded-lg px-2.5 py-2 min-h-[36px] text-gray-700 focus:outline-none focus:border-[#EB6619] bg-white"
            />
            <span className="text-xs text-gray-400">–</span>
            <input
              type="date" value={toDate} min={fromDate || undefined}
              onChange={e => setToDate(e.target.value)}
              className="text-xs border border-[#16205B]/20 rounded-lg px-2.5 py-2 min-h-[36px] text-gray-700 focus:outline-none focus:border-[#EB6619] bg-white"
            />
            <button
              type="button" onClick={fetchData} disabled={loading}
              className="px-3 py-2 min-h-[36px] text-xs font-semibold bg-[#16205B] text-white rounded-lg hover:bg-[#16205B]/90 disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
          </div>
        )}

        {/* Live counts */}
        <div className="flex items-center gap-3 ml-auto">
          {!loading && (layer === 'all' || layer === 'customers') && (
            <span className="text-xs text-[#16205B]/60 font-medium">
              <span className="text-[#16205B] font-bold">{customers.length}</span> customers
            </span>
          )}
          {!loading && (layer === 'all' || layer === 'visits') && (
            <span className="text-xs text-[#16205B]/60 font-medium">
              <span className="text-[#16205B] font-bold">{visits.length}</span> visits
            </span>
          )}
          {loading && <span className="text-xs text-[#16205B]/40 animate-pulse">Loading…</span>}
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={fetchData} className="text-red-600 text-xs font-bold">Retry</button>
          </div>
        </div>
      )}

      {/* ── Map — fills all remaining height ──────────────────────────────── */}
      <div className="relative z-0 overflow-hidden" style={{ height: "calc(100dvh - 176px)" }}>
        {!loading && (
          <MapView
            customers={customers}
            visits={visits}
            layer={layer}
            onVisitClick={(id) => setModal(id)}
          />
        )}

        {/* Legend overlay */}
        {!loading && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-[#16205B]/10 p-3 space-y-1.5 pointer-events-none">
            {(layer === 'all' || layer === 'customers') && (
              <div className="flex items-center gap-2">
                <svg width="12" height="16" viewBox="0 0 14 18" className="flex-shrink-0">
                  <path d="M7 0C3.1 0 0 3.1 0 7c0 5.3 7 11 7 11S14 12.3 14 7C14 3.1 10.9 0 7 0z" fill="#16205B"/>
                  <circle cx="7" cy="7" r="3" fill="white"/>
                </svg>
                <span className="text-[11px] text-[#16205B]/70 font-medium">Customer</span>
              </div>
            )}
            {(layer === 'all' || layer === 'visits') && VISIT_LEGEND.map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: l.colour }} />
                <span className="text-[11px] text-[#16205B]/70 font-medium">{l.label}</span>
              </div>
            ))}
            {(layer === 'all' || layer === 'visits') && (
              <div className="pt-1 mt-0.5 border-t border-[#16205B]/10 flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0" />
                  <span className="text-[10px] text-[#16205B]/50">Omer</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-gray-400 flex-shrink-0" />
                  <span className="text-[10px] text-[#16205B]/50">Mehmet</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Visit detail modal ────────────────────────────────────────────── */}
      {modal && (
        <DetailModal
          type="visit"
          id={modal}
          onClose={() => setModal(null)}
        />
      )}

      <RoleNav />
    </div>
  )
}
