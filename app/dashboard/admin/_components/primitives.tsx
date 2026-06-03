'use client'

/**
 * app/dashboard/admin/_components/primitives.tsx
 *
 * Token-faithful presentation primitives for the /dashboard/admin
 * restyle (UI overhaul Item 5a). Every colour resolves through a
 * mfs-* Tailwind utility backed by app/globals.css CSS variables.
 * No hex literals.
 *
 * Mapped to design-tokens.md component primitives:
 *   Card           → §7.3
 *   SectionLabel   → type ramp caption
 *   KpiTile        → Card variant + accent stripe
 *   RangeTabs      → pill segmented control (radius-pill, navy fill)
 *   ListRow/TableRow → §7.4 list/table primitives
 *   PageHeading    → eyebrow only (Q4 decision, no H1)
 *   EmptyState     → inline message in card body when data empty
 */

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode, CSSProperties } from 'react'

// ─── Accent token mapping ────────────────────────────────────────────────────

export type Accent = 'success' | 'warning' | 'danger' | 'navy'

/**
 * Maps an accent to the Tailwind utility class pair used for the
 * left stripe and the value text. Pure data — the unit suite asserts
 * the exact strings to prove no hex literals leak in.
 */
export function accentClassFor(accent: Accent): { stripe: string; value: string } {
  switch (accent) {
    case 'success': return { stripe: 'bg-mfs-success', value: 'text-mfs-success' }
    case 'warning': return { stripe: 'bg-mfs-warning', value: 'text-mfs-warning' }
    case 'danger':  return { stripe: 'bg-mfs-danger',  value: 'text-mfs-danger'  }
    case 'navy':    return { stripe: 'bg-mfs-navy',    value: 'text-mfs-navy'    }
  }
}

/**
 * Renders the Orders KPI tile sub-label per the addendum spec:
 *   "{placed} placed / {printed} printed / {completed} completed"
 * Single line. Keep zeros literal.
 */
export function formatOrdersSubLabel(counts: {
  placed: number; printed: number; completed: number
}): string {
  return `${counts.placed} placed / ${counts.printed} printed / ${counts.completed} completed`
}

// ─── Card primitive (§7.3) ──────────────────────────────────────────────────

export function Card({
  children, className = '', compact = false,
}: { children: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={[
      'bg-white border border-mfs-neutral-200 rounded-lg shadow-sm',
      compact ? 'p-4' : 'p-5',
      className,
    ].join(' ')}>
      {children}
    </div>
  )
}

// ─── Section label (type ramp caption, muted) ───────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-mfs-neutral-500">
      {children}
    </span>
  )
}

// ─── Card head — icon + uppercase title + optional count pill ───────────────

export function CardHead({
  icon, title, count, compact = false,
}: { icon?: ReactNode; title: string; count?: number | string; compact?: boolean }) {
  return (
    <div className={['flex items-center gap-3', compact ? 'mb-3' : 'mb-4'].join(' ')}>
      {icon && <span className="text-mfs-neutral-500 flex">{icon}</span>}
      <span className={[
        'flex-1 font-semibold tracking-[0.1em] uppercase text-mfs-black',
        compact ? 'text-xs' : 'text-sm',
      ].join(' ')}>
        {title}
      </span>
      {count != null && (
        <span className="
          text-[11px] font-semibold text-mfs-neutral-500
          bg-mfs-soft-neutral border border-mfs-neutral-200
          rounded-full px-2.5 py-0.5 min-w-[24px] text-center
        ">{count}</span>
      )}
    </div>
  )
}

// ─── List row (mobile stacked) ──────────────────────────────────────────────

export function ListRow({
  cells, accentClassName, last = false,
}: { cells: ReactNode; accentClassName?: string; last?: boolean }) {
  return (
    <div className={[
      'flex items-center gap-3 py-3',
      last ? '' : 'border-b border-mfs-neutral-200',
    ].join(' ')}>
      {accentClassName && (
        <span className={[
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          accentClassName,
        ].join(' ')} />
      )}
      {cells}
    </div>
  )
}

// ─── Table row + head (desktop grid) ────────────────────────────────────────

export function RowHead({ cols, widths }: { cols: string[]; widths: string[] }) {
  return (
    <div
      className="grid gap-3 pb-2 border-b border-mfs-neutral-200"
      style={{ gridTemplateColumns: widths.join(' ') }}
    >
      {cols.map((c, i) => (
        <span key={i} className="text-[10px] font-semibold tracking-[0.1em] uppercase text-mfs-neutral-500">
          {c}
        </span>
      ))}
    </div>
  )
}

