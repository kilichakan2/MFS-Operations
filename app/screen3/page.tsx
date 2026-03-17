'use client'

import { useState, useCallback, useId, useEffect } from 'react'
import BottomSheetSelector              from '@/components/BottomSheetSelector'
import RoleNav from '@/components/RoleNav'
import AppHeader                            from '@/components/AppHeader'
import { useCustomers }                 from '@/hooks/useReferenceData'
import { localDb, syncReferenceData }   from '@/lib/localDb'
import type { SelectableItem }          from '@/components/BottomSheetSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

type VisitType  = 'routine' | 'new_pitch' | 'complaint_followup' | 'delivery_issue'
type Outcome    = 'positive' | 'neutral' | 'at_risk' | 'lost'
type CustomerMode = 'existing' | 'prospect'

interface FormState {
  customerMode:      CustomerMode
  customer:          SelectableItem | null  // existing customer
  prospectName:      string                 // new prospect
  prospectPostcode:  string                 // new prospect
  visitType:         VisitType | null
  outcome:           Outcome | null
  commitmentMade:    boolean
  commitmentDetail:  string
  notes:             string
}

const EMPTY_FORM: FormState = {
  customerMode:     'existing',
  customer:         null,
  prospectName:     '',
  prospectPostcode: '',
  visitType:        null,
  outcome:          null,
  commitmentMade:   false,
  commitmentDetail: '',
  notes:            '',
}

// ─── Button config ────────────────────────────────────────────────────────────

const VISIT_TYPES: { value: VisitType; label: string }[] = [
  { value: 'routine',           label: 'Routine'           },
  { value: 'new_pitch',         label: 'New pitch'         },
  { value: 'complaint_followup', label: 'Complaint follow-up' },
  { value: 'delivery_issue',    label: 'Delivery issue'    },
]

// Outcome carries semantic colour — encoded here, applied in render
const OUTCOMES: {
  value:   Outcome
  label:   string
  active:  string   // Tailwind classes for selected state
}[] = [
  {
    value:  'positive',
    label:  'Positive',
    active: 'bg-[#16205B] text-white shadow-md',        // navy — clean positive
  },
  {
    value:  'neutral',
    label:  'Neutral',
    active: 'bg-[#5F5E5A] text-white shadow-md',        // gray — neutral/inert
  },
  {
    value:  'at_risk',
    label:  'At risk',
    active: 'bg-[#BA7517] text-white shadow-md',        // amber — warning
  },
  {
    value:  'lost',
    label:  'Lost',
    active: 'bg-[#A32D2D] text-white shadow-md',        // red — danger
  },
]

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationErrors {
  customer?:         string   // covers both existing and prospect name
  prospectPostcode?: string   // unused currently — postcode has no validation
  visitType?:        string
  outcome?:          string
  commitmentDetail?: string
}

function validate(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {}

  // Customer OR prospect name — one must be present
  if (form.customerMode === 'existing' && !form.customer) {
    errors.customer = 'Select a customer'
  }
  if (form.customerMode === 'prospect' && !form.prospectName.trim()) {
    errors.customer = 'Enter the prospect name'
  }

  if (!form.visitType)  errors.visitType = 'Select a visit type'
  if (!form.outcome)    errors.outcome   = 'Select an outcome'

  if (form.commitmentMade && !form.commitmentDetail.trim()) {
    errors.commitmentDetail = 'Describe the commitment made'
  }

  return errors
}

// ─── Shared primitives (identical to Screens 1 & 2) ──────────────────────────

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

