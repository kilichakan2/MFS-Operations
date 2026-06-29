'use client'

import type { ReactNode } from 'react'
import type { Route } from 'next'
import { NavItem } from './NavItem'

export interface BottomNavItem {
  href: string
  label: ReactNode
  icon: ReactNode
}

export interface BottomNavProps {
  items: BottomNavItem[]
  /** The currently active path — the caller supplies this (no usePathname). */
  activeHref?: string
  /** When set, an overflow "More" cell renders and fires this. */
  onOpenMore?: () => void
  moreLabel?: ReactNode
  moreIcon?: ReactNode
  'aria-label'?: string
}

function MoreIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  )
}

/**
 * Presentational fixed bottom tab bar composing NavItem (vertical). The bar
 * never reads the router — `activeHref` is supplied by the caller. An opt-in
 * "More" overflow cell fires `onOpenMore`.
 */
export function BottomNav({
  items,
  activeHref,
  onOpenMore,
  moreLabel = 'More',
  moreIcon,
  'aria-label': ariaLabel = 'Main navigation',
}: BottomNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-raised border-t border-default"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => (
          <NavItem
            key={item.href}
            href={item.href as Route}
            icon={item.icon}
            label={item.label}
            active={activeHref === item.href}
            orientation="vertical"
          />
        ))}
        {onOpenMore && (
          <NavItem
            onClick={onOpenMore}
            icon={moreIcon ?? <MoreIcon />}
            label={moreLabel}
            orientation="vertical"
          />
        )}
      </div>
    </nav>
  )
}
