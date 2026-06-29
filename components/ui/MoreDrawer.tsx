'use client'

import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Modal } from './Modal'
import { NavItem } from './NavItem'
import { Badge } from './Badge'

export interface MoreDrawerItem {
  href: string
  label: ReactNode
  icon: ReactNode
  /** Renders the "DESKTOP" badge on the row. */
  desktopOnly?: boolean
}

export interface MoreDrawerProps {
  open: boolean
  onClose: () => void
  items: MoreDrawerItem[]
  title?: ReactNode
  desktopBadgeLabel?: ReactNode
}

/**
 * Overflow nav drawer. Composes `Modal variant="sheet"` (NO second sheet
 * engine) and fills it with NavItem `list` rows. A `desktopOnly` item shows the
 * Badge. Tapping a row navigates (the Link href) then closes via onNavigate.
 */
export function MoreDrawer({
  open,
  onClose,
  items,
  title = 'More options',
  desktopBadgeLabel = 'Desktop',
}: MoreDrawerProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      variant="sheet"
      title={title}
    >
      <div className="flex flex-col">
        {items.map((item) => (
          // The NavItem <Link> owns navigation; this wrapper closes the drawer
          // when the row is activated (the §6.9 "navigate then close" rule).
          <div key={item.href} onClick={onClose}>
            <NavItem
              href={item.href as Route}
              icon={item.icon}
              label={item.label}
              orientation="list"
              badge={
                item.desktopOnly ? (
                  <Badge tone="navy">{desktopBadgeLabel}</Badge>
                ) : undefined
              }
            />
          </div>
        ))}
      </div>
    </Modal>
  )
}
