'use client'

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'

export interface PinKeypadLabels {
  /** Builds the aria-label for a digit key. Default: `Digit ${d}`. */
  digit?: (digit: string) => string
  /** aria-label for the backspace key. Default: "Delete last digit". */
  backspace?: string
  /** aria-label for the keypad grid group. Default: "PIN keypad". */
  keypad?: string
  /** Builds the aria-label for the dots row. Default: `${n} of ${len} digits entered`. */
  dots?: (filled: number, length: number) => string
}

export interface PinKeypadProps {
  onComplete: (pin: string) => void
  pinLength?: number
  error?: string
  title?: string
  status?: string
  resetSignal?: number
  onReset?: () => void
  /** Optional ARIA labels — each defaults to an English string so a later
   *  screen can pass t()-translated labels without editing this component. */
  labels?: PinKeypadLabels
}

const KEYPAD_LAYOUT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const
type KeyValue = (typeof KEYPAD_LAYOUT)[number]

const DEFAULT_DIGIT_LABEL = (d: string) => `Digit ${d}`
const DEFAULT_BACKSPACE_LABEL = 'Delete last digit'
const DEFAULT_KEYPAD_LABEL = 'PIN keypad'
const DEFAULT_DOTS_LABEL = (n: number, len: number) =>
  `${n} of ${len} digits entered`

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

function KeyButton({
  value,
  onPress,
  digitLabel,
  backspaceLabel,
}: {
  value: KeyValue
  onPress: (v: KeyValue) => void
  digitLabel: (d: string) => string
  backspaceLabel: string
}) {
  if (value === '') return <div aria-hidden="true" />
  const isBack = value === 'back'
  return (
    <button
      type="button"
      aria-label={isBack ? backspaceLabel : digitLabel(value)}
      onPointerDown={(e) => {
        e.preventDefault()
        if ('vibrate' in navigator) navigator.vibrate(8)
        onPress(value)
      }}
      className={[
        'flex items-center justify-center h-16 rounded-[14px] select-none',
        'font-display text-2xl',
        'bg-surface-raised text-body shadow-sm',
        'active:bg-surface-sunken transition-colors duration-[120ms]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
      ].join(' ')}
    >
      {isBack ? <BackspaceGlyph /> : (value as ReactNode)}
    </button>
  )
}

function PinDots({
  filled,
  length,
  shake,
  label,
}: {
  filled: number
  length: number
  shake: boolean
  label: string
}) {
  return (
    <div
      className={[
        'flex gap-4 justify-center',
        shake ? 'animate-[mfs-pinpulse_0.4s_ease]' : '',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={[
            'w-4 h-4 rounded-full border-2 border-strong transition-all duration-150',
            i < filled ? 'bg-action-primary border-action-primary scale-110' : 'bg-transparent',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

export function PinKeypad({
  onComplete,
  pinLength = 4,
  error,
  title,
  status,
  resetSignal,
  onReset,
  labels,
}: PinKeypadProps) {
  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [shake, setShake] = useState(false)

  const digitLabel = labels?.digit ?? DEFAULT_DIGIT_LABEL
  const backspaceLabel = labels?.backspace ?? DEFAULT_BACKSPACE_LABEL
  const keypadLabel = labels?.keypad ?? DEFAULT_KEYPAD_LABEL
  const dotsLabel = labels?.dots ?? DEFAULT_DOTS_LABEL

  // Ref-not-state guard against double submission — see AuthKeypad: putting
  // isSubmitting in the auto-submit effect deps would clear the timer before
  // onComplete fires. The ref carries the same value with no re-render.
  const submittingRef = useRef(false)

  // Reset when parent increments resetSignal.
  useEffect(() => {
    setPin('')
    setIsSubmitting(false)
    submittingRef.current = false
  }, [resetSignal])

  // Belt-and-braces: clear (and pulse) when parent passes an error.
  useEffect(() => {
    if (error) {
      setIsSubmitting(false)
      setPin('')
      submittingRef.current = false
      setShake(true)
      const t = setTimeout(() => setShake(false), 400)
      return () => clearTimeout(t)
    }
  }, [error])

  const handleDigit = useCallback(
    (digit: string) => {
      setPin((prev) => (prev.length >= pinLength ? prev : prev + digit))
    },
    [pinLength],
  )

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1))
  }, [])

  // Physical keyboard fallback.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleBackspace()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleDigit, handleBackspace])

  // Auto-submit on the final digit. Deps are [pin, pinLength, onComplete] only.
  useEffect(() => {
    if (pin.length === pinLength && !submittingRef.current) {
      submittingRef.current = true
      setIsSubmitting(true)
      const timer = setTimeout(() => onComplete(pin), 120)
      return () => clearTimeout(timer)
    }
  }, [pin, pinLength, onComplete])

  const handleKey = useCallback(
    (value: KeyValue) => {
      if (submittingRef.current) return
      if (value === 'back') handleBackspace()
      else if (value !== '') handleDigit(value)
    },
    [handleDigit, handleBackspace],
  )

  return (
    <div className="flex flex-col items-center bg-surface-base px-6 py-8 select-none">
      {title && (
        <div className="font-display text-[19px] text-body mb-1">{title}</div>
      )}
      <div
        className={[
          'h-5 mb-5 font-text text-[13px] font-medium',
          error ? 'text-status-error-text' : 'text-subtle',
        ].join(' ')}
      >
        {error ?? status ?? ''}
      </div>

      <div className="mb-6">
        <PinDots
          filled={pin.length}
          length={pinLength}
          shake={shake}
          label={dotsLabel(pin.length, pinLength)}
        />
      </div>

      <div
        className="grid grid-cols-3 gap-3 w-[228px]"
        role="group"
        aria-label={keypadLabel}
      >
        {KEYPAD_LAYOUT.map((key, i) => (
          <KeyButton
            key={i}
            value={key}
            onPress={handleKey}
            digitLabel={digitLabel}
            backspaceLabel={backspaceLabel}
          />
        ))}
      </div>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-5 bg-transparent border-none font-text text-[12.5px] font-semibold text-link cursor-pointer"
        >
          Reset
        </button>
      )}

      {isSubmitting && !error && (
        <div className="mt-5 flex items-center gap-2 font-text text-[13px] text-subtle">
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border-2 border-current/30 border-t-current animate-[mfs-spin_0.7s_linear_infinite]"
          />
          Verifying…
        </div>
      )}
    </div>
  )
}
