'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

/** className composition (house style — no clsx/tailwind-merge dependency). */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: cx(
    'bg-action-primary text-on-action border-transparent',
    'hover:bg-action-primary-hover active:bg-action-primary-active',
    'disabled:bg-action-primary-disabled',
  ),
  secondary: cx(
    'bg-action-secondary text-on-action border-transparent',
    'hover:bg-action-secondary-hover active:bg-action-secondary-active',
    'disabled:bg-action-secondary-disabled',
  ),
  ghost: cx(
    'bg-transparent border-action-ghost-border text-action-ghost-fg',
    'hover:bg-action-ghost-hover-bg',
    'disabled:opacity-50',
  ),
  danger: cx(
    'bg-action-danger text-on-action border-transparent',
    'hover:bg-action-danger-hover active:bg-action-danger-active',
    'disabled:bg-action-danger-disabled',
  ),
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-[var(--ctl-h-sm)] px-[14px] text-[13px]',
  md: 'h-[var(--ctl-h)] px-[var(--ctl-px)] text-[length:var(--ctl-fs)]',
  lg: 'h-[var(--ctl-h-lg)] px-[24px] text-[17px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      leadingIcon,
      trailingIcon,
      type = 'button',
      disabled,
      className,
      children,
      onClick,
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        onClick={loading ? undefined : onClick}
        className={cx(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap',
          'border-[1.5px] rounded-[var(--ctl-radius)] font-text font-semibold',
          'transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          'disabled:cursor-not-allowed',
          loading && 'cursor-wait',
          fullWidth && 'flex w-full',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...rest}
      >
        {loading && (
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border-[2.5px] border-current/40 border-t-current animate-[mfs-spin_0.7s_linear_infinite]"
          />
        )}
        {!loading && leadingIcon && (
          <span aria-hidden="true" className="inline-flex shrink-0">
            {leadingIcon}
          </span>
        )}
        {children}
        {!loading && trailingIcon && (
          <span aria-hidden="true" className="inline-flex shrink-0">
            {trailingIcon}
          </span>
        )}
      </button>
    )
  },
)
