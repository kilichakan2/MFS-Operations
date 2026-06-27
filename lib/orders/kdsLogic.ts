/**
 * lib/orders/kdsLogic.ts
 *
 * Pure logic for the KDS production-room display. Extracted from
 * app/kds/page.tsx so it can be unit-tested without rendering React.
 *
 * Covers:
 *   - isCardFlashing      — given audit events + 'now', should card flash?
 *   - cardFadeOpacity     — for completed cards, how faded should it be?
 *   - isCardVisible       — should this order appear on the KDS at all?
 *   - aggregateDoneCount  — how many of an order's lines are done?
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB5)
 */

import type { OrderState } from '@/lib/domain/Order'

// ─── Constants ──────────────────────────────────────────────

/** How long an amendment / reprint flash stays visible on a card. */
export const FLASH_DURATION_MS = 30_000

/** How long completed cards stay visible before disappearing entirely. */
export const COMPLETED_FADE_MS = 30_000

// ─── Types ──────────────────────────────────────────────────

export interface KdsFlashEvent {
  order_id:   string
  action:     string
  created_at: string  // ISO timestamp
}

export interface KdsCardOrder {
  id:           string
  state:        OrderState
  completed_at: string | null
  lines:        Array<{ done_at: string | null }>
}

// ─── Functions ──────────────────────────────────────────────

/**
 * Should a card be flashing orange right now? True when there's a
 * recent audit event (edited, line_edited, reprinted, line_added) for
 * the order within FLASH_DURATION_MS of the current time.
 */
export function isCardFlashing(
  orderId: string,
  flashes: KdsFlashEvent[],
  nowMs:   number,
): boolean {
  return flashes.some(f => {
    if (f.order_id !== orderId) return false
    const eventMs = new Date(f.created_at).getTime()
    return (nowMs - eventMs) < FLASH_DURATION_MS && (nowMs - eventMs) >= 0
  })
}

/**
 * For completed cards, how opaque should they be? Returns 1 for printed
 * cards and recently-completed cards; fades to 0 over the second half
 * of the COMPLETED_FADE_MS window.
 */
export function cardFadeOpacity(
  order: KdsCardOrder,
  nowMs: number,
): number {
  if (order.state !== 'completed' || !order.completed_at) return 1
  const completedMs = new Date(order.completed_at).getTime()
  const elapsed = nowMs - completedMs
  if (elapsed <= 0) return 1

  const fadeStart    = COMPLETED_FADE_MS * 0.5
  const fadeDuration = COMPLETED_FADE_MS - fadeStart

  if (elapsed <= fadeStart) return 1
  if (elapsed >= COMPLETED_FADE_MS) return 0

  return Math.max(0, 1 - (elapsed - fadeStart) / fadeDuration)
}

/**
 * Should this order appear on the KDS at all? Printed orders always
 * appear; completed orders appear for COMPLETED_FADE_MS after
 * completed_at, then drop out.
 */
export function isCardVisible(order: KdsCardOrder, nowMs: number): boolean {
  if (order.state === 'printed') return true
  if (order.state === 'completed' && order.completed_at) {
    const completedMs = new Date(order.completed_at).getTime()
    return (nowMs - completedMs) < COMPLETED_FADE_MS
  }
  return false
}

/**
 * How many of an order's lines are done?
 * Returns { done, total }.
 */
export function aggregateDoneCount(order: KdsCardOrder): { done: number; total: number } {
  const total = order.lines.length
  const done  = order.lines.filter(l => l.done_at !== null).length
  return { done, total }
}
