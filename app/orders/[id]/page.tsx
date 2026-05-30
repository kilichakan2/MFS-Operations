'use client'

/**
 * app/orders/[id]/page.tsx
 *
 * Read-only order view. Used after print, after completion, and as the
 * landing page after a sales rep confirms a new order.
 *
 * Shows: customer, delivery date, lines, notes, state, audit highlights
 * (created by, printed by, completed at).
 *
 * Edit button visible only when state='placed' (jumps to /orders/[id]/edit).
 * Office can override and edit a printed order via the edit page itself,
 * which surfaces an EditLockBanner with a warning rather than a block.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 */

export const dynamic = 'force-dynamic'

import { useEffect, useState, use as usePromise } from 'react'
import Link from 'next/link'

import AppHeader from '@/components/AppHeader'
import RoleNav   from '@/components/RoleNav'
import { useProductsWithDetail } from '@/hooks/useReferenceData'

import type { OrderState, OrderUom } from '@/lib/orders/types'

interface LineRow {
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

interface OrderPayload {
  id:             string
  reference:      string
  delivery_date:  string
  delivery_notes: string | null
  order_notes:    string | null
  state:          OrderState
  created_at:     string
  printed_at:     string | null
  completed_at:   string | null
  customer:       { id: string; name: string; postcode: string | null } | null
  creator:        { id: string; name: string } | null
  printer:        { id: string; name: string } | null
  lines:          LineRow[]
}

interface OrderDetailPageProps {
  params: Promise<{ id: string }>
}

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = usePromise(params)
  const [order,    setOrder]    = useState<OrderPayload | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res  = await fetch(`/api/orders/${id}`, { cache: 'no-store' })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError(body?.error ?? `Server error (${res.status})`)
        } else {
          setOrder(body.order)
        }
      } catch (e) {
        console.error('[OrderDetailPage] load failed', e)
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id])

  return (
    <>
      <AppHeader title="Order" maxWidth="2xl" />
      <main className="max-w-2xl mx-auto px-4 py-4 pb-32 space-y-4">

        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {order && (
          <>
            {/* Header card */}
            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reference</p>
                  <p className="font-mono font-bold text-base">{order.reference}</p>
                  <p className="mt-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Customer</p>
                  <p className="font-semibold text-slate-900">{order.customer?.name ?? '—'}</p>
                  {order.customer?.postcode && (
                    <p className="text-xs text-slate-500 mt-0.5">{order.customer.postcode}</p>
                  )}
                </div>
                <StateChip state={order.state} />
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider">Delivery</p>
                  <p className="text-slate-900 font-semibold mt-0.5">
                    {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider">Placed by</p>
                  <p className="text-slate-900 font-semibold mt-0.5">{order.creator?.name ?? '—'}</p>
                </div>
              </div>

              {order.delivery_notes && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Delivery notes</p>
                  <p className="text-sm text-slate-700 mt-0.5">{order.delivery_notes}</p>
                </div>
              )}

              {order.order_notes && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Order notes</p>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{order.order_notes}</p>
                </div>
              )}
            </section>

            {/* Lines */}
            <section className="space-y-2">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                Line items ({order.lines.length})
              </h2>
              {order.lines
                .slice()
                .sort((a, b) => a.line_number - b.line_number)
                .map(line => (
                  <LineCard key={line.id} line={line} />
                ))}
            </section>

            {/* Print picking list — primary action for office/warehouse */}
            <PrintPickingListButton order={order} />

            {/* Edit button — only available while placed */}
            {order.state === 'placed' && (
              <Link
                href={`/orders/${order.id}/edit`}
                className="block w-full h-14 rounded-xl bg-slate-900 text-white text-base font-bold transition-opacity active:scale-[0.99] flex items-center justify-center"
              >
                Edit order
              </Link>
            )}
            {(order.state === 'printed' || order.state === 'completed') && (
              <Link
                href={`/orders/${order.id}/edit`}
                className="block w-full h-14 rounded-xl bg-slate-100 text-slate-700 text-base font-bold border-2 border-slate-200 flex items-center justify-center"
              >
                {order.state === 'completed' ? 'View (completed)' : 'View / amend (office only)'}
              </Link>
            )}
          </>
        )}
      </main>
      <RoleNav />
    </>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────

function StateChip({ state }: { state: OrderState }) {
  const styles: Record<OrderState, string> = {
    placed:    'bg-blue-100  text-blue-700',
    printed:   'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-700',
  }
  const label: Record<OrderState, string> = {
    placed: 'Placed', printed: 'Printed', completed: 'Completed',
  }
  return (
    <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wider ${styles[state]}`}>
      {label[state]}
    </span>
  )
}

function LineCard({ line }: { line: LineRow }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm">
            {line.ad_hoc_description ?? <ProductName id={line.product_id} />}
          </p>
          {line.notes && (
            <p className="text-xs text-slate-500 mt-0.5 italic">{line.notes}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-bold text-slate-900 text-base font-mono">
            {line.quantity} <span className="text-slate-400 text-xs">{line.uom}</span>
          </p>
          {line.done_at && (
            <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider mt-0.5">Done</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Lazily looks up the product name from the offline catalogue. The hook
// returns live-synced Dexie data so this is cheap to call per line.
function ProductName({ id }: { id: string | null }) {
  const products = useProductsWithDetail()
  if (!id) return <>—</>
  const p = products.find(x => x.id === id)
  return <>{p?.name ?? 'Unknown product'}</>
}

// ─── Print picking list button + iframe ──────────────────────

function PrintPickingListButton({ order }: { order: OrderPayload }) {
  const [printing, setPrinting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Hide for completed orders entirely — can't reprint after completion
  if (order.state === 'completed') return null

  async function handlePrint() {
    setError(null)
    setPrinting(true)

    try {
      const res = await fetch(`/api/orders/${order.id}/picking-list`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? `Server error (${res.status})`)
        setPrinting(false)
        return
      }
      const html = await res.text()

      // Inject into a hidden iframe; the iframe's onload triggers window.print()
      // automatically (the picking-list HTML has that wired in).
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right    = '0'
      iframe.style.bottom   = '0'
      iframe.style.width    = '0'
      iframe.style.height   = '0'
      iframe.style.border   = '0'
      document.body.appendChild(iframe)
      iframe.srcdoc = html

      // Clean up the iframe a few seconds after the print dialog opens.
      // Most browsers keep the dialog alive until the user dismisses it,
      // and the iframe being removed doesn't kill the dialog.
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 5000)

      // Refresh the page state so the UI reflects 'printed'
      setTimeout(() => { window.location.reload() }, 1000)
    } catch (e) {
      console.error('[PrintPickingListButton] print failed', e)
      setError('Network error — please try again')
      setPrinting(false)
    }
  }

  const isReprint = order.state === 'printed'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handlePrint}
        disabled={printing}
        className="w-full h-14 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-base font-bold disabled:opacity-50 transition-opacity active:scale-[0.99] flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        {printing ? 'Preparing…' : (isReprint ? 'Reprint picking list' : 'Print picking list')}
      </button>
      <p className="text-[11px] text-slate-500 text-center px-2">
        {isReprint
          ? 'This will print a fresh sheet — retrieve the old one from the butcher first.'
          : 'Printing will lock this order from sales edits.'}
      </p>
      {error && (
        <p className="text-xs text-red-600 text-center">{error}</p>
      )}
    </div>
  )
}
