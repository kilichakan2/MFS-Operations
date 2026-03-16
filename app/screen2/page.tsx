'use client'

import { useState, useCallback, useId } from 'react'
import BottomSheetSelector              from '@/components/BottomSheetSelector'
import BottomNav, { Icons }             from '@/components/BottomNav'
import { useCustomers }                 from '@/hooks/useReferenceData'
import { localDb }                      from '@/lib/localDb'
import type { SelectableItem }          from '@/components/BottomSheetSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

type Category    = 'weight' | 'quality' | 'delivery' | 'missing_item' | 'pricing' | 'service' | 'other'
type ReceivedVia = 'phone' | 'in_person' | 'whatsapp' | 'email' | 'other'
type Status      = 'open' | 'resolved'

interface FormState {
  customer:        SelectableItem | null
  category:        Category | null
  description:     string
  receivedVia:     ReceivedVia | null
  status:          Status | null
  resolutionNote:  string
}

const EMPTY_FORM: FormState = {
  customer:       null,
  category:       null,
  description:    '',
  receivedVia:    null,
  status:         null,
  resolutionNote: '',
}

// ─── Button config ────────────────────────────────────────────────────────────

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'weight',       label: 'Weight'       },
  { value: 'quality',      label: 'Quality'      },
  { value: 'delivery',     label: 'Delivery'     },
  { value: 'missing_item', label: 'Missing item' },
  { value: 'pricing',      label: 'Pricing'      },
  { value: 'service',      label: 'Service'      },
  { value: 'other',        label: 'Other'        },
]

const RECEIVED_VIA: { value: ReceivedVia; label: string }[] = [
  { value: 'phone',     label: 'Phone call' },
  { value: 'in_person', label: 'In person'  },
  { value: 'whatsapp',  label: 'WhatsApp'   },
  { value: 'email',     label: 'Email'      },
  { value: 'other',     label: 'Other'      },
]

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationErrors {
  customer?:       string
  category?:       string
  description?:    string
  receivedVia?:    string
  status?:         string
  resolutionNote?: string
}

function validate(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {}

  if (!form.customer)                                      errors.customer    = 'Select a customer'
  if (!form.category)                                      errors.category    = 'Select a category'
  if (!form.description || form.description.trim().length < 5)
                                                           errors.description = 'Enter a description (min. 5 characters)'
  if (!form.receivedVia)                                   errors.receivedVia = 'Select how it was received'
  if (!form.status)                                        errors.status      = 'Select a status'
  if (form.status === 'resolved' && !form.resolutionNote.trim())
                                                           errors.resolutionNote = 'Enter how this was resolved'

  return errors
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2 px-1">
      {children}
    </p>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-red-500 text-xs mt-1.5 px-1 font-medium" role="alert">
      {message}
    </p>
  )
}

function SelectorButton({
  label,
  placeholder,
  onClick,
  error,
}: {
  label?:      string
  placeholder: string
  onClick:     () => void
  error?:      string
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
        <span className={label ? 'text-base font-semibold text-gray-900' : 'text-base text-gray-400'}>
          {label ?? placeholder}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className="w-5 h-5 flex-shrink-0 ml-2 text-gray-400" aria-hidden="true">
          <path fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd" />
        </svg>
      </button>
      <FieldError message={error} />
    </div>
  )
}

