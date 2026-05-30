'use client'

/**
 * app/orders/[id]/edit/page.tsx
 *
 * Order edit form. Shape closely mirrors /orders/new but:
 *   - Initial state is loaded from the existing order
 *   - State is sent via PUT instead of POST
 *   - EditLockBanner appears when the order is `printed`
 *   - When state='completed', form is fully read-only
 *
 * Permissions are enforced server-side by the PUT handler — this page
 * just renders accordingly. If a sales rep loads a printed order they
 * see the banner saying "only office can amend" and the submit button
 * is hidden; office users see the warning banner instead.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 */

export const dynamic = 'force-dynamic'

import { useEffect, useState, useId, use as usePromise } from 'react'
import { useRouter } from 'next/navigation'

import AppHeader            from '@/components/AppHeader'
import RoleNav              from '@/components/RoleNav'
import BottomSheetSelector  from '@/components/BottomSheetSelector'
import EditLockBanner       from '@/components/EditLockBanner'
import OrderPipelinePausedNotice from '@/components/OrderPipelinePausedNotice'
import { useCustomers, useProductsWithDetail } from '@/hooks/useReferenceData'
import type { SelectableItem } from '@/components/BottomSheetSelector'
import type { OrderState, OrderUom } from '@/lib/orders/types'
import { isOrderPipelineEnabled } from '@/lib/orders/featureFlag'

// ─── Types ─────────────────────────────────────────────────────

interface DraftLine {
  key:        string
  product_id: string | null
  ad_hoc:     string
  quantity:   string
  uom:        OrderUom
  notes:      string
}

interface LoadedOrder {
  id:             string
  reference:      string
  state:          OrderState
  customer_id:    string
  delivery_date:  string
  delivery_notes: string | null
  order_notes:    string | null
  customer:       { id: string; name: string } | null
  lines: Array<{
    id:                 string
    line_number:        number
    product_id:         string | null
    ad_hoc_description: string | null
    quantity:           number
    uom:                OrderUom
    notes:              string | null
  }>
}

function newDraftKey() { return crypto.randomUUID() }

interface EditOrderPageProps {
  params: Promise<{ id: string }>
}

export default function EditOrderPage({ params }: EditOrderPageProps) {
  if (!isOrderPipelineEnabled()) {
    return <OrderPipelinePausedNotice />
  }
  return <EditOrderPageInner params={params} />
}

