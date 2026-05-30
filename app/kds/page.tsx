'use client'

/**
 * app/kds/page.tsx
 *
 * Kitchen Display System for the production room. Full-screen kiosk
 * mode on a wall-mounted touchscreen.
 *
 * Features:
 *   - Order cards grid showing all printed orders, ordered by delivery
 *     date then by print time (oldest first = top-left)
 *   - Each card lists the order's line items with a Done tap per line
 *   - When all lines are done, the card animates to 'completed' state
 *     and fades out after 30s
 *   - Multi-butcher sign-in dock at the top — butcher taps "Sign in",
 *     enters PIN, joins the active-butchers list. Tapping Done on a
 *     line with multiple butchers signed in prompts for attribution.
 *   - Card flashes orange for 30s after the office amends or reprints
 *     the order (signal to the butcher to re-check the paper sheet)
 *
 * Polling: 2-second interval. Tab-visibility-aware to avoid burning
 * battery on tablets in screensaver mode.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB5)
 */

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, useRef } from 'react'

import type { OrderState, OrderUom } from '@/lib/orders/types'
import { useProductsWithDetail } from '@/hooks/useReferenceData'
import {
  isCardFlashing,
  cardFadeOpacity,
  isCardVisible,
  aggregateDoneCount,
  COMPLETED_FADE_MS,
  type KdsFlashEvent,
  type KdsCardOrder,
} from '@/lib/orders/kdsLogic'

// ─── Constants ─────────────────────────────────────────────────

const POLL_INTERVAL_MS    = 2000
const SESSION_STORAGE_KEY = 'mfs.kds.butchers'

// ─── Types ─────────────────────────────────────────────────────

interface KdsLine {
  id:                 string
  line_number:        number
  product_id:         string | null
  ad_hoc_description: string | null
  quantity:           number
  uom:                OrderUom
  notes:              string | null
  done_at:            string | null
  done_by:            string | null
}

interface KdsOrder {
  id:             string
  reference:      string
  state:          OrderState
  delivery_date:  string
  delivery_notes: string | null
  order_notes:    string | null
  printed_at:     string | null
  completed_at:   string | null
  customer:       { id: string; name: string } | null
  lines:          KdsLine[]
}

interface FlashEntry {
  order_id:   string
  action:     string
  created_at: string
}

interface KdsPayload {
  orders:         KdsOrder[]
  recent_flashes: FlashEntry[]
  server_time:    string
}

interface SignedInButcher {
  id:   string
  name: string
  role: string
  /** ISO timestamp when this butcher signed in */
  since: string
}

// ─── Component ─────────────────────────────────────────────────

