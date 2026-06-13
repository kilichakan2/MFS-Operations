'use client'

/**
 * app/dashboard/admin/_components/cards.tsx
 *
 * Six list/chart cards consumed by the /dashboard/admin restyle
 * (UI overhaul Item 5a). Each card composes the primitives from
 * ./primitives.tsx around the shape returned by /api/dashboard.
 *
 * Empty-state behaviour (Q14):
 *   - List cards (Open complaints / At-risk / Commitments / Visits
 *     by rep / Prospects) render an inline EmptyState when data is
 *     empty.
 *   - Chart cards (Complaint categories donut) return null when
 *     total === 0 — the section hides entirely.
 *
 * Donut sizing (C5 decision): 132px square at desktop / 110px at
 * compact mobile, with a 22px ring thickness. Picked to mirror the
 * mockup's visual weight (centre numeral + legend reads cleanly at
 * both breakpoints) without crushing the card padding.
 */

import type { Route } from 'next'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import {
  Card, CardHead, ListRow, RowHead, TableRow, StagePill, EmptyState,
} from './primitives'

// ─── Pure helpers (tested by tests/unit/dashboard-admin/cards.test.ts) ──────

/**
 * Maps a prospect stage to the Tailwind colour-dot class used inside
 * StagePill. Unknown stages fall back to navy so nothing renders
 * uncoloured.
 */
export function pickStageColor(stage: string): string {
  switch (stage) {
    case 'Quoted':    return 'bg-mfs-orange'
    case 'Sampling':  return 'bg-mfs-sand'
    case 'Contacted': return 'bg-mfs-navy'
    default:          return 'bg-mfs-navy'
  }
}

/**
 * Returns a NEW array of reps ordered by total descending. Original
 * array is not mutated. Non-numeric totals are treated as 0.
 */
export function sortRepsByCountDesc<R extends { total: number }>(reps: R[]): R[] {
  return [...reps].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
}

/**
 * The 5-colour mfs-* brand cycle used as Recharts Pie segment fills
 * for the complaint-categories donut. Uses CSS var() strings rather
 * than Tailwind class names because Recharts' `fill` prop expects a
 * raw colour value, not a class.
 */
export const categoryColorCycle: string[] = [
  'var(--mfs-maroon)',
  'var(--mfs-orange)',
  'var(--mfs-navy)',
  'var(--mfs-sand)',
  'var(--mfs-red)',
]

// ─── Data shapes consumed (mirrors page.tsx DashboardData) ──────────────────

interface OpenComplaint { id: string; customer: string; category: string; loggedBy: string; hoursAgo: number }
interface AtRiskAccount { id: string; customer: string; outcome: 'at_risk' | 'lost'; rep: string; hoursAgo: number }
interface UnreviewedCommitment { id: string; customer: string; detail: string; rep: string; hoursAgo: number }
interface WeekVisitByRep { rep: string; total: number }
interface WeekComplaintByCategory { category: string; count: number }
interface Prospect { name: string; postcode: string; outcome: string; visitType: string; rep: string }

// ─── 1. Open complaints (>48h unresolved) ───────────────────────────────────

