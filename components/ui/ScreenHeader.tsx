'use client'

import type { ReactNode } from 'react'

export interface ScreenHeaderProps {
  /** Small kicker line above the title (e.g. "CCP 2 — Cold Storage"). Renders
   *  in the brand orange (text-action-primary) — a Navy+Orange approved pairing. */
  eyebrow?: ReactNode
  /** Main heading — renders text-inverse (white) on the navy block. */
  title: string
  /** When set, renders an inverse-safe Back affordance on the left. */
  onBack?: () => void
  /** Accessible name for the Back button. Default "Back". */
  backLabel?: string
  /** Right-aligned actions slot. Buttons here sit ON the navy block, so they
   *  MUST use `variant="ghost-inverse"` (or an orange `variant="primary"`) —
   *  NEVER `variant="secondary"` (navy), which is forbidden navy-on-navy. */
  actions?: ReactNode
}

/** Local, non-exported inverse back chevron — inherits currentColor (text-inverse). */
function BackChevron() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

/**
 * ScreenHeader — reusable bold NAVY header block for HACCP / kiosk screen tops.
 *
 * Renders `bg-surface-inverse` (navy in light) + `text-inverse` (white) — the
 * same approved brand pairing the kit AppHeader uses. The orange eyebrow makes
 * it Navy+Orange, also approved. Slots: an inverse-safe Back button (when
 * `onBack` is set) on the left, eyebrow + title in the middle, and a right
 * `actions` slot for on-navy controls.
 *
 * Token-purity: this file is scanned by `semantic-tokens-only` — it uses
 * semantic tokens only (no raw hex, no stock palette, no -mfs-* primitive).
 */
export function ScreenHeader({
  eyebrow,
  title,
  onBack,
  backLabel = 'Back',
  actions,
}: ScreenHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 bg-surface-inverse text-inverse">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className={[
            'inline-flex items-center justify-center shrink-0 -ml-2',
            'w-11 h-11 rounded-[var(--ctl-radius)] text-inverse',
            'transition-colors',
            'hover:bg-[color-mix(in_srgb,var(--text-inverse)_12%,transparent)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          ].join(' ')}
        >
          <BackChevron />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {eyebrow !== undefined && (
          <p className="text-action-primary text-[10px] font-bold tracking-widest uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-inverse text-lg font-bold leading-tight">{title}</h1>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  )
}
