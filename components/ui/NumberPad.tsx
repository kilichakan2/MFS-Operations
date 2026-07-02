'use client'

import { type ReactNode } from 'react'

export type NumberPadTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface NumberPadLabels {
  /** aria-label for the keypad grid group. Default: "Number keypad". */
  keypad?: string
  /** aria-label for the backspace key. Default: "Delete last digit". */
  backspace?: string
  /** aria-label for the live value readout. Default: "Entered value". */
  value?: string
  /** Builds the out-of-range hint. Default: EN "Enter a value between …". */
  outOfRange?: (min: number, max: number, suffix: string) => string
}

export interface NumberPadProps {
  /** Current raw entry string (the caller owns the state). */
  value: string
  onChange: (next: string) => void
  onConfirm: () => void
  /** Allow a single decimal point (chillers). */
  allowDecimal?: boolean
  /** Allow a leading minus sign (freezers). With `allowDecimal` also set, the
   *  '.' keeps the grid slot and the sign becomes a toggle row below it. */
  allowNegative?: boolean
  /** Inclusive sanity bound — gates Confirm. Numeric DATA, not style. */
  min?: number
  max?: number
  /** Unit suffix shown after the value, e.g. "°C". */
  suffix?: string
  title?: ReactNode
  subtitle?: ReactNode
  /** Big-value tint, mirrors StatusTile's semantic `state`. */
  tone?: NumberPadTone
  /** Caller-supplied hint (e.g. a corrective-action preview). */
  hint?: ReactNode
  confirmLabel?: ReactNode
  labels?: NumberPadLabels
}

export interface NumberPadGating {
  allowDecimal?: boolean
  allowNegative?: boolean
}

/**
 * Pure key-press reducer — given the current value and a pressed key, returns
 * the next value. Extracted so the entry rules (single decimal, sign toggle,
 * backspace, leading-zero replace) are unit-testable without rendering.
 */
export function pressNumberPadKey(
  value: string,
  key: string,
  opts: NumberPadGating = {},
): string {
  if (key === 'back') return value.slice(0, -1)
  if (key === '.') {
    if (!opts.allowDecimal) return value
    return value.includes('.') ? value : value + '.'
  }
  if (key === '-') {
    if (!opts.allowNegative) return value
    return value.startsWith('-') ? value.slice(1) : '-' + value
  }
  // digit: a lone leading zero is replaced rather than prefixed.
  if (value === '0') return key
  return value + key
}

/**
 * Pure predicate — is the current value a finite number within the inclusive
 * [min, max] bound? Empty / lone "-" / lone "." parse to NaN → not confirmable.
 */
export function isNumberPadValueConfirmable(
  value: string,
  min?: number,
  max?: number,
): boolean {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return false
  if (min !== undefined && n < min) return false
  if (max !== undefined && n > max) return false
  return true
}

const DEFAULT_KEYPAD_LABEL = 'Number keypad'
const DEFAULT_BACKSPACE_LABEL = 'Delete last digit'
const DEFAULT_VALUE_LABEL = 'Entered value'
const DEFAULT_OUT_OF_RANGE = (min: number, max: number, suffix: string) =>
  `Enter a value between ${min}${suffix} and ${max}${suffix}`

const TONE_TEXT: Record<NumberPadTone, string> = {
  neutral: 'text-body',
  success: 'text-status-success-text',
  warning: 'text-status-warning-text',
  danger: 'text-status-error-text',
}

function BackspaceGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <line x1="18" y1="9" x2="13" y2="14" />
      <line x1="13" y1="9" x2="18" y2="14" />
    </svg>
  )
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Reusable numeric entry pad (ADR-0014 Rule 3). The keypad BODY only — display
 * + grid + explicit Confirm — NOT an overlay; wrap it in a kit `Modal` to give
 * it a scrim/focus-trap. Unlike `PinKeypad` (masked, fixed length, auto-submit)
 * this shows a live value, optionally allows a decimal and/or a sign (both
 * together add a full-width sign-toggle row below the grid), and waits for
 * a deliberate Confirm gated by an optional inclusive bound. Semantic tokens
 * only; render root is a `<div>`.
 */
