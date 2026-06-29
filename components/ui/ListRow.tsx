'use client'

import type { ReactNode } from 'react'
import { accentTokens, type Accent } from './accent'

export interface ListRowProps {
  cells: ReactNode
  /** Optional accent dot (intent, not a raw class). */
  accent?: Accent
  /** Drops the bottom border on the final row. */
  last?: boolean
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Stacked list row holding caller cells, with an optional accent dot. */
export function ListRow({ cells, accent, last = false }: ListRowProps) {
  return (
    <div className={cx('flex items-center gap-3 py-3', !last && 'border-b border-default')}>
      {accent && (
        <span
          aria-hidden="true"
          className={cx('w-1.5 h-1.5 rounded-full flex-shrink-0', accentTokens(accent).fill)}
        />
      )}
      {cells}
    </div>
  )
}
