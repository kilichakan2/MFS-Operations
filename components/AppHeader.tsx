'use client'

import { useRouter }    from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb }      from '@/lib/localDb'
import { useLanguage }  from '@/lib/LanguageContext'
import MfsLogo          from '@/components/MfsLogo'

interface AppHeaderProps {
  title?:    string
  maxWidth?: 'lg' | '2xl' | '4xl'
  actions?:  React.ReactNode
}

// ── Sync indicator — coloured dot only ────────────────────────────────────────

function SyncDot() {
  const unsynced = useLiveQuery(
    () => localDb.queue.filter(r => !r.synced).toArray(),
    [], []
  )
  const total = unsynced.length
  const stuck = unsynced.filter(r => (r.retries ?? 0) >= 3).length

  if (total === 0) return null
  if (stuck > 0) {
    return (
      <span title={`${stuck} stuck`}
        className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0 ring-2 ring-red-400/30"
        aria-label="Sync error" />
    )
  }
  return (
    <span title={`${total} syncing`}
      className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0 ring-2 ring-amber-400/30 animate-pulse"
      aria-label="Syncing" />
  )
}

// ── Three-dot popover menu ────────────────────────────────────────────────────

function DotMenu() {
  const router                        = useRouter()
  const [open, setOpen]               = useState(false)
  const [loggingOut, setLoggingOut]   = useState(false)
  const { lang, setLang, t, mounted } = useLanguage()
  const menuRef                       = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  async function handleLogout() {
    setLoggingOut(true); setOpen(false)
    try { await fetch('/api/auth/logout', { method: 'POST' }) }
    finally { router.replace('/login') }
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger — 44×44px touch target */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className={[
          'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
          open ? 'bg-white/25 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white',
        ].join(' ')}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM8.5 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM15.5 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-[#EDEAE1] overflow-hidden z-50">

          {/* Language row */}
          {mounted && (
            <button type="button"
              onClick={() => { setLang(lang === 'en' ? 'tr' : 'en'); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-[#1E1E1E] hover:bg-[#EDEAE1] transition-colors min-h-[44px]"
            >
              <span className="text-lg leading-none">{lang === 'en' ? '🇹🇷' : '🇬🇧'}</span>
              <span className="font-medium">{lang === 'en' ? 'Türkçe' : 'English'}</span>
            </button>
          )}

          <div className="h-px bg-[#EDEAE1]" />

          {/* Logout row */}
          <button type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 transition-colors min-h-[44px] disabled:opacity-40"
          >
            {loggingOut ? (
              <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd"/>
                <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.04a.75.75 0 1 0-1.06-1.06l-2.5 2.5a.75.75 0 0 0 0 1.06l2.5 2.5a.75.75 0 1 0 1.06-1.06l-1.048-1.04h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd"/>
              </svg>
            )}
            <span className="font-medium">{loggingOut ? t('loggingOut') : t('logout')}</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main header ───────────────────────────────────────────────────────────────

export default function AppHeader({
  title    = 'Operations',
  maxWidth = '2xl',
  actions,
}: AppHeaderProps) {
  return (
    <header className="bg-[#16205B] px-4 pt-12 pb-4 sticky top-0 z-40">
      <div className={`flex items-center justify-between gap-3 max-w-${maxWidth} mx-auto`}>

        {/* Left: Logo + screen title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <MfsLogo className="h-7 w-auto flex-shrink-0 text-[#EB6619]" />
          {title && (
            <>
              <span className="text-white/20 select-none font-light">|</span>
              <span className="text-white/80 text-sm font-semibold truncate">{title}</span>
            </>
          )}
        </div>

        {/* Right: sync dot + optional actions + dot menu */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <SyncDot />
          {actions}
          <DotMenu />
        </div>

      </div>
    </header>
  )
}