export function NumberPad({
  value,
  onChange,
  onConfirm,
  allowDecimal = false,
  allowNegative = false,
  min,
  max,
  suffix = '',
  title,
  subtitle,
  tone = 'neutral',
  hint,
  confirmLabel,
  labels,
}: NumberPadProps) {
  const keypadLabel = labels?.keypad ?? DEFAULT_KEYPAD_LABEL
  const backspaceLabel = labels?.backspace ?? DEFAULT_BACKSPACE_LABEL
  const valueLabel = labels?.value ?? DEFAULT_VALUE_LABEL
  const outOfRangeLabel = labels?.outOfRange ?? DEFAULT_OUT_OF_RANGE

  const gating: NumberPadGating = { allowDecimal, allowNegative }
  const confirmable = isNumberPadValueConfirmable(value, min, max)

  // The slot between 9 and 0: a decimal point (chillers) OR a sign (freezers).
  // When BOTH are allowed (frozen goods-in, process room) the decimal keeps the
  // grid slot and the sign moves to a full-width toggle row below the grid.
  const showSignToggleRow = allowDecimal && allowNegative
  const signOrDecimal = allowDecimal ? '.' : allowNegative ? '-' : ''
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', signOrDecimal, '0', 'back']

  // Show the bound hint only when there IS an entry that is out of range — an
  // empty pad shows nothing, a real deviation in-range shows nothing.
  const showBoundHint =
    value !== '' &&
    (min !== undefined || max !== undefined) &&
    !isNumberPadValueConfirmable(value, min, max) &&
    Number.isFinite(parseFloat(value))

  function handlePress(key: string) {
    onChange(pressNumberPadKey(value, key, gating))
  }

  return (
    <div className="flex flex-col items-center gap-6 select-none bg-surface-base">
      <div className="text-center">
        {title && <div className="font-display text-h3 text-body">{title}</div>}
        {subtitle && (
          <div className="mt-0.5 font-text text-body-sm text-muted">{subtitle}</div>
        )}

        <div
          role="status"
          aria-live="polite"
          aria-label={valueLabel}
          className={cx(
            'mt-3 font-display text-6xl font-bold tracking-tight transition-colors',
            value ? TONE_TEXT[tone] : 'text-subtle',
          )}
        >
          {value || '—'}
          {suffix && <span className="text-2xl ml-2 opacity-60">{suffix}</span>}
        </div>

        {hint && (
          <div className="mt-3 max-w-xs mx-auto font-text text-body-sm text-muted leading-relaxed">
            {hint}
          </div>
        )}
        {showBoundHint && min !== undefined && max !== undefined && (
          <p className="mt-3 font-text text-body-sm font-semibold text-status-error-text">
            {outOfRangeLabel(min, max, suffix)}
          </p>
        )}
      </div>

      <div
        className="grid grid-cols-3 gap-4 w-full max-w-xs"
        role="group"
        aria-label={keypadLabel}
      >
        {keys.map((key, i) => {
          if (key === '') return <div key={`blank-${i}`} aria-hidden="true" />
          const isBack = key === 'back'
          return (
            <button
              key={key}
              type="button"
              aria-label={isBack ? backspaceLabel : undefined}
              onPointerDown={(e) => {
                e.preventDefault()
                if ('vibrate' in navigator) navigator.vibrate(8)
                handlePress(key)
              }}
              className={cx(
                'flex items-center justify-center h-16 rounded-2xl text-xl font-semibold',
                'select-none transition-colors duration-[120ms]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                isBack
                  ? 'bg-surface-sunken text-body'
                  : 'bg-surface-raised text-body active:bg-action-primary active:text-action-primary-fg',
              )}
            >
              {isBack ? <BackspaceGlyph /> : key}
            </button>
          )
        })}
        {showSignToggleRow && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              if ('vibrate' in navigator) navigator.vibrate(8)
              handlePress('-')
            }}
            className={cx(
              'col-span-3 flex items-center justify-center h-12 rounded-2xl text-sm font-bold',
              'select-none transition-colors duration-[120ms]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              'bg-surface-sunken text-body active:bg-action-primary active:text-action-primary-fg',
            )}
          >
            +/− Toggle negative
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={!confirmable}
        className={cx(
          'w-full max-w-xs py-4 rounded-2xl text-base font-bold transition-colors',
          'bg-action-primary text-action-primary-fg',
          'disabled:bg-action-primary-disabled disabled:cursor-not-allowed disabled:opacity-40',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      >
        {confirmLabel ?? (
          <>Confirm{value ? ` ${value}${suffix}` : ''}</>
        )}
      </button>
    </div>
  )
}
