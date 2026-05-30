'use client'

/**
 * app/orders/new/page.tsx
 *
 * Sales-rep order capture form. Replaces the WhatsApp meat-orders flow.
 *
 *   1. Pick customer from the offline-synced customers list
 *   2. Add one or more line items:
 *      - Catalogued product (picked from the offline products list), OR
 *      - Ad-hoc free-text item with qty + uom
 *   3. Set delivery date + optional notes
 *   4. Confirm — POSTs to /api/orders, redirects to the order detail page
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 */

export const dynamic = 'force-dynamic'

import { useState, useId } from 'react'
import { useRouter } from 'next/navigation'

import AppHeader            from '@/components/AppHeader'
import RoleNav              from '@/components/RoleNav'
import BottomSheetSelector  from '@/components/BottomSheetSelector'
import OrderPipelinePausedNotice from '@/components/OrderPipelinePausedNotice'
import { useCustomers, useProductsWithDetail } from '@/hooks/useReferenceData'
import type { SelectableItem } from '@/components/BottomSheetSelector'
import type { OrderUom }       from '@/lib/orders/types'
import { isOrderPipelineEnabled } from '@/lib/orders/featureFlag'

// ─── Types ─────────────────────────────────────────────────────

interface DraftLine {
  /** Client-side id for keyed React rendering. NOT the DB id. */
  key:        string
  /** Catalogued product (UUID from products table), or null for ad-hoc */
  product_id: string | null
  /** Set on ad-hoc lines instead of product_id */
  ad_hoc:     string
  quantity:   string          // string in form state, parsed on submit
  uom:        OrderUom
  notes:      string
}

function emptyLine(): DraftLine {
  return {
    key:        crypto.randomUUID(),
    product_id: null,
    ad_hoc:     '',
    quantity:   '',
    uom:        'kg',
    notes:      '',
  }
}

// ─── Component ─────────────────────────────────────────────────

export default function NewOrderPage() {
  if (!isOrderPipelineEnabled()) {
    return <OrderPipelinePausedNotice />
  }
  return <NewOrderPageInner />
}

