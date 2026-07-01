'use client'

import type { ReactNode } from 'react'

export interface SegmentedControlOption<T extends string> {
  id: T
  label: ReactNode
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (next: T) => void
  options: SegmentedControlOption<T>[]
  /** Scroll horizontally on small screens (behavioural, not a style string). */
  scrollable?: boolean
  'aria-label'?: string
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const BUTTON_BASE =
  'rounded-pill px-4 py-1.5 text-body-sm font-semibold font-text transition-colors border-0 cursor-pointer whitespace-nowrap'

/**
 * Controlled pill button group (NOT Radix Tabs — no content panels). Each
 * option is a real <button> with aria-pressed; native button keyboard
 * activation handles a11y. Semantic tokens only.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  scrollable = false,
  'aria-label': ariaLabel = 'View options',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'inline-flex gap-1 bg-surface-raised border border-default rounded-pill p-1 w-fit max-w-full',
        scrollable && 'overflow-x-auto',
      )}
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={cx(
              BUTTON_BASE,
              active
                ? 'bg-action-secondary text-action-secondary-fg'
                : 'bg-transparent text-muted hover:text-body',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
