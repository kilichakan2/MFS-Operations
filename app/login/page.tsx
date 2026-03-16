'use client'

import { Suspense, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthKeypad from '@/components/AuthKeypad'

type AuthType = 'pin' | 'password'

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep]           = useState<'name' | 'credential'>('name')
  const [authType, setAuthType]   = useState<AuthType>('pin')
  const [name, setName]           = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [isChecking, setChecking] = useState(false)
  const [resetSignal, setReset]   = useState(0)

  async function handleNameSubmit() {
    if (!name.trim()) { setError('Enter your name'); return }
    setError('')
    setChecking(true)
    try {
      const res  = await fetch('/api/auth/type', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json() as { authType: AuthType }
      setAuthType(data.authType ?? 'pin')
    } catch {
      setAuthType('pin')
    } finally {
      setChecking(false)
      setStep('credential')
    }
  }

  const handleCredentialSubmit = useCallback(async (credential: string) => {
    if (!credential.trim()) return
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), credential }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Invalid credentials')
        setReset((n) => n + 1)
        setPassword('')
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
          <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase text-center mb-1">MFS Global</p>
          <h1 className="text-white text-xl font-bold text-center mb-10">Operations</h1>
          <label className="block text-white/60 text-xs font-bold tracking-widest uppercase mb-2">Your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            placeholder="e.g. Hakan"
            autoFocus
            autoComplete="off"
            className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-3"
          />
          {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}
          <button
            type="button"
            onClick={handleNameSubmit}
            disabled={!name.trim() || isChecking}
            className="w-full h-14 rounded-xl bg-[#EB6619] text-white text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {isChecking ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  if (authType === 'pin') {
    return (
      <AuthKeypad
        title={`Welcome, ${name}`}
        onComplete={handleCredentialSubmit}
        error={error}
        resetSignal={resetSignal}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase text-center mb-1">MFS Global</p>
        <h1 className="text-white text-xl font-bold text-center mb-2">Welcome, {name}</h1>
        <p className="text-white/50 text-sm text-center mb-8">Enter your password</p>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleCredentialSubmit(password)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-3"
        />
        {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}
        <button
          type="button"
          onClick={() => handleCredentialSubmit(password)}
          disabled={!password.trim()}
          className="w-full h-14 rounded-xl bg-[#EB6619] text-white text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-all mb-4"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setStep('name'); setPassword(''); setError('') }}
          className="w-full text-white/40 text-sm text-center hover:text-white/70 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  )
}

function LoginSkeleton() {
  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase mb-1">MFS Global</p>
        <h1 className="text-white text-xl font-bold">Operations</h1>
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
