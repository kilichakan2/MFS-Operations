'use client'

import { useRouter }    from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { MoreVertical } from 'lucide-react'
import { localDb }      from '@/lib/localDb'
import { useLanguage }  from '@/lib/LanguageContext'
import MfsLogo          from '@/components/MfsLogo'

type Role = 'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | ''

// Local cookie helper — mirrors RoleNav.getClientRole.
// Self-contained per AppHeader's existing pattern (SyncDot, DotMenu).
function getClientRole(): Role {
  if (typeof document === 'undefined') return ''
  return (document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)?.[1] ?? '') as Role
}

interface AppHeaderProps {
  title?:    string
  maxWidth?: 'lg' | '2xl' | '4xl' | 'full'
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
        <MoreVertical className="w-5 h-5" />
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

// ── Desktop avatar dropdown ───────────────────────────────────────────────────

function DesktopAvatarMenu() {
  const router                      = useRouter()
  const [open, setOpen]             = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [role, setRole]             = useState<Role>('')
  const menuRef                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRole(getClientRole())
  }, [])

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

  const initial = role ? role.charAt(0).toUpperCase() : ''

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className={[
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          'bg-mfs-neutral-300 text-white font-semibold text-sm',
          'transition-colors hover:opacity-90',
        ].join(' ')}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-[#EDEAE1] overflow-hidden z-50">
          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd"/>
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.04a.75.75 0 1 0-1.06-1.06l-2.5 2.5a.75.75 0 0 0 0 1.06l2.5 2.5a.75.75 0 1 0 1.06-1.06l-1.048-1.04h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd"/>
            </svg>
            <span className="font-medium">Logout</span>
          </button>

          <div className="h-px bg-[#EDEAE1]" />

          {/* Settings — disabled placeholder for Item 7 */}
          <div
            aria-disabled="true"
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-mfs-neutral-400 cursor-not-allowed select-none"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
              <path fillRule="evenodd" d="M11.49 3.17a.75.75 0 0 0-.97-.55l-1.07.36-.36-1.07a.75.75 0 0 0-1.42 0l-.36 1.07-1.07-.36a.75.75 0 0 0-.94 1.07l.55 1.07-.55 1.07a.75.75 0 0 0 .94 1.07l1.07-.36.36 1.07a.75.75 0 0 0 1.42 0l.36-1.07 1.07.36a.75.75 0 0 0 .94-1.07l-.55-1.07.55-1.07a.75.75 0 0 0-.03-.52ZM10 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" clipRule="evenodd"/>
            </svg>
            <span className="font-medium">Settings</span>
          </div>
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
  const { lang, setLang, mounted } = useLanguage()

  return (
    <>
      {/* Mobile chrome — <md only */}
      <header
        className="bg-mfs-navy px-4 pb-3 sticky top-0 z-[999] md:hidden"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className={`flex items-center justify-between gap-3 max-w-${maxWidth} mx-auto min-h-[64px]`}>

          {/* Left: Logo only on mobile.
              The page title is intentionally NOT rendered in the
              mobile chrome variant — the MfsLogo SVG is intrinsically
              ~107px wide (its aspect ratio is preserved by w-auto on
              h-7) and consumes the entire left cluster at < 414px
              viewports, leaving 0px for a truncated title.
              PageHeading inside each page body (Item 5a's eyebrow
              pattern — e.g. "Admin · Daily glance") already shows
              the screen identifier, so no UX loss. Desktop chrome
              variant below still renders the title in its middle
              slot. */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <MfsLogo className="h-7 w-auto flex-shrink-0 text-mfs-orange" />
          </div>

          {/* Right: sync dot + optional actions + dot menu. */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <SyncDot />
            {/* Mobile-only compact override on the actions slot:
                tighten descendant <a> / <button> horizontal padding
                from the caller's desktop-sized px-3 to px-2, and
                inner icon-to-text gap-1.5 to gap-1. Scoped to the
                actions wrapper so DotMenu's 44×44px trigger button
                (the next sibling) is not affected. The mobile right
                cluster is flex-shrink-0 so it always renders at
                intrinsic width; before this fix the page title on
                the left was taking the entire shrinking burden,
                producing visibly-crunched-against-title actions.
                Tightening here doesn't require touching the page-
                level action JSX (out of scope per hotfix directive). */}
            {actions && (
              <div className="flex items-center gap-1.5
                [&_a]:px-2 [&_button]:px-2
                [&_a]:gap-1 [&_button]:gap-1">
                {actions}
              </div>
            )}
            <DotMenu />
          </div>

        </div>
      </header>

      {/* Desktop chrome — md+ only */}
      <header
        className="hidden md:flex bg-mfs-navy h-16 w-screen -ml-16 sticky top-0 z-[999] shadow-mfs-1 items-center px-6 gap-6"
      >
        {/* Left: MFS wordmark */}
        <div className="flex items-center flex-shrink-0">
          <MfsLogo className="h-7 w-auto flex-shrink-0 text-mfs-orange" />
        </div>

        {/* Middle: title (flex-1 to push the right slot to the edge) */}
        <div className="flex-1 min-w-0">
          {title && (
            <span className="text-white uppercase tracking-wider text-[22px] truncate block">
              {title}
            </span>
          )}
        </div>

        {/* Right: actions + sync dot + lang pill + avatar.
            The actions slot sits leftmost so per-page actions (HACCP
            shortcut, page Refresh) get visual primacy on desktop;
            SyncDot is a passive indicator further right. Match the
            cluster's gap-4 spacing convention. */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {actions}

          <SyncDot />

          {mounted && (
            <div className="flex items-center text-xs font-semibold rounded-md overflow-hidden bg-white/10">
              <button
                type="button"
                onClick={() => setLang('en')}
                aria-label="Switch to English"
                aria-pressed={lang === 'en'}
                className={[
                  'px-2.5 py-1 transition-colors',
                  lang === 'en' ? 'bg-mfs-orange text-mfs-navy' : 'bg-transparent text-white hover:bg-white/10',
                ].join(' ')}
              >
                EN
              </button>
              <span className="text-white/40 select-none">|</span>
              <button
                type="button"
                onClick={() => setLang('tr')}
                aria-label="Switch to Turkish"
                aria-pressed={lang === 'tr'}
                className={[
                  'px-2.5 py-1 transition-colors',
                  lang === 'tr' ? 'bg-mfs-orange text-mfs-navy' : 'bg-transparent text-white hover:bg-white/10',
                ].join(' ')}
              >
                TR
              </button>
            </div>
          )}

          <DesktopAvatarMenu />
        </div>
      </header>
    </>
  )
}
