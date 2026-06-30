'use client'

import type { ReactNode } from 'react'
import type { Accent } from './accent'

export type ProgressRingSize = 'sm' | 'lg'

export interface ProgressRingProps {
  /** 0–100. The ring owns the fill — callers pass a number, never a width. */
  value: number
  /** Accent family for the filled arc. Defaults to `success`. */
  accent?: Accent
  /** `sm` = phone strip dial; `lg` = iPad side-panel dial. */
  size?: ProgressRingSize
  /** Centre content; defaults to the rounded percentage (e.g. `75%`). */
  label?: ReactNode
}

/**
 * Circular "X% complete" indicator. The arc is drawn from a single 0–100
 * number via a conic-gradient built from SEMANTIC token vars (no raw width,
 * no raw hex) — replacing the hand-rolled `style={{ width }}` bar the live hub
 * used. Appearance is owned here; the screen passes intent only.
 */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Accent intent → the underlying fill token (CSS var, never a hex). */
const FILL_VAR: Record<Accent, string> = {
  success: 'var(--status-success-fill)',
  warning: 'var(--status-warning-fill)',
  danger: 'var(--status-error-fill)',
  navy: 'var(--action-secondary)',
}

const SIZE_CLASS: Record<ProgressRingSize, { box: string; inset: string; text: string }> = {
  sm: { box: 'w-[38px] h-[38px]', inset: 'inset-[5px]', text: 'text-caption' },
  lg: { box: 'w-[84px] h-[84px]', inset: 'inset-[10px]', text: 'text-h3' },
}

export function ProgressRing({
  value,
  accent = 'success',
  size = 'sm',
  label,
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const s = SIZE_CLASS[size]
  return (
    <span
      role="img"
      aria-label={`${pct}% complete`}
      className={cx('relative inline-flex flex-shrink-0 rounded-full', s.box)}
      style={{
        background: `conic-gradient(${FILL_VAR[accent]} ${pct}%, var(--surface-sunken) 0)`,
      }}
    >
      <span
        className={cx(
          'absolute rounded-full bg-surface-raised flex items-center justify-center',
          'font-semibold text-body tabular-nums',
          s.inset,
          s.text,
        )}
      >
        {label ?? `${pct}%`}
      </span>
    </span>
  )
}