/** Reusable chunky option button — used for category and received via grids */
function OptionButton<T extends string>({
  value,
  label,
  selected,
  onPress,
  activeColour = 'maroon',
}: {
  value:        T
  label:        string
  selected:     boolean
  onPress:      (value: T) => void
  activeColour?: 'maroon' | 'navy'
}) {
  const activeBg = activeColour === 'navy' ? 'bg-[#16205B]' : 'bg-[#590129]'

  return (
    <button
      type="button"
      onClick={() => onPress(value)}
      aria-pressed={selected}
      className={[
        'min-h-[52px] rounded-xl px-3 py-3',
        'text-sm font-bold text-center leading-tight',
        'transition-all duration-100 active:scale-[0.97]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
        selected
          ? `${activeBg} text-white shadow-md`
          : 'bg-white text-gray-600 border-2 border-gray-200',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

/** "Logged" success banner — identical to Screen 1 */
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
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
        className="w-4 h-4 text-[#EB6619]" aria-hidden="true">
        <path fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
          clipRule="evenodd" />
      </svg>
      Logged
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Screen2Page() {
  const formId              = useId()
  const customers           = useCustomers()
  const [form, setForm]     = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [sheetOpen, setSheetOpen]     = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Field updaters ──────────────────────────────────────────────────────────

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    []
  )

  // Status change: clear resolution note when switching back to OPEN
  const setStatus = useCallback((status: Status) => {
    setForm((prev) => ({
      ...prev,
      status,
      resolutionNote: status === 'open' ? '' : prev.resolutionNote,
    }))
    setErrors((prev) => ({ ...prev, status: undefined, resolutionNote: undefined }))
  }, [])

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setIsSubmitting(true)

    try {
      await localDb.queue.add({
        localId:   crypto.randomUUID(),
        screen:    'screen2',
        payload: {
          customer_id:     form.customer!.id,
          category:        form.category!,
          description:     form.description.trim(),
          received_via:    form.receivedVia!,
          status:          form.status!,
          // resolution fields are NULL when status = open
          resolution_note: form.status === 'resolved' ? form.resolutionNote.trim() : null,
        },
        createdAt: Date.now(),
        synced:    false,
        retries:   0,
      })

      setForm(EMPTY_FORM)
      setErrors({})
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to write to local queue:', err)
    } finally {
      setIsSubmitting(false)
    }
  }, [form])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <SuccessBanner visible={showSuccess} />

      {sheetOpen && (
        <BottomSheetSelector
          title="Select customer"
          items={customers}
          selectedId={form.customer?.id}
          searchPlaceholder="Search customers…"
          onSelect={(item) => { set('customer', item); setSheetOpen(false) }}
          onDismiss={() => setSheetOpen(false)}
        />
      )}

      <div className="min-h-screen bg-gray-50">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="bg-[#16205B] px-5 pt-14 pb-5 sticky top-0 z-40">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div>
              <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase">
                MFS Global
              </p>
              <h1 className="text-white text-lg font-bold leading-tight mt-0.5">
                Complaint Log
              </h1>
            </div>
            <div
              className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5"
              title="All records synced"
            >
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="text-white/70 text-xs font-medium">Synced</span>
            </div>
          </div>
        </header>

        {/* ── Form ───────────────────────────────────────────────────────── */}
        <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-6" id={formId}>

          {/* ── Customer ─────────────────────────────────────────────────── */}
          <section>
            <Label>Customer</Label>
            <SelectorButton
              label={form.customer?.label}
              placeholder="Select customer"
              onClick={() => setSheetOpen(true)}
              error={errors.customer}
            />
          </section>

          {/* ── Category ─────────────────────────────────────────────────── */}
          <section>
            <Label>Category</Label>
            {/*
              7 buttons — 3 cols so the grid fills evenly.
              Last row has 1 button (Other) which span-cols itself to fill.
            */}
            <div
              className="grid grid-cols-3 gap-2.5"
              role="group"
              aria-label="Complaint category"
            >
              {CATEGORIES.slice(0, 6).map(({ value, label }) => (
                <OptionButton
                  key={value}
                  value={value}
                  label={label}
                  selected={form.category === value}
                  onPress={(v) => set('category', v)}
                  activeColour="maroon"
                />
              ))}
              {/* "Other" spans full width on its own row */}
              <div className="col-span-3">
                <OptionButton
                  value="other"
                  label="Other"
                  selected={form.category === 'other'}
                  onPress={(v) => set('category', v)}
                  activeColour="maroon"
                />
              </div>
            </div>
            <FieldError message={errors.category} />
          </section>

          {/* ── Description ──────────────────────────────────────────────── */}
          <section>
            <Label>Description</Label>
            <textarea
              rows={3}
              placeholder="What did the customer say? What was the specific issue?"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={500}
              aria-label="Complaint description"
              className={[
                'w-full rounded-xl px-4 py-3 resize-none',
                'text-base text-gray-900 placeholder:text-gray-400 leading-relaxed',
                'border-2 bg-white',
                'focus:outline-none focus:border-[#EB6619]',
                'transition-colors',
                errors.description ? 'border-red-400 bg-red-50' : 'border-gray-200',
              ].join(' ')}
            />
            <div className="flex items-start justify-between mt-1 px-1">
              <FieldError message={errors.description} />
              <span className="text-xs text-gray-300 ml-auto flex-shrink-0">
                {form.description.length}/500
              </span>
            </div>
          </section>

          {/* ── Received via ─────────────────────────────────────────────── */}
          <section>
            <Label>Received via</Label>
            <div
              className="grid grid-cols-3 gap-2.5"
              role="group"
              aria-label="How complaint was received"
            >
              {RECEIVED_VIA.slice(0, 3).map(({ value, label }) => (
                <OptionButton
                  key={value}
                  value={value}
                  label={label}
                  selected={form.receivedVia === value}
                  onPress={(v) => set('receivedVia', v)}
                  activeColour="navy"
                />
              ))}
              {/* Email + Other share last row — each 50% */}
              {RECEIVED_VIA.slice(3).map(({ value, label }) => (
                <OptionButton
                  key={value}
                  value={value}
                  label={label}
                  selected={form.receivedVia === value}
                  onPress={(v) => set('receivedVia', v)}
                  activeColour="navy"
                />
              ))}
            </div>
            <FieldError message={errors.receivedVia} />
          </section>

          {/* ── Status ───────────────────────────────────────────────────── */}
          <section>
            <Label>Status</Label>
            <div
              className="grid grid-cols-2 gap-3"
              role="group"
              aria-label="Complaint status"
            >
              {(
                [
                  { value: 'open'     as Status, label: 'Open'     },
                  { value: 'resolved' as Status, label: 'Resolved' },
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
                        ? value === 'open'
                          ? 'bg-[#590129] text-white shadow-md'       // maroon for open
                          : 'bg-[#16205B] text-white shadow-md'       // navy for resolved
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

          {/* ── Resolution note — hidden when OPEN ───────────────────────── */}
          {/*
            Same stable-layout technique as Sent Qty in Screen 1:
            opacity + pointer-events + scale rather than display:none.
            Layout space is preserved so there is no jump when toggling.
            aria-hidden and tabIndex=-1 ensure screen readers and keyboard
            users cannot reach the field when it is hidden.
          */}
          <section
            className={[
              'transition-all duration-200 overflow-hidden',
              form.status === 'resolved'
                ? 'opacity-100 scale-100'
                : 'opacity-0 pointer-events-none scale-95 h-0 !mt-0',
            ].join(' ')}
            aria-hidden={form.status !== 'resolved'}
          >
            <Label>Resolution note</Label>
            <textarea
              rows={3}
              placeholder="What was done to resolve this complaint?"
              value={form.resolutionNote}
              onChange={(e) => set('resolutionNote', e.target.value)}
              maxLength={500}
              aria-label="Resolution note"
              tabIndex={form.status !== 'resolved' ? -1 : 0}
              className={[
                'w-full rounded-xl px-4 py-3 resize-none',
                'text-base text-gray-900 placeholder:text-gray-400 leading-relaxed',
                'border-2 bg-white',
                'focus:outline-none focus:border-[#EB6619]',
                'transition-colors',
                errors.resolutionNote ? 'border-red-400 bg-red-50' : 'border-gray-200',
              ].join(' ')}
            />
            <FieldError message={errors.resolutionNote} />
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
              {isSubmitting ? 'Saving…' : 'Log Complaint'}
            </button>
          </section>

        </main>
      </div>
      <BottomNav items={[
        { href: '/screen1', label: 'Dispatch', icon: Icons.dispatch },
        { href: '/screen2', label: 'Complaints', icon: Icons.complaint },
        { href: '/screen3', label: 'Visits', icon: Icons.visit },
      ]} />
    </>
  )
}
