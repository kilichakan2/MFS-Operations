'use client'

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  error?: boolean
  prefix?: ReactNode
  suffix?: ReactNode
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const BASE_INPUT =
  'h-[var(--field-h)] px-[var(--field-px)] text-[length:var(--field-fs)] ' +
  'font-text text-body bg-surface-raised w-full box-border outline-none ' +
  'rounded-[var(--ctl-radius)] disabled:bg-surface-sunken disabled:text-subtle ' +
  'disabled:cursor-not-allowed placeholder:text-subtle'

// Load-bearing boundary (§5.4): the border is how you FIND the field, so it
// uses --border-input (ink-400, ≥3:1) — not the decorative border-default.
const BORDER_DEFAULT =
  'border-[1.5px] border-input ' +
  'focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_3px_var(--focus-ring-shadow)]'

const BORDER_ERROR =
  'border-[1.5px] border-status-error-fill ' +
  'shadow-[0_0_0_3px_var(--status-error-soft)]'

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ error = false, prefix, suffix, className, ...rest }, ref) {
    // Affixed layout: one bordered flex wrapper, borderless inner input.
    if (prefix != null || suffix != null) {
      return (
        <div
          className={cx(
            'flex items-center h-[var(--field-h)] overflow-hidden box-border',
            'rounded-[var(--ctl-radius)] bg-surface-raised',
            error ? BORDER_ERROR : 'border-[1.5px] border-input',
            className,
          )}
        >
          {prefix != null && (
            <span className="self-stretch flex items-center px-3 bg-surface-sunken font-text text-[length:var(--field-fs)] font-semibold text-subtle">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            aria-invalid={error || undefined}
            className="flex-1 min-w-0 h-full px-[var(--field-px)] bg-transparent border-none outline-none font-text text-[length:var(--field-fs)] text-body disabled:cursor-not-allowed placeholder:text-subtle"
            {...rest}
          />
          {suffix != null && (
            <span className="self-stretch flex items-center px-3 font-text text-[13px] font-medium text-subtle">
              {suffix}
            </span>
          )}
        </div>
      )
    }

    return (
      <input
        ref={ref}
        aria-invalid={error || undefined}
        className={cx(BASE_INPUT, error ? BORDER_ERROR : BORDER_DEFAULT, className)}
        {...rest}
      />
    )
  },
)
