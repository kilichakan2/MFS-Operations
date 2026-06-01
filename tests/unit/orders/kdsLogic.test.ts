/**
 * tests/unit/orders/kdsLogic.test.ts
 *
 * Unit tests for lib/orders/kdsLogic.ts — the pure KDS card state
 * functions (flashing, fading, visibility, done count).
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB5)
 */

import { describe, it, expect } from 'vitest'
import {
  isCardFlashing,
  cardFadeOpacity,
  isCardVisible,
  aggregateDoneCount,
  FLASH_DURATION_MS,
  COMPLETED_FADE_MS,
  type KdsFlashEvent,
  type KdsCardOrder,
} from '../../../lib/orders/kdsLogic'

const T0   = new Date('2026-05-30T12:00:00Z').getTime()  // reference 'now'
const ID_A = 'order-a'
const ID_B = 'order-b'

function flashEvent(orderId: string, ageMs: number, action = 'edited'): KdsFlashEvent {
  return {
    order_id:   orderId,
    action,
    created_at: new Date(T0 - ageMs).toISOString(),
  }
}

function makeOrder(overrides: Partial<KdsCardOrder> = {}): KdsCardOrder {
  return {
    id:           ID_A,
    state:        'printed',
    completed_at: null,
    lines:        [{ done_at: null }, { done_at: null }],
    ...overrides,
  }
}

// ── isCardFlashing ─────────────────────────────────────────────

describe('isCardFlashing', () => {
  it('returns true when a flash event for this order exists within the window', () => {
    const flashes = [flashEvent(ID_A, 5_000)]
    expect(isCardFlashing(ID_A, flashes, T0)).toBe(true)
  })

  it('returns false when no flashes exist for this order', () => {
    const flashes = [flashEvent(ID_B, 5_000)]
    expect(isCardFlashing(ID_A, flashes, T0)).toBe(false)
  })

  it('returns false for events older than FLASH_DURATION_MS', () => {
    const flashes = [flashEvent(ID_A, FLASH_DURATION_MS + 1000)]
    expect(isCardFlashing(ID_A, flashes, T0)).toBe(false)
  })

  it('returns true at the FLASH_DURATION_MS boundary', () => {
    const flashes = [flashEvent(ID_A, FLASH_DURATION_MS - 100)]
    expect(isCardFlashing(ID_A, flashes, T0)).toBe(true)
  })

  it('returns false for events in the future (clock skew safety)', () => {
    const flashes = [flashEvent(ID_A, -5000)]  // 5s in the future
    expect(isCardFlashing(ID_A, flashes, T0)).toBe(false)
  })

  it('returns true when multiple flashes exist and at least one is recent', () => {
    const flashes = [
      flashEvent(ID_A, FLASH_DURATION_MS + 1000),  // expired
      flashEvent(ID_A, 5_000),                      // recent
    ]
    expect(isCardFlashing(ID_A, flashes, T0)).toBe(true)
  })

  it('returns false on empty flash list', () => {
    expect(isCardFlashing(ID_A, [], T0)).toBe(false)
  })
})

// ── cardFadeOpacity ────────────────────────────────────────────

describe('cardFadeOpacity', () => {
  it('returns 1 for printed orders regardless of completed_at', () => {
    const order = makeOrder({ state: 'printed', completed_at: null })
    expect(cardFadeOpacity(order, T0)).toBe(1)
  })

  it('returns 1 for completed orders without completed_at (defensive)', () => {
    const order = makeOrder({ state: 'completed', completed_at: null })
    expect(cardFadeOpacity(order, T0)).toBe(1)
  })

  it('returns 1 for completed orders within the first half of the fade window', () => {
    const order = makeOrder({
      state: 'completed',
      completed_at: new Date(T0 - 5_000).toISOString(),  // 5s ago
    })
    expect(cardFadeOpacity(order, T0)).toBe(1)
  })

  it('returns 0 for completed orders past COMPLETED_FADE_MS', () => {
    const order = makeOrder({
      state: 'completed',
      completed_at: new Date(T0 - COMPLETED_FADE_MS - 1000).toISOString(),
    })
    expect(cardFadeOpacity(order, T0)).toBe(0)
  })

  it('fades linearly during the second half of the window', () => {
    // Half-way through the fade portion: at 0.75 * COMPLETED_FADE_MS,
    // we're at fadeStart (0.5*) + 50% of fadeDuration → opacity ~0.5
    const order = makeOrder({
      state: 'completed',
      completed_at: new Date(T0 - COMPLETED_FADE_MS * 0.75).toISOString(),
    })
    const opacity = cardFadeOpacity(order, T0)
    expect(opacity).toBeGreaterThan(0.4)
    expect(opacity).toBeLessThan(0.6)
  })
})

// ── isCardVisible ──────────────────────────────────────────────

describe('isCardVisible', () => {
  it('shows printed orders', () => {
    expect(isCardVisible(makeOrder({ state: 'printed' }), T0)).toBe(true)
  })

  it('shows recently-completed orders (within fade window)', () => {
    const order = makeOrder({
      state: 'completed',
      completed_at: new Date(T0 - 5_000).toISOString(),
    })
    expect(isCardVisible(order, T0)).toBe(true)
  })

  it('hides completed orders past the fade window', () => {
    const order = makeOrder({
      state: 'completed',
      completed_at: new Date(T0 - COMPLETED_FADE_MS - 1000).toISOString(),
    })
    expect(isCardVisible(order, T0)).toBe(false)
  })

  it('hides placed orders (KDS only shows printed+)', () => {
    expect(isCardVisible(makeOrder({ state: 'placed' }), T0)).toBe(false)
  })

  it('hides completed orders without completed_at (defensive)', () => {
    expect(isCardVisible(makeOrder({ state: 'completed', completed_at: null }), T0)).toBe(false)
  })
})

// ── aggregateDoneCount ─────────────────────────────────────────

describe('aggregateDoneCount', () => {
  it('returns 0/0 for empty line list', () => {
    expect(aggregateDoneCount(makeOrder({ lines: [] }))).toEqual({ done: 0, total: 0 })
  })

  it('returns 0/N when no lines are done', () => {
    const order = makeOrder({ lines: [{ done_at: null }, { done_at: null }, { done_at: null }] })
    expect(aggregateDoneCount(order)).toEqual({ done: 0, total: 3 })
  })

  it('returns N/N when all lines are done', () => {
    const ts = new Date(T0).toISOString()
    const order = makeOrder({ lines: [{ done_at: ts }, { done_at: ts }] })
    expect(aggregateDoneCount(order)).toEqual({ done: 2, total: 2 })
  })

  it('returns the partial count correctly', () => {
    const ts = new Date(T0).toISOString()
    const order = makeOrder({ lines: [
      { done_at: ts }, { done_at: null }, { done_at: ts }, { done_at: null },
    ] })
    expect(aggregateDoneCount(order)).toEqual({ done: 2, total: 4 })
  })
})
