'use client'

import { Switch as RadixSwitch } from 'radix-ui'
import { type ReactNode } from 'react'

export interface ToggleProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label: ReactNode
  id?: string
}

export function Toggle({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  id,
}: ToggleProps) {
  return (
    <label
      className={[
        'flex items-center gap-3',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={[
          'relative shrink-0 w-[46px] h-[27px] rounded-pill',
          'bg-border-strong data-[state=checked]:bg-action-primary',
          'transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          'disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <RadixSwitch.Thumb
          className={[
            'block w-[21px] h-[21px] rounded-full bg-[var(--text-on-action)]',
            'translate-x-[3px] data-[state=checked]:translate-x-[22px]',
            'transition-transform',
          ].join(' ')}
        />
      </RadixSwitch.Root>
      <span className="font-text text-[14px] text-body">{label}</span>
    </label>
  )
}
