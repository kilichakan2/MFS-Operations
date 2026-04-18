/**
 * app/haccp/page.tsx
 *
 * HACCP Login Door — tablet-mounted, always-on screen.
 * Shows name cards for all active butcher + warehouse staff.
 * Tap a card → PIN keypad → authenticate → enter HACCP system.
 *
 * Reuses the existing /api/auth/login endpoint for PIN verification.
 * Always redirects to /haccp on success (ignores server-suggested redirect).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AuthKeypad                            from '@/components/AuthKeypad'
import MfsLogo                               from '@/components/MfsLogo'

interface StaffMember { id: string; name: string; role: 'butcher' | 'warehouse' }

// Initials from a name
function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ── Staff card ────────────────────────────────────────────────────────────────
function StaffCard({
  member,
  selected,
  onSelect,
}: {
  member:   StaffMember
  selected: boolean
  onSelect: (m: StaffMember) => void
}) {
  const isWarehouse = member.role === 'warehouse'
  const avatarBg    = isWarehouse ? 'bg-[#EB6619]' : 'bg-[#590129]'
  const ringClass   = selected
    ? 'ring-4 ring-[#EB6619] bg-white/20'
    : 'ring-1 ring-white/20 bg-white/10 active:bg-white/20 active:ring-[#EB6619]/60'

  return (
    <button
      type="button"
      aria-label={`Select ${member.name}`}
      aria-pressed={selected}
      onPointerDown={(e) => {
        e.preventDefault()
        if ('vibrate' in navigator) navigator.vibrate(8)
        onSelect(member)
      }}
      className={[
        'flex flex-col items-center gap-3 rounded-2xl p-5 transition-all duration-150 select-none',
        ringClass,
      ].join(' ')}
    >
      {/* Avatar */}
      <div className={['w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold', avatarBg].join(' ')}>
        {initials(member.name)}
      </div>

      {/* Name */}
      <p className="text-white font-semibold text-sm text-center leading-tight">
        {member.name}
      </p>

      {/* Role badge */}
      <span className={[
        'text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full',
        isWarehouse
          ? 'bg-[#EB6619]/20 text-[#EB6619]'
          : 'bg-[#590129]/40 text-white/80',
      ].join(' ')}>
        {isWarehouse ? 'Warehouse' : 'Butcher'}
      </span>
    </button>
  )
}

// ── Main door component ───────────────────────────────────────────────────────
export default function HaccpDoor() {
  const [staff,    setStaff]    = useState<StaffMember[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [pinError, setPinError] = useState<string | undefined>()
  const [reset,    setReset]    = useState(0)

  // Fetch staff
  useEffect(() => {
    fetch('/api/auth/haccp-team')
      .then((r) => r.json())
      .then((data) => {
        setStaff(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Handle card tap
  const handleSelect = useCallback((member: StaffMember) => {
    setSelected(member)
    setPinError(undefined)
    setReset((n) => n + 1)
  }, [])

  // Back to card grid
  const handleBack = useCallback(() => {
    setSelected(null)
    setPinError(undefined)
    setReset((n) => n + 1)
  }, [])

  // PIN submitted — call existing login API
  const handlePin = useCallback(async (pin: string) => {
    if (!selected) return

    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: selected.name, credential: pin }),
      })
      const data = await res.json()

      if (res.ok) {
        // Always land on /haccp regardless of server-suggested redirect
        window.location.href = '/haccp'
      } else {
        setPinError(data.error ?? 'Incorrect PIN — try again')
        setReset((n) => n + 1)
      }
    } catch {
      setPinError('Connection error — try again')
      setReset((n) => n + 1)
    }
  }, [selected])

  // ── PIN screen ──────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="min-h-screen bg-[#16205B] flex flex-col">
        {/* Back button */}
        <button
          type="button"
          onPointerDown={handleBack}
          className="absolute top-5 left-5 flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors z-10 select-none"
          aria-label="Back to staff selection"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">Back</span>
        </button>

        <AuthKeypad
          title={`${selected.name} — Enter PIN`}
          onComplete={handlePin}
          error={pinError}
          resetSignal={reset}
        />
      </div>
    )
  }

  // ── Staff selection screen ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col select-none">

      {/* Header */}
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <MfsLogo className="h-8 mb-4 text-white" />
        <p className="text-[#EB6619] text-xs font-bold tracking-[0.35em] uppercase">
          Process Room
        </p>
        <h1 className="text-white text-2xl font-bold tracking-wide mt-1">
          HACCP Compliance
        </h1>
        <p className="text-white/40 text-sm mt-2">
          Tap your name to continue
        </p>
      </div>

      {/* Divider */}
      <div className="mx-8 h-px bg-white/10" />

      {/* Staff grid */}
      <div className="flex-1 flex items-start justify-center px-6 pt-8 pb-10">
        {loading ? (
          <div className="flex items-center gap-3 text-white/40 text-sm mt-12">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading…
          </div>
        ) : staff.length === 0 ? (
          <p className="text-white/40 text-sm mt-12 text-center px-8">
            No staff found. Add butcher or warehouse users via the admin panel.
          </p>
        ) : (
          <div className="w-full max-w-sm grid grid-cols-2 gap-4">
            {staff.map((m) => (
              <StaffCard
                key={m.id}
                member={m}
                selected={false}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center pb-8 text-white/20 text-xs tracking-widest uppercase">
        MFS Global Ltd · Sheffield
      </div>
    </div>
  )
}
