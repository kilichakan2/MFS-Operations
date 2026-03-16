'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthKeypadProps {
  /** Called once the 4th digit is entered. Receives the full PIN string. */
  onComplete: (pin: string) => void
  /** Optional: show an error message below the dots (e.g. "Incorrect PIN") */
  error?: string
  /** Optional: header label above the dots */
  title?: string
  /** Optional: reset the input from the parent (increment to trigger reset) */
  resetSignal?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIN_LENGTH = 4

const KEYPAD_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'back'],
] as const

type KeyValue = (typeof KEYPAD_LAYOUT)[number][number]

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single circular key button */
function KeyButton({
  value,
  onPress,
}: {
  value: KeyValue
  onPress: (value: KeyValue) => void
}) {
  if (value === '') {
    // Empty cell — spacer
    return <div aria-hidden="true" />
  }

  const isBack = value === 'back'

  return (
    <button
      type="button"
      aria-label={isBack ? 'Delete last digit' : `Digit ${value}`}
      onPointerDown={(e) => {
        // Use pointerdown for faster response than onClick
        e.preventDefault()
        // Haptic feedback where supported
        if ('vibrate' in navigator) navigator.vibrate(8)
        onPress(value)
      }}
      className={[
        // Sizing — large circular touch targets
        'flex items-center justify-center',
        'w-20 h-20 rounded-full',
        'mx-auto select-none',
        // Typography
        'text-2xl font-semibold',
        // Colours — MFS navy background, white text
        'bg-[#1e2d6b] text-white',
        // Active state — flash to orange on press
        'active:bg-[#EB6619] active:scale-95',
        // Transition
        'transition-all duration-75',
        // Accessibility
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
      ].join(' ')}
    >
      {isBack ? (
        // Backspace icon — simple SVG, no icon library dependency
        <svg
          xmlns="http://www.w3.org/2000/svg"
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
      ) : (
        value
      )}
    </button>
  )
}

/** The four PIN dot indicators */
function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex gap-5 justify-center" aria-live="polite" aria-label={`${filled} of ${PIN_LENGTH} digits entered`}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <div
          key={i}
          className={[
            'w-4 h-4 rounded-full border-2 border-white',
            'transition-all duration-150',
            i < filled
              ? 'bg-[#EB6619] border-[#EB6619] scale-110'
              : 'bg-transparent',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuthKeypad({
  onComplete,
  error,
  title = 'Enter your PIN',
  resetSignal,
}: AuthKeypadProps) {
  const [pin, setPin] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset when parent signals (e.g. after wrong PIN)
  useEffect(() => {
    if (resetSignal !== undefined) {
      setPin('')
      setIsSubmitting(false)
    }
  }, [resetSignal])

  // Handle physical keyboard input for desktop/testing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key)
      } else if (e.key === 'Backspace') {
        handleBackspace()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const handleDigit = useCallback((digit: string) => {
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev
      return prev + digit
    })
  }, [])

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1))
  }, [])

  // Auto-submit when PIN reaches 4 digits
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !isSubmitting) {
      setIsSubmitting(true)
      // Brief delay so the last dot fills visibly before calling onComplete
      const timer = setTimeout(() => {
        onComplete(pin)
      }, 120)
      return () => clearTimeout(timer)
    }
  }, [pin, isSubmitting, onComplete])

  const handleKey = useCallback(
    (value: KeyValue) => {
      if (isSubmitting) return
      if (value === 'back') {
        handleBackspace()
      } else if (value !== '') {
        handleDigit(value)
      }
    },
    [isSubmitting, handleDigit, handleBackspace]
  )

  return (
    // Full-viewport container — MFS deep navy background
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#16205B] px-8 py-12 select-none">

      {/* Logo / wordmark area */}
      <div className="mb-12 text-center">
        <p className="text-[#EB6619] text-xs font-bold tracking-[0.3em] uppercase mb-1">
          MFS Global
        </p>
        <p className="text-white text-xl font-semibold tracking-wide">
          {title}
        </p>
      </div>

      {/* PIN dots */}
      <div className="mb-10">
        <PinDots filled={pin.length} />
      </div>

      {/* Error message */}
      <div className="h-6 mb-8 flex items-center justify-center">
        {error && (
          <p className="text-red-400 text-sm font-medium animate-pulse">
            {error}
          </p>
        )}
      </div>

      {/* Keypad grid */}
      <div
        className="w-full max-w-xs grid grid-cols-3 gap-y-5 gap-x-2"
        role="group"
        aria-label="PIN keypad"
      >
        {KEYPAD_LAYOUT.flat().map((key, index) => (
          <KeyButton key={index} value={key} onPress={handleKey} />
        ))}
      </div>

      {/* Submitting state overlay */}
      {isSubmitting && (
        <div className="mt-10 flex items-center gap-2 text-white/60 text-sm">
          <svg
            className="animate-spin w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Verifying…
        </div>
      )}
    </div>
  )
}
