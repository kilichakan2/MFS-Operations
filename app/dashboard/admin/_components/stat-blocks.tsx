'use client'

/**
 * app/dashboard/admin/_components/stat-blocks.tsx
 *
 * Three compact stat blocks rendered above the card grid on the
 * restyled /dashboard/admin surface:
 *   - HunterFarmerSplitBlock: split bar (orange = hunter, navy = farmer)
 *   - ValueStatBlock        : display-ramp value + optional unit
 *
 * Hunter/farmer is rendered as a CSS split bar (two spans, percent
 * widths) — NOT a Recharts pie. Q10 swaps the chart types: donut
 * goes to complaint categories; this block uses the simpler bar.
 */

import { Card, SectionLabel } from './primitives'

// ─── Pure helpers (tested) ──────────────────────────────────────────────────

/**
 * Splits the hunter/farmer ratio into integer percentages that sum
 * to 100. The "farmer" share is existing customers, "hunter" is
 * prospects (matches the prior dashboard semantics).
 */
export function computeHunterFarmerSplit(
  hf: { existing: number; prospects: number },
): { farmer: number; hunter: number } {
  const total = hf.existing + hf.prospects
  if (total === 0) return { farmer: 0, hunter: 0 }
  const farmer = Math.round((hf.existing / total) * 100)
  return { farmer, hunter: 100 - farmer }
}

/**
 * Formats a numeric stat value. null → em-dash (no data); zero stays
 * zero (an honest count); positive integers render verbatim.
 */
export function formatStatValue(v: number | null): string {
  if (v === null) return '—'
  return String(v)
}

// ─── Components ─────────────────────────────────────────────────────────────

export function HunterFarmerSplitBlock({
  hunterFarmer, compact = false,
}: { hunterFarmer: { existing: number; prospects: number }; compact?: boolean }) {
  const { hunter, farmer } = computeHunterFarmerSplit(hunterFarmer)
  return (
    <Card compact>
      <div className="mb-3">
        <SectionLabel>Hunter / farmer ratio</SectionLabel>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden mb-2.5 bg-mfs-soft-neutral">
        <span className="bg-mfs-orange" style={{ width: `${hunter}%` }} />
        <span className="bg-mfs-navy"   style={{ width: `${farmer}%` }} />
      </div>
      <div className="flex justify-between text-[13px]">
        <span className="text-mfs-neutral-700">
          <b className="text-mfs-orange font-semibold">{hunter}%</b> Hunter
        </span>
        <span className="text-mfs-neutral-700">
          Farmer <b className="text-mfs-navy font-semibold">{farmer}%</b>
        </span>
      </div>
      {compact && null /* compact flag is accepted but renders identically — bar already mobile-friendly */}
    </Card>
  )
}

export function ValueStatBlock({
  label, value, unit, compact = false,
}: { label: string; value: number | null; unit?: string; compact?: boolean }) {
  return (
    <Card compact>
      <div className="mb-3">
        <SectionLabel>{label}</SectionLabel>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={[
          'font-mfs-display font-normal leading-none tracking-[-0.02em] text-mfs-black',
          compact ? 'text-3xl' : 'text-[38px]',
        ].join(' ')}>
          {formatStatValue(value)}
        </span>
        {unit && (
          <span className="text-sm text-mfs-neutral-500 font-medium">{unit}</span>
        )}
      </div>
    </Card>
  )
}
