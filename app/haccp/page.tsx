/**
 * app/haccp/page.tsx
 *
 * HACCP kiosk hub — rebuilt onto components/ui/ + semantic tokens (UI Phase 1,
 * ADR-0014 Tier A). Two states:
 *   1. No session  → Login door (name cards + centred PIN modal)
 *   2. Valid session → Home screen (tile board + status panel)
 *
 * Locked deltas applied: #1 per-tile SOP help, #2 no fake "Online" dot,
 * #3 honest 8-set progress (service), #4 operational (mid-day) diary surfaced
 * visually (NOT in the audio alarm), #5 "Goods In" label (route unchanged).
 */

'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { MfsIcon, MfsLogo } from '@/components/ui'
import { useHACCPAlarm } from '@/hooks/useHACCPAlarm'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import {
  StatusTile,
  ProgressRing,
  Banner,
  Modal,
  PinKeypad,
  type TileState,
} from '@/components/ui'
import {
  type TodayStatus,
  progressPct,
  coldState,
  coldBadge,
  roomState,
  roomBadge,
  deliveryState,
  deliveryBadge,
  cleaningState,
  cleaningBadge,
  minceState,
  minceBadge,
  returnState,
  returnBadge,
  buildOverdueList,
  buildMandatorySet,
  helpForTile,
  type MandatoryState,
} from './hubModel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember { id: string; name: string; role: string; secondary_roles?: string[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function useLiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

// ─── Icons (stroke=currentColor → inherit the tone colour) ──────────────────────

const PATHS: Record<string, ReactNode> = {
  cold: <path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />,
  room: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  goods: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4A1 1 0 0 0 17.5 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  mince: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2" />
      <path d="M5 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),
  return: (
    <path d="M3 12a9 9 0 0 1 9-9 9.7 9.7 0 0 1 6.7 2.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.7 9.7 0 0 1-6.7-2.7L3 16M8 16H3v5" />
  ),
  clean: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.7Z" />
    </>
  ),
  gauge: <path d="m12 14 4-4M3.3 14a9 9 0 1 1 17.4 0" />,
  reviews: (
    <>
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  training: (
    <path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
  ),
  allergens: (
    <>
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l6.4-6.4a2 2 0 0 0 0-2.8Z" />
      <path d="M7 7h.01" />
    </>
  ),
  recall: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  specs: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5M9 13h6M9 17h6" />
    </>
  ),
  fraud: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  defence: (
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  ),
  audit: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  documents: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5M9 13h6M9 17h6" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  alert: (
    <>
      <path d="M21.7 18 13.7 4a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
}

