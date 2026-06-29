'use client'

import type { ReactNode } from 'react'
import type { Accent } from './accent'

export interface BadgeProps {
  children: ReactNode
  /** `neutral` (default) is the count/label pill; an Accent tints it. */
  tone?: 'neutral' | Accent
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const BASE =
  'inline-flex items-center justify-center text-caption font-semibold rounded-pill px-2.5 py-0.5 min-w-[24px] text-center'

const TONE_CLASSES: Record<'neutral' | Accent, string> = {
  neutral: 'text-muted bg-surface-sunken border border-default',
  success:
    'text-status-success-text bg-status-success-soft border border-status-success-border',
  warning:
    'text-status-warning-text bg-status-warning-soft border border-status-warning-border',
  danger:
    'text-status-error-text bg-status-error-soft border border-status-error-border',
  navy: 'text-action-secondary bg-surface-sunken border border-default',
}

/** A generic count / label pill. Default neutral; an Accent tone tints it. */
export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={cx(BASE, TONE_CLASSES[tone])}>{children}</span>
}
