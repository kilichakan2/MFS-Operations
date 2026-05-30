'use client'

/**
 * components/OrderCutoverBanner.tsx
 *
 * A reminder banner shown at the top of the orders dashboard during
 * the WhatsApp-parallel-running cutover window. Configured via env
 * vars NEXT_PUBLIC_ORDER_CUTOVER_START and NEXT_PUBLIC_ORDER_CUTOVER_END
 * (both YYYY-MM-DD). When today's date is in [start, end], the banner
 * shows. Outside that window it renders null.
 *
 * Three messages depending on which phase of cutover we're in:
 *   Week 1-2: 'Post to WhatsApp AND mfsops — parallel running'
 *   Week 3-4: 'Use mfsops first; WhatsApp is fallback only'
 *   After:    (no banner)
 *
 * Phase calculation is in lib/orders/cutoverPhase.ts (pure function,
 * unit-tested separately).
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB6)
 */

import { getCutoverPhase } from '@/lib/orders/cutoverPhase'

export default function OrderCutoverBanner() {
  const phase = getCutoverPhase(new Date())
  if (!phase) return null

  if (phase === 'parallel') {
    return (
      <div className="rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <div className="flex items-start gap-3">
          <span className="text-xl leading-none">📋</span>
          <div>
            <p className="font-bold">Parallel-running phase</p>
            <p className="text-xs mt-0.5 text-blue-800 leading-relaxed">
              Post every order to <strong>WhatsApp AND mfsops</strong>. Butchers still work
              from WhatsApp screenshots; mfsops is being trialled in parallel so the team
              gets familiar with it before cutover.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 'fallback' phase
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">⚡</span>
        <div>
          <p className="font-bold">Cutover — mfsops is primary</p>
          <p className="text-xs mt-0.5 text-amber-800 leading-relaxed">
            Enter orders in <strong>mfsops first</strong>. WhatsApp is fallback only —
            use it if mfsops is down, then enter the order here when it comes back.
          </p>
        </div>
      </div>
    </div>
  )
}