export function OpenComplaintsCard({
  items, compact = false, rangeLabel, href,
}: { items: OpenComplaint[]; compact?: boolean; rangeLabel: string; href?: Route }) {
  return (
    <Card compact={compact} href={href}>
      <CardHead title="Open complaints" count={items.length} compact={compact} />
      {items.length === 0 ? <EmptyState rangeLabel={rangeLabel} /> : (
        compact ? (
          <div>
            {items.map((c, i) => (
              <ListRow
                key={c.id}
                accentClassName="bg-mfs-danger"
                last={i === items.length - 1}
                cells={
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-sm text-mfs-black truncate flex-1 min-w-0">
                        {c.customer}
                      </span>
                      <span className="text-[13px] font-semibold text-mfs-danger flex-shrink-0">
                        {c.hoursAgo}h
                      </span>
                    </div>
                    <div className="text-xs text-mfs-neutral-500 mt-0.5">
                      {c.category} · {c.loggedBy}
                    </div>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <>
            <RowHead cols={['Account', 'Category', 'Age', 'Owner']} widths={['1fr', '120px', '64px', '110px']} />
            <div>
              {items.map((c, i) => (
                <TableRow
                  key={c.id}
                  last={i === items.length - 1}
                  widths={['1fr', '120px', '64px', '110px']}
                  cells={[
                    <strong key="customer" className="font-semibold text-mfs-black">{c.customer}</strong>,
                    <span key="category" className="text-mfs-neutral-700">{c.category}</span>,
                    <span key="hoursAgo" className="text-mfs-danger font-semibold">{c.hoursAgo}h</span>,
                    <span key="loggedBy" className="text-mfs-neutral-700">{c.loggedBy}</span>,
                  ]}
                />
              ))}
            </div>
          </>
        )
      )}
    </Card>
  )
}

// ─── 2. At-risk accounts ────────────────────────────────────────────────────

export function AtRiskCard({
  items, compact = false, rangeLabel, href,
}: { items: AtRiskAccount[]; compact?: boolean; rangeLabel: string; href?: Route }) {
  return (
    <Card compact={compact} href={href}>
      <CardHead title="At-risk accounts" count={items.length} compact={compact} />
      {items.length === 0 ? <EmptyState rangeLabel={rangeLabel} /> : (
        compact ? (
          <div>
            {items.map((a, i) => (
              <ListRow
                key={a.id}
                accentClassName={a.outcome === 'lost' ? 'bg-mfs-danger' : 'bg-mfs-warning'}
                last={i === items.length - 1}
                cells={
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-sm text-mfs-black truncate flex-1 min-w-0">
                        {a.customer}
                      </span>
                      <span className="text-[13px] font-semibold text-mfs-black flex-shrink-0">
                        {a.outcome === 'lost' ? 'LOST' : 'AT RISK'}
                      </span>
                    </div>
                    <div className="text-xs text-mfs-neutral-500 mt-0.5">
                      {a.rep} · {a.hoursAgo}h ago
                    </div>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <>
            <RowHead cols={['Account', 'Reason', 'Rep']} widths={['1fr', '1fr', '110px']} />
            <div>
              {items.map((a, i) => (
                <TableRow
                  key={a.id}
                  last={i === items.length - 1}
                  widths={['1fr', '1fr', '110px']}
                  cells={[
                    <strong key="customer" className="font-semibold text-mfs-black">{a.customer}</strong>,
                    <span key="outcome" className={a.outcome === 'lost' ? 'text-mfs-danger font-semibold' : 'text-mfs-warning font-semibold'}>
                      {a.outcome === 'lost' ? 'Lost' : 'At risk'}
                    </span>,
                    <span key="rep" className="text-mfs-neutral-700">{a.rep}</span>,
                  ]}
                />
              ))}
            </div>
          </>
        )
      )}
    </Card>
  )
}

// ─── 3. Unreviewed commitments ──────────────────────────────────────────────

export function CommitmentsCard({
  items, compact = false, rangeLabel, href,
}: { items: UnreviewedCommitment[]; compact?: boolean; rangeLabel: string; href?: Route }) {
  return (
    <Card compact={compact} href={href}>
      <CardHead title="Unreviewed commitments" count={items.length} compact={compact} />
      {items.length === 0 ? <EmptyState rangeLabel={rangeLabel} /> : (
        <div>
          {items.map((c, i) => {
            const overdue = c.hoursAgo > 24
            return (
              <ListRow
                key={c.id}
                accentClassName={overdue ? 'bg-mfs-danger' : 'bg-mfs-navy'}
                last={i === items.length - 1}
                cells={
                  <div className="flex-1 min-w-0 flex justify-between gap-2 items-center">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-mfs-black truncate">
                        {c.customer}
                      </div>
                      <div className="text-xs text-mfs-neutral-500 mt-0.5 truncate">
                        {c.detail || c.rep}
                      </div>
                    </div>
                    <span className={[
                      'text-xs font-semibold whitespace-nowrap rounded-full border px-2.5 py-1',
                      overdue
                        ? 'text-mfs-danger border-mfs-danger/30 bg-mfs-danger/10'
                        : 'text-mfs-neutral-700 border-mfs-neutral-200 bg-mfs-soft-neutral',
                    ].join(' ')}>
                      {overdue ? 'Overdue' : `${c.hoursAgo}h`}
                    </span>
                  </div>
                }
              />
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── 4. Visits by rep (single bar, no warning treatment — Q6) ───────────────

export function VisitsByRepCard({
  reps, compact = false, rangeLabel, href,
}: { reps: WeekVisitByRep[]; compact?: boolean; rangeLabel: string; href?: Route }) {
  const sorted = sortRepsByCountDesc(reps)
  const max    = sorted.length > 0 ? Math.max(...sorted.map(r => r.total)) : 1
  return (
    <Card compact={compact} href={href}>
      <CardHead title="Visits by rep" count={sorted.length} compact={compact} />
      {sorted.length === 0 ? <EmptyState rangeLabel={rangeLabel} /> : (
        <div className="flex flex-col gap-4">
          {sorted.map(v => {
            const pct = max > 0 ? (v.total / max) * 100 : 0
            return (
              <div key={v.rep} className="flex items-center gap-3">
                <span className="flex items-center gap-2 w-[104px] flex-shrink-0">
                  <span className="text-[13px] text-mfs-black font-medium whitespace-nowrap">
                    {v.rep}
                  </span>
                </span>
                <span className="flex-1 h-2 bg-mfs-soft-neutral rounded-full overflow-hidden">
                  <span
                    className="block h-full bg-mfs-navy rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="text-[13px] font-semibold text-mfs-black w-5 text-right">
                  {v.total}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── 5. Complaint categories (Recharts donut + legend) ──────────────────────

export function ComplaintCategoriesCard({
  categories, compact = false, href,
}: { categories: WeekComplaintByCategory[]; compact?: boolean; href?: Route }) {
  const total = categories.reduce((s, c) => s + c.count, 0)
  // Hide entirely when nothing to plot (Q14)
  if (total === 0) return null

  const size = compact ? 110 : 132
  return (
    <Card compact={compact} href={href}>
      <CardHead title="Complaint categories" count={total} compact={compact} />
      <div className="flex items-center gap-5 flex-wrap">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <ResponsiveContainer width={size} height={size}>
            <PieChart>
              <Pie
                data={categories}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={(size - 44) / 2}
                outerRadius={size / 2}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
              >
                {categories.map((_, i) => (
                  <Cell key={i} fill={categoryColorCycle[i % categoryColorCycle.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Centre overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mfs-display text-[28px] leading-none text-mfs-black">
              {total}
            </span>
            <span className="text-[10px] tracking-wider uppercase text-mfs-neutral-500">
              this week
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-[150px]">
          {categories.map((c, i) => (
            <div key={c.category} className="flex items-center gap-3">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: categoryColorCycle[i % categoryColorCycle.length] }}
              />
              <span className="text-[13px] text-mfs-neutral-700 flex-1 capitalize">
                {c.category}
              </span>
              <span className="text-[13px] font-semibold text-mfs-black">
                {c.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ─── 6. Prospects this week ─────────────────────────────────────────────────

export function ProspectsCard({
  items, compact = false, rangeLabel, href,
}: { items: Prospect[]; compact?: boolean; rangeLabel: string; href?: Route }) {
  return (
    <Card compact={compact} href={href}>
      <CardHead title="Prospects this week" count={items.length} compact={compact} />
      {items.length === 0 ? <EmptyState rangeLabel={rangeLabel} /> : (
        compact ? (
          <div>
            {items.map((p, i) => (
              <ListRow
                key={`${p.name}-${i}`}
                last={i === items.length - 1}
                cells={
                  <div className="flex-1 min-w-0 flex justify-between gap-2 items-center">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-mfs-black truncate">
                        {p.name}
                      </div>
                      <div className="mt-1">
                        <StagePill
                          dotClassName={pickStageColor(p.visitType)}
                          label={p.visitType || 'Logged'}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-mfs-neutral-500 whitespace-nowrap">
                      {p.rep}
                    </span>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <>
            <RowHead cols={['Account', 'Stage', 'Rep']} widths={['1fr', '120px', '110px']} />
            <div>
              {items.map((p, i) => (
                <TableRow
                  key={`${p.name}-${i}`}
                  last={i === items.length - 1}
                  widths={['1fr', '120px', '110px']}
                  cells={[
                    <strong key="name" className="font-semibold text-mfs-black">{p.name}</strong>,
                    <StagePill
                      key="stage"
                      dotClassName={pickStageColor(p.visitType)}
                      label={p.visitType || 'Logged'}
                    />,
                    <span key="rep" className="text-mfs-neutral-700">{p.rep}</span>,
                  ]}
                />
              ))}
            </div>
          </>
        )
      )}
    </Card>
  )
}
