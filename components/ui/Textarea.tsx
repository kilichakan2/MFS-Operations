'use client'

import {
  forwardRef,
  useState,
  type TextareaHTMLAttributes,
} from 'react'

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
  showCount?: boolean
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const BASE =
  'w-full min-h-[84px] py-[12px] px-[var(--field-px)] box-border resize-y ' +
  'font-text text-[length:var(--field-fs)] leading-[1.5] text-body ' +
  'bg-surface-raised rounded-[var(--ctl-radius)] outline-none ' +
  'disabled:bg-surface-sunken disabled:text-subtle disabled:cursor-not-allowed ' +
  'placeholder:text-subtle'

const BORDER_DEFAULT =
  'border-[1.5px] border-default ' +
  'focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_3px_var(--focus-ring-shadow)]'

const BORDER_ERROR =
  'border-[1.5px] border-status-error-fill ' +
  'shadow-[0_0_0_3px_var(--status-error-soft)]'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      error = false,
      showCount = false,
      className,
      maxLength,
      value,
      defaultValue,
      onChange,
      ...rest
    },
    ref,
  ) {
    const isControlled = value != null
    const initialLen =
      typeof defaultValue === 'string' ? defaultValue.length : 0
    const [uncontrolledLen, setUncontrolledLen] = useState(initialLen)
    const len = isControlled ? String(value).length : uncontrolledLen

    const counterVisible = showCount && maxLength != null

    return (
      <div className="relative">
        <textarea
          ref={ref}
          aria-invalid={error || undefined}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => {
            if (!isControlled) setUncontrolledLen(e.target.value.length)
            onChange?.(e)
          }}
          className={cx(BASE, error ? BORDER_ERROR : BORDER_DEFAULT, className)}
          {...rest}
        />
        {counterVisible && (
          <span className="absolute right-3 bottom-[10px] font-text text-[11px] font-medium text-subtle">
            {len} / {maxLength}
          </span>
        )}
      </div>
    )
  },
)
