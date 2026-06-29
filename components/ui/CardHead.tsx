'use client'

import type { ReactNode } from 'react'
import { Badge } from './Badge'

export interface CardHeadProps {
  /** Caller-supplied leading icon (no icon library). */
  icon?: ReactNode
  title: string
  /** Optional count, rendered as a Badge. */
  count?: number | string
  compact?: boolean
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Card header: optional icon + uppercase title + optional count Badge. */
export function CardHead({ icon, title, count, compact = false }: CardHeadProps) {
  return (
    <div className={cx('flex items-center gap-3', compact ? 'mb-3' : 'mb-4')}>
      {icon && (
        <span className="text-subtle flex" aria-hidden="true">
          {icon}
        </span>
      )}
      <span
        className={cx(
          'flex-1 font-semibold uppercase tracking-[0.1em] text-body',
          compact ? 'text-caption' : 'text-body-sm',
        )}
      >
        {title}
      </span>
      {count != null && <Badge>{count}</Badge>}
    </div>
  )
}
