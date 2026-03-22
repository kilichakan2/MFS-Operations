'use client'

import { useState, useCallback, useId, useEffect } from 'react'
import BottomSheetSelector, {
  type SelectableItem,
} from '@/components/BottomSheetSelector'
import RoleNav from '@/components/RoleNav'
import AppHeader             from '@/components/AppHeader'
import RecentActivity from '@/components/RecentActivity'
import { localDb, syncReferenceData } from '@/lib/localDb'
import { triggerSync }                from '@/lib/syncEngine'
import { useCustomers, useProducts } from '@/hooks/useReferenceData'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status  = 'short' | 'not_sent'
type Reason  = 'out_of_stock' | 'supplier_short' | 'butcher_error' | 'other'
type Unit    = 'kg' | 'units'

interface FormState {
  customer:    SelectableItem | null
  product:     SelectableItem | null
  status:      Status | null
  orderedQty:  string
  sentQty:     string
  unit:        Unit
  reason:      Reason | null
  note:        string
}

const EMPTY_FORM: FormState = {
  customer:   null,
  product:    null,
  status:     null,
  orderedQty: '',
  sentQty:    '',
  unit:       'kg',
  reason:     null,
  note:       '',
}

// ─── Reason config ────────────────────────────────────────────────────────────

const REASONS: { value: Reason; label: string }[] = [
  { value: 'out_of_stock',   label: 'Out of stock'   },
  { value: 'supplier_short', label: 'Supplier short' },
  { value: 'butcher_error',  label: 'Butcher error'  },
  { value: 'other',          label: 'Other'          },
]

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationErrors {
  customer?:   string
  product?:    string
  status?:     string
  orderedQty?: string
  sentQty?:    string
  reason?:     string
}

function validate(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {}

  if (!form.customer)  errors.customer  = 'Select a customer'
  if (!form.product)   errors.product   = 'Select a product'
  if (!form.status)    errors.status    = 'Select a status'
  if (!form.reason)    errors.reason    = 'Select a reason'

  const ordered = parseFloat(form.orderedQty)
  if (!form.orderedQty || isNaN(ordered) || ordered <= 0) {
    errors.orderedQty = 'Enter ordered quantity'
  }

  if (form.status === 'short') {
    const sent = parseFloat(form.sentQty)
    if (!form.sentQty || isNaN(sent) || sent <= 0) {
      errors.sentQty = 'Enter sent quantity'
    } else if (!isNaN(ordered) && sent >= ordered) {
      errors.sentQty = 'Must be less than ordered qty'
    }
  }

  return errors
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Section label */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2 px-1">
      {children}
    </p>
  )
}

/** Inline field error */
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-red-500 text-xs mt-1.5 px-1 font-medium" role="alert">
      {message}
    </p>
  )
}

/** Selector trigger button — opens the bottom sheet */
function SelectorButton({
  label,
  placeholder,
  onClick,
  error,
}: {
  label?: string
  placeholder: string
  onClick: () => void
  error?: string
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={[
          'w-full min-h-[56px] flex items-center justify-between',
          'px-4 rounded-xl border-2 text-left',
          'transition-colors duration-100 active:scale-[0.99]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
          error
            ? 'border-red-400 bg-red-50'
            : label
            ? 'border-[#16205B] bg-white'
            : 'border-gray-200 bg-gray-50',
        ].join(' ')}
        aria-haspopup="dialog"
      >
        <span
          className={
            label ? 'text-base font-semibold text-gray-900' : 'text-base text-gray-400'
          }
        >
          {label ?? placeholder}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 flex-shrink-0 ml-2 text-gray-400"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <FieldError message={error} />
    </div>
  )
}

