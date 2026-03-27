'use client'

/**
 * app/driver/page.tsx
 *
 * Driver view — read-only. Shows today's assigned route stops.
 * Each stop has Google Maps + Waze navigation buttons.
 * "Open full route" button at the bottom uses the saved Google Maps deep link.
 *
 * This page is the ONLY thing drivers see after logging in.
 * No visit forms, no dashboard, no complaints — just their stops.
 */

import { useEffect, useState, useCallback } from 'react'
import MfsLogo from '@/components/MfsLogo'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stop {
  id:                      string
  position:                number
  priority:                'none' | 'urgent' | 'priority'
  priority_note:           string | null
  estimated_arrival:       string | null
  drive_time_from_prev_min: number | null
  visited:                 boolean
  customer: {
    id:       string
    name:     string
    postcode: string | null
    lat:      number | null
    lng:      number | null
  }
}

interface Route {
  id:                string
  name:              string | null
  planned_date:      string
  departure_time:    string
  end_point:         string
  total_distance_km:  number | null
  total_duration_min: number | null
  google_maps_url:   string | null
  assignee:          { name: string } | null
  route_stops:       Stop[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, { bar: string; label: string; text: string }> = {
  priority: { bar: 'bg-red-500',   label: '🔴 Priority stop',  text: 'text-red-600' },
  urgent:   { bar: 'bg-amber-400', label: '⚠️ Urgent delivery', text: 'text-amber-600' },
  none:     { bar: 'bg-[#EDEAE1]', label: '',                  text: '' },
}

function navUrl(app: 'google' | 'waze', stop: Stop): string {
  const q = stop.customer.postcode
    ? encodeURIComponent(stop.customer.postcode)
    : stop.customer.lat != null
      ? `${stop.customer.lat},${stop.customer.lng}`
      : encodeURIComponent(stop.customer.name)

  if (app === 'google') return `https://maps.google.com/?q=${q}`
  return `https://waze.com/ul?q=${q}&navigate=yes`
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Stop card ────────────────────────────────────────────────────────────────

function StopItem({ stop }: { stop: Stop }) {
  const style = PRIORITY_STYLES[stop.priority]

  return (
    <div className={[
      'bg-white rounded-2xl overflow-hidden border-2 transition-colors',
      stop.priority === 'priority' ? 'border-red-200'
        : stop.priority === 'urgent' ? 'border-amber-200'
        : 'border-transparent',
    ].join(' ')}>
      {/* Priority bar */}
      {stop.priority !== 'none' && (
        <div className={`${style.bar} h-1 w-full`} />
      )}

      <div className="px-4 py-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          {/* Position badge */}
          <div className="w-10 h-10 rounded-full bg-[#16205B] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-base">{stop.position}</span>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[#16205B] text-base leading-tight">{stop.customer.name}</h2>
            {stop.customer.postcode && (
              <p className="text-gray-400 text-sm mt-0.5">{stop.customer.postcode}</p>
            )}
          </div>

          {/* ETA */}
          {stop.estimated_arrival && (
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Est. arrival</p>
              <p className="text-[#16205B] font-bold text-sm">{stop.estimated_arrival}</p>
            </div>
          )}
        </div>

        {/* Priority note */}
        {stop.priority !== 'none' && (
          <div className={`mb-3 flex items-center gap-1.5 ${style.text}`}>
            <span className="text-sm font-semibold">{style.label}</span>
            {stop.priority_note && (
              <span className="text-sm opacity-80">— {stop.priority_note}</span>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-2">
          <a
            href={navUrl('google', stop)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-12 rounded-xl bg-[#16205B] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            style={{ touchAction: 'manipulation' }}
          >
            {/* Google Maps pin icon */}
            <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 flex-shrink-0">
              <path d="M10 2C6.13 2 3 5.13 3 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7Z"
                    fill="white" fillOpacity="0.9"/>
              <circle cx="10" cy="9" r="2.5" fill="#16205B"/>
            </svg>
            Google Maps
          </a>

          <a
            href={navUrl('waze', stop)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-12 rounded-xl bg-[#33CCFF] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            style={{ touchAction: 'manipulation' }}
          >
            {/* Waze-style smiley icon */}
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4 flex-shrink-0">
              <circle cx="10" cy="10" r="8" fill="white" fillOpacity="0.25"/>
              <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.5" fill="none"/>
              <circle cx="7.5" cy="8.5" r="1" fill="white"/>
              <circle cx="12.5" cy="8.5" r="1" fill="white"/>
              <path d="M7 12.5c0.8 1.5 5.2 1.5 6 0" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
            Waze
          </a>
        </div>
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
    <div className="min-h-screen bg-[#F5F3EE] flex flex-col">

      {/* Header */}
      <div className="bg-[#16205B] px-4 pt-safe-top pb-5 flex-shrink-0"
           style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto">
          {/* Logo row + logout button */}
          <div className="flex items-center justify-between mb-4">
            <MfsLogo className="h-8 w-auto text-[#EB6619]" />
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
                window.location.href = '/login'
              }}
              className="flex items-center gap-1.5 text-white/50 hover:text-white active:text-white/70 transition-colors text-xs font-semibold"
              style={{ touchAction: 'manipulation' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd"/>
                <path fillRule="evenodd" d="M6 10a.75.75 0 0 1 .75-.75h9.546l-1.048-.943a.75.75 0 1 1 1.004-1.114l2.5 2.25a.75.75 0 0 1 0 1.114l-2.5 2.25a.75.75 0 1 1-1.004-1.114l1.048-.943H6.75A.75.75 0 0 1 6 10Z" clipRule="evenodd"/>
              </svg>
              Log out
            </button>
          </div>
          {route ? (
            <>
              <h1 className="text-white font-bold text-xl leading-tight">
                {route.name ?? 'Your deliveries today'}
              </h1>
              <p className="text-white/50 text-sm mt-1">
                {formatDate(route.planned_date)}
              </p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                  <span className="text-white/70 text-xs">Stops:</span>
                  <span className="text-white font-bold text-xs">{stops.length}</span>
                </div>
                {route.total_duration_min && (
                  <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                    <span className="text-white/70 text-xs">Drive:</span>
                    <span className="text-white font-bold text-xs">{fmtDuration(route.total_duration_min)}</span>
                  </div>
                )}
                {route.departure_time && (
                  <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                    <span className="text-white/70 text-xs">Depart:</span>
                    <span className="text-white font-bold text-xs">{route.departure_time.slice(0, 5)}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <h1 className="text-white font-bold text-xl">Your deliveries</h1>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">

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

        {/* No route assigned */}
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
              No deliveries have been assigned to you for today.
              <br />Contact Hakan or Ege if this is a mistake.
            </p>
          </div>
        )}

        {/* Stop list */}
        {!loading && !error && route && stops.length > 0 && (
          <>
            <div className="space-y-3 mb-6">
              {stops.map(stop => (
                <StopItem key={stop.id} stop={stop} />
              ))}
            </div>

            {/* Master button — open full route */}
            {route.google_maps_url ? (
              <a
                href={route.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 w-full h-14 rounded-2xl bg-[#EB6619] text-white font-bold text-base active:scale-[0.98] transition-transform shadow-lg shadow-[#EB6619]/30"
                style={{ touchAction: 'manipulation' }}
              >
                <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
                  <path d="M10 2C6.13 2 3 5.13 3 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7Z"
                        fill="white" fillOpacity="0.9"/>
                  <circle cx="10" cy="9" r="2.5" fill="#EB6619"/>
                </svg>
                Open full route in Google Maps
              </a>
            ) : (
              <div className="h-14 rounded-2xl bg-[#16205B]/10 flex items-center justify-center">
                <p className="text-[#16205B]/40 text-sm">Route link not available — optimise the route first</p>
              </div>
            )}

            {/* End point note */}
            <p className="text-center text-xs text-gray-400 mt-4">
              Return to {route.end_point === 'ozmen_john_street' ? 'Ozmen John Street' : 'MFS Sheffield'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
