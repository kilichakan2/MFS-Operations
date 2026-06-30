'use client'

import type { ReactNode } from 'react'

/** Traffic-light status shared across the HACCP launcher tiles. */
export type TileState = 'complete' | 'overdue' | 'due' | 'deviation' | 'neutral'
export type StatusTileSize = 'large' | 'small'

export interface StatusTileProps {
  /** Caller-supplied leading icon (no icon library). */
  icon: ReactNode
  label: string
  /** One-line status (e.g. "AM done · PM overdue"). */
  statusLine: ReactNode
  state: TileState
  /** `large` = primary daily-check tile; `small` = compliance/records tile. */
  size?: StatusTileSize
  onTap: () => void
  /** When set, renders the "?" help affordance. */
  onHelp?: () => void
  /** aria-label for the help affordance. Default: `Help for {label}`. */
  helpLabel?: string
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * state → semantic token classes. Written as LITERAL class strings (not
 * `bg-status-${family}-soft`) so Tailwind's content scanner keeps them.
 */
const TILE_TONE: Record<
  TileState,
  { shell: string; dot: string; line: string; icon: string }
> = {
  complete: {
    shell: 'bg-status-success-soft border-status-success-border',
    dot: 'bg-status-success-fill',
    line: 'text-status-success-text',
    icon: 'text-status-success-text',
  },
  overdue: {
    shell: 'bg-status-error-soft border-status-error-border',
    dot: 'bg-status-error-fill',
    line: 'text-status-error-text',
    icon: 'text-status-error-text',
  },
  due: {
    shell: 'bg-status-warning-soft border-status-warning-border',
    dot: 'bg-status-warning-fill',
    line: 'text-status-warning-text',
    icon: 'text-status-warning-text',
  },
  deviation: {
    shell: 'bg-status-deviation-soft border-status-deviation-border',
    dot: 'bg-status-deviation-fill',
    line: 'text-status-deviation-text',
    icon: 'text-status-deviation-text',
  },
  neutral: {
    shell: 'bg-status-neutral-soft border-status-neutral-border',
    dot: 'bg-status-neutral-fill',
    line: 'text-status-neutral-text',
    icon: 'text-status-neutral-text',
  },
}

/**
 * Tappable launcher tile: leading icon + label + a status dot + one-line
 * status + an optional "?" help affordance, on a large tap target. `state`
 * drives the whole colour family via tokens. Unlike `KpiTile` (a KPI display)
 * this is a navigation/launch surface — hence a first-party primitive.
 */
export function StatusTile({
  icon,
  label,
  statusLine,
  state,
  size = 'large',
  onTap,
  onHelp,
  helpLabel,
}: StatusTileProps) {
  const tone = TILE_TONE[state]
  const large = size === 'large'

  return (
    <div className={cx('relative overflow-hidden rounded-lg border', tone.shell)}>
      <button
        type="button"
        onClick={() => onTap()}
        className={cx(
          'flex w-full h-full flex-col justify-between text-left select-none',
          'bg-transparent cursor-pointer transition-transform active:scale-[0.98]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          large ? 'gap-4 p-5 min-h-[124px]' : 'gap-2.5 p-4 min-h-[88px]',
        )}
      >
        {large ? (
          <>
            <span className={cx('inline-flex flex-shrink-0', tone.icon)} aria-hidden="true">
              {icon}
            </span>
            <div className="min-w-0">
              <div className="font-display text-h3 text-body leading-tight">{label}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cx('w-2 h-2 rounded-full flex-shrink-0', tone.dot)}
                />
                <span className={cx('text-body-sm font-semibold', tone.line)}>
                  {statusLine}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={cx('inline-flex flex-shrink-0', tone.icon)} aria-hidden="true">
                {icon}
              </span>
              <span className="font-text font-semibold text-body-sm text-body truncate">
                {label}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className={cx('w-1.5 h-1.5 rounded-full flex-shrink-0', tone.dot)}
              />
              <span className={cx('text-caption font-semibold truncate', tone.line)}>
                {statusLine}
              </span>
            </div>
          </>
        )}
      </button>

      {onHelp && (
        <button
          type="button"
          aria-label={helpLabel ?? `Help for ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onHelp()
          }}
          className={cx(
            'absolute top-2.5 right-2.5 z-10 inline-flex items-center justify-center',
            'w-7 h-7 rounded-full border border-default bg-surface-raised',
            'text-muted font-display text-body-sm cursor-pointer',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        >
          ?
        </button>
      )}
    </div>
  )
}
