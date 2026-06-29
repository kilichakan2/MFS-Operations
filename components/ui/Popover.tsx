'use client'

import { Popover as RadixPopover } from 'radix-ui'
import type { ReactNode } from 'react'

export type PopoverAlign = 'start' | 'center' | 'end'
export type PopoverSide = 'top' | 'bottom'

export interface PopoverProps {
  /** The anchor element (wrapped in RadixPopover.Trigger asChild). */
  trigger: ReactNode
  /** The floating panel body. */
  children: ReactNode
  /** Optional controlled state — uncontrolled if omitted. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: PopoverAlign
  side?: PopoverSide
  /** Accessible name for the floating panel (Radix Content is role="dialog"). */
  'aria-label'?: string
}

/**
 * Anchor-positioned floating panel. Radix Popover provides the positioning,
 * outside-click/ESC dismissal and focus management. `align`/`side` are
 * semantic-intent props mapped straight to Radix props.
 */
export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'end',
  side = 'bottom',
  'aria-label': ariaLabel = 'Popover',
}: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          aria-label={ariaLabel}
          align={align}
          side={side}
          sideOffset={6}
          className={[
            'z-50 bg-surface-overlay border border-default rounded-lg shadow-lg p-1',
            'animate-[mfs-fade_0.15s_ease-out] focus:outline-none',
          ].join(' ')}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
