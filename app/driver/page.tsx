'use client'

/**
 * app/driver/page.tsx  — Sprint 3: Read-Only Manifest
 *
 * Strict h-[100dvh] flex sandwich:
 *   <AppHeader />          ← top bread
 *   <main flex-1 scroll>   ← meat: summary card + stop list
 *   <RoleNav />            ← bottom bread (fixed, renders My Route + Complaints)
 *
 * No status buttons. Drivers navigate, they don't report.
 */

import { useEffect, useState, useCallback } from 'react'
import AppHeader from '@/components/AppHeader'
import RoleNav   from '@/components/RoleNav'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stop {
  id:                       string
  position:                 number
  priority:                 'none' | 'urgent' | 'priority'
  priority_note:            string | null
  estimated_arrival:        string | null
  drive_time_from_prev_min: number | null
  customer: {
    id:       string
    name:     string
    postcode: string | null
    lat:      number | null
    lng:      number | null
  }
}

interface Route {
  id:                 string
  name:               string | null
  planned_date:       string
  departure_time:     string
  end_point:          string
  total_distance_km:  number | null
  total_duration_min: number | null
  google_maps_url:    string | null
  route_stops:        Stop[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function navUrl(stop: Stop): string {
  if (stop.customer.lat != null && stop.customer.lng != null)
    return `https://maps.google.com/?q=${stop.customer.lat},${stop.customer.lng}`
  if (stop.customer.postcode)
    return `https://maps.google.com/?q=${encodeURIComponent(stop.customer.postcode + ', UK')}`
  return `https://maps.google.com/?q=${encodeURIComponent(stop.customer.name)}`
}

const PRIORITY_COLOUR: Record<string, { border: string; bar: string; label: string; text: string }> = {
  urgent:   { border: 'border-amber-300', bar: 'bg-amber-400', label: '⚠️ Urgent',   text: 'text-amber-600' },
  priority: { border: 'border-red-300',   bar: 'bg-red-500',   label: '🔴 Priority', text: 'text-red-600'   },
  none:     { border: 'border-transparent', bar: '',            label: '',             text: ''               },
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ route, stopCount }: { route: Route; stopCount: number }) {
  const totalMin  = route.total_duration_min ?? 0
  const driveMin  = Math.max(0, totalMin - stopCount * 15)
  const unloadMin = stopCount * 15
  const miles     = route.total_distance_km
    ? Math.round(route.total_distance_km * 0.621371 * 10) / 10
    : null

  return (
    <div className="bg-[#16205B] rounded-2xl p-4 mb-4">
      {/* Route name + date */}
      <h2 className="text-white font-bold text-base leading-tight">
        {route.name ?? 'Your deliveries today'}
      </h2>
      <p className="text-white/50 text-xs mt-0.5 mb-3">{formatDate(route.planned_date)}</p>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        {totalMin > 0 && (
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-white/50 text-[9px] uppercase tracking-widest">🚗 Driving</p>
            <p className="text-white font-bold text-sm">{fmtDuration(driveMin)}</p>
          </div>
        )}
        {stopCount > 0 && (
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-white/50 text-[9px] uppercase tracking-widest">📦 Unloading</p>
            <p className="text-white font-bold text-sm">{fmtDuration(unloadMin)}</p>
          </div>
        )}
        {totalMin > 0 && (
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-white/50 text-[9px] uppercase tracking-widest">⏱️ Total shift</p>
            <p className="text-white font-bold text-sm">{fmtDuration(totalMin)}</p>
          </div>
        )}
        {miles && (
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-white/50 text-[9px] uppercase tracking-widest">📍 Distance</p>
            <p className="text-white font-bold text-sm">{miles} mi · {stopCount} stops</p>
          </div>
        )}
      </div>

      {/* Departure + end point */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
        <span className="text-white/60 text-xs">
          🕗 Depart <span className="text-white font-semibold">{route.departure_time.slice(0, 5)}</span>
        </span>
        <span className="text-white/30">·</span>
        <span className="text-white/60 text-xs">
          🏁 Return to <span className="text-white font-semibold">
            {route.end_point === 'ozmen_john_street' ? 'Ozmen' : 'MFS'}
          </span>
        </span>
      </div>
    </div>
  )
}

// ─── Stop card ────────────────────────────────────────────────────────────────

function StopItem({ stop }: { stop: Stop }) {
  const style = PRIORITY_COLOUR[stop.priority]

  return (
    <div className={['bg-white rounded-2xl overflow-hidden border-2 transition-colors', style.border].join(' ')}>
      {/* Priority bar */}
      {style.bar && <div className={`${style.bar} h-1 w-full`} />}

      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#16205B] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">{stop.position}</span>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[#16205B] text-sm leading-tight">{stop.customer.name}</h3>
            {stop.customer.postcode && (
              <p className="text-gray-400 text-xs mt-0.5">{stop.customer.postcode}</p>
            )}
            {stop.priority !== 'none' && (
              <p className={`text-xs font-semibold mt-0.5 ${style.text}`}>
                {style.label}{stop.priority_note ? ` — ${stop.priority_note}` : ''}
              </p>
            )}
          </div>

          {/* ETA */}
          {stop.estimated_arrival && (
            <div className="text-right flex-shrink-0">
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Arrive</p>
              <p className="text-[#16205B] font-bold text-sm">{stop.estimated_arrival}</p>
            </div>
          )}
        </div>

        {/* Navigate button */}
        <a
          href={navUrl(stop)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-[#16205B] text-white font-bold text-sm active:scale-[0.97] transition-transform"
          style={{ touchAction: 'manipulation' }}
        >
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 flex-shrink-0">
            <path d="M10 2C6.13 2 3 5.13 3 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7Z"
                  fill="white" fillOpacity="0.9"/>
            <circle cx="10" cy="9" r="2.5" fill="#16205B"/>
          </svg>
          Navigate
        </a>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DriverPage() {
  const [route,   setRoute]   = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/routes/today')
      const data = await res.json() as { route: Route | null; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to load route'); return }
      setRoute(data.route)
    } catch {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const stops = route?.route_stops ?? []

  return (
    <>
    <div className="bg-[#EDEAE1] h-[100dvh] flex flex-col overflow-hidden">

      {/* Top bread */}
      <AppHeader title="My Route" />

      {/* Meat — scrollable content */}
      <main className="flex-1 overflow-y-auto min-h-0 px-4 py-4 pb-24 max-w-lg mx-auto w-full">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <svg className="animate-spin w-7 h-7 text-[#16205B]/30" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-[#16205B]/40 text-sm">Loading your route…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-semibold mb-1">Couldn&apos;t load your route</p>
            <p className="text-red-500 text-sm mb-4">{error}</p>
            <button type="button" onClick={load}
              className="h-10 px-5 rounded-xl bg-red-600 text-white text-sm font-semibold">
              Try again
            </button>
          </div>
        )}

        {/* No route */}
        {!loading && !error && !route && (
          <div className="flex flex-col items-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-[#16205B]/5 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#16205B" strokeWidth="1.5" className="w-8 h-8 opacity-20">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                <line x1="9" y1="3" x2="9" y2="18"/>
                <line x1="15" y1="6" x2="15" y2="21"/>
              </svg>
            </div>
            <h2 className="text-[#16205B] font-bold text-lg mb-2">No route today</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              No deliveries assigned to you for today.
              <br />Contact Hakan or Ege if this is a mistake.
            </p>
          </div>
        )}

        {/* Route manifest */}
        {!loading && !error && route && (
          <>
            <SummaryCard route={route} stopCount={stops.length} />

            <div className="space-y-3 mb-4">
              {stops.map(stop => (
                <StopItem key={stop.id} stop={stop} />
              ))}
            </div>

            {/* Master button — always at bottom of list */}
            {route.google_maps_url ? (
              <a
                href={route.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 w-full h-12 rounded-2xl bg-[#EB6619] text-white font-bold text-sm active:scale-[0.98] transition-transform"
                style={{ touchAction: 'manipulation' }}
              >
                <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                  <path d="M10 2C6.13 2 3 5.13 3 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7Z"
                        fill="white" fillOpacity="0.9"/>
                  <circle cx="10" cy="9" r="2.5" fill="#EB6619"/>
                </svg>
                Open full route in Google Maps
              </a>
            ) : (
              <div className="h-12 rounded-2xl bg-[#16205B]/10 flex items-center justify-center">
                <p className="text-[#16205B]/40 text-sm text-center px-4">
                  Route link not available — optimise first
                </p>
              </div>
            )}
          </>
        )}
      </main>

    </div>
    {/* RoleNav must be OUTSIDE the overflow-hidden container — position:fixed inside
        overflow:hidden breaks touch event routing on iOS Safari / WebKit */}
    <RoleNav />
    </>
  )
}
