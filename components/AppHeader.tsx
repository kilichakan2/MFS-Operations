'use client'

import { useRouter }      from 'next/navigation'
import { useState }       from 'react'
import { useLiveQuery }   from 'dexie-react-hooks'
import { localDb }        from '@/lib/localDb'
import MfsLogo            from '@/components/MfsLogo'

interface AppHeaderProps {
  title?:    string
  maxWidth?: 'lg' | '2xl' | '4xl'
  actions?:  React.ReactNode
}

// ── Inline SyncStatus pill ────────────────────────────────────────────────────
// Reads the Dexie queue reactively. Hidden when everything is synced.
// Amber = pending (being retried). Red = stuck (retries exhausted).

function SyncStatus() {
  const unsynced = useLiveQuery(
    () => localDb.queue.filter(r => !r.synced).toArray(),
    [],
    []
  )

  const total  = unsynced.length
  const stuck  = unsynced.filter(r => (r.retries ?? 0) >= 3).length
  const pending = total - stuck

  if (total === 0) return null

  if (stuck > 0) {
    return (
      <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 text-red-200 text-[10px] font-bold">
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
        </svg>
        {stuck} stuck
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 text-amber-200 text-[10px] font-bold">
      <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      {pending} syncing
    </span>
  )
}

// ── Main header ───────────────────────────────────────────────────────────────

export default function AppHeader({
  title    = 'Operations',
  maxWidth = '2xl',
  actions,
}: AppHeaderProps) {
  const router                      = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.replace('/login')
    }
  }

  return (
    <header className="bg-[#16205B] px-5 pt-14 pb-5 sticky top-0 z-40">
      <div className={`flex items-center justify-between max-w-${maxWidth} mx-auto`}>

        {/* Logo + screen title */}
        <div className="flex items-center gap-3">
          <MfsLogo className="h-7 w-auto" />
          {title && (
            <>
              <span className="text-white/25 font-light select-none">|</span>
              <span className="text-white/80 text-sm font-semibold">{title}</span>
            </>
          )}
        </div>

        {/* Right slot: sync pill + any custom actions + logout */}
        <div className="flex items-center gap-2">
          <SyncStatus />

          {actions}

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Log out"
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
              loggingOut
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white active:scale-95',
            ].join(' ')}
          >
            {loggingOut ? (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd"/>
                <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.04a.75.75 0 1 0-1.06-1.06l-2.5 2.5a.75.75 0 0 0 0 1.06l2.5 2.5a.75.75 0 1 0 1.06-1.06l-1.048-1.04h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd"/>
              </svg>
            )}
            {loggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      </div>
    </header>
  )
}
