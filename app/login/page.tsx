'use client'

import MfsLogo from '@/components/MfsLogo'


import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams }                             from 'next/navigation'
import AuthKeypad                                      from '@/components/AuthKeypad'

type Mode = 'select' | 'team' | 'admin'

interface TeamMember { id: string; name: string; role: string }

const ROLE_ACCENT: Record<string, string> = {
  warehouse: 'border-amber-500/40  text-amber-300',
  office:    'border-purple-500/40 text-purple-300',
  sales:     'border-emerald-500/40 text-emerald-300',
}
const ROLE_LABEL: Record<string, string> = {
  warehouse: 'Warehouse',
  office:    'Office',
  sales:     'Sales',
}

// ─── Shared submit helper ─────────────────────────────────────────────────────
// Uses window.location.href for the success redirect (hard navigation).
// This guarantees the new mfs_session cookie is included in the very next
// request to the server — bypasses any SPA router caching or React batching
// that could cause middleware to see a stale request without the cookie.

async function submitLogin(
  name:       string,
  credential: string,
  onSuccess:  (redirect: string) => void,
  onError:    (msg: string)      => void,
  from:       string | null,
) {
  console.log('[LOGIN] Sending PIN/password to server for:', name)

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => {
    console.log('[LOGIN] Aborting — 15s timeout reached')
    controller.abort()
  }, 15_000)

  try {
    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), credential: String(credential) }),
      signal:  controller.signal,
    })

    console.log('[LOGIN] Server response status:', res.status)

    let data: { redirect?: string; error?: string }
    try {
      data = await res.json()
      console.log('[LOGIN] Response body:', JSON.stringify(data))
    } catch (parseErr) {
      console.log('[LOGIN] Failed to parse response as JSON:', parseErr)
      onError(`Server returned unexpected response (${res.status})`)
      return
    }

    if (res.ok) {
      const dest = from ?? data.redirect ?? '/screen1'
      console.log('[LOGIN] Success — forcing hard redirect to', dest)
      // Hard navigation: full browser reload, new cookie sent natively with next request
      onSuccess(dest)
    } else {
      console.log('[LOGIN] Auth failed:', data.error)
      onError(data.error ?? `Login failed (${res.status})`)
    }
  } catch (err: unknown) {
    console.log('[LOGIN] Error caught:', err)
    if (err instanceof Error && err.name === 'AbortError') {
      onError('Connection timed out — please try again')
    } else {
      onError('Connection error — check your network and try again')
    }
  } finally {
    clearTimeout(timeoutId)
    console.log('[LOGIN] submitLogin finally block — timeout cleared')
  }
}

// ─── Screen A: Mode selector ──────────────────────────────────────────────────

function ModeSelect({ onSelect }: { onSelect: (m: 'team' | 'admin') => void }) {
  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="text-center mb-12">
          <MfsLogo className="h-14 w-auto mx-auto" />
        </div>

        <button type="button" onClick={() => onSelect('team')}
          className="w-full mb-4 rounded-2xl bg-[#EB6619] active:bg-[#c95510] active:scale-[0.98] transition-all p-5 text-left">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Team Login</p>
              <p className="text-white/70 text-xs mt-0.5">Drivers, warehouse &amp; sales</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-5 h-5 ml-auto opacity-60">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd"/>
            </svg>
          </div>
        </button>

        <button type="button" onClick={() => onSelect('admin')}
          className="w-full rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 active:scale-[0.98] transition-all p-5 text-left border border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Admin Login</p>
              <p className="text-white/50 text-xs mt-0.5">Hakan &amp; Ege only</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-5 h-5 ml-auto opacity-30">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd"/>
            </svg>
          </div>
        </button>
      </div>
    </div>
  )
}

// ─── Screen B: Team login (POS grid → PIN pad) ────────────────────────────────

