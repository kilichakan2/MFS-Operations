'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  /** Tighter padding for dense layouts. */
  compact?: boolean
  /** When set, the whole card becomes a clickable Next <Link>. */
  href?: Route
}

/** className composition (house style — no clsx/tailwind-merge dependency). */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Surface card. A plain <div> by default; a clickable Next <Link> when `href`
 * is given (hover-shadow + cursor affordance). Semantic tokens only.
 */
export function Card({ children, compact = false, href }: CardProps) {
  const shared = cx(
    'block bg-surface-raised border border-default rounded-lg shadow-sm',
    compact ? 'p-4' : 'p-5',
  )
  if (href) {
    return (
      <Link
        href={href}
        className={cx(
          shared,
          'transition-shadow hover:shadow-md cursor-pointer no-underline text-inherit',
        )}
      >
        {children}
      </Link>
    )
  }
  return <div className={shared}>{children}</div>
}