function EditOrderPageInner({ params }: EditOrderPageProps) {
  const { id } = usePromise(params)
  const router = useRouter()

  const customers = useCustomers()
  const products  = useProductsWithDetail()

  const productItems: SelectableItem[] = products.map(p => ({
    id:       p.id,
    label:    p.name,
    sublabel: p.box_size ? `${p.box_size}${p.category ? ` · ${p.category}` : ''}` : (p.category ?? undefined),
  }))

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [order,   setOrder]   = useState<LoadedOrder | null>(null)
  const [role,    setRole]    = useState<string>('')

  // Form fields — populated from the loaded order
  const [customer,      setCustomer]      = useState<SelectableItem | null>(null)
  const [deliveryDate,  setDeliveryDate]  = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [orderNotes,    setOrderNotes]    = useState('')
  const [lines,         setLines]         = useState<DraftLine[]>([])

  const [showCustomerPicker,      setShowCustomerPicker]      = useState(false)
  const [productPickerForLineKey, setProductPickerForLineKey] = useState<string | null>(null)
  const [submitting,              setSubmitting]              = useState(false)
  const [submitError,             setSubmitError]             = useState<string | null>(null)

  const formId = useId()

  // Read role from cookie (same pattern as RoleNav)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const m = document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)
    setRole(m?.[1] ?? '')
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/orders/${id}`, { cache: 'no-store' })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setLoadError(body?.error ?? `Server error (${res.status})`)
          setLoading(false)
          return
        }

        const o: LoadedOrder = body.order
        setOrder(o)
        if (o.customer) setCustomer({ id: o.customer.id, label: o.customer.name })
        setDeliveryDate(o.delivery_date)
        setDeliveryNotes(o.delivery_notes ?? '')
        setOrderNotes(o.order_notes ?? '')
        setLines(
          o.lines
            .slice()
            .sort((a, b) => a.line_number - b.line_number)
            .map(l => ({
              key:        newDraftKey(),
              product_id: l.product_id,
              ad_hoc:     l.ad_hoc_description ?? '',
              quantity:   String(l.quantity),
              uom:        l.uom,
              notes:      l.notes ?? '',
            }))
        )
        setLoading(false)
      } catch (e) {
        console.error('[EditOrderPage] load failed', e)
        if (!cancelled) {
          setLoadError('Network error')
          setLoading(false)
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id])

  // ── Helpers ─────────────────────────────────────────────────

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }
  function addLine() { setLines(prev => [...prev, { key: newDraftKey(), product_id: null, ad_hoc: '', quantity: '', uom: 'kg', notes: '' }]) }
  function removeLine(key: string) { setLines(prev => prev.filter(l => l.key !== key)) }
  function selectProductForLine(key: string, product: SelectableItem | null) {
    if (!product) updateLine(key, { product_id: null })
    else updateLine(key, { product_id: product.id, ad_hoc: '' })
  }

  function validate(): string | null {
    if (!customer)     return 'Customer is required'
    if (!deliveryDate) return 'Delivery date is required'
    if (lines.length === 0) return 'At least one line is required'
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const hasProduct = !!l.product_id
      const hasAdHoc   = l.ad_hoc.trim().length > 0
      if (hasProduct && hasAdHoc)   return `Line ${i + 1}: clear the ad-hoc text or remove the product`
      if (!hasProduct && !hasAdHoc) return `Line ${i + 1}: pick a product or write an ad-hoc description`
      const qty = parseFloat(l.quantity)
      if (!Number.isFinite(qty) || qty <= 0) return `Line ${i + 1}: quantity must be a positive number`
    }
    return null
  }

  async function handleSubmit() {
    const err = validate()
    if (err) { setSubmitError(err); return }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        delivery_date:  deliveryDate,
        delivery_notes: deliveryNotes.trim() || null,
        order_notes:    orderNotes.trim()    || null,
        lines: lines.map(l => ({
          product_id:         l.product_id,
          ad_hoc_description: l.product_id ? null : l.ad_hoc.trim(),
          quantity:           parseFloat(l.quantity),
          uom:                l.uom,
          notes:              l.notes.trim() || null,
        })),
      }
      const res = await fetch(`/api/orders/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(body?.error ?? `Server error (${res.status})`)
        setSubmitting(false)
        return
      }
      router.push(`/orders/${id}`)
    } catch (e) {
      console.error('[EditOrderPage] submit failed', e)
      setSubmitError('Network error — please try again')
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────

  const isPrinted   = order?.state === 'printed'
  const isCompleted = order?.state === 'completed'
  const canStillEdit = role === 'admin' || role === 'office'
  const submitDisabled = submitting || isCompleted || (isPrinted && !canStillEdit)

  return (
    <>
      <AppHeader title="Edit order" maxWidth="2xl" />
      <main className="max-w-2xl mx-auto px-4 py-4 pb-32 space-y-4">

        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            Loading…
          </div>
        )}
        {loadError && !loading && (
          <div className="rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-900">
            {loadError}
          </div>
        )}

        {!loading && !loadError && order && (
          <>
            {/* Reference + state */}
            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reference</p>
              <p className="font-mono font-bold">{order.reference}</p>
            </section>

            <EditLockBanner state={order.state} canStillEdit={canStillEdit} />

            {/* Customer (read-only on edit — customer change requires order recreation) */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 opacity-60">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer (cannot be changed)</label>
              <div className="mt-2 w-full text-left rounded-xl border-2 border-slate-200 px-4 py-3 bg-slate-50">
                <span className="font-semibold text-slate-900">{customer?.label ?? '—'}</span>
              </div>
            </section>

            {/* Delivery date + notes */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div>
                <label htmlFor={`${formId}-date`} className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivery date</label>
                <input
                  id={`${formId}-date`}
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  disabled={submitDisabled}
                  className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-semibold disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-delivery-notes`} className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivery notes</label>
                <input
                  id={`${formId}-delivery-notes`}
                  type="text"
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  disabled={submitDisabled}
                  placeholder="e.g. before 11am"
                  className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-order-notes`} className="text-xs font-bold text-slate-500 uppercase tracking-wider">Order notes</label>
                <textarea
                  id={`${formId}-order-notes`}
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  disabled={submitDisabled}
                  rows={2}
                  className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </section>

            {/* Lines */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Line items</h2>
                <span className="text-xs text-slate-400">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
              </div>

              {lines.map((line, i) => {
                const product = line.product_id ? products.find(p => p.id === line.product_id) : null
                return (
                  <div key={line.key} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">Line {i + 1}</span>
                      {!submitDisabled && lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(line.key)} className="text-xs text-red-600 font-bold">Remove</button>
                      )}
                    </div>

                    <div>
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => setProductPickerForLineKey(line.key)}
                          disabled={submitDisabled}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border-2 transition-colors disabled:opacity-50 ${
                            line.product_id || line.ad_hoc === '' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
                          }`}
                        >
                          Catalogue
                        </button>
                        <button
                          type="button"
                          onClick={() => updateLine(line.key, { product_id: null })}
                          disabled={submitDisabled}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border-2 transition-colors disabled:opacity-50 ${
                            !line.product_id && line.ad_hoc !== '' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500'
                          }`}
                        >
                          Ad-hoc
                        </button>
                      </div>

                      {line.product_id ? (
                        <button
                          type="button"
                          onClick={() => setProductPickerForLineKey(line.key)}
                          disabled={submitDisabled}
                          className="w-full text-left rounded-xl border-2 border-slate-200 px-4 py-3 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <div className="font-semibold text-sm">{product?.name ?? 'Unknown product'}</div>
                          {product?.box_size && <div className="text-xs text-slate-500 mt-0.5">{product.box_size}</div>}
                        </button>
                      ) : (
                        <input
                          type="text"
                          value={line.ad_hoc}
                          onChange={e => updateLine(line.key, { ad_hoc: e.target.value })}
                          disabled={submitDisabled}
                          placeholder="Free-text description"
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.quantity}
                        onChange={e => updateLine(line.key, { quantity: e.target.value })}
                        disabled={submitDisabled}
                        placeholder="Qty"
                        className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-semibold disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateLine(line.key, { uom: 'kg' })}
                          disabled={submitDisabled}
                          className={`px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${
                            line.uom === 'kg' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
                          }`}
                        >
                          kg
                        </button>
                        <button
                          type="button"
                          onClick={() => updateLine(line.key, { uom: 'unit' })}
                          disabled={submitDisabled}
                          className={`px-4 py-3 text-sm font-bold border-l-2 border-slate-200 transition-colors disabled:opacity-50 ${
                            line.uom === 'unit' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
                          }`}
                        >
                          unit
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={line.notes}
                      onChange={e => updateLine(line.key, { notes: e.target.value })}
                      disabled={submitDisabled}
                      placeholder="Line notes"
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                )
              })}

              {!submitDisabled && (
                <button
                  type="button"
                  onClick={addLine}
                  className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-bold text-slate-500 hover:border-slate-400"
                >
                  + Add line
                </button>
              )}
            </section>

            {submitError && (
              <div className="rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-900">
                {submitError}
              </div>
            )}

            {!submitDisabled && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full h-14 rounded-xl bg-slate-900 text-white text-base font-bold disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </>
        )}
      </main>

      {showCustomerPicker && (
        <BottomSheetSelector
          items={customers}
          onSelect={(c) => { setCustomer(c); setShowCustomerPicker(false) }}
          onDismiss={() => setShowCustomerPicker(false)}
          searchPlaceholder="Search customers"
          title="Pick a customer"
          selectedId={customer?.id}
        />
      )}

      {productPickerForLineKey && (
        <BottomSheetSelector
          items={productItems}
          onSelect={(p) => {
            selectProductForLine(productPickerForLineKey, p)
            setProductPickerForLineKey(null)
          }}
          onDismiss={() => setProductPickerForLineKey(null)}
          searchPlaceholder="Search products"
          title="Pick a product"
          selectedId={lines.find(l => l.key === productPickerForLineKey)?.product_id ?? undefined}
        />
      )}

      <RoleNav />
    </>
  )
}