function TeamLogin({ onBack, from }: { onBack: () => void; from: string | null }) {
  const [step,        setStep]        = useState<'grid' | 'pin'>('grid')
  const [selected,    setSelected]    = useState<TeamMember | null>(null)
  const [members,     setMembers]     = useState<TeamMember[]>([])
  const [fetchError,  setFetchError]  = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [error,       setError]       = useState('')
  const [resetSignal, setReset]       = useState(0)

  function loadMembers() {
    setLoadingList(true)
    setFetchError('')
    fetch('/api/auth/team')
      .then((r) => r.json())
      .then((data: TeamMember[]) => setMembers(Array.isArray(data) ? data : []))
      .catch(() => setFetchError('Could not load team — check connection'))
      .finally(() => setLoadingList(false))
  }

  useEffect(() => { loadMembers() }, [])

  const handlePin = useCallback(async (pin: string) => {
    if (!selected) return
    console.log('[LOGIN] handlePin called for', selected.name, '— PIN length', pin.length)
    setError('')
    try {
      await submitLogin(
        selected.name,
        pin,
        (redirect) => {
          // Hard redirect — full browser reload, no SPA router
          console.log('[LOGIN] Forcing hard redirect to', redirect)
          window.location.href = redirect
        },
        (msg) => {
          console.log('[LOGIN] onError called with:', msg)
          setError(msg)
        },
        from,
      )
    } catch (unexpectedErr) {
      // Should never reach here — submitLogin has its own try/catch
      console.log('[LOGIN] Unexpected throw from submitLogin:', unexpectedErr)
      setError('Unexpected error — please try again')
    } finally {
      console.log('[LOGIN] handlePin finally — incrementing resetSignal')
      setReset((n) => n + 1)
    }
  }, [selected, from])

  function selectMember(m: TeamMember) {
    console.log('[LOGIN] Selected team member:', m.name, m.role)
    setSelected(m)
    setError('')
    setStep('pin')
  }

  if (step === 'grid') {
    return (
      <div className="min-h-screen bg-[#16205B] flex flex-col px-6 pt-16 pb-10">
        <div className="max-w-sm mx-auto w-full flex flex-col flex-1">
          <button type="button" onClick={onBack}
            className="flex items-center gap-1.5 text-white/40 text-sm mb-8 hover:text-white/70 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd"/>
            </svg>
            Back
          </button>

          <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase text-center mb-1">Team Login</p>
          <h1 className="text-white text-xl font-bold text-center mb-8">Who are you?</h1>

          {loadingList && (
            <div className="flex flex-col items-center gap-3 py-10">
              <svg className="animate-spin w-6 h-6 text-white/30" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p className="text-white/40 text-sm">Loading team…</p>
            </div>
          )}

          {fetchError && (
            <div className="bg-red-900/40 border border-red-500/30 rounded-xl p-4 text-center">
              <p className="text-red-300 text-sm">{fetchError}</p>
              <button type="button" onClick={loadMembers} className="mt-3 text-white/50 text-xs hover:text-white/80">Retry</button>
            </div>
          )}

          {!loadingList && !fetchError && members.length === 0 && (
            <div className="text-center py-10">
              <p className="text-white/40 text-sm">No team members yet.</p>
              <p className="text-white/30 text-xs mt-1">Add users in the Admin panel first.</p>
            </div>
          )}

          {!loadingList && members.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {members.map((m) => (
                <button key={m.id} type="button" onClick={() => selectMember(m)}
                  className={['relative flex flex-col items-center justify-center bg-white/8 border rounded-2xl p-5 active:scale-95 transition-all duration-100 hover:bg-white/12', ROLE_ACCENT[m.role] ?? 'border-white/20 text-white/50'].join(' ')}>
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3">
                    <span className="text-white text-xl font-bold">{m.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-white font-bold text-base leading-tight">{m.name}</span>
                  <span className={`text-[10px] font-semibold mt-1 ${ROLE_ACCENT[m.role]?.split(' ')[1] ?? 'text-white/40'}`}>
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <AuthKeypad
        title={`Hi ${selected?.name ?? ''}, enter your PIN`}
        onComplete={handlePin}
        error={error}
        resetSignal={resetSignal}
      />
      <div className="fixed bottom-8 left-0 right-0 flex justify-center">
        <button type="button" onClick={() => { setStep('grid'); setError(''); setSelected(null) }}
          className="text-white/30 text-xs hover:text-white/60 transition-colors px-4 py-2">
          ← Back
        </button>
      </div>
    </div>
  )
}

// ─── Screen C: Admin login ────────────────────────────────────────────────────

function AdminLogin({ onBack, from }: { onBack: () => void; from: string | null }) {
  const [username,     setUsername]   = useState('')
  const [password,     setPassword]   = useState('')
  const [error,        setError]      = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!username.trim() || !password.trim() || isSubmitting) return
    setSubmitting(true)
    setError('')
    console.log('[LOGIN] Admin submit for username:', username)
    try {
      await submitLogin(
        username, password,
        (redirect) => {
          console.log('[LOGIN] Admin success — hard redirect to', redirect)
          window.location.href = redirect
        },
        (msg) => {
          console.log('[LOGIN] Admin error:', msg)
          setError(msg)
        },
        from,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 text-white/40 text-sm mb-8 hover:text-white/70 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd"/>
          </svg>
          Back
        </button>

        <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase text-center mb-1">Admin Login</p>
        <h1 className="text-white text-xl font-bold text-center mb-10">Welcome back</h1>

        <label className="block text-white/60 text-xs font-bold tracking-widest uppercase mb-2">Username</label>
        <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="Hakan or Ege"
          autoFocus autoComplete="username"
          className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-4" />

        <label className="block text-white/60 text-xs font-bold tracking-widest uppercase mb-2">Password</label>
        <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="••••••••"
          autoComplete="current-password"
          className="w-full h-14 rounded-xl px-4 text-base font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB6619] mb-3" />

        {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}

        <button type="button" onClick={handleSubmit}
          disabled={!username.trim() || !password.trim() || isSubmitting}
          className="w-full h-14 rounded-xl bg-[#EB6619] text-white text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-all">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function LoginForm() {
  const searchParams    = useSearchParams()
  const from            = searchParams.get('from')
  const [mode, setMode] = useState<Mode>('select')

  return mode === 'select' ? <ModeSelect onSelect={setMode} />
       : mode === 'team'   ? <TeamLogin  onBack={() => setMode('select')} from={from} />
       :                     <AdminLogin  onBack={() => setMode('select')} from={from} />
}

function LoginSkeleton() {
  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <MfsLogo className="h-14 w-auto mx-auto" />
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
