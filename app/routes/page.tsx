'use client'

/**
 * app/routes/page.tsx
 *
 * Route Planner — accessible to all authenticated roles.
 * Drivers land on /driver instead; everyone else uses this.
 *
 * Left panel:  date, assignee, departure time, end point, stop builder
 * Right panel: RouteMap live preview (SSR-disabled Leaflet)
 */

import dynamic from 'next/dynamic'
import {
  useState, useCallback, useEffect, useRef, useMemo
} from 'react'
import AppHeader from '@/components/AppHeader'
import type { RouteStop } from '@/components/RouteMap'

// RouteMap must be client-only (Leaflet uses window)
const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr:     false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#EDEAE1] rounded-xl">
      <p className="text-[#16205B]/40 text-sm">Loading map…</p>
    </div>
  ),
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id:       string
  name:     string
  postcode: string | null
  lat:      number | null
  lng:      number | null
}

interface StopCard extends Customer {
  priority:         'none' | 'urgent' | 'priority'
  lockedPosition:   boolean
  priorityNote:     string
  estimatedArrival: string | null  // populated from optimise result, null until then
}

interface User {
  id:   string
  name: string
  role: string
}

interface OptimiseResult {
  orderedStops:    RouteStop[]
  totalDistanceKm: number
  totalDurationMin: number
  googleMapsUrl:   string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = {
  none:     'Standard',
  urgent:   '⚠️ Urgent',
  priority: '🔴 Priority',
}
const PRIORITY_RING: Record<string, string> = {
  none:     'border-[#EDEAE1]',
  urgent:   'border-amber-400',
  priority: 'border-red-500',
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Stop card ────────────────────────────────────────────────────────────────

function StopCardRow({
  stop, index, total, onChange, onRemove, onMove, broken, onPostcodeUpdate,
}: {
  stop:              StopCard
  index:             number
  total:             number
  onChange:          (id: string, patch: Partial<StopCard>) => void
  onRemove:          (id: string) => void
  onMove:            (index: number, dir: -1 | 1) => void
  broken?:           boolean
  onPostcodeUpdate?: (id: string, newPostcode: string) => void
}) {
  const [showNote,      setShowNote]      = useState(false)
  const [editingPost,   setEditingPost]   = useState(false)
  const [postcodeInput, setPostcodeInput] = useState(stop.postcode ?? '')
  const [saving,        setSaving]        = useState(false)
  const [saveErr,       setSaveErr]       = useState('')

  async function savePostcode() {
    const trimmed = postcodeInput.replace(/\s+/g, ' ').trim().toUpperCase()
    if (!trimmed) return
    setSaving(true); setSaveErr('')
    try {
      const res  = await fetch(`/api/routes/customers/${stop.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ postcode: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveErr(data.error ?? 'Save failed'); return }
      onPostcodeUpdate?.(stop.id, trimmed)
      setEditingPost(false); setSaveErr('')
    } catch { setSaveErr('Network error') }
    finally   { setSaving(false) }
  }

  const borderClass = broken
    ? 'border-red-500 bg-red-50/30'
    : PRIORITY_RING[stop.priority]

  return (
    <div className={['bg-white rounded-xl border-2 transition-colors', borderClass].join(' ')}>
      {/* ── Main row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">

        {/* Position badge + up/down arrows stacked vertically */}
        <div className="flex flex-col items-center flex-shrink-0 w-5">
          <button type="button" disabled={index === 0 || stop.lockedPosition}
            onClick={() => onMove(index, -1)}
            className="text-[#16205B]/25 hover:text-[#16205B] disabled:opacity-0 transition-colors leading-none"
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 10 6" fill="currentColor" className="w-2 h-1.5"><path d="M5 0L10 6H0L5 0Z"/></svg>
          </button>
          <span className="text-[11px] font-bold text-[#16205B] leading-none my-0.5">{index + 1}</span>
          <button type="button" disabled={index === total - 1 || stop.lockedPosition}
            onClick={() => onMove(index, 1)}
            className="text-[#16205B]/25 hover:text-[#16205B] disabled:opacity-0 transition-colors leading-none"
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 10 6" fill="currentColor" className="w-2 h-1.5"><path d="M5 6L0 0H10L5 6Z"/></svg>
          </button>
        </div>

        {/* Customer name + postcode */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#16205B] truncate leading-tight">{stop.name}</p>
          {broken ? (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-red-600 font-bold">🔴 Bad postcode</span>
              <button type="button" style={{ touchAction: 'manipulation' }}
                onClick={() => { setEditingPost(v => !v); setPostcodeInput(stop.postcode ?? '') }}
                className="text-[10px] text-red-500 underline hover:text-red-700 font-semibold"
              >Edit</button>
            </div>
          ) : !stop.postcode || !stop.lat ? (
            <p className="text-[10px] text-amber-600 font-semibold leading-tight">
              ⚠ {!stop.postcode ? 'No postcode' : 'Not geocoded'}
            </p>
          ) : (
            <div className="flex items-center gap-1">
              <p className="text-[10px] text-gray-400 leading-tight">{stop.postcode}</p>
              <button type="button" style={{ touchAction: 'manipulation' }}
                onClick={() => { setEditingPost(v => !v); setPostcodeInput(stop.postcode ?? '') }}
                className="text-[10px] text-gray-300 hover:text-[#EB6619] transition-colors" title="Edit postcode"
              >✏</button>
            </div>
          )}
          {/* ETA — shown after optimise */}
          {stop.estimatedArrival && (
            <p className="text-[10px] font-bold text-[#EB6619] leading-tight mt-0.5">
              ETA {stop.estimatedArrival}
            </p>
          )}
        </div>

        {/* Controls row: priority · lock · note · remove — all 28px height */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Priority select */}
          <select
            value={stop.priority}
            onChange={e => onChange(stop.id, { priority: e.target.value as StopCard['priority'] })}
            className={[
              'text-[10px] font-bold border rounded-md px-1 py-0.5 bg-white focus:outline-none focus:border-[#EB6619] h-7',
              stop.priority === 'priority' ? 'border-red-400 text-red-600'
                : stop.priority === 'urgent' ? 'border-amber-400 text-amber-600'
                : 'border-[#EDEAE1] text-[#16205B]/60',
            ].join(' ')}
            style={{ touchAction: 'manipulation' }}
          >
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          {/* Lock */}
          <button type="button"
            onClick={() => onChange(stop.id, { lockedPosition: !stop.lockedPosition })}
            title={stop.lockedPosition ? 'Unlock' : 'Lock position'}
            className={[
              'w-7 h-7 flex items-center justify-center rounded-md border transition-colors',
              stop.lockedPosition
                ? 'bg-[#16205B] border-[#16205B] text-white'
                : 'border-[#EDEAE1] text-[#16205B]/30 hover:text-[#16205B]',
            ].join(' ')}
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
              <path d="M9.5 5.5V4a2.5 2.5 0 0 0-5 0v1.5H3.5A.5.5 0 0 0 3 6v5a.5.5 0 0 0 .5.5h7A.5.5 0 0 0 11 11V6a.5.5 0 0 0-.5-.5H9.5ZM6 4a1 1 0 0 1 2 0v1.5H6V4Zm1 4.5a.75.75 0 0 1 .75.75v.75a.75.75 0 0 1-1.5 0v-.75A.75.75 0 0 1 7 8.5Z"/>
            </svg>
          </button>

          {/* Note toggle */}
          <button type="button"
            onClick={() => setShowNote(v => !v)}
            title="Add note"
            className={[
              'w-7 h-7 flex items-center justify-center rounded-md border transition-colors',
              showNote || stop.priorityNote
                ? 'border-[#EB6619]/60 text-[#EB6619]'
                : 'border-[#EDEAE1] text-[#16205B]/30 hover:text-[#16205B]',
            ].join(' ')}
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M1 7.5C1 5.3 2.8 3.5 5 3.5h4C11.2 3.5 13 5.3 13 7.5S11.2 11.5 9 11.5h-.6l-2 1.4a.4.4 0 0 1-.65-.37v-1.03H5C2.8 11.5 1 9.7 1 7.5Z" clipRule="evenodd"/>
            </svg>
          </button>

          {/* Remove */}
          <button type="button" onClick={() => onRemove(stop.id)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[#16205B]/20 hover:text-red-500 hover:bg-red-50 transition-colors"
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
              <path d="M3 3l8 8M11 3l-8 8"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Inline postcode editor ─────────────────────────────────────── */}
      {editingPost && (
        <div className="px-2 pb-2 pt-0">
          <div className="flex items-center gap-1.5">
            <input type="text" autoFocus maxLength={8}
              value={postcodeInput}
              onChange={e => { setPostcodeInput(e.target.value.toUpperCase()); setSaveErr('') }}
              onKeyDown={e => e.key === 'Enter' && savePostcode()}
              placeholder="e.g. S3 8DG"
              className="flex-1 h-8 rounded-lg border-2 border-[#EB6619] px-2.5 text-xs font-mono text-gray-800 focus:outline-none uppercase"
            />
            <button type="button" onClick={savePostcode}
              disabled={saving || !postcodeInput.trim()}
              className="h-8 px-3 rounded-lg bg-[#EB6619] text-white text-xs font-bold disabled:opacity-40 flex-shrink-0"
              style={{ touchAction: 'manipulation' }}
            >{saving ? '…' : 'Save'}</button>
            <button type="button" onClick={() => { setEditingPost(false); setSaveErr('') }}
              className="h-8 px-2 rounded-lg border border-[#EDEAE1] text-xs text-gray-400 flex-shrink-0"
              style={{ touchAction: 'manipulation' }}
            >✕</button>
          </div>
          {saveErr && <p className="text-[10px] text-red-600 mt-1">{saveErr}</p>}
        </div>
      )}
      {/* ── Note input ───────────────────────────────────────────────────── */}
      {showNote && (
        <div className="px-2 pb-2 pt-0">
          <input type="text"
            value={stop.priorityNote}
            onChange={e => onChange(stop.id, { priorityNote: e.target.value })}
            placeholder="e.g. Early delivery, call ahead"
            className="w-full h-8 rounded-lg border border-[#EDEAE1] px-2.5 text-xs text-gray-700 focus:outline-none focus:border-[#EB6619]"
          />
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RoutesPage() {
  // ── Form state ──────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const [plannedDate,    setPlannedDate]    = useState(today)
  const [departureTime,  setDepartureTime]  = useState('08:00')
  const [endPoint,       setEndPoint]       = useState<'mfs' | 'ozmen_john_street'>('mfs')
  const [assignedTo,     setAssignedTo]     = useState('')
  const [routeName,      setRouteName]      = useState('')

  // ── Users & customers ───────────────────────────────────────────────────────
  const [users,          setUsers]          = useState<User[]>([])
  const [customers,      setCustomers]      = useState<Customer[]>([])
  const [stops,          setStops]          = useState<StopCard[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showPicker,     setShowPicker]     = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Optimise result ─────────────────────────────────────────────────────────
  const [optimising,     setOptimising]     = useState(false)
  const [optimiseError,  setOptimiseError]  = useState('')
  const [result,         setResult]         = useState<OptimiseResult | null>(null)
  const [brokenIds,      setBrokenIds]      = useState<Set<string>>(new Set())

  // ── Save state ──────────────────────────────────────────────────────────────
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [saveError,      setSaveError]      = useState('')

  // ── Fetch users and customers ───────────────────────────────────────────────
  useEffect(() => {
    // Fetch customers from dedicated route planner endpoint (includes postcode + coords)
    fetch('/api/routes/customers')
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          console.error('[routes/page] Customer fetch error:', d.error)
          return
        }
        const all       = d.customers ?? []
        const withPost  = all.filter((c: Customer) => c.postcode)
        const noPost    = all.filter((c: Customer) => !c.postcode)
        console.log(`[routes/page] Loaded ${all.length} customers — ${withPost.length} with postcode, ${noPost.length} without`)
        if (noPost.length > 0) {
          console.warn('[routes/page] Customers missing postcodes (excluded from picker):', noPost.map((c: Customer) => c.name))
        }
        setCustomers(withPost)
      })
      .catch(err => console.error('[routes/page] Customer fetch network error:', err))

    // Dedicated endpoint — /api/admin/users is admin-only (307 for non-admins)
    fetch('/api/routes/users')
      .then(r => {
        if (!r.ok) { console.error('[routes/page] Users fetch failed:', r.status, r.url); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        const list: User[] = d.users ?? []
        console.log(`[routes/page] ${list.length} assignable users:`, list.map(u => `${u.name}(${u.role})`).join(', ') || 'NONE')
        setUsers(list)
      })
      .catch(err => console.error('[routes/page] Users fetch network error:', err))
  }, [])

  // ── Customer search filter ──────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim()
    const added = new Set(stops.map(s => s.id))
    return customers
      .filter(c => !added.has(c.id))
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.postcode ?? '').toLowerCase().includes(q))
      .slice(0, 40)
  }, [customers, stops, customerSearch])

  // ── Stop management ─────────────────────────────────────────────────────────
  const addStop = useCallback((customer: Customer) => {
    setStops(prev => [...prev, {
      ...customer,
      priority: 'none', lockedPosition: false, priorityNote: '', estimatedArrival: null,
    }])
    setCustomerSearch('')
    setShowPicker(false)
    setResult(null)
  }, [])

  const removeStop = useCallback((id: string) => {
    setStops(prev => prev.filter(s => s.id !== id))
    setResult(null)
  }, [])

  const updateStop = useCallback((id: string, patch: Partial<StopCard>) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    setResult(null)
  }, [])

  const moveStop = useCallback((index: number, dir: -1 | 1) => {
    setStops(prev => {
      const next = [...prev]
      const swap = index + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[index], next[swap]] = [next[swap], next[index]]
      // Clear all ETAs — they're now stale after manual reorder
      return next.map(s => ({ ...s, estimatedArrival: null }))
    })
    setResult(null)
  }, [])

  // ── Optimise ────────────────────────────────────────────────────────────────
  const handleOptimise = useCallback(async () => {
    if (stops.length < 2) return

    // Block optimise if any stop has no postcode — Google will fail
    const invalidStops = stops.filter(s => !s.postcode)
    if (invalidStops.length > 0) {
      setOptimiseError(
        `${invalidStops.map(s => s.name).join(', ')} ${invalidStops.length === 1 ? 'has' : 'have'} no postcode — remove ${invalidStops.length === 1 ? 'it' : 'them'} or add a postcode in the customer record first.`
      )
      return
    }

    setOptimising(true)
    setOptimiseError('')
    setResult(null)
    setBrokenIds(new Set())

    const payload = {
      stops: stops.map(s => ({
        customerId:     s.id,
        lockedPosition: s.lockedPosition,
        priority:       s.priority,
        priorityNote:   s.priorityNote || null,
      })),
      departureTime,
      endPoint,
      plannedDate,
    }

    // Client-side log so you can see exactly what's being sent
    console.log('[routes/optimise] Sending payload:', {
      stopCount:     payload.stops.length,
      postcodes:     stops.map(s => `${s.name}: ${s.postcode}`),
      departureTime: payload.departureTime,
      endPoint:      payload.endPoint,
      plannedDate:   payload.plannedDate,
    })

    try {
      const res  = await fetch('/api/routes/optimise', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        // ZERO_RESULTS with sniffer data — highlight broken stops on cards
        if (data.error === 'ZERO_RESULTS' && data.brokenPostcodes?.length > 0) {
          const ids = new Set<string>(
            (data.brokenPostcodes as { customerId: string }[]).map(b => b.customerId)
          )
          setBrokenIds(ids)
          setOptimiseError(data.message ?? 'Some postcodes could not be routed. Fix the highlighted stops.')
          return
        }

        // Generic error — map to friendly message
        const raw = (data.error ?? data.message ?? '') as string
        const friendly =
          raw.includes('ZERO_RESULTS')
            ? 'Could not calculate a route. Please check all postcodes are correct and reachable by road.'
            : raw.includes('REQUEST_DENIED')
            ? 'Google Maps access denied. The API key may not have the Directions API enabled — contact your admin.'
            : raw.includes('OVER_DAILY_LIMIT') || raw.includes('OVER_QUERY_LIMIT')
            ? 'Google Maps quota exceeded for today. Try again tomorrow or contact your admin.'
            : raw.includes('INVALID_REQUEST')
            ? 'Invalid request — one or more postcodes may be in the wrong format.'
            : raw || 'Optimisation failed — try again.'
        console.error('[routes/optimise] Error from server:', raw)
        setOptimiseError(friendly)
        return
      }

      setResult(data)
      setBrokenIds(new Set())

      // ── Diagnostic: log the order Google returned ────────────────────────
      console.log('[routes/optimise] Result received:', {
        stopCount:    (data.orderedStops as RouteStop[]).length,
        newSequence:  (data.orderedStops as RouteStop[]).map((s: RouteStop) => `${s.position}. ${s.customerName}`),
        totalKm:      data.totalDistanceKm,
        totalMin:     data.totalDurationMin,
      })

      // ── Reorder stops + merge ETAs in one pass ───────────────────────────
      // Build lookup: customerId → { position, estimatedArrival }
      const etaMap = new Map<string, { position: number; estimatedArrival: string | null }>(
        (data.orderedStops as RouteStop[]).map((s: RouteStop) => [
          s.customerId,
          { position: s.position, estimatedArrival: s.estimatedArrival ?? null },
        ])
      )
      setStops(prev =>
        [...prev]
          .sort((a, b) => (etaMap.get(a.id)?.position ?? 99) - (etaMap.get(b.id)?.position ?? 99))
          .map(s => ({ ...s, estimatedArrival: etaMap.get(s.id)?.estimatedArrival ?? null }))
      )
    } catch {
      setOptimiseError('Network error — check your connection and try again.')
    } finally {
      setOptimising(false)
    }
  }, [stops, departureTime, endPoint, plannedDate])

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!assignedTo) { setSaveError('Select a person to assign to'); return }
    if (stops.length === 0) { setSaveError('Add at least one stop'); return }
    setSaving(true)
    setSaveError('')
    try {
      const stopsPayload = (result?.orderedStops ?? stops.map((s, i) => ({
        customerId:            s.id,
        position:              i + 1,
        priority:              s.priority,
        lockedPosition:        s.lockedPosition,
        priorityNote:          s.priorityNote || null,
        estimatedArrival:      null,
        driveTimeFromPrevMin:  null,
        distanceFromPrevKm:    null,
      }))).map((s, i) => ({
        customerId:            s.customerId,
        position:              i + 1,
        priority:              (s as RouteStop).priority ?? stops[i]?.priority ?? 'none',
        lockedPosition:        (s as RouteStop & { lockedPosition?: boolean }).lockedPosition ?? stops[i]?.lockedPosition ?? false,
        priorityNote:          (s as RouteStop & { priorityNote?: string }).priorityNote ?? stops[i]?.priorityNote ?? null,
        estimatedArrival:      (s as RouteStop).estimatedArrival ?? null,
        driveTimeFromPrevMin:  (s as RouteStop).driveTimeFromPrevMin ?? null,
        distanceFromPrevKm:    (s as RouteStop).distanceFromPrevKm ?? null,
      }))

      const res = await fetch('/api/routes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:             routeName.trim() || null,
          plannedDate,
          assignedTo,
          departureTime,
          endPoint,
          stops:            stopsPayload,
          totalDistanceKm:  result?.totalDistanceKm  ?? null,
          totalDurationMin: result?.totalDurationMin ?? null,
          googleMapsUrl:    result?.googleMapsUrl    ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error ?? 'Save failed'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setSaveError('Network error — try again')
    } finally {
      setSaving(false)
    }
  }, [assignedTo, stops, plannedDate, departureTime, endPoint, routeName, result])

  // ── Map stops — always from stops state so manual reorders update the polyline ──
  // After optimise, stops are already sorted and have ETAs merged in.
  // After manual reorder (up/down arrows), stops state changes and map redraws.
  const mapStops: RouteStop[] = stops.map((s, i) => ({
    position:         i + 1,
    customerId:       s.id,
    customerName:     s.name,
    postcode:         s.postcode,
    lat:              s.lat,
    lng:              s.lng,
    priority:         s.priority,
    estimatedArrival: s.estimatedArrival ?? null,
  }))

  return (
    <div className="min-h-screen bg-[#F5F3EE] flex flex-col">
      <AppHeader />

      {/* Page header */}
      <div className="bg-[#16205B] px-4 pb-4">
        <h1 className="text-white font-bold text-lg">Route Planner</h1>
        <p className="text-white/50 text-xs mt-0.5">Build, optimise and assign delivery routes</p>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-4 lg:p-4 overflow-hidden">

        {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
        <div className="lg:w-[420px] lg:flex-shrink-0 flex flex-col overflow-y-auto">

          {/* Route meta */}
          <div className="bg-white border-b border-[#EDEAE1] lg:rounded-xl lg:border px-4 py-4 space-y-3">

            {/* Route name (optional) */}
            <div>
              <label className="block text-[10px] font-bold text-[#16205B]/50 uppercase tracking-widest mb-1">
                Route name (optional)
              </label>
              <input
                type="text"
                value={routeName}
                onChange={e => setRouteName(e.target.value)}
                placeholder="e.g. Sheffield North run"
                className="w-full h-10 rounded-xl border border-[#EDEAE1] px-3 text-sm text-gray-800 focus:outline-none focus:border-[#EB6619]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Date */}
              <div>
                <label className="block text-[10px] font-bold text-[#16205B]/50 uppercase tracking-widest mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={e => { setPlannedDate(e.target.value); setResult(null) }}
                  className="w-full h-10 rounded-xl border border-[#EDEAE1] px-3 text-sm text-gray-800 focus:outline-none focus:border-[#EB6619]"
                />
              </div>

              {/* Departure time */}
              <div>
                <label className="block text-[10px] font-bold text-[#16205B]/50 uppercase tracking-widest mb-1">
                  Depart
                </label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={e => { setDepartureTime(e.target.value); setResult(null) }}
                  className="w-full h-10 rounded-xl border border-[#EDEAE1] px-3 text-sm text-gray-800 focus:outline-none focus:border-[#EB6619]"
                />
              </div>
            </div>

            {/* Assign to */}
            <div>
              <label className="block text-[10px] font-bold text-[#16205B]/50 uppercase tracking-widest mb-1">
                Assign to
              </label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#EDEAE1] px-3 text-sm text-gray-800 focus:outline-none focus:border-[#EB6619] bg-white"
              >
                <option value="">Select person…</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            {/* End point */}
            <div>
              <label className="block text-[10px] font-bold text-[#16205B]/50 uppercase tracking-widest mb-1.5">
                End at
              </label>
              <div className="flex gap-2">
                {([
                  { value: 'mfs',               label: 'MFS  S3 8DG' },
                  { value: 'ozmen_john_street',  label: 'Ozmen  S2 4QT' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setEndPoint(opt.value); setResult(null) }}
                    className={[
                      'flex-1 h-9 rounded-xl text-xs font-semibold border-2 transition-colors',
                      endPoint === opt.value
                        ? 'bg-[#16205B] border-[#16205B] text-white'
                        : 'border-[#EDEAE1] text-[#16205B]/60 hover:border-[#16205B]/30',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stops section */}
          <div className="bg-white border-b border-[#EDEAE1] lg:rounded-xl lg:border px-4 py-4 mt-0 lg:mt-3 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[#16205B]">
                Stops
                {stops.length > 0 && (
                  <span className="ml-2 text-[#16205B]/40 font-normal">{stops.length}</span>
                )}
              </h2>
              {stops.length > 1 && (
                <p className="text-[10px] text-gray-400">Use arrows to reorder · 📌 to lock</p>
              )}
            </div>

            {/* Stop cards */}
            <div className="space-y-2 mb-3">
              {stops.map((stop, i) => (
                <StopCardRow
                  key={stop.id}
                  stop={stop}
                  index={i}
                  total={stops.length}
                  onChange={updateStop}
                  onRemove={removeStop}
                  onMove={moveStop}
                  broken={brokenIds.has(stop.id)}
                  onPostcodeUpdate={(id, newPostcode) => {
                    // Update local stop state with new postcode so card re-renders immediately
                    setStops(prev => prev.map(s => s.id === id ? { ...s, postcode: newPostcode } : s))
                    // Clear broken flag for this stop — user has fixed it
                    setBrokenIds(prev => { const n = new Set(prev); n.delete(id); return n })
                    setOptimiseError('')
                  }}
                />
              ))}
            </div>

            {/* Customer picker */}
            <div className="relative">
              <input
                ref={searchRef}
                type="text"
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setShowPicker(true) }}
                onFocus={() => setShowPicker(true)}
                placeholder="+ Add customer…"
                className="w-full h-10 rounded-xl border-2 border-dashed border-[#EDEAE1] px-3 text-sm text-[#16205B] placeholder:text-[#16205B]/30 focus:outline-none focus:border-[#EB6619] bg-[#F5F3EE]"
              />
              {showPicker && filteredCustomers.length > 0 && (
                <div className="absolute left-0 right-0 top-11 z-50 bg-white border border-[#EDEAE1] rounded-xl shadow-xl max-h-52 overflow-y-auto">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); addStop(c) }}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[#F5F3EE] border-b border-[#EDEAE1] last:border-0 transition-colors"
                    >
                      <span className="text-sm font-medium text-[#16205B] truncate">{c.name}</span>
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{c.postcode}</span>
                    </button>
                  ))}
                </div>
              )}
              {showPicker && customerSearch.length > 0 && filteredCustomers.length === 0 && (
                <div className="absolute left-0 right-0 top-11 z-50 bg-white border border-[#EDEAE1] rounded-xl shadow-xl px-3 py-3">
                  <p className="text-sm text-gray-400">No customers found</p>
                </div>
              )}
            </div>

            {/* Optimise error */}
            {optimiseError && (
              <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-xs text-red-700">{optimiseError}</p>
              </div>
            )}

            {/* Result summary */}
            {result && (
              <div className="mt-3 px-3 py-3 bg-[#16205B]/5 rounded-xl border border-[#16205B]/10">
                <div className="flex items-center gap-4 text-[#16205B]">
                  <div className="text-center">
                    <p className="text-base font-bold">{fmtDuration(result.totalDurationMin)}</p>
                    <p className="text-[10px] text-[#16205B]/50">Drive time</p>
                  </div>
                  <div className="w-px h-8 bg-[#16205B]/10" />
                  <div className="text-center">
                    <p className="text-base font-bold">{result.totalDistanceKm} km</p>
                    <p className="text-[10px] text-[#16205B]/50">Distance</p>
                  </div>
                  <div className="w-px h-8 bg-[#16205B]/10" />
                  <div className="text-center">
                    <p className="text-base font-bold">{stops.length}</p>
                    <p className="text-[10px] text-[#16205B]/50">Stops</p>
                  </div>
                </div>
                <a
                  href={result.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-center gap-2 w-full h-9 rounded-xl bg-white border border-[#EDEAE1] text-xs font-semibold text-[#16205B] hover:bg-[#F5F3EE] transition-colors"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                    <path d="M10 2C6.13 2 3 5.13 3 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7Z" stroke="#EB6619" strokeWidth="1.5"/>
                    <circle cx="10" cy="9" r="2.5" stroke="#EB6619" strokeWidth="1.5"/>
                  </svg>
                  Preview in Google Maps
                </a>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="bg-white border-t border-[#EDEAE1] lg:bg-transparent lg:border-0 px-4 py-4 lg:px-0 flex gap-3">
            <button
              type="button"
              onClick={handleOptimise}
              disabled={optimising || stops.length < 2 || stops.some(s => !s.postcode)}
              className="flex-1 h-12 rounded-xl bg-[#16205B] text-white font-bold text-sm disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              style={{ touchAction: 'manipulation' }}
            >
              {optimising ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Optimising…
                </>
              ) : stops.length < 2 ? 'Add 2+ stops to optimise' : stops.some(s => !s.postcode) ? '⚠ Fix missing postcodes' : '✨ Optimise Route'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || stops.length === 0 || !assignedTo}
              className="flex-1 h-12 rounded-xl bg-[#EB6619] text-white font-bold text-sm disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              style={{ touchAction: 'manipulation' }}
            >
              {saving ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Saving…
                </>
              ) : saved ? '✓ Saved!' : '💾 Save & Assign'}
            </button>
          </div>

          {saveError && (
            <p className="px-4 pb-3 text-xs text-red-600 lg:px-0">{saveError}</p>
          )}
        </div>

        {/* ── RIGHT PANEL — MAP ────────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-1 flex-col">
          <div className="flex-1 rounded-xl overflow-hidden border border-[#EDEAE1] min-h-[500px]">
            {mapStops.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full bg-[#F5F3EE] text-center px-6">
                <div className="w-16 h-16 rounded-full bg-[#16205B]/5 flex items-center justify-center mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#16205B" strokeWidth="1.5" className="w-8 h-8 opacity-30">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                    <line x1="9" y1="3" x2="9" y2="18"/>
                    <line x1="15" y1="6" x2="15" y2="21"/>
                  </svg>
                </div>
                <p className="text-[#16205B]/30 text-sm font-medium">Add stops to see the route map</p>
              </div>
            ) : (
              <RouteMap stops={mapStops} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
