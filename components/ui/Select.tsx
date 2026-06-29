'use client'

import { Select as RadixSelect } from 'radix-ui'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  error?: boolean
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-subtle shrink-0"
    >
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-action-primary"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  error = false,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: SelectProps) {
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={error || undefined}
        className={cx(
          'h-[var(--field-h)] w-full px-[14px] box-border',
          'inline-flex items-center justify-between gap-2',
          'rounded-[var(--ctl-radius)] bg-surface-raised',
          'font-text text-[length:var(--field-fs)] text-body',
          'border-[1.5px]',
          error ? 'border-status-error-fill' : 'border-default',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          'disabled:bg-surface-sunken disabled:text-subtle disabled:cursor-not-allowed',
          'data-[placeholder]:text-subtle',
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronIcon />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className={cx(
            'z-50 overflow-hidden min-w-[var(--radix-select-trigger-width)]',
            'rounded-[var(--ctl-radius)] bg-surface-overlay',
            'border-[1px] border-default shadow-md',
          )}
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                className={cx(
                  'relative flex items-center justify-between gap-2',
                  'px-3 py-[9px] rounded-[6px] cursor-pointer select-none',
                  'font-text text-[13.5px] text-body outline-none',
                  'data-[highlighted]:bg-surface-sunken',
                  'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
                )}
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <CheckIcon />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
