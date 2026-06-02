'use client'

/**
 * components/MoreDrawer.tsx
 *
 * Slide-up bottom sheet that lists the overflow nav tabs (the rows
 * that don't fit in the 4-cell bottom nav). Triggered by the synthetic
 * "More" tab in BottomNav; rendered by RoleNav.
 *
 * Behaviour:
 *   - Tap backdrop OR drag handle → close
 *   - ESC key → close (consistency with DotMenu)
 *   - Tap a row → navigate (regular Link), then close
 *
 * Visual (matches the Item-2 spec):
 *   - Backdrop: mfs-navy/50, 150ms fade
 *   - Sheet: white, rounded-t-mfs-lg, mfs-3 shadow, 250ms ease-out slide
 *   - Drag handle: 36×4 mfs-neutral-300 pill
 *   - Caption: "MORE OPTIONS" uppercase, mfs-neutral-500
 *   - Rows: 56px min-height, 24px icon, Inter Medium 16px label,
 *           "DESKTOP" pill on items flagged desktopOnly
 */

import { useEffect } from 'react'
import Link          from 'next/link'
import type { NavItem } from '@/components/BottomNav'

interface MoreDrawerProps {
  open:    boolean
  onClose: () => void
  items:   NavItem[]
}

export default function MoreDrawer({ open, onClose, items }: MoreDrawerProps) {
  // ESC key closes the drawer
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop — full-screen, navy/50, fades 150ms */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={[
          'fixed inset-0 z-[9998] bg-mfs-navy/50 transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Sheet — slides up 250ms ease-out */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More navigation options"
        className={[
          'fixed bottom-0 left-0 right-0 z-[9999] bg-white rounded-t-mfs-lg shadow-mfs-3 px-5 py-6',
          'transition-transform duration-[250ms] ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle (tap-to-close) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close more navigation options"
          className="block w-9 h-1 bg-mfs-neutral-300 rounded-full mx-auto mt-3"
        />

        {/* Caption header */}
        <p className="text-xs uppercase tracking-wider text-mfs-neutral-500 mt-4 mb-2">
          MORE OPTIONS
        </p>

        {/* Rows */}
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 min-h-[56px] border-b border-mfs-neutral-200 last:border-b-0"
              >
                <span className="w-6 h-6 flex-shrink-0 pointer-events-none text-mfs-neutral-900">
                  {item.icon}
                </span>
                <span className="flex-1 text-base font-medium text-mfs-neutral-900">
                  {item.label}
                </span>
                {item.desktopOnly && (
                  <span className="bg-mfs-neutral-100 text-mfs-neutral-500 text-[10px] font-medium uppercase px-2 py-0.5 rounded-mfs-pill">
                    DESKTOP
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