function NewOrderPageInner() {
  const router    = useRouter()
  const customers = useCustomers()
  const products  = useProductsWithDetail()

  const productItems: SelectableItem[] = products.map(p => ({
    id:       p.id,
    label:    p.name,
    sublabel: p.box_size ? `${p.box_size}${p.category ? ` · ${p.category}` : ''}` : (p.category ?? undefined),
  }))

  // ── Form state ──────────────────────────────────────────────
  const [customer,      setCustomer]      = useState<SelectableItem | null>(null)
  const [deliveryDate,  setDeliveryDate]  = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [orderNotes,    setOrderNotes]    = useState('')
  const [lines,         setLines]         = useState<DraftLine[]>(() => [emptyLine()])

  // ── UI state ────────────────────────────────────────────────
  const [showCustomerPicker,        setShowCustomerPicker]        = useState(false)
  const [productPickerForLineKey,   setProductPickerForLineKey]   = useState<string | null>(null)
  const [submitting,                setSubmitting]                = useState(false)
  const [submitError,               setSubmitError]               = useState<string | null>(null)

  const formId = useId()

  // ── Helpers ─────────────────────────────────────────────────

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }

  function addLine()    { setLines(prev => [...prev, emptyLine()]) }
  function removeLine(key: string) { setLines(prev => prev.filter(l => l.key !== key)) }

  function selectProductForLine(key: string, product: SelectableItem | null) {
    if (!product) {
      // Switch to ad-hoc mode
      updateLine(key, { product_id: null })
    } else {
      updateLine(key, { product_id: product.id, ad_hoc: '' })
    }
  }

  // ── Validation (client-side, mirrors lib/orders/validation) ─

  function validate(): string | null {
    if (!customer)     return 'Pick a customer'
    if (!deliveryDate) return 'Set a delivery date'
    if (lines.length === 0) return 'Add at least one line'

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const hasProduct = !!l.product_id
      const hasAdHoc   = l.ad_hoc.trim().length > 0
      if (hasProduct && hasAdHoc) {
        return `Line ${i + 1}: clear the ad-hoc text or remove the product`
      }
      if (!hasProduct && !hasAdHoc) {
        return `Line ${i + 1}: pick a product or write an ad-hoc description`
      }
      const qty = parseFloat(l.quantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        return `Line ${i + 1}: quantity must be a positive number`
      }
    }
    return null
  }

  // ── Submit ─────────────────────────────────────────────────

  async function handleSubmit() {
    const err = validate()
    if (err) { setSubmitError(err); return }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const payload = {
        customer_id:    customer!.id,
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

      const res = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setSubmitError(body?.error ?? `Server error (${res.status})`)
        setSubmitting(false)
        return
      }

      router.push(`/orders/${body.id}`)
    } catch (e) {
      console.error('[NewOrderPage] submit failed', e)
      setSubmitError('Network error — please try again')
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────

  return (
    <>
      <AppHeader title="New order" maxWidth="2xl" />

      <main className="max-w-2xl mx-auto px-4 py-4 pb-32 space-y-4">

        {/* Customer */}
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</label>
          <button
            type="button"
            onClick={() => setShowCustomerPicker(true)}
            className="mt-2 w-full text-left rounded-xl border-2 border-slate-200 px-4 py-3 hover:border-slate-300 transition-colors"
          >
            {customer ? (
              <span className="font-semibold text-slate-900">{customer.label}</span>
            ) : (
              <span className="text-slate-400">Tap to choose a customer</span>
            )}
          </button>
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
              className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-semibold"
            />
          </div>

          <div>
            <label htmlFor={`${formId}-delivery-notes`} className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivery notes (optional)</label>
            <input
              id={`${formId}-delivery-notes`}
              type="text"
              value={deliveryNotes}
              onChange={e => setDeliveryNotes(e.target.value)}
              placeholder="e.g. before 11am, ring bell"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor={`${formId}-order-notes`} className="text-xs font-bold text-slate-500 uppercase tracking-wider">Order notes (optional)</label>
            <textarea
              id={`${formId}-order-notes`}
              value={orderNotes}
              onChange={e => setOrderNotes(e.target.value)}
              placeholder="Anything the butcher should know about the whole order"
              rows={2}
              className="mt-2 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm resize-none"
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
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-xs text-red-600 font-bold hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Product or ad-hoc switcher */}
                <div>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setProductPickerForLineKey(line.key)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border-2 transition-colors ${
                        line.product_id || line.ad_hoc === ''
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      Catalogue
                    </button>
                    <button
                      type="button"
                      onClick={() => updateLine(line.key, { product_id: null })}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border-2 transition-colors ${
                        !line.product_id && line.ad_hoc !== ''
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      Ad-hoc
                    </button>
                  </div>

                  {line.product_id ? (
                    <button
                      type="button"
                      onClick={() => setProductPickerForLineKey(line.key)}
                      className="w-full text-left rounded-xl border-2 border-slate-200 px-4 py-3 hover:border-slate-300"
                    >
                      <div className="font-semibold text-slate-900 text-sm">{product?.name ?? 'Unknown product'}</div>
                      {product?.box_size && <div className="text-xs text-slate-500 mt-0.5">{product.box_size}</div>}
                    </button>
                  ) : (
                    <input
                      type="text"
                      value={line.ad_hoc}
                      onChange={e => updateLine(line.key, { ad_hoc: e.target.value })}
                      placeholder="Free-text description (e.g. mutton trim)"
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm"
                    />
                  )}
                </div>

                {/* Qty + UOM */}
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={line.quantity}
                    onChange={e => updateLine(line.key, { quantity: e.target.value })}
                    placeholder="Qty"
                    className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-semibold"
                  />
                  <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateLine(line.key, { uom: 'kg' })}
                      className={`px-4 py-3 text-sm font-bold transition-colors ${
                        line.uom === 'kg' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
                      }`}
                    >
                      kg
                    </button>
                    <button
                      type="button"
                      onClick={() => updateLine(line.key, { uom: 'unit' })}
                      className={`px-4 py-3 text-sm font-bold transition-colors border-l-2 border-slate-200 ${
                        line.uom === 'unit' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
                      }`}
                    >
                      unit
                    </button>
                  </div>
                </div>

                {/* Line notes */}
                <input
                  type="text"
                  value={line.notes}
                  onChange={e => updateLine(line.key, { notes: e.target.value })}
                  placeholder="Line notes (optional) — e.g. tied, extra trim"
                  className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm"
                />
              </div>
            )
          })}

          <button
            type="button"
            onClick={addLine}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-bold text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
          >
            + Add line
          </button>
        </section>

        {/* Error */}
        {submitError && (
          <div className="rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-900">
            {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 rounded-xl bg-slate-900 text-white text-base font-bold disabled:opacity-50 transition-opacity active:scale-[0.99]"
        >
          {submitting ? 'Saving…' : 'Confirm order'}
        </button>
      </main>

      {/* Customer picker sheet */}
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

      {/* Product picker sheet */}
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
