'use client'

import { DropdownMenu as RadixDropdownMenu } from 'radix-ui'
import type { ReactNode } from 'react'

export type DropdownMenuAlign = 'start' | 'center' | 'end'

export interface DropdownMenuItem {
  id: string
  label?: ReactNode
  icon?: ReactNode
  onSelect?: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
  /** A separator row — when true, the other fields are ignored. */
  separator?: boolean
}

export interface DropdownMenuProps {
  /** The trigger element (wrapped in Trigger asChild). */
  trigger: ReactNode
  items: DropdownMenuItem[]
  align?: DropdownMenuAlign
  'aria-label'?: string
}

/** className composition (house style — no clsx/tailwind-merge dependency). */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * A real menu (Radix DropdownMenu) — arrow-key roving focus, role="menu"/
 * "menuitem", type-ahead. Distinct from the generic Popover. Data-driven via a
 * single `items` array (an item may be `{ separator: true }`).
 */
export function DropdownMenu({
  trigger,
  items,
  align = 'end',
  'aria-label': ariaLabel,
}: DropdownMenuProps) {
  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          aria-label={ariaLabel}
          align={align}
          sideOffset={6}
          className={cx(
            'z-50 bg-surface-overlay border border-default rounded-xl shadow-lg overflow-hidden p-1',
            'animate-[mfs-fade_0.15s_ease-out]',
          )}
        >
          {items.map((item) =>
            item.separator ? (
              <RadixDropdownMenu.Separator
                key={item.id}
                className="h-px bg-border-subtle my-1"
              />
            ) : (
              <RadixDropdownMenu.Item
                key={item.id}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cx(
                  'flex items-center gap-3 px-3 py-2.5 text-body-sm rounded-md',
                  'cursor-pointer outline-none data-[highlighted]:bg-surface-sunken',
                  item.tone === 'danger' && 'text-status-error-text',
                  item.disabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                {item.icon && (
                  <span aria-hidden="true" className="inline-flex shrink-0">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </RadixDropdownMenu.Item>
            ),
          )}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  )
}
