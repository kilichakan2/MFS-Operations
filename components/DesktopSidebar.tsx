'use client'

/**
 * components/DesktopSidebar.tsx
 *
 * Desktop chrome left rail (Item 3 — UI Overhaul).
 *
 * Behaviour (locked in plan §A1-A7):
 *   - Width transitions between 64px (collapsed) and 240px (expanded).
 *   - Hover-peek: 300ms enter + 300ms leave timers, only when not pinned.
 *   - Pin: chevron button at bottom toggles pinned-expanded vs
 *     pinned-collapsed. No localStorage — pin state resets on reload.
 *   - Active item: 3px orange vertical bar on the left edge, orange
 *     icon + label, subtle white/8% row tint.
 *   - z-[998] (top bar is z-[999]).
 *   - Width transition 250ms ease-decelerate, label opacity 150ms.
 *   - Returns null when items is empty.
 *
 * Rendered only at md+ via the `<div className="hidden md:block">`
 * wrapper in RoleNav.tsx — this component does NOT internally guard
 * by viewport.
 */

import Link            from 'next/link'
import type { Route }  from 'next'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight }   from 'lucide-react'
import type { NavItem } from '@/components/BottomNav'

interface DesktopSidebarProps {
  items: NavItem[]
}

export default function DesktopSidebar({ items }: DesktopSidebarProps) {
  const pathname = usePathname()

  // pinnedExpanded: null = unpinned (hover-driven), true = pinned open,
  //                 false = pinned collapsed.
  const [pinnedExpanded, setPinnedExpanded] = useState<boolean | null>(null)
  const [hovered, setHovered] = useState(false)

  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current)
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [])

  if (items.length === 0) return null

  const expanded = pinnedExpanded ?? hovered

  function handleMouseEnter() {
    if (pinnedExpanded !== null) return // pinned → ignore hover
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    enterTimer.current = setTimeout(() => setHovered(true), 300)
  }

  function handleMouseLeave() {
    if (pinnedExpanded !== null) return
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null }
    leaveTimer.current = setTimeout(() => setHovered(false), 300)
  }

  function handleChevronClick() {
    // If currently effectively expanded → pin collapsed (force hover off).
    // If currently effectively collapsed → pin expanded.
    if (expanded) {
      setPinnedExpanded(false)
      setHovered(false)
      if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null }
    } else {
      setPinnedExpanded(true)
    }
  }

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={[
        'fixed left-0 top-16 h-[calc(100vh-64px)] z-[998]',
        'bg-mfs-navy text-white shadow-mfs-2',
        'flex flex-col',
        'transition-[width] duration-[250ms] ease-[cubic-bezier(0,0,0.2,1)]',
        expanded ? 'w-60' : 'w-16',
      ].join(' ')}
      aria-label="Primary navigation"
    >
      {/* Item list */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        <ul className="flex flex-col">
          {items.map((item) => {
            const active = pathname === item.href
            return (
              <li key={item.href} className="relative">
                <Link
                  href={item.href as Route}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'relative flex items-center h-12 overflow-hidden',
                    'transition-colors',
                    active
                      ? 'bg-white/[0.08] text-mfs-orange'
                      : 'text-white hover:bg-white/[0.05]',
                  ].join(' ')}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 bottom-0 w-[3px] bg-mfs-orange"
                    />
                  )}
                  {/* Icon column — fixed 64px wide, icon centred */}
                  <span
                    className={[
                      'flex-shrink-0 w-16 h-12 flex items-center justify-center',
                      active ? 'text-mfs-orange' : 'text-white',
                    ].join(' ')}
                  >
                    {item.icon}
                  </span>
                  {/* Label — fades in/out with width */}
                  <span
                    className={[
                      'text-sm font-medium whitespace-nowrap overflow-hidden',
                      'transition-opacity duration-150 ease-[cubic-bezier(0,0,0.2,1)]',
                      expanded ? 'opacity-100' : 'opacity-0',
                    ].join(' ')}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Chevron pin toggle */}
      <div className="flex-shrink-0 flex items-center justify-center py-2">
        <button
          type="button"
          onClick={handleChevronClick}
          aria-label={expanded ? 'Pin sidebar collapsed' : 'Pin sidebar expanded'}
          className={[
            'w-8 h-8 flex items-center justify-center rounded',
            'text-white/70 hover:text-white hover:bg-white/[0.08]',
            'transition-colors',
          ].join(' ')}
        >
          {expanded ? (
            <ChevronLeft size={20} strokeWidth={2} />
          ) : (
            <ChevronRight size={20} strokeWidth={2} />
          )}
        </button>
      </div>
    </aside>
  )
}
