'use client'

import type { ReactNode } from 'react'

export type ScreenHeaderSurface = 'bold-navy' | 'alarm'

export interface ScreenHeaderProps {
  /** Small kicker line above the title (e.g. "CCP 2 — Cold Storage"). Renders
   *  in the surface accent (orange on navy, white on alarm — orange is
   *  brand-banned on red). */
  eyebrow?: ReactNode
  /** Main heading — `text-body` resolves to white through the surface context. */
  title: string
  /** When set, renders an inverse-safe Back affordance on the left. */
  onBack?: () => void
  /** Accessible name for the Back button. Default "Back". */
  backLabel?: string
  /** Right-aligned actions slot. Buttons here sit ON the bold block, so they
   *  MUST use `variant="ghost-inverse"` (or an orange `variant="primary"`) —
   *  NEVER `variant="secondary"` (navy), which is forbidden navy-on-navy. */
  actions?: ReactNode
  /** Which bold surface this header is (spec §5.9/§5.10). `alarm` is the
   *  food-safety panic light — red fill, white-everything context. */
  surface?: ScreenHeaderSurface
}

/** Local, non-exported back chevron — inherits currentColor (context white). */
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

const SURFACE_FILL: Record<ScreenHeaderSurface, string> = {
  'bold-navy': 'bg-surface-inverse',
  alarm: 'bg-status-error-fill',
}

/**
 * ScreenHeader — reusable bold header block for HACCP / kiosk screen tops.
 *
 * Declares its own `data-surface` context (spec §5.9): the semantic text vars
 * underneath it re-scope to the legal foregrounds for the bold fill, so the
 * title/back simply use `text-body` and resolve white — black-on-navy is
 * unrepresentable rather than merely forbidden. `surface="alarm"` swaps the
 * fill to the brand alarm red (`--status-error-fill`) with a white accent
 * (orange is brand-banned on red); the 500ms colour transition preserves the
 * hub's calm↔alarm flip behaviour.
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
  surface = 'bold-navy',
}: ScreenHeaderProps) {
  return (
    // Semantic <header> — restores the banner landmark on every kiosk screen
    // (all consumers render it at page top level, so it is never nested).
    <header
      data-surface={surface}
      className={[
        'flex items-center gap-3 px-5 py-4 text-body',
        'transition-colors duration-500',
        SURFACE_FILL[surface],
      ].join(' ')}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className={[
            'inline-flex items-center justify-center shrink-0 -ml-2',
            'w-11 h-11 rounded-[var(--ctl-radius)] text-body',
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
          <p className="text-[color:var(--surface-accent-fg)] text-[10px] font-bold tracking-widest uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-body text-lg font-bold leading-tight">{title}</h1>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  )
}
