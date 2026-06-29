'use client'

import type { ReactNode } from 'react'
import type { Route } from 'next'
import { NavItem } from './NavItem'

export interface DesktopSidebarItem {
  href: string
  label: ReactNode
  icon: ReactNode
}

export interface DesktopSidebarProps {
  items: DesktopSidebarItem[]
  /** The currently active path — supplied by the caller (no usePathname). */
  activeHref?: string
  expanded?: boolean
  onToggle?: () => void
  logo?: ReactNode
  collapseIcon?: ReactNode
  expandIcon?: ReactNode
  'aria-label'?: string
}

function ChevronLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/**
 * Presentational fixed left rail composing NavItem (rail). It knows how to LOOK
 * open/closed (`expanded`) and how to ASK to toggle (`onToggle`) — it does NOT
 * own the hover-peek timers or pin state machine (that is screen/RoleNav logic).
 */
export function DesktopSidebar({
  items,
  activeHref,
  expanded = false,
  onToggle,
  logo,
  collapseIcon,
  expandIcon,
  'aria-label': ariaLabel = 'Primary navigation',
}: DesktopSidebarProps) {
  const toggleLabel = expanded ? 'Collapse sidebar' : 'Expand sidebar'

  return (
    <aside
      aria-label={ariaLabel}
      className={[
        'fixed left-0 top-16 h-[calc(100vh-64px)] z-30',
        'bg-surface-inverse text-inverse shadow-md',
        'flex flex-col transition-[width] duration-medium ease-decelerate',
        expanded ? 'w-60' : 'w-16',
      ].join(' ')}
    >
      {logo && (
        <div className="flex items-center px-3 py-4 shrink-0">{logo}</div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {items.map((item) => (
          <NavItem
            key={item.href}
            href={item.href as Route}
            icon={item.icon}
            label={item.label}
            active={activeHref === item.href}
            orientation="rail"
            onInverse
          />
        ))}
      </div>

      {onToggle && (
        <div className="shrink-0 border-t border-default p-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={toggleLabel}
            className={[
              'inline-flex items-center justify-center w-10 h-10 rounded-md',
              'text-inverse/70 hover:text-inverse',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            ].join(' ')}
          >
            {expanded
              ? (collapseIcon ?? <ChevronLeftIcon />)
              : (expandIcon ?? <ChevronRightIcon />)}
          </button>
        </div>
      )}
    </aside>
  )
}