export default function KdsPage() {
  const [orders,         setOrders]         = useState<KdsOrder[]>([])
  const [recentFlashes,  setRecentFlashes]  = useState<FlashEntry[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [now,            setNow]            = useState(Date.now())

  // Signed-in butchers (persisted to sessionStorage so a tab refresh
  // doesn't kick everyone off)
  const [butchers, setButchers] = useState<SignedInButcher[]>([])
  const [showPinModal,        setShowPinModal]        = useState(false)
  const [attributingLine,     setAttributingLine]     = useState<{ orderId: string; lineId: string } | null>(null)

  // ── Load signed-in butchers from sessionStorage on mount ────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (raw) setButchers(JSON.parse(raw))
    } catch (e) {
      console.error('[KDS] failed to read butchers from sessionStorage', e)
    }
  }, [])

  // Persist butchers list
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(butchers))
    } catch {
      // sessionStorage may be unavailable — non-fatal
    }
  }, [butchers])

  // ── Poll the KDS queue ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/kds/orders', { cache: 'no-store' })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError(body?.error ?? `Server error (${res.status})`)
        } else {
          const payload = body as KdsPayload
          setOrders(payload.orders)
          setRecentFlashes(payload.recent_flashes)
          setError(null)
        }
      } catch (e) {
        console.error('[KDS] poll failed', e)
        if (!cancelled) setError('Network error — retrying')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_INTERVAL_MS)

    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Tick `now` every second so flash + fade timers expire on screen
  // without needing a manual re-render trigger
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  // ── Sign-in handlers ───────────────────────────────────────

  function signIn(butcher: { id: string; name: string; role: string }) {
    setButchers(prev => {
      // Already signed in? Update timestamp.
      const filtered = prev.filter(b => b.id !== butcher.id)
      return [...filtered, { ...butcher, since: new Date().toISOString() }]
    })
    setShowPinModal(false)
  }

  function signOut(id: string) {
    setButchers(prev => prev.filter(b => b.id !== id))
  }

  // ── Done tap handler ───────────────────────────────────────

  async function markLineDone(orderId: string, lineId: string, butcherId: string) {
    try {
      const res = await fetch(`/api/orders/${orderId}/lines/${lineId}/done`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ butcher_id: butcherId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[KDS] markLineDone failed', body)
        // Visible error — but don't disrupt the queue
        setError(body?.error ?? 'Failed to mark done')
        setTimeout(() => setError(null), 3000)
      }
      // Polling will refresh the UI within 2s
    } catch (e) {
      console.error('[KDS] markLineDone network error', e)
    }
  }

  function handleLineTap(orderId: string, lineId: string) {
    if (butchers.length === 0) {
      setShowPinModal(true)
      return
    }
    if (butchers.length === 1) {
      void markLineDone(orderId, lineId, butchers[0].id)
      return
    }
    // Multiple butchers — prompt for attribution
    setAttributingLine({ orderId, lineId })
  }

  // ── Filter visible orders ─────────────────────────────────

  const visibleOrders = useMemo(() => {
    return orders.filter(o => isCardVisible(o, now))
  }, [orders, now])

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Top bar — sign-in dock + clock */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Production queue</h1>
          {loading && <span className="text-xs text-slate-400">Loading…</span>}
          {error && <span className="text-xs text-red-400 font-bold">{error}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {butchers.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => signOut(b.id)}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
              title="Tap to sign out"
            >
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              {b.name}
              <span className="text-slate-400 text-xs">✕</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowPinModal(true)}
            className="bg-orange-600 hover:bg-orange-700 rounded-full px-4 py-1.5 text-sm font-bold transition-colors"
          >
            + Sign in
          </button>
        </div>
      </header>

      {/* Cards grid */}
      <main className="p-6">
        {visibleOrders.length === 0 && !loading && (
          <div className="text-center py-20 text-slate-500">
            <p className="text-2xl">No orders to cut.</p>
            <p className="text-sm mt-2">Cards appear here when the office prints a picking sheet.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              flashes={recentFlashes}
              now={now}
              onLineTap={handleLineTap}
            />
          ))}
        </div>
      </main>

      {/* PIN modal */}
      {showPinModal && (
        <PinModal
          onSuccess={signIn}
          onDismiss={() => setShowPinModal(false)}
        />
      )}

      {/* Attribution modal */}
      {attributingLine && (
        <AttributionModal
          butchers={butchers}
          onPick={(butcherId) => {
            void markLineDone(attributingLine.orderId, attributingLine.lineId, butcherId)
            setAttributingLine(null)
          }}
          onDismiss={() => setAttributingLine(null)}
        />
      )}
    </div>
  )
}

// ─── Order card ────────────────────────────────────────────

