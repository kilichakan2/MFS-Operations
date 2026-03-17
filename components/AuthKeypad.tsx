'use client'

import { useState, useEffect, useCallback } from 'react'

interface AuthKeypadProps {
  onComplete:    (pin: string) => void
  error?:        string
  title?:        string
  resetSignal?:  number
}

const PIN_LENGTH = 4

const KEYPAD_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'back'],
] as const

type KeyValue = (typeof KEYPAD_LAYOUT)[number][number]

function KeyButton({ value, onPress }: { value: KeyValue; onPress: (v: KeyValue) => void }) {
  if (value === '') return <div aria-hidden="true" />
  const isBack = value === 'back'
  return (
    <button
      type="button"
      aria-label={isBack ? 'Delete last digit' : `Digit ${value}`}
      onPointerDown={(e) => {
        e.preventDefault()
        if ('vibrate' in navigator) navigator.vibrate(8)
        onPress(value)
      }}
      className="flex items-center justify-center w-20 h-20 rounded-full mx-auto select-none text-2xl font-semibold bg-[#1e2d6b] text-white active:bg-[#EB6619] active:scale-95 transition-all duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]"
    >
      {isBack ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
          <line x1="18" y1="9" x2="13" y2="14"/><line x1="13" y1="9" x2="18" y2="14"/>
        </svg>
      ) : value}
    </button>
  )
}

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex gap-5 justify-center" aria-live="polite" aria-label={`${filled} of ${PIN_LENGTH} digits entered`}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <div key={i} className={['w-4 h-4 rounded-full border-2 border-white transition-all duration-150', i < filled ? 'bg-[#EB6619] border-[#EB6619] scale-110' : 'bg-transparent'].join(' ')} />
      ))}
    </div>
  )
}

export default function AuthKeypad({ onComplete, error, title = 'Enter your PIN', resetSignal }: AuthKeypadProps) {
  const [pin,          setPin]          = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Reset when parent increments resetSignal ─────────────────────────────────
  // Fires on every change to resetSignal, including back to 0.
  // Also fires on mount (initial undefined → defined transition) to clear any stale state.
  useEffect(() => {
    console.log('[KEYPAD] resetSignal changed →', resetSignal, '— clearing pin and isSubmitting')
    setPin('')
    setIsSubmitting(false)
  }, [resetSignal])

  // ── ALSO reset whenever parent passes a non-empty error ──────────────────────
  // Belt-and-braces: if the parent surfaces an error, the keypad MUST be unfrozen
  // regardless of whether resetSignal fired. Handles the case where the React
  // update batching prevents the resetSignal effect from running in time.
  useEffect(() => {
    if (error) {
      console.log('[KEYPAD] error prop set →', error, '— force clearing isSubmitting')
      setIsSubmitting(false)
      setPin('')
    }
  }, [error])

  // ── Physical keyboard support ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleBackspace()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
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

  // ── Auto-submit when 4 digits entered ────────────────────────────────────────
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !isSubmitting) {
      console.log('[KEYPAD] 4 digits entered — setting isSubmitting=true and scheduling onComplete')
      setIsSubmitting(true)
      const timer = setTimeout(() => {
        console.log('[KEYPAD] Calling onComplete with PIN of length', pin.length)
        onComplete(pin)
      }, 120)
      return () => clearTimeout(timer)
    }
  }, [pin, isSubmitting, onComplete])

  const handleKey = useCallback((value: KeyValue) => {
    if (isSubmitting) return
    if (value === 'back') handleBackspace()
    else if (value !== '') handleDigit(value)
  }, [isSubmitting, handleDigit, handleBackspace])

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#16205B] px-8 py-12 select-none">
      <div className="mb-12 text-center">
        <p className="text-[#EB6619] text-xs font-bold tracking-[0.3em] uppercase mb-1">MFS Global</p>
        <p className="text-white text-xl font-semibold tracking-wide">{title}</p>
      </div>

      <div className="mb-10"><PinDots filled={pin.length} /></div>

      <div className="h-6 mb-8 flex items-center justify-center">
        {error && <p className="text-red-400 text-sm font-medium animate-pulse">{error}</p>}
      </div>

      <div className="w-full max-w-xs grid grid-cols-3 gap-y-5 gap-x-2" role="group" aria-label="PIN keypad">
        {KEYPAD_LAYOUT.flat().map((key, i) => (
          <KeyButton key={i} value={key} onPress={handleKey} />
        ))}
      </div>

      {isSubmitting && (
        <div className="mt-10 flex items-center gap-2 text-white/60 text-sm">
          <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Verifying…
        </div>
      )}
    </div>
  )
}
