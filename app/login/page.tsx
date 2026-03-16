'use client'

import { Suspense, useState, useCallback } from 'react'
import { useRouter, useSearchParams }      from 'next/navigation'
import AuthKeypad                          from '@/components/AuthKeypad'

type Mode = 'select' | 'team' | 'admin'

// ─── Shared submit helper ─────────────────────────────────────────────────────

async function submitLogin(
  name:       string,
  credential: string,
  onSuccess:  (redirect: string) => void,
  onError:    (msg: string) => void,
  from:       string | null,
) {
  try {
    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), credential }),
    })
    const data = await res.json()
    if (res.ok) {
      onSuccess(from ?? data.redirect)
    } else {
      onError(data.error ?? 'Invalid credentials')
    }
  } catch {
    onError('Connection error — try again')
  }
}

// ─── Screen A: Mode selector ──────────────────────────────────────────────────

function ModeSelect({ onSelect }: { onSelect: (m: 'team' | 'admin') => void }) {
  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        {/* Logo */}
        <div className="text-center mb-12">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase mb-1">
            MFS Global
          </p>
          <h1 className="text-white text-2xl font-bold">Operations</h1>
        </div>

        {/* Team Login */}
        <button
          type="button"
          onClick={() => onSelect('team')}
          className="w-full mb-4 rounded-2xl bg-[#EB6619] active:bg-[#c95510] active:scale-[0.98] transition-all p-5 text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              {/* People icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-6 h-6">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Team Login</p>
              <p className="text-white/70 text-xs mt-0.5">Drivers, warehouse &amp; sales</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white"
              className="w-5 h-5 ml-auto opacity-60">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd"/>
            </svg>
          </div>
        </button>

        {/* Admin Login */}
        <button
          type="button"
          onClick={() => onSelect('admin')}
          className="w-full rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 active:scale-[0.98] transition-all p-5 text-left border border-white/10"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              {/* Shield icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-6 h-6">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Admin Login</p>
              <p className="text-white/50 text-xs mt-0.5">Hakan &amp; Ege only</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white"
              className="w-5 h-5 ml-auto opacity-30">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd"/>
            </svg>
          </div>
        </button>
      </div>
    </div>
  )
}

// ─── Screen B: Team login (Name → PIN) ────────────────────────────────────────

function TeamLogin({
  onBack,
  from,
}: {
  onBack: () => void
  from:   string | null
}) {
  const router = useRouter()
  const [step, setStep]         = useState<'name' | 'pin'>('name')
  const [name, setName]         = useState('')
  const [error, setError]       = useState('')
  const [resetSignal, setReset] = useState(0)

  const handlePin = useCallback(async (pin: string) => {
    setError('')
    await submitLogin(
      name, pin,
      (redirect) => router.replace(redirect),
      (msg)      => { setError(msg); setReset((n) => n + 1) },
      from,
    )
  }, [name, router, from])

  if (step === 'name') {
    return (
      <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-white/40 text-sm mb-8 hover:text-white/70 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd"/>
            </svg>
            Back
          </button>

          <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase text-center mb-1">
            Team Login
          </p>
          <h1 className="text-white text-xl font-bold text-center mb-10">What's your name?</h1>

          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && (setError(''), setStep('pin'))}
            placeholder="e.g. Daz"
            autoFocus
            autoComplete="off"
            className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-3"
          />
          {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}
          <button
            type="button"
            onClick={() => { if (name.trim()) { setError(''); setStep('pin') } }}
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
    <div className="flex flex-col">
      <AuthKeypad
        title={`Hi ${name}, enter your PIN`}
        onComplete={handlePin}
        error={error}
        resetSignal={resetSignal}
      />
      <div className="fixed bottom-8 left-0 right-0 flex justify-center">
        <button
          type="button"
          onClick={() => { setStep('name'); setError('') }}
          className="text-white/30 text-xs hover:text-white/60 transition-colors px-4 py-2"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

// ─── Screen C: Admin login (Username + Password) ──────────────────────────────

function AdminLogin({
  onBack,
  from,
}: {
  onBack: () => void
  from:   string | null
}) {
  const router = useRouter()
  const [username,    setUsername]    = useState('')
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!username.trim() || !password.trim() || isSubmitting) return
    setSubmitting(true)
    setError('')
    await submitLogin(
      username, password,
      (redirect) => router.replace(redirect),
      (msg)      => { setError(msg); setSubmitting(false) },
      from,
    )
  }

  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/40 text-sm mb-8 hover:text-white/70 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd"/>
          </svg>
          Back
        </button>

        <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase text-center mb-1">
          Admin Login
        </p>
        <h1 className="text-white text-xl font-bold text-center mb-10">Welcome back</h1>

        {/* Username */}
        <label className="block text-white/60 text-xs font-bold tracking-widest uppercase mb-2">
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Hakan or Ege"
          autoFocus
          autoComplete="username"
          className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-4"
        />

        {/* Password */}
        <label className="block text-white/60 text-xs font-bold tracking-widest uppercase mb-2">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="••••••••"
          autoComplete="current-password"
          className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-3"
        />

        {error && (
          <p className="text-red-400 text-sm text-center mb-3">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!username.trim() || !password.trim() || isSubmitting}
          className="w-full h-14 rounded-xl bg-[#EB6619] text-white text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}

// ─── Root form (reads searchParams) ──────────────────────────────────────────

function LoginForm() {
  const searchParams          = useSearchParams()
  const from                  = searchParams.get('from')
  const [mode, setMode]       = useState<Mode>('select')

  if (mode === 'select') return <ModeSelect onSelect={setMode} />
  if (mode === 'team')   return <TeamLogin  onBack={() => setMode('select')} from={from} />
  return                        <AdminLogin  onBack={() => setMode('select')} from={from} />
}

// ─── Skeleton + page export ───────────────────────────────────────────────────

function LoginSkeleton() {
  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase mb-1">MFS Global</p>
        <h1 className="text-white text-2xl font-bold">Operations</h1>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
