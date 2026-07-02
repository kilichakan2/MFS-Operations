'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'ghost-inverse'
  | 'danger'
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
  // Per-variant label colours (spec §5.3): the orange fill carries an INK
  // label (LOCKED (b) — white on orange is 3.3, body-illegal); navy and red
  // fills carry white labels via their own -fg tokens.
  primary: cx(
    'bg-action-primary text-action-primary-fg border-transparent',
    'hover:bg-action-primary-hover active:bg-action-primary-active',
    'disabled:bg-action-primary-disabled',
  ),
  secondary: cx(
    'bg-action-secondary text-action-secondary-fg border-transparent',
    'hover:bg-action-secondary-hover active:bg-action-secondary-active',
    'disabled:bg-action-secondary-disabled',
  ),
  ghost: cx(
    'bg-transparent border-action-ghost-border text-action-ghost-fg',
    'hover:bg-action-ghost-hover-bg',
    'disabled:opacity-50',
  ),
  // Reads on the navy ScreenHeader block: transparent with an inverse (white)
  // outline + inverse text. The hover wash is DERIVED from --text-inverse via
  // color-mix (not stock white) so it stays token-pure. Never put a navy
  // variant="secondary" button on the navy header — that is forbidden navy-on-navy.
  'ghost-inverse': cx(
    'bg-transparent border-[color:var(--text-inverse)] text-inverse',
    'hover:bg-[color-mix(in_srgb,var(--text-inverse)_12%,transparent)]',
    'disabled:opacity-50',
  ),
  danger: cx(
    'bg-action-danger text-action-danger-fg border-transparent',
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
