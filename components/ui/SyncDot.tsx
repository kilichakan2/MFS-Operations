'use client'

export type SyncState = 'clean' | 'synced' | 'syncing' | 'stuck'

export interface SyncDotProps {
  state: SyncState
  /** Shape A: render the timestamp text beside the dot. */
  time?: string
  /** `sm` = inline (RecentActivity); `md` = header dot (AppHeader). */
  size?: 'sm' | 'md'
  'aria-label'?: string
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const DEFAULT_LABEL: Record<Exclude<SyncState, 'clean'>, string> = {
  synced: 'Synced',
  syncing: 'Syncing',
  stuck: 'Sync error',
}

/** Solid dot fill per state. */
const FILL: Record<Exclude<SyncState, 'clean'>, string> = {
  synced: 'bg-status-success-fill',
  syncing: 'bg-status-warning-fill',
  stuck: 'bg-status-error-fill',
}

/** Ring colour per state (only the bare/active states ring). */
const RING: Partial<Record<Exclude<SyncState, 'clean'>, string>> = {
  syncing: 'ring-2 ring-status-warning-soft',
  stuck: 'ring-2 ring-status-error-soft',
}

/**
 * Presentational sync indicator unifying the two live shapes (RecentActivity's
 * `{synced,time}` and AppHeader's queue-derived clean/syncing/stuck). The
 * caller computes `state` from the queue — this component never reads it.
 */
export function SyncDot({
  state,
  time,
  size,
  'aria-label': ariaLabel,
}: SyncDotProps) {
  if (state === 'clean') return null

  const resolvedSize = size ?? (time ? 'sm' : 'md')
  const dotSize = resolvedSize === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'
  const label = ariaLabel ?? DEFAULT_LABEL[state]

  const dot = (
    <span
      role="status"
      aria-label={label}
      className={cx(
        'inline-block rounded-full flex-shrink-0',
        dotSize,
        FILL[state],
        RING[state],
        state === 'syncing' && 'animate-pulse',
      )}
    />
  )

  if (time) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {dot}
        <span className="text-caption text-subtle">{time}</span>
      </span>
    )
  }
  return dot
}
