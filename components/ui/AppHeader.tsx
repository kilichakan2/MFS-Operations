'use client'

import type { ReactNode } from 'react'

export interface AppHeaderProps {
  /** Caller-supplied logo element (ReactNode slot — no baked-in public/ path). */
  logo?: ReactNode
  title?: ReactNode
  /** Caller passes a <SyncDot /> — the header does NOT read the queue. */
  sync?: ReactNode
  actions?: ReactNode
  /** Caller passes a <DropdownMenu /> for the kebab/account menu. */
  menu?: ReactNode
}

/**
 * Presentational sticky top bar — all data arrives via slots. Inverse (navy)
 * chrome. Unlike the live AppHeader it reads no cookies, router, or sync queue;
 * those become caller-supplied slots (`sync`/`actions`/`menu`).
 */
export function AppHeader({ logo, title, sync, actions, menu }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 bg-surface-inverse text-inverse px-4 h-16 flex items-center gap-4"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {logo && <div className="flex-shrink-0 inline-flex items-center">{logo}</div>}
      {title !== undefined && (
        <span className="text-inverse uppercase tracking-wider text-h3 truncate">
          {title}
        </span>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-3 shrink-0">
        {sync}
        {actions}
        {menu}
      </div>
    </header>
  )
}
