'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AppHeader        from '@/components/AppHeader'
import RoleNav          from '@/components/RoleNav'
import BottomSheetSelector from '@/components/BottomSheetSelector'
import { useCustomers, useProductsWithDetail } from '@/hooks/useReferenceData'
import { syncReferenceData } from '@/lib/localDb'
import type { SelectableItem } from '@/components/BottomSheetSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgreementStatus = 'draft' | 'active' | 'cancelled'
type PriceUnit       = 'per_kg' | 'per_box'
type ViewFilter      = 'all' | 'draft' | 'active' | 'expired' | 'cancelled'

interface PriceLine {
  id?:                   string   // present on saved lines
  product_id?:           string
  product_name_override?: string
  product_name:          string
  box_size:              string | null
  code:                  string | null
  price:                 number | ''
  unit:                  PriceUnit
  notes:                 string
  is_freetext:           boolean
  _localId?:             string   // temp key for unsaved lines
}

interface Agreement {
  id:               string
  reference_number: string
  status:           AgreementStatus
  is_expired:       boolean
  valid_from:       string
  valid_until:      string | null
  notes:            string | null
  created_at:       string
  customer_id:      string | null
  customer_name:    string
  is_prospect:      boolean
  rep_id:           string | null
  rep_name:         string
  lines:            PriceLine[]
}

interface FormState {
  customer:       SelectableItem | null
  prospectName:   string
  customerMode:   'existing' | 'prospect'
  validFrom:      string
  validUntil:     string
  notes:          string
  lines:          PriceLine[]
}

const EMPTY_LINE: PriceLine = {
  product_name: '', box_size: null, code: null,
  price: '', unit: 'per_kg', notes: '', is_freetext: false,
}

const EMPTY_FORM: FormState = {
  customer: null, prospectName: '', customerMode: 'existing',
  validFrom: new Date().toLocaleDateString('en-CA'),
  validUntil: '', notes: '', lines: [],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

function fmtPrice(p: number, unit: PriceUnit) {
  return `£${p.toFixed(2)} ${unit === 'per_kg' ? '/ kg' : '/ box'}`
}

function statusLabel(a: Agreement): { label: string; cls: string } {
  if (a.is_expired) return { label: 'Expired',   cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  if (a.status === 'active')    return { label: 'Active',    cls: 'bg-green-50 text-green-700 border-green-200' }
  if (a.status === 'draft')     return { label: 'Draft',     cls: 'bg-amber-50 text-amber-700 border-amber-200' }
  if (a.status === 'cancelled') return { label: 'Cancelled', cls: 'bg-red-50 text-red-600 border-red-200' }
  return { label: a.status, cls: 'bg-gray-100 text-gray-500' }
}

function getClientRole(): string {
  if (typeof document === 'undefined') return ''
  return document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)?.[1] ?? ''
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ agreement }: { agreement: Agreement }) {
  const { label, cls } = statusLabel(agreement)
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  )
}

// ─── Agreement Card ───────────────────────────────────────────────────────────

function AgreementCard({
  agreement, onView, onExportPdf, currentUserId,
}: {
  agreement:     Agreement
  onView:        (a: Agreement) => void
  onExportPdf:   (a: Agreement) => void
  currentUserId: string | null
}) {
  const role    = getClientRole()
  const canEdit = role === 'admin' || role === 'office' || agreement.rep_id === currentUserId

  return (
    <div className="bg-white rounded-2xl border border-[#EDEAE1] overflow-hidden">
      <button type="button" onClick={() => onView(agreement)}
        className="w-full text-left px-4 pt-3 pb-2 block active:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-bold text-[#16205B] text-sm leading-tight">{agreement.customer_name}</p>
          <StatusBadge agreement={agreement} />
        </div>
        <p className="text-[10px] text-gray-400 font-mono mb-1">{agreement.reference_number}</p>
        <p className="text-[11px] text-gray-500">
          {agreement.lines.length} product{agreement.lines.length !== 1 ? 's' : ''}
          {' · '}Valid from {fmtDate(agreement.valid_from)}
          {agreement.valid_until ? ` to ${fmtDate(agreement.valid_until)}` : ' (ongoing)'}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {agreement.is_prospect && <span className="text-amber-600 font-semibold">Prospect · </span>}
          Agreed by {agreement.rep_name}
        </p>
      </button>
      <div className="flex items-center border-t border-[#EDEAE1]">
        {canEdit && (
          <button type="button" onClick={() => onView(agreement)}
            className="flex-1 h-9 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#16205B]/50 hover:text-[#16205B] hover:bg-[#EDEAE1] transition-colors">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
            </svg>
            View / Edit
          </button>
        )}
        {!canEdit && (
          <button type="button" onClick={() => onView(agreement)}
            className="flex-1 h-9 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#16205B]/50 hover:text-[#16205B] hover:bg-[#EDEAE1] transition-colors">
            View
          </button>
        )}
        <div className="w-px h-5 bg-[#EDEAE1]"/>
        <button type="button" onClick={() => onExportPdf(agreement)}
          className="flex-1 h-9 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#16205B]/50 hover:text-[#EB6619] hover:bg-orange-50 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/>
            <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/>
          </svg>
          PDF
        </button>
      </div>
    </div>
  )
}

