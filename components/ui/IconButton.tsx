'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type IconButtonVariant =
  | 'ghost'
  | 'ghost-inverse'
  | 'primary'
  | 'neutral'
  | 'danger'
export type IconButtonSize = 'sm' | 'md'

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required accessible name — defaults English when used via spread, but the
   *  prop itself is mandatory so TS forces every caller to supply one. */
  'aria-label': string
  icon: ReactNode
  variant?: IconButtonVariant
  size?: IconButtonSize
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost: cx(
    'bg-transparent border-action-ghost-border text-action-ghost-fg',
    'hover:bg-action-ghost-hover-bg disabled:opacity-50',
  ),
  // Inverse-safe ghost for actions sitting ON the navy ScreenHeader block:
  // inverse (white) outline + inverse glyph, hover wash derived from
  // --text-inverse (not stock white) to stay token-pure.
  'ghost-inverse': cx(
    'bg-transparent border-[color:var(--text-inverse)] text-inverse',
    'hover:bg-[color-mix(in_srgb,var(--text-inverse)_12%,transparent)] disabled:opacity-50',
  ),
  primary: cx(
    'bg-action-primary text-action-primary-fg border-transparent',
    'hover:bg-action-primary-hover active:bg-action-primary-active',
    'disabled:bg-action-primary-disabled',
  ),
  neutral: cx(
    'bg-surface-sunken text-body border-transparent',
    'hover:bg-surface-base disabled:opacity-50',
  ),
  danger: cx(
    'bg-status-error-soft text-status-error-text border-transparent',
    'hover:bg-status-error-soft disabled:opacity-50',
  ),
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  // ≥44px tap floor applied on both sizes per design rule.
  sm: 'w-[var(--ctl-h-sm)] h-[var(--ctl-h-sm)] min-w-[44px] min-h-[44px]',
  md: 'w-[var(--ctl-h)] h-[var(--ctl-h)] min-w-[44px] min-h-[44px]',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      variant = 'ghost',
      size = 'md',
      type = 'button',
      className,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(
          'inline-flex items-center justify-center',
          'border-[1.5px] rounded-[var(--ctl-radius)]',
          'transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          'disabled:cursor-not-allowed',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...rest}
      >
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      </button>
    )
  },
)
