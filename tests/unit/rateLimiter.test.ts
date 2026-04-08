/**
 * tests/unit/rateLimiter.test.ts
 *
 * Unit tests for the login rate limiter logic.
 * Mirrors the logic in app/api/auth/login/route.ts without importing it
 * (route files are not directly importable in vitest due to Next.js deps).
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ── Mirror of the rate limiter logic ─────────────────────────────────────────

interface AttemptRecord { count: number; lockedUntil: number }

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 15 * 60 * 1000

function makeRateLimiter() {
  const store = new Map<string, AttemptRecord>()

  function check(name: string, now = Date.now()): { allowed: boolean; retryAfterSec?: number } {
    const record = store.get(name.toLowerCase())
    if (!record) return { allowed: true }
    if (record.lockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((record.lockedUntil - now) / 1000) }
    }
    if (record.lockedUntil > 0 && record.lockedUntil <= now) {
      store.delete(name.toLowerCase())
      return { allowed: true }
    }
    return { allowed: true }
  }

  function recordFailure(name: string, now = Date.now()): void {
    const key    = name.toLowerCase()
    const record = store.get(key) ?? { count: 0, lockedUntil: 0 }
    record.count++
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS
    }
    store.set(key, record)
  }

  function recordSuccess(name: string): void {
    store.delete(name.toLowerCase())
  }

  return { check, recordFailure, recordSuccess, store }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('login rate limiter', () => {
  let rl: ReturnType<typeof makeRateLimiter>
  const NOW = 1_700_000_000_000

  beforeEach(() => {
    rl = makeRateLimiter()
  })

  it('allows first attempt with no prior failures', () => {
    expect(rl.check('Hakan', NOW).allowed).toBe(true)
  })

  it('allows attempts below the threshold', () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) rl.recordFailure('Hakan', NOW)
    expect(rl.check('Hakan', NOW).allowed).toBe(true)
  })

  it('blocks after MAX_ATTEMPTS failures', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) rl.recordFailure('Hakan', NOW)
    const result = rl.check('Hakan', NOW)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSec).toBeGreaterThan(0)
  })

  it('retryAfterSec is approximately LOCKOUT_MS/1000 immediately after lockout', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) rl.recordFailure('Hakan', NOW)
    const { retryAfterSec } = rl.check('Hakan', NOW)
    expect(retryAfterSec).toBe(LOCKOUT_MS / 1000)
  })

  it('unlocks after lockout period expires', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) rl.recordFailure('Hakan', NOW)
    const afterLockout = NOW + LOCKOUT_MS + 1
    expect(rl.check('Hakan', afterLockout).allowed).toBe(true)
  })

  it('clears record on success', () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) rl.recordFailure('Hakan', NOW)
    rl.recordSuccess('Hakan')
    expect(rl.check('Hakan', NOW).allowed).toBe(true)
    expect(rl.store.has('hakan')).toBe(false)
  })

  it('is case-insensitive — HAKAN and hakan share the same bucket', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) rl.recordFailure('HAKAN', NOW)
    expect(rl.check('hakan', NOW).allowed).toBe(false)
  })

  it('different users have independent buckets', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) rl.recordFailure('Hakan', NOW)
    expect(rl.check('Mehmet', NOW).allowed).toBe(true)
  })

  it('retryAfterSec decreases over time', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) rl.recordFailure('Hakan', NOW)
    const r1 = rl.check('Hakan', NOW)
    const r2 = rl.check('Hakan', NOW + 60_000) // 1 minute later
    expect(r2.retryAfterSec!).toBeLessThan(r1.retryAfterSec!)
  })
})
