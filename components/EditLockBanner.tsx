'use client'

/**
 * components/EditLockBanner.tsx
 *
 * Yellow banner shown on the order edit page when the order has been
 * printed and is therefore locked from sales-rep edits. Office can
 * still edit a printed order, but they get the same banner so they
 * know editing will trigger a reprint.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 */

import type { OrderState } from '@/lib/domain/Order'

interface EditLockBannerProps {
  state: OrderState
  /** Set true if the current user is office/admin — they get a warning, not a block. */
  canStillEdit: boolean
}

export default function EditLockBanner({ state, canStillEdit }: EditLockBannerProps) {
  if (state === 'placed') return null  // no banner needed

  const isCompleted = state === 'completed'

  const fill =
    isCompleted ? 'bg-slate-100 border-slate-300 text-slate-700' :
    canStillEdit ? 'bg-amber-50 border-amber-300 text-amber-900' :
                   'bg-red-50 border-red-300 text-red-900'

  return (
    <div className={`rounded-xl border px-4 py-3 ${fill}`}>
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="flex-1 text-sm">
          {isCompleted && (
            <p><span className="font-bold">Order completed.</span> This order has been delivered and cannot be edited.</p>
          )}
          {!isCompleted && !canStillEdit && (
            <p>
              <span className="font-bold">Order locked.</span> The picking list has been printed. Only the office can amend this order — please ask office to make the change.
            </p>
          )}
          {!isCompleted && canStillEdit && (
            <p>
              <span className="font-bold">Order printed.</span> Saving changes will require a fresh picking list. Make sure to retrieve the old sheet before reprinting.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
