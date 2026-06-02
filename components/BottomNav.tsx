'use client'

import Link            from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface NavItem {
  href:         string
  label:        string
  icon:         React.ReactNode
  desktopOnly?: boolean
}

export interface NavMatrix {
  visible:   NavItem[]   // 3 (driver) or 4 (others) tabs
  overflow?: NavItem[]   // undefined for driver
}

interface BottomNavProps {
  matrix:      NavMatrix
  onOpenMore?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BottomNav({ matrix, onOpenMore }: BottomNavProps) {
  const pathname = usePathname()

  if (matrix.visible.length === 0) return null

  const hasOverflow = !!matrix.overflow && matrix.overflow.length > 0

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-mfs-neutral-200"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        // translateZ(0) forces a hardware compositing layer — ensures iOS Safari
        // renders and routes touch events correctly regardless of ancestor overflow
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        touchAction: 'manipulation',
      }}
      aria-label="Main navigation"
    >
      <div className="flex">
        {matrix.visible.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px]',
                'text-[11px] font-medium uppercase tracking-[0.05em]',
                active ? 'text-mfs-orange' : 'text-mfs-neutral-500',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
              style={{ touchAction: 'manipulation' }}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-0 right-0 h-[3px] bg-mfs-orange"
                />
              )}
              <span className="w-6 h-6 flex-shrink-0 pointer-events-none">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}

        {hasOverflow && (
          <button
            type="button"
            onClick={onOpenMore}
            className={[
              'relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px]',
              'text-[11px] font-medium uppercase tracking-[0.05em]',
              'text-mfs-neutral-500',
            ].join(' ')}
            style={{ touchAction: 'manipulation' }}
            aria-label="More navigation options"
          >
            <span className="w-6 h-6 flex-shrink-0 pointer-events-none">
              <MoreHorizontal size={24} strokeWidth={2} />
            </span>
            <span>More</span>
          </button>
        )}
      </div>
    </nav>
  )
}
