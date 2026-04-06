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
    const detail   = allProducts.find(p => p.id === item.id)
    const boxSize  = detail?.box_size ?? null
    // Auto-detect unit: if box_size contains "box" → per_box, else → per_kg
    const autoUnit: PriceUnit = boxSize && /box/i.test(boxSize) ? 'per_box' : 'per_kg'
    onUpdate(index, {
      product_id:    item.id,
      product_name:  item.label,
      box_size:      boxSize,
      code:          detail?.code ?? null,
      unit:          autoUnit,
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

      {/* Actions — two rows: Add Product + Cancel/Save/Activate */}
      <div className="fixed bottom-[64px] left-0 right-0 bg-white border-t border-[#EDEAE1] max-w-lg mx-auto">
        {/* Row 1: Add Product (always visible, saves scrolling up) */}
        <div className="px-4 pt-2.5 pb-0">
          <button type="button" onClick={addLine}
            className="w-full h-9 rounded-xl bg-[#16205B]/8 border border-[#16205B]/15 text-[#16205B] text-xs font-bold flex items-center justify-center gap-1.5 active:bg-[#16205B]/15 transition-colors">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/></svg>
            Add Product
          </button>
        </div>
        {/* Row 2: Cancel / Save Draft / Activate */}
        <div className="px-4 py-2.5 flex gap-2">
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

/** Convert a SVG data URI to a PNG data URI via the browser Canvas API.
 *  jsPDF addImage() does not support SVG — PNG is required. */
async function svgToPng(svgDataUri: string, pxW: number, pxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = pxW
      canvas.height = pxH
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no canvas context')); return }
      ctx.drawImage(img, 0, 0, pxW, pxH)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = svgDataUri
  })
}

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

  // MFS logo — convert SVG to PNG via canvas (jsPDF addImage doesn't support SVG)
  // Logo aspect ratio: 912×238 ≈ 3.83:1 → at 52mm wide = ~13.6mm tall, 4× for crispness
  const logoDataUri = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTEyIiBoZWlnaHQ9IjIzOCIgdmlld0JveD0iMCAwIDkxMiAyMzgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik04MDkuMzMyIDE2NS45NzNDNzU2LjgxOCAxNjUuOTczIDcyMy4wNDMgMTQ1LjEwOSA3MjEuNDE1IDExNC4zMTRDNzIxLjMyNiAxMTIuNjYgNzIyLjY4NyAxMTEuMzMgNzI0LjM0MyAxMTEuMzNINzUxLjg0M0M3NTMuNTMyIDExMS4zMyA3NTQuODY0IDExMi43MTkgNzU1LjExMyAxMTQuMzg5Qzc1Ny4yODQgMTI5LjIxIDc3Ni45NTEgMTM4Ljc2NSA4MDcuOTY5IDEzOC43NjVDODQ1LjM4MiAxMzguNzY1IDg2Ni4wMTcgMTMxLjk2MiA4NjYuMDE3IDExNi45OThDODY2LjAxNyA3NC4xNDM3IDcyNS42NjYgMTIzLjgwMSA3MjUuNjY2IDUwLjEwOTFDNzI1LjY2NiAxNy42ODU5IDc1OS45MDIgMC4wMDAxMjIwNyA4MDkuMTAyIDAuMDAwMTIyMDdDODU5LjE4OCAwLjAwMDEyMjA3IDg5Mi42NzIgMjAuNDMwNiA4OTQuOTIgNTEuNTk4NUM4OTUuMDM3IDUzLjI3MyA4OTMuNjY5IDU0LjY0MyA4OTEuOTkzIDU0LjY0M0g4NjUuMTg1Qzg2My41MTUgNTQuNjQzIDg2Mi4xODUgNTMuMjggODYxLjkzOSA1MS42MjY2Qzg1OS42NjggMzYuNTcwOCA4NDAuMjM1IDI2Ljk4MDggODEwLjAwOCAyNi45ODA4Qzc3Ny4xMzYgMjYuOTgwOCA3NTguMzE0IDMzLjc4MzkgNzU4LjMxNCA0Ny4zODc5Qzc1OC4zMTQgODcuMjkzMyA4OTguNDQgNDEuMDM5IDg5OC40NCAxMTUuNjM1Qzg5OC40NCAxNDguNzM5IDg2My4yOTEgMTY1Ljk3MSA4MDkuMzI5IDE2NS45NzFMODA5LjMzMiAxNjUuOTczWiIgZmlsbD0iI0VCNjYxOSIvPgo8cGF0aCBkPSJNNTYyLjMxNiAxNjIuMzUyQzU2MC42NDYgMTYyLjM1MiA1NTkuMjg4IDE2MC45OTggNTU5LjI4OCAxNTkuMzI2VjYuNjYxNjhDNTU5LjI4OCA0Ljk4OTU5IDU2MC42NDQgMy42MzU5OSA1NjIuMzE2IDMuNjM1OTlINzAxLjgzMUM3MDMuNSAzLjYzNTk5IDcwNC44NTIgNC45OTE5MyA3MDQuODUyIDYuNjYxNjhWMjcuNTkxQzcwNC44NTIgMjkuMjYzMSA3MDMuNSAzMC42MTY3IDcwMS44MzEgMzAuNjE2N0g1OTQuNTFDNTkyLjg0IDMwLjYxNjcgNTkxLjQ4OSAzMS45NzI2IDU5MS40ODkgMzMuNjQyNFY2My40MTQ2QzU5MS40ODkgNjUuMDg2NiA1OTIuODQgNjYuNDQwMyA1OTQuNTEgNjYuNDQwM0g2OTAuNzE4QzY5Mi4zODggNjYuNDQwMyA2OTMuNzQ2IDY3Ljc5NjIgNjkzLjc0NiA2OS40NjU5Vjg4LjM1MzFDNjkzLjc0NiA5MC4wMjUyIDY5Mi4zOTEgOTEuMzc4OCA2OTAuNzE4IDkxLjM3ODhINTk0LjUxQzU5Mi44NCA5MS4zNzg4IDU5MS40ODkgOTIuNzMyNCA1OTEuNDg5IDk0LjQwNDVWMTU5LjMyMUM1OTEuNDg5IDE2MC45OTMgNTkwLjEzMyAxNjIuMzQ3IDU4OC40NjEgMTYyLjM0N0g1NjIuMzE2VjE2Mi4zNTJaIiBmaWxsPSIjRUI2NjE5Ii8+CjxwYXRoIGQ9Ik00MDUuODA2IDMuNjM1OTlDNDA3LjQ3OCAzLjYzNTk5IDQwOC44MzEgNC45ODk1OSA0MDguODMxIDYuNjYxNjhWMTE2LjIyNEw0MzIuMDYgODIuOTk0OUw0ODYuNjQgNC45Mjg3QzQ4Ny4yMDcgNC4xMTg0MSA0ODguMTMyIDMuNjM1OTkgNDg5LjEyIDMuNjM1OTlINTE3LjYyMUM1MTkuMjkzIDMuNjM1OTkgNTIwLjY0NiA0Ljk4OTU5IDUyMC42NDYgNi42NjE2OFYxNTkuMzI2QzUyMC42NDYgMTYwLjk5OCA1MTkuMjkzIDE2Mi4zNTQgNTE3LjYyMSAxNjIuMzU0SDQ5MS40NzZDNDg5LjgwNCAxNjIuMzU0IDQ4OC40NSAxNjAuOTk4IDQ4OC40NSAxNTkuMzI2VjY0LjAxNDFDNDg4LjQ1IDYxLjEwMDggNDg0LjczNiA1OS44NjkgNDgyLjk5NiA2Mi4yMDg1TDQwOS4zODQgMTYxLjEyNEM0MDguODEgMTYxLjg5NSA0MDcuOTA0IDE2Mi4zNDkgNDA2Ljk0MSAxNjIuMzQ0TDQwNi4wNjYgMTYyLjM0QzQwNS45NzkgMTYyLjM0NyA0MDUuODkyIDE2Mi4zNTQgNDA1LjgwNiAxNjIuMzU0SDM3OS42NjFDMzc3Ljk4OSAxNjIuMzU0IDM3Ni42MzUgMTYwLjk5OCAzNzYuNjM1IDE1OS4zMjZWNjQuMDE0MUMzNzYuNjM1IDYxLjEwMDggMzcyLjkyMSA1OS44NjkgMzcxLjE4MSA2Mi4yMDg1TDI5Ny41NjQgMTYxLjEzNEMyOTYuOTkzIDE2MS45MDIgMjk2LjA5NCAxNjIuMzU0IDI5NS4xMzYgMTYyLjM1NEgyNzAuNTc0QzI2OC4xMjcgMTYyLjM1NCAyNjYuNjkyIDE1OS41OTcgMjY4LjA5NCAxNTcuNTkxTDM3NC44MjUgNC45Mjg3QzM3NS4zOTIgNC4xMTg0MSAzNzYuMzE3IDMuNjM1OTkgMzc3LjMwNSAzLjYzNTk5SDQwNS44MDZaIiBmaWxsPSIjRUI2NjE5Ii8+CjxwYXRoIGQ9Ik0xMTUuNDA1IDEyNy45MTNDMTE1LjE5OSAxMjcuNDE1IDExMy40NzMgMTIzLjMyMyAxMTAuMTMzIDEyMC4wMDNDMTAzLjcxOSAxMTMuNjIxIDk1Ljk2NTEgMTEzLjA2NiA5NC4xNjg5IDExMi45ODRDNjMuNzgwOCAxMTIuOTcgMzMuMzkyNyAxMTIuOTU2IDMuMDA0NjIgMTEyLjk0MkMxLjM0NjU3IDExMi45NDIgMCAxMTQuMjg2IDAgMTE1Ljk0N1YxMzIuOTExQzAgMTM0LjU3MSAxLjM0NDIzIDEzNS45MTYgMy4wMDQ2MiAxMzUuOTE2SDY0LjA2ODlWMTM1Ljk2OUM2Ny4yNTM4IDEzNS45NjkgNjkuODI5OSAxMzguNTQ2IDY5LjgyOTkgMTQxLjczQzY5LjgyOTkgMTQzLjM3IDY5LjE1MDcgMTQ0Ljg0NSA2OC4wNSAxNDUuODk5SDY4LjA4MDVMMjIuNTU0NSAxOTEuNDI1QzIxLjM4MTMgMTkyLjU5OCAyMS4zODEzIDE5NC41IDIyLjU1NDUgMTk1LjY3M0wzNC41NDk2IDIwNy42NjhDMzUuNzIyOSAyMDguODQxIDM3LjYyNDUgMjA4Ljg0MSAzOC43OTc3IDIwNy42NjhMODUuMzc5OSAxNjEuMDg2Qzg2LjI0ODcgMTYwLjU2MSA4Ny4yNTEgMTYwLjI0MSA4OC4zNDIzIDE2MC4yNDFDOTEuNTI3MyAxNjAuMjQxIDk0LjEwMzMgMTYyLjgxNyA5NC4xMDMzIDE2Ni4wMDJIOTQuMjUwOVYyMjcuMDYxQzk0LjI1MDkgMjI4LjcxOSA5NS41OTUxIDIzMC4wNjYgOTcuMjU1NSAyMzAuMDY2SDExNC4yMkMxMTUuODggMjMwLjA2NiAxMTcuMjI1IDIyOC43MjIgMTE3LjIyNSAyMjcuMDYxTDExNy4yNDEgMTM1Ljk2NUMxMTcuMjQxIDEzNC45MTMgMTE2Ljk3OSAxMzEuNzAzIDExNS40MDcgMTI3LjkxMUwxMTUuNDA1IDEyNy45MTNaIiBmaWxsPSIjRUI2NjE5Ii8+CjxwYXRoIGQ9Ik0yMjEuOTc3IDEyNC40M0MyMjEuOTc3IDEyNC40MTIgMjIxLjYyOSAxMjQuMzk4IDIyMS4yNDIgMTI0LjM4NkMyMjEuMTkxIDEyNC4zOTUgMjIxLjEzMiAxMjQuNDAyIDIyMS4xMzQgMTI0LjQxNEMyMjEuMTQxIDEyNC40ODIgMjIxLjk3NyAxMjQuNDU4IDIyMS45NzcgMTI0LjQzWiIgZmlsbD0iI0VCNjYxOSIvPgo8cGF0aCBkPSJNMjI2LjMyNCAxMjAuNDAyQzIyNi4zMDYgMTE4LjQ0MiAyMjYuMjggMTE2LjQ4OSAyMjYuMjk0IDExNC41MjlDMjI2LjMwMSAxMTMuMjU1IDIyNi4zMDEgMTExLjUzOCAyMjYuMjc4IDEwOS4wNjVWMTA0LjM4NkMyMjYuMjc4IDEwNC4zNTYgMjI2LjI2MSAxMDQuMzMgMjI2LjI2MSAxMDQuMjZDMjI2LjI1NCAxMDQuMTc4IDIyNi4yMTQgMTAzLjkxOCAyMjYuMTIxIDEwMy42MDRDMjI2LjAzNCAxMDMuMjkzIDIyNS45MDUgMTAzLjAxNiAyMjUuNjk3IDEwMi43MDNDMjI1LjUyOCAxMDIuNDYxIDIyNS4zNDMgMTAyLjI1MSAyMjUuMTAyIDEwMi4wNTZDMjI1LjA4MyAxMDIuMDQgMjI1LjA2MiAxMDIuMDM1IDIyNS4wNDMgMTAyLjAyMUMyMjQuNzg4IDEwMS44MjkgMjI0LjUxOSAxMDEuNjcyIDIyNC4yMDcgMTAxLjU2OUMyMjMuNTUyIDEwMS4zMzUgMjIyLjk3OCAxMDEuMzYxIDIyMi44MjYgMTAxLjM3NUMyMjIuNjk1IDEwMS4zNzUgMjIyLjU2MyAxMDEuMzc5IDIyMi40MyAxMDEuMzgySDE2Mi44MjlDMTYxLjY1OCAxMDEuMzkzIDE2MC40OSAxMDEuNDA1IDE1OS4zMTkgMTAxLjQxN0MxNTMuOTgyIDEwMS40MTcgMTUxLjMwNyA5NC45NjI3IDE1NS4wODIgOTEuMTg3NkMxNTUuODA0IDkwLjQ2NjMgMTU2LjUzNyA4OS43MzEgMTU3LjI3OSA4OC45ODYyQzE3MS42MjMgNzQuNjY1NyAxODUuOTY1IDYwLjM0NzUgMjAwLjMwOSA0Ni4wMjdDMjAxLjMxNiA0NS4wMiAyMDEuNDA1IDQzLjUwMjUgMjAwLjY4MyA0Mi4zNDMyQzIwMC41OTIgNDIuMTYyOSAyMDAuNDk4IDQxLjk4OTYgMjAwLjQxNiA0MS44NzQ5QzE5OS40NTkgNDAuOTA3NyAxOTguNjc5IDQwLjEyNTUgMTk4LjE3NSAzOS42MTczQzE5Ni4wNiAzNy40OTA5IDE5My41NTUgMzQuOTY2MyAxOTAuNDQgMzEuODc5OEMxODkuODI0IDMxLjI3MDkgMTg5LjIwOCAzMC42NTk2IDE4OC41OTIgMzAuMDUwOEMxODguNTM0IDI5Ljk3NTggMTg4LjA3MiAyOS40NDY2IDE4Ny4zMTYgMjkuMTIxQzE4Ni45NjkgMjguOTc1OCAxODYuNTgzIDI4Ljg2MzQgMTg2LjExIDI4Ljg4MjJDMTg1LjczNSAyOC44OTYyIDE4NS40MTQgMjguOTg5OSAxODUuMTI5IDI5LjEwN0MxODUuMDM1IDI5LjE0MjEgMTg0Ljk1NSAyOS4yMDMgMTg0Ljg2NCAyOS4yNDk4QzE4NC42MzIgMjkuMzc2MyAxODQuNDQgMjkuNTAwNCAxODQuMjkgMjkuNjMxNkMxODQuMjE4IDI5LjY5MDEgMTg0LjEzMSAyOS43MTU5IDE4NC4wNjMgMjkuNzgxNEwxODIuMDQyIDMxLjgwMjVDMTgyLjAxNiAzMS44MjgyIDE4MS45OSAzMS44NTE3IDE4MS45NjUgMzEuODc3NEMxNjcuNiA0Ni4yNDI0IDE1My4yMzcgNjAuNjA3NSAxMzguODcyIDc0Ljk3MjVDMTM2LjgxMSA3Ny4wMzMzIDEzMy43NTUgNzcuMDMxIDEzMS43NDggNzUuOTg4OUMxMjkuNTQ0IDc0Ljg0MzcgMTI4Ljg3IDcyLjAzODEgMTI4LjY0MyA3MC43MzYxQzEyOC42NDUgNjkuNzEwMyAxMjguNjQ1IDY4LjY3OTkgMTI4LjY1OSA2Ny42NTQyVjU4LjgxMzZDMTI4LjY2NCA1NC44NzIyIDEyOC42NzMgNTAuOTM1NiAxMjguNjc1IDQ2Ljk4NzJDMTI4LjY4IDM5LjIzMDkgMTI4LjY2NiAzMS41MDI3IDEyOC42NTkgMjMuNzY3NVY2Ljg1NDU0QzEyOC42NTkgNi43ODY2MyAxMjguNjI0IDYuNzMwNDIgMTI4LjYxOSA2LjY2MjUxQzEyOC41OTggNi40NjM0NSAxMjguNTYxIDYuMjMzOTUgMTI4LjQ4MSA1Ljk3NjM0QzEyOC4xMzkgNC44ODI2OSAxMjcuMjE3IDQuMDkzNDggMTI2LjA1NSAzLjkzMTg5QzEyNS45OTkgMy45MjAxOCAxMjUuOTQ1IDMuOTA2MTMgMTI1Ljg4NiAzLjg5OTFDMTI1LjgwNCAzLjg5MjA4IDEyNS43MzYgMy44NTIyNiAxMjUuNjUyIDMuODUyMjZIMTI1LjM0M0MxMjUuMjg5IDMuODQ5OTIgMTI1LjIzOCAzLjgzODIxIDEyNS4xODEgMy44MzgyMUMxMjQuNjc2IDMuODI4ODUgMTIzLjc3MiAzLjgxNzE0IDEyMi42NDUgMy44MDc3N0MxMTguOTkgMy43NzczMiAxMTcuMDQ4IDMuODI2NSAxMTIuNTg5IDMuODM4MjFDMTExLjc3NCAzLjgzODIxIDExMC40NjMgMy44NDI5IDEwOC44MjYgMy44MzgyMUMxMDguNzkzIDMuODM4MjEgMTA4Ljc3IDMuODUyMjYgMTA4LjY4NSAzLjg1MjI2QzEwOC42MTUgMy44NTIyNiAxMDguNTU0IDMuODg3MzkgMTA4LjQ4NCAzLjg5MjA4QzEwOC4xNTQgMy45MjAxOCAxMDcuODM4IDMuOTY0NjcgMTA3LjU1NCA0LjA3OTQzQzEwNy40NDkgNC4xMjE1OCAxMDcuMzY5IDQuMTk4ODYgMTA3LjI3MSA0LjI1MjcyQzEwNy4wNDQgNC4zNzkxOCAxMDYuODE5IDQuNTAwOTYgMTA2LjYzNiA0LjY4MTI5QzEwNi40MyA0Ljg3NTY2IDEwNi4yOCA1LjExNjg3IDEwNi4xMzUgNS4zNjI3N0MxMDYuMTAyIDUuNDIzNjYgMTA2LjA1MyA1LjQ2ODE1IDEwNi4wMjMgNS41MjkwNEMxMDUuODYzIDUuODQ5ODggMTA1Ljc3NCA2LjE5ODgyIDEwNS43MzkgNi41NzExN0MxMDUuNzM1IDYuNjAzOTYgMTA1LjcxOCA2LjYyOTcyIDEwNS43MTMgNi42OTc2NEMxMDUuNzExIDYuNzUxNSAxMDUuNjgzIDYuNzk4MzQgMTA1LjY4MyA2Ljg1MjJWNy45MzY0OEMxMDUuNjgzIDguMTQwMjMgMTA1LjY3NiA4LjM0MTYzIDEwNS42ODMgOC41NDUzN0MxMDUuNjgzIDguNTQ1MzcgMTA1LjY4MyA2Ny4yOTM1IDEwNS43MTEgNjcuMjkzNVY3MC43Mzg0QzEwNS43MTEgNzYuMDc1NSA5OS4yNTQ2IDc4Ljc0OTkgOTUuNDc5NSA3NC45NzQ4QzgxLjExNDUgNjAuNjA5OCA2Ni43NTE4IDQ2LjI0NDggNTIuMzg2NyAzMS44Nzk4QzUyLjA3NzYgMzEuNjEwNCA1MS43Njg1IDMxLjM0MTEgNTEuNDU5NCAzMS4wNzE4TDUwLjI2NSAyOS44Nzc1QzQ5LjMzMjkgMjguOTQ1NCA0Ny45NTgzIDI4Ljc4NjIgNDYuODM2NSAyOS4zMzE4QzQ2LjMyODMgMjkuNTQ3MyA0NS45ODE3IDI5LjgyODMgNDUuODg4IDI5LjkxNzNDNDUuMjMgMzAuNTczIDQ0LjU2OTYgMzEuMjI2NCA0My45MTE1IDMxLjg4MjFDNDMuMjk3OSAzMi40OTEgNDIuMjc5MiAzMy41OTY0IDQwLjU3NjcgMzUuMzJMMzkuMTc2MyAzNi43MjA0QzM4LjMxNjggMzcuNTcwNSAzNy4zMjM4IDM4LjUzMyAzNi4xNzYzIDM5LjYyMkMzNS4zNzU0IDQwLjM4MDcgMzQuNzI5IDQwLjk3NTYgMzQuMzk2NSA0MS4yOEMzNC4xMTc4IDQxLjU3NTEgMzMuNzczNiA0Mi4wMzQxIDMzLjUzOTQgNDIuNjAzMkMzMi45MzA1IDQzLjczOSAzMy4wNjQgNDUuMTY1MiAzNC4wMjE4IDQ2LjEyNTRDMzQuMDIxOCA0Ni4xMjU0IDM1LjI1ODMgNDcuMzYxOSAzNS4yNzQ3IDQ3LjM4MjlDMzYuMTE1NCA0OC4zNjQyIDM2Ljg5MjkgNDkuMDU5NyAzNy4zNDk2IDQ5LjQ1MzFMNDIuNzc1NyA1NC44NzkzQzQyLjk5MzUgNTUuMDk5NCA0My4yMDkgNTUuMzE5NSA0My40MjY3IDU1LjUzNzNDNDkuMTUyNiA2MS4yNjMyIDU0Ljg3NjEgNjYuOTg2NyA2MC42MDIgNzIuNzEyNkM2Ni4zMjc5IDc4LjQzODUgNzIuMDUxNCA4NC4xNjIgNzcuNzc3MyA4OS44ODc5SDExNy4yMzVDMTE5LjE3MiA5MC4wMDI2IDEyNi41NDcgOTAuNjc0NyAxMzIuNzc4IDk2LjcwMjdDMTM5LjQ1IDEwMy4xNTcgMTQwLjA4IDExMS4xNzggMTQwLjE3NiAxMTIuOTgzVjE1Mi4yODlMMTgxLjg0OCAxOTMuOTYxQzE4Mi4yOTUgMTk0LjM5MSAxODIuNjQ0IDE5NC43NSAxODIuODgzIDE5NC45OTZDMTgzLjE5NCAxOTUuMzE2IDE4My40MDMgMTk1LjU0NiAxODMuNzYxIDE5NS44NzRDMTg0LjA4NiAxOTYuMTc0IDE4NC4yNSAxOTYuMzI0IDE4NC40NCAxOTYuNDVDMTg0LjQ0IDE5Ni40NSAxODQuNjIgMTk2LjU2NyAxODQuOTExIDE5Ni42OTFDMTg1LjAyMSAxOTYuNzQzIDE4NS4xMzEgMTk2Ljc3MSAxODUuMjQ2IDE5Ni44MDhDMTg1LjQ2MyAxOTYuODc2IDE4NS43IDE5Ni45MzUgMTg1Ljk4NiAxOTYuOTUxQzE4Ni4xMzYgMTk2Ljk2IDE4Ni4yNzYgMTk2Ljk0NCAxODYuNDI2IDE5Ni45M0MxODYuNTYyIDE5Ni45MTQgMTg2LjY4OCAxOTYuODg4IDE4Ni44MTUgMTk2Ljg1NUMxODcuMzQ5IDE5Ni43MzMgMTg3Ljg2MiAxOTYuNTE4IDE4OC4yNzggMTk2LjEwM0wyMDAuMjczIDE4NC4xMDhDMjAxLjQ0NyAxODIuOTM1IDIwMS40NDcgMTgxLjAzMyAyMDAuMjczIDE3OS44NkMyMDAuMjczIDE3OS44NiAxOTkuNjk3IDE3OS4yODQgMTk5LjY3NCAxNzkuMjU0QzE5OS40NjEgMTc4Ljk5NiAxOTkuMDU4IDE3OC41NyAxOTguNjIgMTc4LjE0OEMxOTguNDgyIDE3OC4wMTUgMTk4LjMzNyAxNzcuODgxIDE5OC4xNjggMTc3LjczNEMxOTcuOTA4IDE3Ny41MDQgMTk3LjY3NCAxNzcuMjQ3IDE5Ny40MjMgMTc3LjAxTDE5My44NzEgMTczLjQ1N0MxOTMuNjMgMTczLjIwOSAxOTMuMzkzIDE3Mi45NTYgMTkzLjE0NyAxNzIuNzFDMTkxLjg0NSAxNzEuNDIgMTkwLjY1MSAxNzAuMjMzIDE4OS41MjkgMTY5LjExM0wxODMuMTAzIDE2Mi42ODdDMTc0Ljk1MSAxNTQuNDk1IDE3NC4yMTggMTUzLjU3NSAxNzIuMDMzIDE1MS42MTdDMTcxLjM1NCAxNTAuOTM4IDE3MC42NzIgMTUwLjI1NyAxNjkuOTkzIDE0OS41NzdDMTY4LjQ2MiAxNDguMDQ2IDE2Ni45MyAxNDYuNTE0IDE2NS4zOTggMTQ0Ljk4M0MxNjMuOTA0IDE0My40ODkgMTYzLjQ4NSAxNDMuMDU4IDE2Mi4yMjcgMTQxLjgwNUMxNjEuMDcxIDE0MC42NSAxNjEuMTc0IDE0MC43NiAxNjAuNTMgMTQwLjExNEMxNTguMTkgMTM3Ljc2NSAxNTguMjM3IDEzNy43MyAxNTcuMzQ1IDEzNi45MDhDMTU3LjA5MiAxMzYuNjc0IDE1Ni42MjYgMTM2LjI1IDE1Ni4wMjIgMTM1LjYxOEMxNTUuNTIzIDEzNS4wOTUgMTU1LjE1IDEzNC42NDggMTU1LjA3OCAxMzQuNTc1QzE1MS4zMDMgMTMwLjggMTUzLjk3NyAxMjQuMzQ2IDE1OS4zMTQgMTI0LjM0NkMxNjAuMzEyIDEyNC4zNDYgMTYxLjM3MyAxMjQuMzQ2IDE2Mi40NjQgMTI0LjM0NEMxODEuNzc3IDEyNC4zNDggMjAxLjA5MSAxMjQuMzUzIDIyMC40MDQgMTI0LjM1NUMyMjAuNjA2IDEyNC4zNjUgMjIwLjkzMyAxMjQuMzc0IDIyMS4yNCAxMjQuMzg2QzIyMS4yOTYgMTI0LjM3NyAyMjEuMzc4IDEyNC4zNjUgMjIxLjQ4NiAxMjQuMzU1SDIyMy4yNjZDMjI0LjU0NSAxMjQuMzU1IDIyNS42MiAxMjMuNTUyIDIyNi4wNTMgMTIyLjQyOEMyMjYuMzAxIDEyMS45MzQgMjI2LjMyOSAxMjEuMzg0IDIyNi4zMTcgMTIwLjQwMkgyMjYuMzI0WiIgZmlsbD0iI0VCNjYxOSIvPgo8cGF0aCBkPSJNMjc1LjcyOCAyMjkuNzMzTDI2NS43OTUgMjAyLjg4OUgyNzEuNzAxTDI3OC44MzQgMjIyLjY3N0wyODUuNTgzIDIwMi44ODlIMjkwLjkxM0wyOTcuNjI0IDIyMi42NzdMMzA0Ljc5NSAyMDIuODg5SDMxMC43MDFMMzAwLjc2OSAyMjkuNzMzSDI5NC42MzNMMjg4LjI2NyAyMTAuODI3TDI4MS44MjUgMjI5LjczM0gyNzUuNzI4Wk0zNTUuNDQ0IDIyOS43MzNWMjAyLjg4OUgzNjAuODg5VjIxMy4xNjdIMzc4Ljk1MVYyMDIuODg5SDM4NC4zOTZWMjI5LjczM0gzNzguOTUxVjIxNy43NjhIMzYwLjg4OVYyMjkuNzMzSDM1NS40NDRaTTQ0Ni42MzIgMjMwLjM0NkM0MzYuODkxIDIzMC4zNDYgNDMwLjQ0OSAyMjQuNzQ4IDQzMC40NDkgMjE2LjMxMUM0MzAuNDQ5IDIwNy44NzUgNDM2Ljg5MSAyMDIuMjc2IDQ0Ni42MzIgMjAyLjI3NkM0NTYuMzMzIDIwMi4yNzYgNDYyLjgxNCAyMDcuODc1IDQ2Mi44MTQgMjE2LjMxMUM0NjIuODE0IDIyNC43NDggNDU2LjMzMyAyMzAuMzQ2IDQ0Ni42MzIgMjMwLjM0NlpNNDQ2LjYzMiAyMjUuNzQ1QzQ1My4wNzQgMjI1Ljc0NSA0NTcuMzY5IDIyMi4xNCA0NTcuMzY5IDIxNi4zMTFDNDU3LjM2OSAyMTAuNDgyIDQ1My4wNzQgMjA2LjgzOSA0NDYuNjMyIDIwNi44MzlDNDQwLjE4OSAyMDYuODM5IDQzNS44OTQgMjEwLjQ4MiA0MzUuODk0IDIxNi4zMTFDNDM1Ljg5NCAyMjIuMTQgNDQwLjE4OSAyMjUuNzQ1IDQ0Ni42MzIgMjI1Ljc0NVpNNTA4LjkwMyAyMjkuNzMzVjIwMi44ODlINTE0LjM0OVYyMjUuMTMxSDUzMy4wNjJWMjI5LjczM0g1MDguOTAzWk01NzcuMzU3IDIyOS43MzNWMjAyLjg4OUg2MDMuMjQyVjIwNy40NTNINTgyLjgwMlYyMTMuMzJINjAwLjk3OVYyMTcuNTM4SDU4Mi44MDJWMjI1LjEzMUg2MDMuMjQyVjIyOS43MzNINTc3LjM1N1pNNjYzLjI3MSAyMzAuMzQ2QzY1NC4xMDYgMjMwLjM0NiA2NDguMzE2IDIyNi41ODggNjQ4LjM5MiAyMjEuMTA1SDY1NC4wNjhDNjU0LjAzIDIyMy45MDQgNjU3LjQ0MyAyMjUuNzQ1IDY2My4wNDEgMjI1Ljc0NUM2NjkuMzY5IDIyNS43NDUgNjcyLjg1OCAyMjQuNTk0IDY3Mi44NTggMjIyLjA2M0M2NzIuODU4IDIxNC44MTYgNjQ5LjEyMSAyMjMuMjE0IDY0OS4xMjEgMjEwLjc1MUM2NDkuMTIxIDIwNS4yNjcgNjU0LjkxMiAyMDIuMjc2IDY2My4yMzMgMjAyLjI3NkM2NzEuOTc2IDIwMi4yNzYgNjc3LjcyOCAyMDUuOTU3IDY3Ny43NjcgMjExLjUxOEg2NzIuMjA2QzY3Mi4yMDYgMjA4LjY4IDY2OC44MzIgMjA2LjgzOSA2NjMuMzg2IDIwNi44MzlDNjU3LjgyNiAyMDYuODM5IDY1NC42NDMgMjA3Ljk5IDY1NC42NDMgMjEwLjI5MUM2NTQuNjQzIDIxNy4wNCA2NzguMzQyIDIwOS4yMTcgNjc4LjM0MiAyMjEuODMzQzY3OC4zNDIgMjI3LjQzMiA2NzIuMzk4IDIzMC4zNDYgNjYzLjI3MSAyMzAuMzQ2Wk03MjAuNjkzIDIyOS43MzNMNzM3LjAzIDIwMi44ODlINzQzLjYyNUw3NjAgMjI5LjczM0g3NTMuNzExTDc1MC4zNzUgMjI0LjA1N0g3MzAuMjhMNzI2Ljk4MiAyMjkuNzMzSDcyMC42OTNaTTczMi45MjYgMjE5LjQ1Nkg3NDcuNzI5TDc0MC4zNjYgMjA2LjY4Nkw3MzIuOTI2IDIxOS40NTZaTTgwMy45ODkgMjI5LjczM1YyMDIuODg5SDgwOS40MzRWMjI1LjEzMUg4MjguMTQ4VjIyOS43MzNIODAzLjk4OVpNODcyLjQ0MiAyMjkuNzMzVjIwMi44ODlIODk4LjMyN1YyMDcuNDUzSDg3Ny44ODhWMjEzLjMySDg5Ni4wNjVWMjE3LjUzOEg4NzcuODg4VjIyNS4xMzFIODk4LjMyN1YyMjkuNzMzSDg3Mi40NDJaIiBmaWxsPSIjRUI2NjE5Ii8+Cjwvc3ZnPgo='
  const logoPng = await svgToPng(logoDataUri, 912, 238)
  doc.addImage(logoPng, 'PNG', 12, 7.2, 52, 13.6)

  // Section label on right
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
