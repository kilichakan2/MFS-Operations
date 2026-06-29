'use client'

import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  message?: ReactNode
  /** Caller-supplied action slot, e.g. a <Button>. */
  action?: ReactNode
}

/**
 * Centred "no results / nothing here" panel — icon + title + optional message
 * + optional action slot. Generalizes the app's empty-state panels.
 */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-8 gap-3">
      {icon && (
        <span aria-hidden="true" className="inline-flex text-subtle">
          {icon}
        </span>
      )}
      <p className="text-body font-semibold text-body">{title}</p>
      {message && <p className="text-body-sm text-muted">{message}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