/** "Logged" success flash banner */
function SuccessBanner({ visible }: { visible: boolean }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={[
        'fixed top-4 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2.5 px-5 py-3',
        'bg-[#16205B] text-white rounded-full shadow-xl',
        'text-sm font-semibold',
        'transition-all duration-300',
        visible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 -translate-y-2 scale-95 pointer-events-none',
      ].join(' ')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4 text-[#EB6619]"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
          clipRule="evenodd"
        />
      </svg>
      Logged
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SheetTarget = 'customer' | 'product' | null

export default function Screen1Page() {
  const formId               = useId()
  const [form, setForm]      = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors]  = useState<ValidationErrors>({})
  const [sheet, setSheet]    = useState<SheetTarget>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Live reference data (Supabase via Dexie offline cache) ─────────────────
  const customers = useCustomers()
  const products  = useProducts()

  // Sync on mount — respects 30-min cooldown, safe to call every render
  useEffect(() => {
    syncReferenceData().catch(console.error)
  }, [])

  // ── Field updaters ──────────────────────────────────────────────────────────

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      // Clear that field's error on change
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    []
  )

  // When status changes to NOT SENT, clear sent qty
  const setStatus = useCallback((status: Status) => {
    setForm((prev) => ({
      ...prev,
      status,
      sentQty: status === 'not_sent' ? '' : prev.sentQty,
    }))
    setErrors((prev) => ({ ...prev, status: undefined, sentQty: undefined }))
  }, [])

  // ── Sheet handlers ──────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (item: SelectableItem) => {
      if (sheet === 'customer') set('customer', item)
      if (sheet === 'product')  set('product',  item)
      setSheet(null)
    },
    [sheet, set]
  )

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      // Scroll to top so first error is visible
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setIsSubmitting(true)

    try {
      await localDb.queue.add({
        localId:   crypto.randomUUID(),
        screen:    'screen1',
        payload: {
          customer_id:  form.customer!.id,
          product_id:   form.product!.id,
          status:       form.status!,
          ordered_qty:  parseFloat(form.orderedQty),
          sent_qty:     form.status === 'short' ? parseFloat(form.sentQty) : null,
          unit:         form.unit,
          reason:       form.reason!,
          note:         form.note.trim() || null,
        },
        createdAt: Date.now(),
        synced:    false,
        retries:   0,
      })

      // Reset form immediately — user is unblocked
      setForm(EMPTY_FORM)
      setErrors({})

      // Flash success banner for 2 seconds
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)

      // Fire-and-forget sync — does not block the UI
      triggerSync()
    } catch (err) {
      console.error('Failed to write to local queue:', err)
    } finally {
      setIsSubmitting(false)
    }
  }, [form])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Success flash */}
      <SuccessBanner visible={showSuccess} />

      {/* Bottom sheets */}
      {sheet === 'customer' && (
        <BottomSheetSelector
          title="Select customer"
          items={customers}
          selectedId={form.customer?.id}
          searchPlaceholder="Search customers…"
          onSelect={handleSelect}
          onDismiss={() => setSheet(null)}
        />
      )}
      {sheet === 'product' && (
        <BottomSheetSelector
          title="Select product"
          items={products}
          selectedId={form.product?.id}
          searchPlaceholder="Search products…"
          onSelect={handleSelect}
          onDismiss={() => setSheet(null)}
        />
      )}

      {/* Page */}
      <div className="min-h-screen bg-gray-50">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <AppHeader title="Dispatch Log" maxWidth="lg" />

        {/* ── Form ───────────────────────────────────────────────────────── */}
        <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-6" id={formId}>

          {/* ── Customer ─────────────────────────────────────────────────── */}
          <section>
            <Label>Customer</Label>
            <SelectorButton
              label={form.customer?.label}
              placeholder="Select customer"
              onClick={() => setSheet('customer')}
              error={errors.customer}
            />
          </section>

          {/* ── Product ──────────────────────────────────────────────────── */}
          <section>
            <Label>Product</Label>
            <SelectorButton
              label={form.product?.label}
              placeholder="Select product"
              onClick={() => setSheet('product')}
              error={errors.product}
            />
          </section>

          {/* ── Status ───────────────────────────────────────────────────── */}
          <section>
            <Label>Status</Label>
            <div
              className="grid grid-cols-2 gap-3"
              role="group"
              aria-label="Discrepancy status"
            >
              {(
                [
                  { value: 'short' as Status,    label: 'Short'    },
                  { value: 'not_sent' as Status, label: 'Not sent' },
                ] as const
              ).map(({ value, label }) => {
                const isActive = form.status === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatus(value)}
                    aria-pressed={isActive}
                    className={[
                      'h-[72px] rounded-2xl text-base font-bold',
                      'transition-all duration-100 active:scale-[0.97]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive
                        ? 'bg-[#590129] text-white shadow-md'
                        : 'bg-white text-gray-500 border-2 border-gray-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <FieldError message={errors.status} />
          </section>

          {/* ── Quantities ───────────────────────────────────────────────── */}
          <section>
            <Label>Quantities</Label>

            {/* Unit toggle — sits above the qty fields */}
            <div
              className="flex rounded-xl overflow-hidden border-2 border-gray-200 mb-3 w-fit"
              role="group"
              aria-label="Unit"
            >
              {(['kg', 'units'] as Unit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => set('unit', u)}
                  aria-pressed={form.unit === u}
                  className={[
                    'px-6 py-2.5 text-sm font-bold transition-colors duration-100',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
                    form.unit === u
                      ? 'bg-[#16205B] text-white'
                      : 'bg-white text-gray-500',
                  ].join(' ')}
                >
                  {u}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Ordered qty — always visible */}
              <div>
                <p className="text-xs text-gray-400 font-semibold mb-1.5 px-1">
                  Ordered
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  placeholder={`0.000 ${form.unit}`}
                  value={form.orderedQty}
                  onChange={(e) => set('orderedQty', e.target.value)}
                  aria-label="Ordered quantity"
                  className={[
                    'w-full h-[56px] rounded-xl px-4',
                    'text-base font-semibold text-gray-900',
                    'border-2 bg-white',
                    'focus:outline-none focus:border-[#EB6619]',
                    'transition-colors',
                    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                    errors.orderedQty ? 'border-red-400 bg-red-50' : 'border-gray-200',
                  ].join(' ')}
                />
                <FieldError message={errors.orderedQty} />
              </div>

              {/* Sent qty — hidden when NOT SENT selected */}
              <div
                className={[
                  'transition-all duration-200 overflow-hidden',
                  form.status === 'not_sent'
                    ? 'opacity-0 pointer-events-none scale-95'
                    : 'opacity-100 scale-100',
                ].join(' ')}
                aria-hidden={form.status === 'not_sent'}
              >
                <p className="text-xs text-gray-400 font-semibold mb-1.5 px-1">
                  Sent
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  placeholder={`0.000 ${form.unit}`}
                  value={form.sentQty}
                  onChange={(e) => set('sentQty', e.target.value)}
                  aria-label="Sent quantity"
                  tabIndex={form.status === 'not_sent' ? -1 : 0}
                  className={[
                    'w-full h-[56px] rounded-xl px-4',
                    'text-base font-semibold text-gray-900',
                    'border-2 bg-white',
                    'focus:outline-none focus:border-[#EB6619]',
                    'transition-colors',
                    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                    errors.sentQty ? 'border-red-400 bg-red-50' : 'border-gray-200',
                  ].join(' ')}
                />
                <FieldError message={errors.sentQty} />
              </div>
            </div>
          </section>

          {/* ── Reason ───────────────────────────────────────────────────── */}
          <section>
            <Label>Reason</Label>
            <div
              className="grid grid-cols-2 gap-3"
              role="group"
              aria-label="Reason for discrepancy"
            >
              {REASONS.map(({ value, label }) => {
                const isActive = form.reason === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      set('reason', value)
                    }}
                    aria-pressed={isActive}
                    className={[
                      'min-h-[56px] rounded-xl px-3 py-3',
                      'text-sm font-bold text-center leading-tight',
                      'transition-all duration-100 active:scale-[0.97]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive
                        ? 'bg-[#EB6619] text-white shadow-md'
                        : 'bg-white text-gray-600 border-2 border-gray-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <FieldError message={errors.reason} />
          </section>

          {/* ── Note (optional) ──────────────────────────────────────────── */}
          <section>
            <Label>Note (optional)</Label>
            <textarea
              rows={2}
              placeholder="Any additional context…"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              maxLength={280}
              aria-label="Optional note"
              className={[
                'w-full rounded-xl px-4 py-3',
                'text-base text-gray-900 placeholder:text-gray-400',
                'border-2 border-gray-200 bg-white',
                'focus:outline-none focus:border-[#EB6619]',
                'transition-colors resize-none',
              ].join(' ')}
            />
          </section>

          {/* ── Submit ───────────────────────────────────────────────────── */}
          <section className="pb-10">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={[
                'w-full h-16 rounded-2xl',
                'text-white text-lg font-bold',
                'transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                isSubmitting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-[#EB6619] active:scale-[0.98] active:bg-[#c95510] shadow-lg shadow-orange-200',
              ].join(' ')}
            >
              {isSubmitting ? 'Saving…' : 'Log Discrepancy'}
            </button>
          </section>


          <RecentActivity screen="screen1" />

        </main>
      </div>
      <RoleNav />
    </>
  )
}
