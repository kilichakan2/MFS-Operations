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
  /**
   * When set, the whole banner becomes a single tappable `<button>` (iOS needs
   * a direct gesture to start audio). Mutually exclusive with `onDismiss` —
   * when `onClick` is set the dismiss affordance is omitted to avoid nesting a
   * button inside a button. Default keeps the banner a non-interactive region.
   */
  onClick?: () => void
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
  onClick,
  labels,
}: BannerProps) {
  const dismissLabel = labels?.dismiss ?? 'Dismiss'
  const role = tone === 'danger' ? 'alert' : 'status'

  const body = (
    <>
      {icon && (
        <span aria-hidden="true" className="inline-flex shrink-0 mt-0.5">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-body-sm">{title}</p>}
        <div className="text-body-sm">{children}</div>
      </div>
      {/* dismiss is omitted when the whole banner is tappable (no nested button) */}
      {onDismiss && !onClick && (
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
    </>
  )

  // Soft fills are LIGHT surfaces: declare the canvas context so nested
  // semantic text resolves light even when a Banner sits inside a bold
  // surface (spec §5.9).
  const shell = cx(
    'flex items-start gap-3 rounded-xl border px-4 py-3',
    TONE_CLASSES[tone],
  )

  if (onClick) {
    // A tappable danger banner (e.g. the overdue-alarm "tap to sound") is still
    // a button (iOS needs the direct gesture), but on a safety surface it must
    // also be announced when it appears — aria-live keeps the button role while
    // giving screen readers the alert behaviour role="alert" would on the static path.
    const announce =
      tone === 'danger'
        ? ({ 'aria-live': 'assertive', 'aria-atomic': true } as const)
        : {}
    return (
      <button
        type="button"
        onClick={onClick}
        data-surface="canvas"
        {...announce}
        className={cx(
          shell,
          'w-full text-left cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      >
        {body}
      </button>
    )
  }

  return (
    <div role={role} data-surface="canvas" className={shell}>
      {body}
    </div>
  )
}
