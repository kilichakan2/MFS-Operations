'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'

export type NavItemOrientation = 'vertical' | 'rail' | 'list'

export interface NavItemProps {
  /** Exactly one of `href` / `onClick` is expected. `href` → a Next <Link>. */
  href?: Route
  /** `onClick` (when no `href`) → a <button>. */
  onClick?: () => void
  icon: ReactNode
  label: ReactNode
  active?: boolean
  /** Layout pose: bottom-tab cell / side-rail row / drawer list row. */
  orientation?: NavItemOrientation
  /** True when rendered on the inverse (navy) chrome — flips inactive colour. */
  onInverse?: boolean
  /** Trailing slot (list orientation only) — e.g. a "DESKTOP" Badge. */
  badge?: ReactNode
  'aria-current'?: 'page' | undefined
}

/** className composition (house style — no clsx/tailwind-merge dependency). */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const ORIENTATION_WRAP: Record<NavItemOrientation, string> = {
  vertical: 'relative flex flex-col items-center justify-center gap-1 px-2 py-1.5 text-center',
  rail: 'relative flex items-center gap-3 px-3 py-2.5 w-full',
  list: 'flex items-center gap-3 px-4 py-3 w-full text-left',
}

const LABEL_CLASS: Record<NavItemOrientation, string> = {
  vertical: 'text-caption font-semibold uppercase tracking-[0.05em]',
  rail: 'text-body-sm font-medium truncate',
  list: 'text-body-sm font-medium',
}

/**
 * One navigation cell/row — the shared unit composed by BottomNav (vertical),
 * DesktopSidebar (rail) and MoreDrawer (list). Presentational: the caller
 * passes `active`; this brick never reads the router.
 */
export function NavItem({
  href,
  onClick,
  icon,
  label,
  active = false,
  orientation = 'vertical',
  onInverse = false,
  badge,
  'aria-current': ariaCurrent,
}: NavItemProps) {
  // Colour: active is always the orange action token; inactive depends on surface.
  const contentColour = active
    ? 'text-action-primary'
    : onInverse
      ? 'text-inverse'
      : 'text-muted'

  const focusRing =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-md'

  const inner = (
    <>
      {/* Active accent bar */}
      {active && (
        <span
          aria-hidden="true"
          className={cx(
            'absolute bg-action-primary',
            orientation === 'vertical'
              ? 'top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-pill'
              : 'left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-pill',
          )}
        />
      )}
      <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className={LABEL_CLASS[orientation]}>{label}</span>
      {orientation === 'list' && badge && (
        <span className="ml-auto inline-flex shrink-0">{badge}</span>
      )}
    </>
  )

  const className = cx(ORIENTATION_WRAP[orientation], contentColour, focusRing)

  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? (ariaCurrent ?? 'page') : undefined}
        className={cx(className, 'no-underline')}
      >
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  )
}