function OrderCard({
  order, flashes, now, onLineTap,
}: {
  order:    KdsOrder
  flashes:  FlashEntry[]
  now:      number
  onLineTap: (orderId: string, lineId: string) => void
}) {
  const products = useProductsWithDetail()

  // Detect if this card should be flashing orange right now
  const isFlashing = isCardFlashing(order.id, flashes, now)
  const isCompleted = order.state === 'completed'
  const opacity = cardFadeOpacity(order, now)

  const { done: doneCount, total: totalCount } = aggregateDoneCount(order)

  return (
    <div
      style={{ opacity }}
      className={`bg-slate-800 rounded-xl p-4 border-4 transition-all ${
        isFlashing
          ? 'border-orange-500 animate-pulse shadow-lg shadow-orange-500/30'
          : isCompleted
            ? 'border-green-500'
            : 'border-slate-700'
      }`}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-400 font-mono">{order.reference}</p>
          <h2 className="text-lg font-bold text-white truncate">{order.customer?.name ?? '—'}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Delivery {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-GB', {
              weekday: 'short', day: 'numeric', month: 'short',
            })}
          </p>
          {order.delivery_notes && (
            <p className="text-xs text-amber-400 mt-1 italic">⏰ {order.delivery_notes}</p>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
          isCompleted ? 'bg-green-600 text-white' : 'bg-orange-600 text-white'
        }`}>
          {doneCount}/{totalCount}
        </span>
      </div>

      {order.order_notes && (
        <div className="mb-3 rounded-lg bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
          <span className="font-bold text-slate-400">Note:</span> {order.order_notes}
        </div>
      )}

      {/* Line items */}
      <ul className="space-y-1.5">
        {order.lines
          .slice()
          .sort((a, b) => a.line_number - b.line_number)
          .map(line => {
            const product = line.product_id ? products.find(p => p.id === line.product_id) : null
            const description = line.ad_hoc_description ?? product?.name ?? '(unknown product)'
            const isDone = line.done_at !== null

            return (
              <li key={line.id}>
                <button
                  type="button"
                  onClick={() => !isDone && !isCompleted && onLineTap(order.id, line.id)}
                  disabled={isDone || isCompleted}
                  className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-3 transition-colors ${
                    isDone
                      ? 'bg-green-900/30 border border-green-700/50 cursor-default'
                      : 'bg-slate-700 hover:bg-slate-600 active:scale-[0.98]'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDone ? 'bg-green-600' : 'bg-slate-600 border-2 border-slate-500'
                  }`}>
                    {isDone && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${isDone ? 'text-green-300 line-through' : 'text-white'}`}>
                      {description}
                    </p>
                    {line.notes && (
                      <p className="text-xs text-slate-400 italic truncate">{line.notes}</p>
                    )}
                  </div>
                  <div className={`text-right ${isDone ? 'text-green-300' : 'text-white'}`}>
                    <p className="text-base font-bold font-mono">
                      {line.quantity}<span className="text-xs ml-0.5">{line.uom}</span>
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
      </ul>

      {isCompleted && (
        <div className="mt-3 text-center text-xs text-green-400 font-bold uppercase tracking-wider">
          ✓ Completed
        </div>
      )}
    </div>
  )
}

// ─── PIN modal ─────────────────────────────────────────────

function PinModal({
  onSuccess,
  onDismiss,
}: {
  onSuccess: (b: { id: string; name: string; role: string }) => void
  onDismiss: () => void
}) {
  const [pin, setPin]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function trySubmit(value: string) {
    if (!value || value.length < 3) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/kds-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error ?? 'Invalid PIN')
        setPin('')
        setSubmitting(false)
        return
      }
      onSuccess(body as { id: string; name: string; role: string })
    } catch (e) {
      console.error('[KDS PinModal] submit failed', e)
      setError('Network error')
      setSubmitting(false)
    }
  }

  function pressDigit(d: string) {
    if (submitting) return
    const next = (pin + d).slice(0, 8)
    setPin(next)
    if (next.length >= 4) {
      // Auto-submit when 4+ digits — most PINs are 4
      void trySubmit(next)
    }
  }

  function pressBack() {
    if (submitting) return
    setPin(p => p.slice(0, -1))
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
      <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Butcher sign-in</h3>
          <button type="button" onClick={onDismiss} className="text-slate-400 hover:text-white text-2xl leading-none">✕</button>
        </div>
        <p className="text-sm text-slate-400 mb-4">Enter your PIN</p>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={pin}
          readOnly
          className="w-full bg-slate-700 text-white text-center text-3xl font-mono tracking-widest rounded-xl py-4 mb-4"
        />

        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} type="button" onClick={() => pressDigit(d)} disabled={submitting}
              className="h-16 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white text-2xl font-bold transition-colors disabled:opacity-50">
              {d}
            </button>
          ))}
          <button type="button" onClick={pressBack} disabled={submitting}
            className="h-16 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xl font-bold disabled:opacity-50">
            ⌫
          </button>
          <button type="button" onClick={() => pressDigit('0')} disabled={submitting}
            className="h-16 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-2xl font-bold disabled:opacity-50">
            0
          </button>
          <button type="button" onClick={() => trySubmit(pin)} disabled={submitting || pin.length < 3}
            className="h-16 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-base font-bold disabled:opacity-50">
            {submitting ? '…' : 'OK'}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-red-400 font-bold">{error}</p>
        )}
      </div>
    </div>
  )
}

// ─── Attribution modal ─────────────────────────────────────

function AttributionModal({
  butchers,
  onPick,
  onDismiss,
}: {
  butchers: SignedInButcher[]
  onPick:    (butcherId: string) => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
      <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Who marked this done?</h3>
          <button type="button" onClick={onDismiss} className="text-slate-400 hover:text-white text-2xl leading-none">✕</button>
        </div>
        <div className="space-y-2">
          {butchers.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => onPick(b.id)}
              className="w-full bg-slate-700 hover:bg-slate-600 rounded-xl px-4 py-4 text-left font-bold text-white text-lg transition-colors active:scale-[0.99]"
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