export function TableRow({
  cells, widths, last = false,
}: { cells: ReactNode[]; widths: string[]; last?: boolean }) {
  return (
    <div
      className={[
        'grid gap-3 items-center py-3 text-[13px]',
        last ? '' : 'border-b border-mfs-neutral-200',
      ].join(' ')}
      style={{ gridTemplateColumns: widths.join(' ') }}
    >
      {cells.map((c, i) => <div key={i} className="min-w-0">{c}</div>)}
    </div>
  )
}

// ─── Stage pill — used by ProspectsCard rows ────────────────────────────────

export function StagePill({ dotClassName, label }: { dotClassName: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-mfs-neutral-700">
      <span className={['w-1.5 h-1.5 rounded-full', dotClassName].join(' ')} />
      {label}
    </span>
  )
}

// ─── KPI tile — Card variant + accent stripe + display-ramp value ───────────

export function KpiTile({
  value, label, sub, accent, icon, href, compact = false,
}: {
  value: string | number
  label: string
  sub?: string
  accent: Accent
  icon?: ReactNode
  href: Route
  compact?: boolean
}) {
  const cls = accentClassFor(accent)
  const padClass = compact ? 'p-4 pl-5' : 'p-5 pl-6'
  return (
    <Link href={href} className={[
      // h-full lets the tile stretch to its row height when the
      // grid item is wrapped (e.g. the Orders tile's col-span-2
      // wrapper on mobile). Without it the Link sits at intrinsic
      // height inside the stretched wrapper and breaks the row.
      'relative block h-full overflow-hidden no-underline text-inherit',
      'bg-white border border-mfs-neutral-200 rounded-lg shadow-sm',
      'transition-shadow hover:shadow-md',
      padClass,
    ].join(' ')}>
      {/* Accent stripe (left) */}
      <span className={['absolute left-0 top-0 bottom-0 w-1', cls.stripe].join(' ')} />

      {/* Header row: icon + label + tap-affordance pinned top-right */}
      <div className={['flex items-center gap-2 text-mfs-neutral-500', compact ? 'pr-5' : 'pr-6'].join(' ')}>
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="text-[11px] font-semibold tracking-wide uppercase leading-tight">
          {label}
        </span>
      </div>

      {/* Tap affordance */}
      <span aria-hidden className="absolute top-4 right-4 text-mfs-neutral-500">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7h10v10" /><path d="M7 17 17 7" />
        </svg>
      </span>

      {/* Value */}
      <div className={[
        'font-mfs-display font-normal leading-none tracking-[-0.02em] mt-3',
        compact ? 'text-3xl' : 'text-[44px]',
        cls.value,
      ].join(' ')}>
        {value}
      </div>

      {/* Sub-label — always wraps; we removed the legacy `tight`
          nowrap because at the desktop 1×5 grid each column is
          ~186px wide and the Orders sub-label ("12 placed / 8
          printed / 4 completed") overflowed under overflow-hidden. */}
      {sub && (
        <div className={[
          'text-mfs-neutral-700 mt-1.5',
          compact ? 'text-xs' : 'text-[13px]',
        ].join(' ')}>
          {sub}
        </div>
      )}
    </Link>
  )
}

// ─── Range tabs — pill segmented control ────────────────────────────────────

export function RangeTabs<T extends string>({
  value, onChange, ranges, scrollOnSmall = false,
}: {
  value: T
  onChange: (next: T) => void
  ranges: { id: T; label: string }[]
  scrollOnSmall?: boolean
}) {
  return (
    <div className={[
      'flex gap-1 bg-white border border-mfs-neutral-200 rounded-full p-1 w-fit max-w-full',
      scrollOnSmall ? 'range-scroll overflow-x-auto' : '',
    ].join(' ')}>
      {ranges.map(r => {
        const active = r.id === value
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            aria-pressed={active}
            className={[
              'border-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5',
              'text-[13px] font-semibold font-mfs-body transition-colors',
              active ? 'bg-mfs-navy text-white' : 'bg-transparent text-mfs-neutral-700 hover:text-mfs-black',
            ].join(' ')}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Page heading — eyebrow only, no H1 (Q4 decision) ───────────────────────

export function PageHeading({ children = 'Admin · Daily glance' }: { children?: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-mfs-neutral-500">
        {children}
      </div>
    </div>
  )
}

// ─── Empty state — inline message used inside list cards (Q14) ──────────────

export function EmptyState({ rangeLabel }: { rangeLabel: string }) {
  return (
    <p className="text-[13px] text-mfs-neutral-500 py-4 text-center">
      Nothing to surface — {rangeLabel}
    </p>
  )
}

// ─── Re-export shared utility for cards/stat-blocks to compose ──────────────

export type { CSSProperties }
