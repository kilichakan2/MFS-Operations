'use client'

/**
 * components/PrintLabelStrip.tsx
 *
 * The shared print-action strip used at the bottom of any card that prints labels.
 * Two 50/50 width buttons, 48px tall — comfortably over WCAG AAA's 44px minimum
 * tap target. Orange = 100mm (AirPrint / iframe path), blue = 58mm (Sunmi V3
 * silent path with iframe fallback).
 *
 * Pure presentation — no fetch, no state. Tap behaviour is delegated to the
 * caller via the on100mm / on58mm props. The strip handles event-bubble
 * suppression so cards that expand on tap don't toggle when staff hit a
 * print button.
 *
 * Used in:
 *   - app/haccp/delivery/page.tsx — collapsed row + open detail header
 *   - app/haccp/mince/page.tsx    — collapsed row (callbacks open a use-by-date modal)
 */

interface PrintLabelStripProps {
  /** Callback fired when the orange 100mm button is tapped. */
  on100mm: () => void
  /** Callback fired when the blue 58mm button is tapped. */
  on58mm: () => void
}

export default function PrintLabelStrip({ on100mm, on58mm }: PrintLabelStripProps) {
  return (
    <div className="mt-2 pt-2 border-t border-slate-100 flex gap-2">
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          on100mm()
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-orange-600 text-white text-sm font-bold transition-colors hover:bg-orange-700 active:bg-orange-800"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        100mm
      </button>
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          on58mm()
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white text-sm font-bold transition-colors hover:bg-blue-700 active:bg-blue-800"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        58mm
      </button>
    </div>
  )
}