function Ic({ name, size = 24, className }: { name: keyof typeof PATHS; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

// ─── mandatory-set row token maps ─────────────────────────────────────────────

const MAND_DOT: Record<MandatoryState, string> = {
  complete: 'bg-status-success-fill',
  overdue: 'bg-status-error-fill',
  pending: 'bg-status-neutral-fill',
}
const MAND_WORD_TEXT: Record<MandatoryState, string> = {
  complete: 'text-status-success-text',
  overdue: 'text-status-error-text',
  pending: 'text-status-neutral-text',
}
const MAND_WORD: Record<MandatoryState, string> = {
  complete: 'Done',
  overdue: 'Overdue',
  pending: 'Pending',
}

// ─── Status Strip (phone / Sunmi) ──────────────────────────────────────────────

function StatusStrip({
  now,
  pct,
  overdueItems,
  s,
}: {
  now: Date
  pct: number
  overdueItems: string[]
  s: TodayStatus | null
}) {
  const [open, setOpen] = useState(false)
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const n = overdueItems.length

  return (
    <div className="rounded-lg border border-default bg-surface-raised overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <ProgressRing value={pct} size="sm" accent={n > 0 ? 'danger' : 'success'} />
        <div className="flex-1 min-w-0">
          <div className="text-body-sm font-semibold text-body">
            Today&rsquo;s checks · {s ? `${s.completed_checks} of ${s.total_checks} done` : '—'}
          </div>
          {n > 0 ? (
            <div className="text-caption font-semibold text-status-error-text">
              {n} check{n === 1 ? '' : 's'} overdue
            </div>
          ) : (
            <div className="text-caption font-semibold text-status-success-text">
              All checks on track
            </div>
          )}
        </div>
        <span className="font-text text-h3 font-bold text-body tabular-nums">{timeStr}</span>
        <Ic
          name="chevron"
          size={18}
          className={cx('text-subtle transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-subtle">
          <div className="text-caption font-semibold uppercase tracking-wide text-subtle my-2">
            Overdue now · {n}
          </div>
          {n > 0 ? (
            <div className="space-y-2">
              {overdueItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2.5 rounded-md bg-status-error-soft border border-status-error-border p-2.5"
                >
                  <Ic name="alert" size={16} className="text-status-error-fill flex-shrink-0 mt-0.5" />
                  <span className="text-body-sm font-semibold text-body">{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-caption font-semibold text-status-success-text pb-1">
              All checks on track
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ userName, userRole }: { userName: string; userRole: string }) {
  const isAdmin = userRole === 'admin'
  const now = useLiveClock()
  const [status, setStatus] = useState<TodayStatus | null>(null)
  const [specReviewDue, setSpecReviewDue] = useState(false)
  const [fraudReviewDue, setFraudReviewDue] = useState(false)
  const [defenceReviewDue, setDefenceReviewDue] = useState(false)
  const [helpSection, setHelp] = useState<string | null>(null)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const alarm = useHACCPAlarm(status)
  const push = usePushNotifications()

  const loadStatus = useCallback(() => {
    fetch('/api/haccp/today-status')
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStatus(d) })
      .catch(() => {})
    fetch('/api/haccp/product-specs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSpecReviewDue(d.review_due_count > 0) })
      .catch(() => {})
    fetch('/api/haccp/food-fraud')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFraudReviewDue(d.review_due === true) })
      .catch(() => {})
    fetch('/api/haccp/food-defence')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setDefenceReviewDue(d.review_due === true) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadStatus()
    refreshRef.current = setInterval(loadStatus, 5 * 60 * 1000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [loadStatus])

  const s = status
  const pct = progressPct(s)
  const overdue = buildOverdueList(s)
  const mandatory = buildMandatorySet(s)

  // secondary tiles with no delta — derived inline
  const calibState: TileState = !s ? 'neutral'
    : (s.calibration_done && !s.calibration_pass) ? 'deviation'
    : s.calibration_done ? 'complete'
    : s.calibration_due ? 'due'
    : 'neutral'
  const calibBadge = !s ? '—'
    : (s.calibration_done && !s.calibration_pass) ? 'Done · probe failed'
    : s.calibration_done ? 'Done'
    : 'Due this month'

  const reviewState: TileState = !s ? 'neutral'
    : (s.weekly_review_overdue || s.monthly_review_overdue) ? 'overdue'
    : (s.weekly_review_due || s.monthly_review_due) ? 'due'
    : 'complete'
  const reviewBadge = !s ? '—'
    : s.weekly_review_overdue ? 'Weekly overdue'
    : s.monthly_review_overdue ? 'Monthly overdue'
    : s.weekly_review_due ? 'Weekly due'
    : s.monthly_review_due ? 'Monthly due'
    : 'Up to date'

  const trainState: TileState = !s ? 'neutral'
    : s.training_overdue > 0 ? 'overdue'
    : s.training_due_soon > 0 ? 'due'
    : 'complete'
  const trainBadge = !s ? '—'
    : s.training_overdue > 0 ? `${s.training_overdue} overdue`
    : s.training_due_soon > 0 ? `${s.training_due_soon} due soon`
    : 'All current'

  function signOut() { window.location.href = '/api/auth/logout' }

  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const help = helpSection ? helpForTile(helpSection) : null

  return (
    <div className="min-h-screen bg-surface-base flex flex-col select-none">

      {/* Header — turns red while alarming (preserved behaviour) */}
      <header
        className={cx(
          'flex items-center justify-between gap-3 px-4 md:px-6 h-16 border-b flex-shrink-0 transition-colors duration-500',
          alarm.isAlarming ? 'bg-status-error-fill border-status-error-border' : 'bg-surface-raised border-default',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <MfsIcon className={cx('h-7 w-7', alarm.isAlarming ? 'text-inverse' : 'text-body')} />
          <div className="w-px h-6 bg-border" />
          <div className="min-w-0 leading-tight">
            <div className={cx('font-display text-h3', alarm.isAlarming ? 'text-inverse' : 'text-body')}>
              Food Safety
            </div>
            <div className={cx('text-caption font-semibold', alarm.isAlarming ? 'text-inverse' : 'text-subtle')}>
              <span className="hidden md:inline">MFS Sheffield · S3 8DG · </span>HACCP
            </div>
          </div>
          {alarm.isAlarming && (
            <span className="ml-1 animate-pulse rounded-pill border border-current px-2 py-0.5 text-caption font-bold text-inverse">
              {alarm.overdueCount} OVERDUE
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={() => { window.location.href = '/haccp/admin' }}
              className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-action-primary bg-surface-raised text-action-primary font-semibold text-body-sm"
            >
              <Ic name="settings" size={17} />
              <span className="hidden md:inline">Admin panel</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { window.location.href = '/haccp/documents' }}
            className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-default bg-surface-raised text-muted font-semibold text-body-sm"
          >
            <Ic name="documents" size={18} />
            <span className="hidden md:inline">Documents</span>
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-surface-base border border-default px-2 py-1">
            <span className="w-8 h-8 rounded-full bg-action-primary text-on-action flex items-center justify-center text-caption font-bold">
              {initials(userName)}
            </span>
            <div className="hidden md:block min-w-0">
              <div className="text-body-sm font-semibold text-body truncate">{userName}</div>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-default bg-surface-raised text-muted"
            >
              <Ic name="logout" size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* Safety banners */}
      <div className="flex flex-col gap-2 px-4 pt-3 md:px-6 flex-shrink-0 empty:hidden">
        {/* Overdue alarm — tap the whole banner to sound (iOS needs a direct gesture) */}
        {alarm.isAlarming && (
          <Banner
            tone="danger"
            onClick={() => alarm.fireAlarm()}
            icon={<Ic name="bell" size={20} className="animate-pulse" />}
            title="Overdue — tap to sound alarm"
          >
            {alarm.overdueLabels.join(' · ')}
          </Banner>
        )}

        {/* Push permission prompt */}
        {push.supported && push.permission === 'default' && !push.subscribed && (
          <Banner tone="warning" icon={<Ic name="bell" size={19} />} title="Enable overdue alarms">
            <div className="flex items-center gap-3">
              <span className="flex-1 min-w-0">Get notified even when the iPad is locked</span>
              <button
                type="button"
                onClick={async () => { await push.subscribe() }}
                className="flex-shrink-0 h-9 px-4 rounded-md bg-action-primary text-on-action font-semibold text-body-sm"
              >
                Enable
              </button>
            </div>
          </Banner>
        )}

        {/* Alarms-active strip */}
        {push.supported && push.subscribed && !alarm.isAlarming && (
          <div className="flex items-center gap-2 rounded-md bg-status-success-soft border border-status-success-border px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-status-success-fill animate-pulse" />
            <span className="text-caption font-semibold text-status-success-text">
              Alarms active on this device
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 p-4 md:p-6 overflow-y-auto pb-20">
          {/* phone / Sunmi strip */}
          <div className="md:hidden mb-4">
            <StatusStrip now={now} pct={pct} overdueItems={overdue} s={s} />
          </div>

          <div className="text-caption font-semibold uppercase tracking-wide text-subtle mb-3">
            Daily checks
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatusTile icon={<Ic name="cold" size={28} />} label="Cold Storage" state={coldState(s)}
              statusLine={coldBadge(s)} onTap={() => { window.location.href = '/haccp/cold-storage' }}
              onHelp={() => setHelp('cold_storage')} />
            <StatusTile icon={<Ic name="room" size={28} />} label="Process Room" state={roomState(s)}
              statusLine={roomBadge(s)} onTap={() => { window.location.href = '/haccp/process-room' }}
              onHelp={() => setHelp('processing_room')} />
            {/* delta #5: "Goods In" label; route stays /haccp/delivery, help key 'delivery' */}
            <StatusTile icon={<Ic name="goods" size={28} />} label="Goods In" state={deliveryState(s)}
              statusLine={deliveryBadge(s)} onTap={() => { window.location.href = '/haccp/delivery' }}
              onHelp={() => setHelp('delivery')} />
            <StatusTile icon={<Ic name="mince" size={28} />} label="Mince / Prep" state={minceState(s)}
              statusLine={minceBadge(s)} onTap={() => { window.location.href = '/haccp/mince' }}
              onHelp={() => setHelp('mince')} />
            <StatusTile icon={<Ic name="return" size={28} />} label="Product Return" state={returnState(s)}
              statusLine={returnBadge(s)} onTap={() => { window.location.href = '/haccp/product-return' }}
              onHelp={() => setHelp('product_return')} />
            <StatusTile icon={<Ic name="clean" size={28} />} label="Cleaning" state={cleaningState(s)}
              statusLine={cleaningBadge(s)} onTap={() => { window.location.href = '/haccp/cleaning' }}
              onHelp={() => setHelp('cleaning')} />
          </div>

          <div className="text-caption font-semibold uppercase tracking-wide text-subtle mt-7 mb-3">
            Records &amp; compliance
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <StatusTile size="small" icon={<Ic name="gauge" size={20} />} label="Calibration" state={calibState}
              statusLine={calibBadge} onTap={() => { window.location.href = '/haccp/calibration' }}
              onHelp={() => setHelp('calibration')} />
            <StatusTile size="small" icon={<Ic name="reviews" size={20} />} label="Reviews" state={reviewState}
              statusLine={reviewBadge} onTap={() => { window.location.href = '/haccp/reviews' }}
              onHelp={() => setHelp('reviews')} />
            <StatusTile size="small" icon={<Ic name="people" size={20} />} label="People" state="neutral"
              statusLine="Event only" onTap={() => { window.location.href = '/haccp/people' }}
              onHelp={() => setHelp('people')} />
            <StatusTile size="small" icon={<Ic name="training" size={20} />} label="Training" state={trainState}
              statusLine={trainBadge} onTap={() => { window.location.href = '/haccp/training' }}
              onHelp={() => setHelp('training')} />
            <StatusTile size="small" icon={<Ic name="allergens" size={20} />} label="Allergens" state="neutral"
              statusLine="View assessment" onTap={() => { window.location.href = '/haccp/allergens' }}
              onHelp={() => setHelp('allergens')} />
            <StatusTile size="small" icon={<Ic name="recall" size={20} />} label="Recall Contacts" state="neutral"
              statusLine="View contacts" onTap={() => { window.location.href = '/haccp/recall' }}
              onHelp={() => setHelp('recall')} />
            <StatusTile size="small" icon={<Ic name="specs" size={20} />} label="Product Specs"
              state={specReviewDue ? 'due' : 'neutral'} statusLine={specReviewDue ? 'Review due' : 'View specs'}
              onTap={() => { window.location.href = '/haccp/product-specs' }} onHelp={() => setHelp('product-specs')} />
            <StatusTile size="small" icon={<Ic name="fraud" size={20} />} label="Food Fraud"
              state={fraudReviewDue ? 'due' : 'neutral'} statusLine={fraudReviewDue ? 'Review due' : 'Current'}
              onTap={() => { window.location.href = '/haccp/food-fraud' }} onHelp={() => setHelp('food-fraud')} />
            <StatusTile size="small" icon={<Ic name="defence" size={20} />} label="Food Defence"
              state={defenceReviewDue ? 'due' : 'neutral'} statusLine={defenceReviewDue ? 'Review due' : 'Current'}
              onTap={() => { window.location.href = '/haccp/food-defence' }} onHelp={() => setHelp('food-defence')} />
            {isAdmin && (
              <StatusTile size="small" icon={<Ic name="audit" size={20} />} label="Audit" state="neutral"
                statusLine="View all records" onTap={() => { window.location.href = '/haccp/audit' }}
                onHelp={() => setHelp('audit')} />
            )}
          </div>
        </main>

        {/* Side panel — iPad+ only */}
        <aside className="hidden md:flex w-[326px] flex-shrink-0 border-l border-default bg-surface-raised p-6 flex-col gap-5 overflow-y-auto">
          <div>
            <div className="font-text text-[38px] leading-none font-bold text-body tabular-nums">{timeStr}</div>
            <div className="text-body-sm text-subtle mt-1">{dateStr}</div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-base border border-default">
            <ProgressRing value={pct} size="lg" accent="success" />
            <div className="min-w-0">
              <div className="text-caption font-semibold uppercase tracking-wide text-subtle">
                Today&rsquo;s checks
              </div>
              <div className="font-display text-h2 text-body mt-1">
                {s ? `${s.completed_checks} of ${s.total_checks}` : '—'}
              </div>
              <div className="text-body-sm text-subtle mt-0.5">mandatory daily set</div>
            </div>
          </div>

          {/* F4 — the honest-8 mandatory checklist */}
          <div>
            <div className="text-caption font-semibold uppercase tracking-wide text-subtle mb-2">
              Mandatory set · {mandatory.length}
            </div>
            {mandatory.map((m) => (
              <div key={m.label} className="flex items-center gap-3 py-2 border-b border-subtle">
                <span className={cx('w-2.5 h-2.5 rounded-full flex-shrink-0', MAND_DOT[m.state])} />
                <span className="flex-1 min-w-0 text-body-sm text-body">{m.label}</span>
                <span className={cx('text-caption font-semibold', MAND_WORD_TEXT[m.state])}>
                  {MAND_WORD[m.state]}
                </span>
              </div>
            ))}
          </div>

          {overdue.length > 0 && (
            <div>
              <div className="text-caption font-semibold uppercase tracking-wide text-status-error-text mb-2">
                Overdue now · {overdue.length}
              </div>
              <div className="space-y-2">
                {overdue.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-lg bg-status-error-soft border border-status-error-border p-3"
                  >
                    <Ic name="alert" size={18} className="text-status-error-fill flex-shrink-0 mt-0.5" />
                    <div className="text-body-sm font-semibold text-body">{item}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Per-tile SOP help sheet (delta #1) */}
      <Modal
        open={!!help}
        onOpenChange={(o) => { if (!o) setHelp(null) }}
        variant="sheet"
        title={help?.title}
        description={help?.ref}
      >
        {help && (
          <div className="whitespace-pre-line text-body-sm text-muted leading-relaxed">
            {help.text}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Login Door ─────────────────────────────────────────────────────────────

function StaffCard({ member, onSelect }: { member: StaffMember; onSelect: (m: StaffMember) => void }) {
  const isWh = member.role === 'warehouse'
  return (
    <button
      type="button"
      aria-label={`Select ${member.name}`}
      onPointerDown={(e) => { e.preventDefault(); if ('vibrate' in navigator) navigator.vibrate(8); onSelect(member) }}
      className="flex flex-col items-start gap-3.5 rounded-lg border border-default bg-surface-raised p-4 text-left transition-transform active:scale-[0.98] select-none"
    >
      <span
        className={cx(
          'w-12 h-12 rounded-full flex items-center justify-center text-on-action text-body-lg font-bold',
          isWh ? 'bg-action-primary' : 'bg-action-secondary',
        )}
      >
        {initials(member.name)}
      </span>
      <div className="min-w-0">
        <div className="text-body font-semibold text-body">{member.name}</div>
        <div className="text-body-sm text-subtle mt-0.5">{isWh ? 'Warehouse' : 'Butcher'}</div>
      </div>
      {(member.secondary_roles ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(member.secondary_roles ?? []).map((r) => (
            <span key={r} className="text-caption font-semibold px-1.5 py-0.5 rounded bg-surface-sunken text-subtle">
              +{r}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

function LoginDoor() {
  const now = useLiveClock()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [pinError, setPinError] = useState<string | undefined>()
  const [reset, setReset] = useState(0)

  useEffect(() => {
    fetch('/api/auth/haccp-team')
      .then((r) => r.json())
      .then((d) => { setStaff(Array.isArray(d) ? d : []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handlePin = useCallback(async (pin: string) => {
    if (!selected) return
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selected.name, credential: pin }),
      })
      const data = await res.json()
      if (res.ok) {
        // Mark this as a HACCP kiosk session so the main app doesn't redirect
        // this user to /screen1 (dispatch log).
        document.cookie = 'mfs_haccp_session=1; path=/; max-age=86400; samesite=lax'
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

  function closePin() {
    setSelected(null)
    setPinError(undefined)
    setReset((n) => n + 1)
  }

  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-surface-base flex flex-col select-none">
      <header className="flex items-center justify-between gap-3 px-4 md:px-6 h-16 border-b border-default flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <MfsIcon className="h-7 w-7 text-body" />
          <div className="w-px h-6 bg-border" />
          <div className="leading-tight">
            <div className="font-display text-h3 text-body">Food Safety</div>
            <div className="text-caption font-semibold text-subtle">MFS Sheffield · HACCP kiosk</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-text text-h2 font-bold text-body tabular-nums leading-none">{timeStr}</div>
          <div className="text-caption font-semibold text-subtle mt-1">{dateStr}</div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="font-display text-h2 text-body">Tap your name to sign in</div>
        <div className="text-body-sm text-subtle mt-1 mb-6">
          A 4-digit PIN keeps every record signed to you.
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-subtle text-body-sm py-16 justify-center">
            <span className="w-5 h-5 rounded-full border-2 border-default border-t-action-primary animate-[mfs-spin_0.8s_linear_infinite]" />
            Loading…
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-14">
            <span className="w-14 h-14 rounded-lg bg-surface-sunken flex items-center justify-center text-subtle">
              <Ic name="people" size={26} />
            </span>
            <div className="text-body font-semibold text-body">No staff found</div>
            <div className="text-body-sm text-subtle max-w-[34ch]">
              No team members are set up for this site. An admin can add staff from the main app.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 max-w-3xl">
            {staff.map((m) => <StaffCard key={m.id} member={m} onSelect={setSelected} />)}
          </div>
        )}
      </main>

      <div className="flex gap-3 p-4 md:p-6 border-t border-default bg-surface-raised flex-shrink-0">
        <button
          type="button"
          onPointerDown={() => { window.location.href = '/haccp/visitor' }}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-action-primary text-on-action font-semibold text-body py-3"
        >
          <Ic name="people" size={19} />
          Visitor sign-in
        </button>
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); window.location.href = '/' }}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-action-ghost-border bg-transparent text-action-ghost-fg font-semibold text-body py-3"
        >
          Back to main app
        </button>
      </div>

      {/* F3 — centred PIN modal using the kit PinKeypad (auth logic preserved) */}
      <Modal
        open={!!selected}
        onOpenChange={(o) => { if (!o) closePin() }}
        variant="center"
        title={selected ? `Hi, ${selected.name.split(' ')[0]}` : undefined}
        description={selected ? selected.name : undefined}
      >
        {selected && (
          <PinKeypad
            onComplete={handlePin}
            error={pinError}
            resetSignal={reset}
            status="Enter your 4-digit PIN"
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Root — checks session, shows door or home ────────────────────────────────

export default function HaccpRoot() {
  const [authState, setAuthState] = useState<'checking' | 'door' | 'home'>('checking')
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')

  useEffect(() => {
    const role = document.cookie.split(';').find((c) => c.trim().startsWith('mfs_role='))?.split('=')[1]
    const name = document.cookie.split(';').find((c) => c.trim().startsWith('mfs_name='))?.split('=')[1]

    if (role && ['warehouse', 'butcher', 'admin'].includes(role) && name) {
      setUserName(decodeURIComponent(name))
      setUserRole(role)
      setAuthState('home')
    } else {
      setAuthState('door')
    }
  }, [])

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <MfsLogo className="h-10 w-auto text-body opacity-40" />
      </div>
    )
  }

  if (authState === 'home') return <HomeScreen userName={userName} userRole={userRole} />
  return <LoginDoor />
}
