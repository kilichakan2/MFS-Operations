'use client'

import { Checkbox as RadixCheckbox } from 'radix-ui'
import { type ReactNode } from 'react'

export type CheckedState = boolean | 'indeterminate'

export interface CheckboxProps {
  checked?: CheckedState
  onCheckedChange?: (checked: CheckedState) => void
  disabled?: boolean
  label: ReactNode
  id?: string
}

function CheckGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function MinusGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  )
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  id,
}: CheckboxProps) {
  return (
    <label
      className={[
        'flex items-center gap-[11px]',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={[
          'flex shrink-0 items-center justify-center',
          'w-[22px] h-[22px] rounded-[6px] border-2',
          'border-strong bg-transparent',
          'data-[state=checked]:bg-action-primary data-[state=checked]:border-action-primary',
          'data-[state=indeterminate]:bg-action-primary data-[state=indeterminate]:border-action-primary',
          'text-on-action',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          'disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <RadixCheckbox.Indicator>
          {checked === 'indeterminate' ? <MinusGlyph /> : <CheckGlyph />}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span className="font-text text-[14px] text-body">{label}</span>
    </label>
  )
}
