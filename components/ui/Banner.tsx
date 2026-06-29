'use client'

import type { ReactNode } from 'react'

export type BannerTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface BannerLabels {
  /** aria-label for the dismiss action. Default: "Dismiss". */
  dismiss?: string
}

export interface BannerProps {
  tone?: BannerTone
  icon?: ReactNode
  title?: ReactNode
  children: ReactNode
  onDismiss?: () => void
  labels?: BannerLabels
}

/** className composition (house style — no clsx/tailwind-merge dependency). */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const TONE_CLASSES: Record<BannerTone, string> = {
  neutral:
    'bg-status-neutral-soft text-status-neutral-text border-status-neutral-border',
  info: 'bg-status-info-soft text-status-info-text border-status-info-border',
  success:
    'bg-status-success-soft text-status-success-text border-status-success-border',
  warning:
    'bg-status-warning-soft text-status-warning-text border-status-warning-border',
  danger: 'bg-status-error-soft text-status-error-text border-status-error-border',
}

function DismissIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

/**
 * Inline coloured alert. `tone` drives the colour family (mapped to status
 * tokens). Generalizes the live EditLockBanner / OrderCutoverBanner.
 */
export function Banner({
  tone = 'info',
  icon,
  title,
  children,
  onDismiss,
  labels,
}: BannerProps) {
  const dismissLabel = labels?.dismiss ?? 'Dismiss'
  const role = tone === 'danger' ? 'alert' : 'status'

  return (
    <div
      role={role}
      className={cx(
        'flex items-start gap-3 rounded-xl border px-4 py-3',
        TONE_CLASSES[tone],
      )}
    >
      {icon && (
        <span aria-hidden="true" className="inline-flex shrink-0 mt-0.5">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-body-sm">{title}</p>}
        <div className="text-body-sm">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cx(
            'ml-auto inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-md',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        >
          <DismissIcon />
        </button>
      )}
    </div>
  )
}
