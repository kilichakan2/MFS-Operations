'use client'

import { RadioGroup as RadixRadioGroup } from 'radix-ui'
import { type ReactNode } from 'react'

export interface RadioOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface RadioProps {
  value?: string
  onValueChange?: (value: string) => void
  options: RadioOption[]
  name?: string
  'aria-label'?: string
}

export function Radio({
  value,
  onValueChange,
  options,
  name,
  'aria-label': ariaLabel,
}: RadioProps) {
  return (
    <RadixRadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      name={name}
      aria-label={ariaLabel}
      className="flex flex-col gap-[14px]"
    >
      {options.map((opt) => {
        const itemId = `${name ?? 'radio'}-${opt.value}`
        return (
          <label
            key={opt.value}
            htmlFor={itemId}
            className={[
              'flex items-center gap-[11px]',
              opt.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <RadixRadioGroup.Item
              id={itemId}
              value={opt.value}
              disabled={opt.disabled}
              className={[
                'flex shrink-0 items-center justify-center',
                'w-[22px] h-[22px] rounded-full border-2',
                'border-strong bg-transparent',
                'data-[state=checked]:border-action-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                'disabled:cursor-not-allowed',
              ].join(' ')}
            >
              <RadixRadioGroup.Indicator className="block w-[10px] h-[10px] rounded-full bg-action-primary" />
            </RadixRadioGroup.Item>
            <span className="font-text text-[14px] text-body">{opt.label}</span>
          </label>
        )
      })}
    </RadixRadioGroup.Root>
  )
}
