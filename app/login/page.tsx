'use client'

import { Suspense, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthKeypad from '@/components/AuthKeypad'

// ─── Inner component — contains useSearchParams, must be inside Suspense ──────
// Next.js 15 requires any component calling useSearchParams() to be wrapped
// in a <Suspense> boundary during static generation. Isolating it here means
// the outer page can remain a normal server-renderable shell.

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep]         = useState<'name' | 'pin'>('name')
  const [name, setName]         = useState('')
  const [error, setError]       = useState('')
  const [resetSignal, setReset] = useState(0)

  function handleNameSubmit() {
    if (!name.trim()) { setError('Enter your name'); return }
    setError('')
    setStep('pin')
  }

  const handlePinComplete = useCallback(async (pin: string) => {
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), credential: pin }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Invalid PIN')
        setReset((n) => n + 1)
        return
      }

      const from = searchParams.get('from')
      router.replace(from ?? data.redirect)
    } catch {
      setError('Connection error — try again')
      setReset((n) => n + 1)
    }
  }, [name, router, searchParams])

  if (step === 'name') {
    return (
      <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase text-center mb-1">
            MFS Global
          </p>
          <h1 className="text-white text-xl font-bold text-center mb-10">
            Operations
          </h1>

          <label className="block text-white/60 text-xs font-bold tracking-widest uppercase mb-2">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            placeholder="e.g. Daz"
            autoFocus
            autoComplete="off"
            className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-3"
          />

          {error && (
            <p className="text-red-400 text-sm text-center mb-3">{error}</p>
          )}

          <button
            type="button"
            onClick={handleNameSubmit}
            disabled={!name.trim()}
            className="w-full h-14 rounded-xl bg-[#EB6619] text-white text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <AuthKeypad
      title={`Welcome, ${name}`}
      onComplete={handlePinComplete}
      error={error}
      resetSignal={resetSignal}
    />
  )
}

// ─── Loading shell — shown by Suspense while LoginForm hydrates ───────────────

function LoginSkeleton() {
  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase mb-1">
          MFS Global
        </p>
        <h1 className="text-white text-xl font-bold">Operations</h1>
      </div>
    </div>
  )
}

// ─── Page export — Suspense boundary wraps the useSearchParams consumer ───────

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
