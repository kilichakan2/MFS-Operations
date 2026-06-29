'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { accentTokens, type Accent } from './accent'

export interface KpiTileProps {
  value: string | number
  label: string
  sub?: string
  accent: Accent
  /** Caller-supplied leading icon (no icon library). */
  icon?: ReactNode
  /** When set, the tile becomes a clickable Next <Link> with a tap arrow. */
  href?: Route
  compact?: boolean
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const TapArrow = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </svg>
)

/** KPI tile: accent stripe + display-ramp value + label, optionally a link. */
export function KpiTile({
  value,
  label,
  sub,
  accent,
  icon,
  href,
  compact = false,
}: KpiTileProps) {
  const tokens = accentTokens(accent)
  const surface = cx(
    'relative block h-full overflow-hidden bg-surface-raised border border-default rounded-lg shadow-sm',
    compact ? 'p-4 pl-5' : 'p-5 pl-6',
  )

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cx('absolute left-0 top-0 bottom-0 w-1', tokens.fill)}
      />
      <div className={cx('flex items-center gap-2 text-subtle', compact ? 'pr-5' : 'pr-6')}>
        {icon && (
          <span className="flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="text-caption font-semibold uppercase leading-tight">{label}</span>
      </div>
      {href && (
        <span aria-hidden="true" className="absolute top-4 right-4 text-subtle">
          {TapArrow}
        </span>
      )}
      <div
        className={cx(
          'font-display leading-none tracking-[-0.02em] mt-3',
          compact ? 'text-h1' : 'text-display',
          tokens.text,
        )}
      >
        {value}
      </div>
      {sub && <div className="text-muted mt-1.5 text-body-sm">{sub}</div>}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cx(surface, 'no-underline text-inherit transition-shadow hover:shadow-md')}
      >
        {body}
      </Link>
    )
  }
  return <div className={surface}>{body}</div>
}