// ─── Line Editor Row ──────────────────────────────────────────────────────────

function LineRow({
  line, index, onUpdate, onRemove, productItems, allProducts,
}: {
  line:        PriceLine
  index:       number
  onUpdate:    (idx: number, patch: Partial<PriceLine>) => void
  onRemove:    (idx: number) => void
  productItems: SelectableItem[]
  allProducts:  ReturnType<typeof useProductsWithDetail>
}) {
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [freetext,          setFreetext]          = useState(line.is_freetext)
  const [freetextInput,     setFreetextInput]     = useState(line.product_name_override ?? '')
  const [showFreetextWarn,  setShowFreetextWarn]  = useState(false)

  function handleProductSelect(item: SelectableItem) {
    const detail = allProducts.find(p => p.id === item.id)
    onUpdate(index, {
      product_id:    item.id,
      product_name:  item.label,
      box_size:      detail?.box_size ?? null,
      code:          detail?.code     ?? null,
      is_freetext:   false,
      product_name_override: undefined,
    })
    setFreetext(false)
    setShowProductPicker(false)
  }

  function handleFreetextConfirm() {
    if (!freetextInput.trim()) return
    onUpdate(index, {
      product_id:            undefined,
      product_name:          freetextInput.trim(),
      product_name_override: freetextInput.trim(),
      box_size:              null,
      code:                  null,
      is_freetext:           true,
    })
    setShowFreetextWarn(false)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[#EDEAE1] p-3 space-y-2.5">
        {/* Product selector */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Product</label>
            <button type="button"
              onClick={() => { setFreetext(f => !f); setShowFreetextWarn(false) }}
              className="text-[10px] text-[#EB6619] font-semibold">
              {freetext ? 'Pick from list' : 'Add freetext'}
            </button>
          </div>

          {!freetext ? (
            <button type="button" onClick={() => setShowProductPicker(true)}
              className={[
                'w-full h-9 px-3 rounded-xl border text-left text-sm transition-colors',
                line.product_name
                  ? 'border-[#16205B]/20 text-gray-800'
                  : 'border-[#EDEAE1] text-gray-400',
              ].join(' ')}>
              {line.product_name || 'Select product…'}
            </button>
          ) : (
            <div className="space-y-1">
              <input
                type="text" value={freetextInput}
                onChange={e => setFreetextInput(e.target.value)}
                onBlur={() => { if (freetextInput.trim()) setShowFreetextWarn(true) }}
                placeholder="Type product name…"
                className="w-full h-9 px-3 rounded-xl border border-[#EDEAE1] text-sm focus:outline-none focus:border-[#EB6619]"
              />
              {showFreetextWarn && freetextInput.trim() && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] font-bold text-amber-700">⚠ Not in product list</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    Are you sure "{freetextInput.trim()}" isn't already in the system?
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={handleFreetextConfirm}
                      className="h-6 px-3 rounded-lg bg-amber-600 text-white text-[10px] font-bold">
                      Yes, use this
                    </button>
                    <button type="button" onClick={() => { setFreetext(false); setShowFreetextWarn(false) }}
                      className="h-6 px-3 rounded-lg border border-amber-200 text-amber-700 text-[10px] font-semibold">
                      Search list
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {line.box_size && (
            <p className="text-[10px] text-gray-400 mt-1">📦 {line.box_size}</p>
          )}
        </div>

        {/* Price + Unit */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Price (£)</label>
            <input type="number" min="0" step="0.01"
              value={line.price}
              onChange={e => onUpdate(index, { price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
              placeholder="0.00"
              className="w-full h-9 mt-1 px-3 rounded-xl border border-[#EDEAE1] text-sm focus:outline-none focus:border-[#EB6619]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Unit</label>
            <select value={line.unit} onChange={e => onUpdate(index, { unit: e.target.value as PriceUnit })}
              className="w-full h-9 mt-1 px-3 rounded-xl border border-[#EDEAE1] text-sm bg-white focus:outline-none focus:border-[#EB6619]">
              <option value="per_kg">Per kg</option>
              <option value="per_box">Per box</option>
            </select>
          </div>
        </div>

        {/* Line notes + remove */}
        <div className="flex items-center gap-2">
          <input type="text" value={line.notes}
            onChange={e => onUpdate(index, { notes: e.target.value })}
            placeholder="Note (e.g. min order 5 boxes)"
            className="flex-1 h-8 px-3 rounded-lg border border-[#EDEAE1] text-xs focus:outline-none focus:border-[#EB6619]"
          />
          <button type="button" onClick={() => onRemove(index)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#EDEAE1] text-red-400 hover:bg-red-50 hover:border-red-200 transition-colors flex-shrink-0">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
            </svg>
          </button>
        </div>
      </div>

      {showProductPicker && (
        <BottomSheetSelector
          items={productItems}
          onSelect={handleProductSelect}
          onDismiss={() => setShowProductPicker(false)}
          searchPlaceholder="Search products…"
          title="Select Product"
        />
      )}
    </>
  )
}

// ─── Agreement Form (New + Edit) ──────────────────────────────────────────────

function AgreementForm({
  initial, onSave, onCancel,
}: {
  initial?:   Agreement
  onSave:     (id: string, refNum: string) => void
  onCancel:   () => void
}) {
  const customers    = useCustomers()
  const allProducts  = useProductsWithDetail()
  const productItems = useMemo<SelectableItem[]>(() =>
    allProducts.map(p => ({
      id: p.id, label: p.name,
      sublabel: p.box_size ? `${p.box_size}${p.category ? ` · ${p.category}` : ''}` : (p.category ?? undefined),
    })), [allProducts])

  const isEdit = !!initial

  const [form,         setForm]         = useState<FormState>(() => {
    if (!initial) return EMPTY_FORM
    return {
      customer:     initial.customer_id
                      ? { id: initial.customer_id, label: initial.customer_name }
                      : null,
      prospectName: initial.is_prospect ? initial.customer_name : '',
      customerMode: initial.is_prospect ? 'prospect' : 'existing',
      validFrom:    initial.valid_from,
      validUntil:   initial.valid_until ?? '',
      notes:        initial.notes ?? '',
      lines:        initial.lines.map(l => ({ ...l })),
    }
  })
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [saving,             setSaving]             = useState(false)
  const [error,              setError]              = useState('')
  const linesEndRef = useRef<HTMLDivElement>(null)

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function addLine() {
    set('lines', [...form.lines, { ...EMPTY_LINE, _localId: crypto.randomUUID() }])
    setTimeout(() => linesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  function updateLine(idx: number, patch: Partial<PriceLine>) {
    set('lines', form.lines.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function removeLine(idx: number) {
    set('lines', form.lines.filter((_, i) => i !== idx))
  }

  async function save(activate: boolean) {
    setError('')
    // Validate
    if (form.customerMode === 'existing' && !form.customer) {
      setError('Please select a customer'); return
    }
    if (form.customerMode === 'prospect' && !form.prospectName.trim()) {
      setError('Please enter a prospect name'); return
    }
    if (!form.validFrom) {
      setError('Valid from date required'); return
    }
    if (form.lines.length === 0) {
      setError('Add at least one product line'); return
    }
    const badLine = form.lines.findIndex(l => !l.product_name || !l.price || Number(l.price) <= 0)
    if (badLine !== -1) {
      setError(`Line ${badLine + 1}: product and price required`); return
    }

    setSaving(true)
    try {
      const body = {
        customer_id:   form.customerMode === 'existing' ? (form.customer?.id ?? null) : null,
        prospect_name: form.customerMode === 'prospect' ? form.prospectName.trim()    : null,
        valid_from:    form.validFrom,
        valid_until:   form.validUntil || null,
        notes:         form.notes.trim() || null,
        lines: form.lines.map((l, i) => ({
          product_id:            l.is_freetext ? null : (l.product_id ?? null),
          product_name_override: l.is_freetext ? l.product_name : null,
          price:                 Number(l.price),
          unit:                  l.unit,
          notes:                 l.notes.trim() || null,
          position:              i,
        })),
      }

      let id: string
      let refNum: string

      if (isEdit && initial) {
        // Update header only — lines handled separately via PATCH on existing lines
        const res = await fetch(`/api/pricing/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id:   body.customer_id,
            prospect_name: body.prospect_name,
            valid_from:    body.valid_from,
            valid_until:   body.valid_until,
            notes:         body.notes,
            ...(activate ? { status: 'active' } : {}),
          }),
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error ?? 'Update failed'); return }

        // Delete all existing lines and re-insert (simplest approach for edit)
        for (const line of initial.lines) {
          if (line.id) await fetch(`/api/pricing/lines/${line.id}`, { method: 'DELETE' })
        }
        for (let i = 0; i < body.lines.length; i++) {
          await fetch(`/api/pricing/${initial.id}/lines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body.lines[i], position: i }),
          })
        }
        id     = initial.id
        refNum = initial.reference_number
      } else {
        // Create new
        const res = await fetch('/api/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error ?? 'Failed to create'); return }
        id     = d.id
        refNum = d.reference_number

        // Activate if requested
        if (activate) {
          await fetch(`/api/pricing/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' }),
          })
        }
      }

      onSave(id, refNum)
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 pb-32">

      {/* Customer */}
      <div className="bg-white rounded-2xl border border-[#EDEAE1] p-4 space-y-3">
        <p className="text-xs font-bold text-[#16205B]/50 uppercase tracking-widest">Customer</p>

        <div className="flex rounded-xl overflow-hidden border border-[#EDEAE1]">
          {(['existing', 'prospect'] as const).map(m => (
            <button key={m} type="button"
              onClick={() => set('customerMode', m)}
              className={[
                'flex-1 py-2 text-xs font-bold transition-colors',
                form.customerMode === m
                  ? 'bg-[#16205B] text-white'
                  : 'bg-white text-gray-400 hover:text-gray-600',
              ].join(' ')}>
              {m === 'existing' ? 'Existing Customer' : 'Prospect'}
            </button>
          ))}
        </div>

        {form.customerMode === 'existing' ? (
          <button type="button" onClick={() => setShowCustomerPicker(true)}
            className={[
              'w-full h-10 px-3 rounded-xl border text-left text-sm transition-colors',
              form.customer ? 'border-[#16205B]/20 text-gray-800' : 'border-[#EDEAE1] text-gray-400',
            ].join(' ')}>
            {form.customer?.label || 'Select customer…'}
          </button>
        ) : (
          <input type="text" value={form.prospectName}
            onChange={e => set('prospectName', e.target.value)}
            placeholder="Prospect / company name"
            className="w-full h-10 px-3 rounded-xl border border-[#EDEAE1] text-sm focus:outline-none focus:border-[#EB6619]"
          />
        )}
      </div>

      {/* Dates + Notes */}
      <div className="bg-white rounded-2xl border border-[#EDEAE1] p-4 space-y-3">
        <p className="text-xs font-bold text-[#16205B]/50 uppercase tracking-widest">Agreement Details</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Valid from</label>
            <input type="date" value={form.validFrom}
              onChange={e => set('validFrom', e.target.value)}
              className="w-full h-9 mt-1 px-3 rounded-xl border border-[#EDEAE1] text-sm focus:outline-none focus:border-[#EB6619]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Valid until</label>
            <input type="date" value={form.validUntil}
              onChange={e => set('validUntil', e.target.value)}
              placeholder="Ongoing"
              className="w-full h-9 mt-1 px-3 rounded-xl border border-[#EDEAE1] text-sm focus:outline-none focus:border-[#EB6619]"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Notes (optional)</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="e.g. Agreed at trade visit, valid for standing orders only"
            rows={2}
            className="w-full mt-1 px-3 py-2 rounded-xl border border-[#EDEAE1] text-sm resize-none focus:outline-none focus:border-[#EB6619]"
          />
        </div>
      </div>

      {/* Product Lines */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold text-[#16205B]/50 uppercase tracking-widest">
            Products ({form.lines.length})
          </p>
          <button type="button" onClick={addLine}
            className="h-7 px-3 rounded-lg bg-[#16205B] text-white text-[10px] font-bold flex items-center gap-1">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/></svg>
            Add Product
          </button>
        </div>

        {form.lines.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-[#EDEAE1] p-8 text-center">
            <p className="text-sm text-gray-400">No products added yet</p>
            <p className="text-xs text-gray-300 mt-1">Tap Add Product to get started</p>
          </div>
        )}

        {form.lines.map((line, i) => (
          <LineRow key={line.id ?? line._localId ?? i}
            line={line} index={i}
            onUpdate={updateLine} onRemove={removeLine}
            productItems={productItems} allProducts={allProducts}
          />
        ))}
        <div ref={linesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600 font-semibold">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="fixed bottom-[64px] left-0 right-0 bg-white border-t border-[#EDEAE1] px-4 py-3 flex gap-2 max-w-lg mx-auto">
        <button type="button" onClick={onCancel}
          className="h-11 px-4 rounded-xl border border-[#EDEAE1] text-sm font-semibold text-gray-500 flex-shrink-0">
          Cancel
        </button>
        <button type="button" onClick={() => save(false)} disabled={saving}
          className="flex-1 h-11 rounded-xl border border-[#16205B] text-[#16205B] text-sm font-bold disabled:opacity-40">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Draft'}
        </button>
        <button type="button" onClick={() => save(true)} disabled={saving}
          className="flex-1 h-11 rounded-xl bg-[#EB6619] text-white text-sm font-bold disabled:opacity-40">
          {saving ? 'Saving…' : isEdit ? 'Save & Activate' : 'Activate'}
        </button>
      </div>

      {showCustomerPicker && (
        <BottomSheetSelector
          items={customers}
          onSelect={item => { set('customer', item); setShowCustomerPicker(false) }}
          onDismiss={() => setShowCustomerPicker(false)}
          searchPlaceholder="Search customers…"
          title="Select Customer"
        />
      )}
    </div>
  )
}

// ─── Detail / Edit Sheet ──────────────────────────────────────────────────────

function AgreementDetail({
  agreement, onClose, onUpdate, onDelete, onExportPdf, currentUserId,
}: {
  agreement:     Agreement
  onClose:       () => void
  onUpdate:      (updated: Agreement) => void
  onDelete:      (id: string) => void
  onExportPdf:   (a: Agreement) => void
  currentUserId: string | null
}) {
  const role     = getClientRole()
  const isAdmin  = role === 'admin'
  const canEdit  = isAdmin || role === 'office' || agreement.rep_id === currentUserId
  const canDelete = isAdmin || (agreement.rep_id === currentUserId && agreement.status === 'draft')

  const [editing,       setEditing]       = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [deleteConfirm,  setDeleteConfirm]  = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  async function changeStatus(status: AgreementStatus) {
    setStatusUpdating(true)
    try {
      const res = await fetch(`/api/pricing/${agreement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) onUpdate({ ...agreement, status, is_expired: false })
    } finally { setStatusUpdating(false) }
  }

  async function doDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/pricing/${agreement.id}`, { method: 'DELETE' })
      if (res.ok) { onDelete(agreement.id); onClose() }
    } finally { setDeleting(false) }
  }

  const { label, cls } = statusLabel(agreement)

  if (editing && canEdit) {
    return (
      <div className="pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => setEditing(false)}
            className="text-sm text-[#EB6619] font-semibold">← Back</button>
          <p className="text-sm font-bold text-[#16205B]">Edit Agreement</p>
        </div>
        <AgreementForm
          initial={agreement}
          onSave={(id, _ref) => {
            // Reload the agreement to get updated data
            fetch(`/api/pricing/${id}`)
              .then(r => r.json())
              .then(d => { onUpdate(d); setEditing(false) })
              .catch(() => setEditing(false))
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="pb-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-[#16205B]">{agreement.customer_name}</p>
          <p className="text-[11px] font-mono text-gray-400">{agreement.reference_number}</p>
        </div>
        <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full border ${cls}`}>
          {label}
        </span>
      </div>

      {/* Meta */}
      <div className="bg-[#EDEAE1] rounded-xl p-3 space-y-1.5 text-[12px]">
        <div className="flex justify-between">
          <span className="text-gray-500">Valid from</span>
          <span className="font-semibold text-gray-800">{fmtDate(agreement.valid_from)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Valid until</span>
          <span className="font-semibold text-gray-800">{agreement.valid_until ? fmtDate(agreement.valid_until) : 'Ongoing'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Agreed by</span>
          <span className="font-semibold text-gray-800">{agreement.rep_name}</span>
        </div>
        {agreement.notes && (
          <div className="pt-1.5 border-t border-[#EDEAE1]">
            <p className="text-gray-600 leading-relaxed">{agreement.notes}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Products ({agreement.lines.length})
        </p>
        {agreement.lines.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No products on this agreement</p>
        ) : (
          <div className="bg-white rounded-2xl border border-[#EDEAE1] overflow-hidden">
            {agreement.lines.map((line, i) => (
              <div key={line.id ?? i}
                className="px-4 py-3 border-b border-[#EDEAE1] last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#16205B] leading-tight">
                      {line.product_name}
                      {line.is_freetext && (
                        <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Custom</span>
                      )}
                    </p>
                    {line.box_size && (
                      <p className="text-[10px] text-gray-400 mt-0.5">📦 {line.box_size}</p>
                    )}
                    {line.notes && (
                      <p className="text-[10px] text-gray-400 italic mt-0.5">{line.notes}</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#EB6619] flex-shrink-0">
                    {fmtPrice(line.price as number, line.unit)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button type="button" onClick={() => onExportPdf(agreement)}
          className="w-full h-11 rounded-xl bg-[#EB6619] text-white text-sm font-bold flex items-center justify-center gap-2">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/>
            <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/>
          </svg>
          Export PDF
        </button>

        {canEdit && (
          <button type="button" onClick={() => setEditing(true)}
            className="w-full h-11 rounded-xl border border-[#16205B] text-[#16205B] text-sm font-bold">
            Edit Agreement
          </button>
        )}

        {/* Status actions */}
        {canEdit && !agreement.is_expired && (
          <div className="flex gap-2">
            {agreement.status === 'draft' && (
              <button type="button" onClick={() => changeStatus('active')} disabled={statusUpdating}
                className="flex-1 h-10 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-40">
                {statusUpdating ? '…' : 'Activate'}
              </button>
            )}
            {agreement.status === 'active' && (
              <button type="button" onClick={() => changeStatus('draft')} disabled={statusUpdating}
                className="flex-1 h-10 rounded-xl border border-[#EDEAE1] text-gray-500 text-sm font-bold disabled:opacity-40">
                {statusUpdating ? '…' : 'Revert to Draft'}
              </button>
            )}
            {agreement.status !== 'cancelled' && (
              <button type="button" onClick={() => changeStatus('cancelled')} disabled={statusUpdating}
                className="flex-1 h-10 rounded-xl border border-red-200 text-red-600 text-sm font-bold disabled:opacity-40">
                {statusUpdating ? '…' : 'Cancel'}
              </button>
            )}
          </div>
        )}

        {/* Delete */}
        {canDelete && !deleteConfirm && (
          <button type="button" onClick={() => setDeleteConfirm(true)}
            className="w-full h-9 text-xs text-red-400 font-semibold hover:text-red-600 transition-colors">
            Delete agreement
          </button>
        )}
        {deleteConfirm && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center space-y-2">
            <p className="text-sm font-semibold text-red-700">Delete this agreement?</p>
            <div className="flex gap-2">
              <button type="button" onClick={doDelete} disabled={deleting}
                className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40">
                {deleting ? '…' : 'Delete'}
              </button>
              <button type="button" onClick={() => setDeleteConfirm(false)}
                className="flex-1 h-9 rounded-lg border border-red-200 text-red-600 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <button type="button" onClick={onClose}
        className="w-full h-10 text-xs text-gray-400 font-semibold">
        Close
      </button>
    </div>
  )
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

async function exportPdf(agreement: Agreement) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const navy  = [22, 32, 91]   as [number,number,number]
  const orange= [235, 102, 25] as [number,number,number]
  const gray  = [107, 114, 128] as [number,number,number]

  // ── Header bar ──
  doc.setFillColor(...navy)
  doc.rect(0, 0, 210, 28, 'F')

  // Orange accent stripe
  doc.setFillColor(...orange)
  doc.rect(0, 28, 210, 2, 'F')

  // Header text
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Operations', 22, 17)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)
  doc.text('Contract Price Agreement', 210 - 14, 17, { align: 'right' })

  // ── Document title ──
  doc.setTextColor(...navy)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('CONTRACT PRICE AGREEMENT', 14, 44)

  // ── Meta block ──
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const meta: [string, string][] = [
    ['Customer',    agreement.customer_name],
    ['Reference',   agreement.reference_number],
    ['Valid from',  fmtDate(agreement.valid_from)],
    ['Valid until', agreement.valid_until ? fmtDate(agreement.valid_until) : 'Ongoing'],
    ['Agreed by',   `${agreement.rep_name} (MFS Global Ltd)`],
    ['Date issued', today],
  ]

  let y = 52
  doc.setFontSize(10)
  for (const [label, value] of meta) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...gray)
    doc.text(label, 14, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(17, 24, 39)
    doc.text(value, 58, y)
    y += 7
  }

  if (agreement.notes) {
    y += 2
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...gray)
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(`Note: ${agreement.notes}`, 180)
    doc.text(lines, 14, y)
    y += lines.length * 5 + 2
  }

  // ── Divider ──
  y += 4
  doc.setDrawColor(...navy)
  doc.setLineWidth(0.5)
  doc.line(14, y, 196, y)
  y += 6

  // ── Products table ──
  autoTable(doc, {
    startY: y,
    head: [['Product', 'Pack Size', 'Price', 'Unit', 'Notes']],
    body: agreement.lines.map(l => [
      l.product_name + (l.is_freetext ? ' *' : ''),
      l.box_size ?? '—',
      `£${(l.price as number).toFixed(2)}`,
      l.unit === 'per_kg' ? 'per kg' : 'per box',
      l.notes ?? '',
    ]),
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [31, 41, 55] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 45 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 22 },
      4: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  })

  // ── Freetext footnote ──
  const hasFreetext = agreement.lines.some(l => l.is_freetext)
  const finalY = (doc as any).lastAutoTable.finalY + 6
  if (hasFreetext) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...gray)
    doc.text('* Custom product — not in standard catalogue', 14, finalY)
  }

  // ── Footer ──
  const footerY = 280
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.line(14, footerY - 4, 196, footerY - 4)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...gray)
  doc.text('MFS Global Ltd  ·  mfsglobal.co.uk', 14, footerY)
  doc.text(
    'Prices subject to change with 30 days written notice. This agreement is between MFS Global Ltd and the above customer.',
    14, footerY + 4,
    { maxWidth: 182 }
  )

  const filename = `MFS-Pricing-${agreement.reference_number}-${agreement.customer_name.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`
  doc.save(filename)
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [agreements,    setAgreements]    = useState<Agreement[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState('')
  const [view,          setView]          = useState<'list' | 'new' | 'detail'>('list')
  const [filter,        setFilter]        = useState<ViewFilter>('all')
  const [search,        setSearch]        = useState('')
  const [selected,      setSelected]      = useState<Agreement | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    syncReferenceData().catch(console.error)
    const m = document.cookie.match(/(?:^|;\s*)mfs_user_id=([^;]+)/)
    setCurrentUserId(m?.[1] ?? null)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pricing')
      if (res.ok) {
        const d = await res.json()
        setAgreements(d.agreements ?? [])
      } else {
        setLoadError('Failed to load pricing agreements')
      }
    } catch {
      setLoadError('Network error — tap to retry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    return agreements.filter(a => {
      if (filter === 'all')       return true
      if (filter === 'expired')   return a.is_expired
      if (filter === 'active')    return a.status === 'active' && !a.is_expired
      if (filter === 'draft')     return a.status === 'draft'
      if (filter === 'cancelled') return a.status === 'cancelled'
      return true
    }).filter(a => {
      if (!search) return true
      const q = search.toLowerCase()
      return a.customer_name.toLowerCase().includes(q) ||
             a.reference_number.toLowerCase().includes(q) ||
             a.rep_name.toLowerCase().includes(q)
    })
  }, [agreements, filter, search])

  function handleSaved(id: string, _ref: string) {
    load()
    setView('list')
  }

  function handleUpdate(updated: Agreement) {
    setAgreements(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelected(updated)
  }

  function handleDelete(id: string) {
    setAgreements(prev => prev.filter(a => a.id !== id))
    setSelected(null)
    setView('list')
  }

  const FILTERS: { id: ViewFilter; label: string }[] = [
    { id: 'all',       label: 'All' },
    { id: 'active',    label: 'Active' },
    { id: 'draft',     label: 'Draft' },
    { id: 'expired',   label: 'Expired' },
    { id: 'cancelled', label: 'Cancelled' },
  ]

  const activeCount = agreements.filter(a => a.status === 'active' && !a.is_expired).length

  return (
    <div className="min-h-screen bg-[#EDEAE1]">
      <AppHeader title="Pricing" />

      {/* Top tab bar — List vs New */}
      <div className="flex border-b border-[#EDEAE1] bg-white">
        {([['list', 'Agreements'], ['new', '+ New Agreement']] as const).map(([v, label]) => (
          <button key={v} type="button"
            onClick={() => setView(v)}
            className={[
              'flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors border-b-2',
              view === v || (view === 'detail' && v === 'list')
                ? 'border-[#EB6619] text-[#EB6619]'
                : 'border-transparent text-gray-400 hover:text-gray-600',
            ].join(' ')}>
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-28">

        {/* ── LIST VIEW ── */}
        {(view === 'list' || view === 'detail') && selected === null && view !== 'detail' && (
          <>
            {/* Stats strip */}
            {!loading && agreements.length > 0 && (
              <div className="flex gap-3 mb-3">
                <div className="flex-1 bg-white rounded-xl border border-[#EDEAE1] p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{activeCount}</p>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Active</p>
                </div>
                <div className="flex-1 bg-white rounded-xl border border-[#EDEAE1] p-3 text-center">
                  <p className="text-2xl font-bold text-[#16205B]">{agreements.length}</p>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Total</p>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative mb-3">
              <svg viewBox="0 0 20 20" fill="currentColor"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#16205B]/30 pointer-events-none">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
              </svg>
              <input type="search" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by customer, reference…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#16205B]/10 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#EB6619]"
              />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: 'none' }}>
              {FILTERS.map(f => {
                const count = f.id === 'all' ? agreements.length
                  : f.id === 'expired'   ? agreements.filter(a => a.is_expired).length
                  : f.id === 'active'    ? agreements.filter(a => a.status === 'active' && !a.is_expired).length
                  : agreements.filter(a => a.status === f.id).length
                return (
                  <button key={f.id} type="button"
                    onClick={() => setFilter(f.id)}
                    className={[
                      'flex-shrink-0 h-7 px-3 rounded-full text-xs font-bold transition-all flex items-center gap-1',
                      filter === f.id
                        ? 'bg-[#16205B] text-white shadow-sm'
                        : 'bg-white text-[#16205B]/60 border border-[#16205B]/10',
                    ].join(' ')}>
                    {f.label}
                    {count > 0 && (
                      <span className={`text-[9px] font-bold ${filter === f.id ? 'text-white/70' : 'text-gray-400'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex justify-center py-12">
                <svg className="animate-spin w-6 h-6 text-[#16205B]/30" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              </div>
            ) : loadError ? (
              <button type="button" onClick={() => { setLoadError(''); setLoading(true); load() }}
                className="w-full text-center py-12">
                <p className="text-sm font-semibold text-red-500">{loadError}</p>
              </button>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-12 h-12 rounded-full bg-[#16205B]/5 flex items-center justify-center mx-auto mb-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#16205B" strokeWidth="1.5" className="w-6 h-6 opacity-20">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700">
                  {agreements.length === 0 ? 'No pricing agreements yet' : 'No agreements match this filter'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {agreements.length === 0 ? 'Tap + New Agreement to create one' : 'Try a different filter'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest px-1">
                  {filtered.length} agreement{filtered.length !== 1 ? 's' : ''}
                </p>
                {filtered.map(a => (
                  <AgreementCard key={a.id} agreement={a}
                    currentUserId={currentUserId}
                    onView={a => { setSelected(a); setView('detail') }}
                    onExportPdf={exportPdf}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {view === 'detail' && selected && (
          <AgreementDetail
            agreement={selected}
            currentUserId={currentUserId}
            onClose={() => { setSelected(null); setView('list') }}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onExportPdf={exportPdf}
          />
        )}

        {/* ── NEW AGREEMENT FORM ── */}
        {view === 'new' && (
          <AgreementForm
            onSave={handleSaved}
            onCancel={() => setView('list')}
          />
        )}
      </div>

      <RoleNav />
    </div>
  )
}
