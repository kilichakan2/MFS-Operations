/**
 * lib/orders/cutoverPhase.ts
 *
 * Pure phase calculation for the order pipeline cutover. Lives outside
 * the .tsx component file so it can be unit-tested without vitest
 * needing JSX transform on the test imports.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB6)
 */

export type CutoverPhase = 'parallel' | 'fallback'

const CUTOVER_PHASES: ReadonlyArray<{ name: CutoverPhase; pct_start: number; pct_end: number }> = [
  { name: 'parallel', pct_start: 0,   pct_end: 0.5 },
  { name: 'fallback', pct_start: 0.5, pct_end: 1.0 },
]

/**
 * Given the current time, determine which cutover phase we're in
 * based on the NEXT_PUBLIC_ORDER_CUTOVER_START/_END env vars. Returns
 * null when:
 *   - either env var is unset or empty
 *   - either env var is unparseable
 *   - the current time is outside [start, end]
 */
export function getCutoverPhase(now: Date): CutoverPhase | null {
  const startStr = process.env.NEXT_PUBLIC_ORDER_CUTOVER_START
  const endStr   = process.env.NEXT_PUBLIC_ORDER_CUTOVER_END

  if (!startStr || !endStr) return null

  const start = new Date(startStr + 'T00:00:00Z').getTime()
  const end   = new Date(endStr   + 'T23:59:59Z').getTime()
  const nowMs = now.getTime()

  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (nowMs < start || nowMs > end)              return null

  const pct = (nowMs - start) / (end - start)
  for (const phase of CUTOVER_PHASES) {
    if (pct >= phase.pct_start && pct < phase.pct_end) return phase.name
  }
  return 'fallback'  // pct == 1 exactly
}
