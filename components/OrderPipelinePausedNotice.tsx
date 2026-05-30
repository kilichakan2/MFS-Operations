'use client'

/**
 * components/OrderPipelinePausedNotice.tsx
 *
 * Renders when the order pipeline feature flag is disabled. Used by
 * the orders dashboard, /orders/new, /orders/[id], /kds — anywhere
 * that would otherwise expose order pipeline functionality.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB6)
 */

export default function OrderPipelinePausedNotice() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16">
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-200 flex items-center justify-center">
          <svg className="w-7 h-7 text-amber-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="6"  x2="12" y2="14" />
            <line x1="12" y1="17" x2="12" y2="17.01" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-amber-900 mb-2">Order pipeline temporarily paused</h1>
        <p className="text-sm text-amber-800 leading-relaxed">
          Please continue using the WhatsApp meat-orders group for all orders until further notice.
          This is being looked at — Hakan or office will let you know when it&apos;s back on.
        </p>
      </div>
    </main>
  )
}