export default function Screen3Page() {
  const formId              = useId()
  // Sync reference data on mount so customer dropdown is populated
  useEffect(() => {
    syncReferenceData().catch(console.error)
  }, [])

  const customers           = useCustomers()
  const [form, setForm]     = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [showSuccess, setShowSuccess]   = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Field updaters ──────────────────────────────────────────────────────────

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    []
  )

  // Switching modes clears the other mode's data and any customer error
  const switchMode = useCallback((mode: CustomerMode) => {
    setForm((prev) => ({
      ...prev,
      customerMode:     mode,
      customer:         null,
      prospectName:     '',
      prospectPostcode: '',
    }))
    setErrors((prev) => ({ ...prev, customer: undefined }))
  }, [])

  // Commitment toggle — clear detail when switching to NO
  const setCommitment = useCallback((made: boolean) => {
    setForm((prev) => ({
      ...prev,
      commitmentMade:   made,
      commitmentDetail: made ? prev.commitmentDetail : '',
    }))
    setErrors((prev) => ({ ...prev, commitmentDetail: undefined }))
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
        screen:    'screen3',
        payload: {
          // Exactly one of customer_id or prospect_name will be non-null
          customer_id:       form.customerMode === 'existing' ? form.customer!.id : null,
          prospect_name:     form.customerMode === 'prospect' ? form.prospectName.trim()  : null,
          prospect_postcode: form.customerMode === 'prospect' ? form.prospectPostcode.trim() || null : null,
          visit_type:        form.visitType!,
          outcome:           form.outcome!,
          commitment_made:   form.commitmentMade,
          commitment_detail: form.commitmentMade ? form.commitmentDetail.trim() : null,
          notes:             form.notes.trim() || null,
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

  const isProspectMode = form.customerMode === 'prospect'

  return (
    <>
      <SuccessBanner visible={showSuccess} />

      {sheetOpen && (
        <BottomSheetSelector
          title="Select customer"
          items={customers}
          selectedId={form.customer?.id}
          searchPlaceholder="Search customers…"
          onSelect={(item) => {
            set('customer', item)
            setSheetOpen(false)
          }}
          onDismiss={() => setSheetOpen(false)}
          footerAction={{
            label:   '+ New prospect',
            onPress: () => switchMode('prospect'),
          }}
        />
      )}

      <div className="min-h-screen bg-gray-50">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <AppHeader title="Visit Log" maxWidth="lg" />

        {/* ── Form ───────────────────────────────────────────────────────── */}
        <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-6" id={formId}>

          {/* ── Customer / Prospect ──────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <Label>
                {isProspectMode ? 'New prospect' : 'Customer'}
              </Label>
              {/* Mode toggle pill */}
              <button
                type="button"
                onClick={() => switchMode(isProspectMode ? 'existing' : 'prospect')}
                className={[
                  'text-xs font-bold px-3 py-1 rounded-full border-2',
                  'transition-colors duration-100',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
                  isProspectMode
                    ? 'border-[#EB6619] text-[#EB6619] bg-orange-50'
                    : 'border-gray-300 text-gray-400 bg-white',
                ].join(' ')}
                aria-label={isProspectMode ? 'Switch to existing customer' : 'Switch to new prospect'}
              >
                {isProspectMode ? '← Existing customer' : '+ New prospect'}
              </button>
            </div>

            {/* Existing customer — bottom sheet selector */}
            {!isProspectMode && (
              <SelectorButton
                label={form.customer?.label}
                placeholder="Select customer"
                onClick={() => setSheetOpen(true)}
                error={errors.customer}
              />
            )}

            {/* New prospect — two free text fields */}
            {isProspectMode && (
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    placeholder="Business or contact name"
                    value={form.prospectName}
                    onChange={(e) => {
                      set('prospectName', e.target.value)
                      setErrors((prev) => ({ ...prev, customer: undefined }))
                    }}
                    aria-label="Prospect name"
                    autoFocus
                    className={[
                      'w-full h-[56px] rounded-xl px-4',
                      'text-base text-gray-900 placeholder:text-gray-400',
                      'border-2 bg-white',
                      'focus:outline-none focus:border-[#EB6619]',
                      'transition-colors',
                      errors.customer ? 'border-red-400 bg-red-50' : 'border-gray-200',
                    ].join(' ')}
                  />
                  <FieldError message={errors.customer} />
                </div>
                <input
                  type="text"
                  placeholder="Postcode (optional)"
                  value={form.prospectPostcode}
                  onChange={(e) => set('prospectPostcode', e.target.value)}
                  aria-label="Prospect postcode"
                  maxLength={10}
                  className={[
                    'w-full h-[56px] rounded-xl px-4',
                    'text-base text-gray-900 placeholder:text-gray-400',
                    'border-2 border-gray-200 bg-white',
                    'focus:outline-none focus:border-[#EB6619]',
                    'transition-colors',
                  ].join(' ')}
                />
                <p className="text-xs text-gray-400 px-1">
                  Postcode is used to map prospect activity over time — no format validation.
                </p>
              </div>
            )}
          </section>

          {/* ── Visit type ───────────────────────────────────────────────── */}
          <section>
            <Label>Visit type</Label>
            <div
              className="grid grid-cols-2 gap-2.5"
              role="group"
              aria-label="Visit type"
            >
              {VISIT_TYPES.map(({ value, label }) => {
                const isActive = form.visitType === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('visitType', value)}
                    aria-pressed={isActive}
                    className={[
                      'min-h-[56px] rounded-xl px-3 py-3',
                      'text-sm font-bold text-center leading-tight',
                      'transition-all duration-100 active:scale-[0.97]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive
                        ? 'bg-[#590129] text-white shadow-md'
                        : 'bg-white text-gray-600 border-2 border-gray-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <FieldError message={errors.visitType} />
          </section>

          {/* ── Outcome ──────────────────────────────────────────────────── */}
          <section>
            <Label>Outcome</Label>
            <div
              className="grid grid-cols-2 gap-2.5"
              role="group"
              aria-label="Visit outcome"
            >
              {OUTCOMES.map(({ value, label, active }) => {
                const isActive = form.outcome === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('outcome', value)}
                    aria-pressed={isActive}
                    className={[
                      'min-h-[56px] rounded-xl px-3 py-3',
                      'text-sm font-bold text-center leading-tight',
                      'transition-all duration-100 active:scale-[0.97]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive
                        ? active
                        : 'bg-white text-gray-600 border-2 border-gray-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <FieldError message={errors.outcome} />

            {/* At risk / Lost contextual hint */}
            {(form.outcome === 'at_risk' || form.outcome === 'lost') && (
              <div className={[
                'mt-2.5 px-4 py-2.5 rounded-xl text-xs font-medium',
                form.outcome === 'lost'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200',
              ].join(' ')}>
                {form.outcome === 'lost'
                  ? 'This account will be flagged on the management dashboard immediately.'
                  : 'Management will be alerted to this account on the dashboard.'}
              </div>
            )}
          </section>

          {/* ── Commitment ───────────────────────────────────────────────── */}
          <section>
            <Label>Commitment made?</Label>
            <div
              className="grid grid-cols-2 gap-3"
              role="group"
              aria-label="Was a commitment made?"
            >
              {([
                { value: true,  label: 'Yes' },
                { value: false, label: 'No'  },
              ] as const).map(({ value, label }) => {
                const isActive = form.commitmentMade === value
                return (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setCommitment(value)}
                    aria-pressed={isActive}
                    className={[
                      'h-[72px] rounded-2xl text-base font-bold',
                      'transition-all duration-100 active:scale-[0.97]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive && value === true
                        ? 'bg-[#EB6619] text-white shadow-md'       // orange YES — action
                        : isActive && value === false
                        ? 'bg-[#16205B] text-white shadow-md'       // navy NO — neutral
                        : 'bg-white text-gray-500 border-2 border-gray-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Commitment detail — hidden when NO (h-0 + overflow-hidden technique) */}
            <div
              className={[
                'transition-all duration-200 overflow-hidden',
                form.commitmentMade
                  ? 'opacity-100 scale-100 mt-3'
                  : 'opacity-0 pointer-events-none scale-95 h-0 !mt-0',
              ].join(' ')}
              aria-hidden={!form.commitmentMade}
            >
              <textarea
                rows={2}
                placeholder="What was promised? (price, product, delivery arrangement…)"
                value={form.commitmentDetail}
                onChange={(e) => set('commitmentDetail', e.target.value)}
                maxLength={300}
                aria-label="Commitment detail"
                tabIndex={form.commitmentMade ? 0 : -1}
                className={[
                  'w-full rounded-xl px-4 py-3 resize-none',
                  'text-base text-gray-900 placeholder:text-gray-400 leading-relaxed',
                  'border-2 bg-white',
                  'focus:outline-none focus:border-[#EB6619]',
                  'transition-colors',
                  errors.commitmentDetail ? 'border-red-400 bg-red-50' : 'border-gray-200',
                ].join(' ')}
              />
              <FieldError message={errors.commitmentDetail} />
            </div>
          </section>

          {/* ── Notes (optional) ─────────────────────────────────────────── */}
          <section>
            <Label>Notes (optional)</Label>
            <textarea
              rows={2}
              placeholder="Market intelligence, competitor mentions, product feedback…"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={400}
              aria-label="Additional notes"
              className={[
                'w-full rounded-xl px-4 py-3 resize-none',
                'text-base text-gray-900 placeholder:text-gray-400 leading-relaxed',
                'border-2 border-gray-200 bg-white',
                'focus:outline-none focus:border-[#EB6619]',
                'transition-colors',
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
              {isSubmitting ? 'Saving…' : 'Log Visit'}
            </button>
          </section>

        </main>
      </div>
      <RoleNav />
    </>
  )
}
