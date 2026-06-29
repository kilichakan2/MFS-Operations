'use client'

import type { ReactNode } from 'react'
import { accentTokens, type Accent } from './accent'

export interface StatusPillProps {
  accent: Accent
  label: ReactNode
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Coloured dot + text label, accent-driven (no raw colour class crosses in). */
export function StatusPill({ accent, label }: StatusPillProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-semibold tracking-wide uppercase text-body">
      <span
        aria-hidden="true"
        className={cx('w-1.5 h-1.5 rounded-full', accentTokens(accent).fill)}
      />
      {label}
    </span>
  )
}
