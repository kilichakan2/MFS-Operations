/**
 * tests/unit/observability/context.test.ts
 *
 * Unit spec for the AsyncLocalStorage-backed Caller context.
 *
 * Coverage:
 *   - `getCaller()` returns undefined outside any context.
 *   - `runWithCaller` binds the caller synchronously.
 *   - Cross-async-boundary propagation (the load-bearing case — this
 *     is the entire reason for using ALS).
 *   - Nested runWithCaller re-binds the inner caller; outer caller
 *     restored after inner returns.
 *   - Two parallel async chains (Promise.all) keep their callers
 *     independent — no leakage between chains.
 */

import { describe, it, expect } from 'vitest'
import { getCaller, runWithCaller } from '@/lib/observability/context'
import { makeCaller } from '@/lib/observability/Caller'

describe('observability context (ALS)', () => {
  it('getCaller() returns undefined when no context is active', () => {
    expect(getCaller()).toBeUndefined()
  })

  it('runWithCaller binds the caller synchronously', () => {
    const caller = makeCaller({ userId: 'u-1', role: 'admin', correlationId: 'cid-sync' })
    const seen = runWithCaller(caller, () => getCaller())
    expect(seen).toBe(caller)
  })

  it('caller survives await boundaries (the load-bearing case)', async () => {
    const caller = makeCaller({ userId: 'u-2', role: 'sales', correlationId: 'cid-async' })
    const seen = await runWithCaller(caller, async () => {
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 1))
      return getCaller()
    })
    expect(seen).toBe(caller)
  })

  it('nested runWithCaller re-binds inner, restores outer on return', () => {
    const outer = makeCaller({ correlationId: 'outer' })
    const inner = makeCaller({ correlationId: 'inner' })
    runWithCaller(outer, () => {
      expect(getCaller()?.correlationId).toBe('outer')
      runWithCaller(inner, () => {
        expect(getCaller()?.correlationId).toBe('inner')
      })
      expect(getCaller()?.correlationId).toBe('outer')
    })
  })

  it('parallel async chains keep callers independent (no cross-chain leakage)', async () => {
    const a = makeCaller({ correlationId: 'a' })
    const b = makeCaller({ correlationId: 'b' })

    const chain = (c: typeof a) => runWithCaller(c, async () => {
      await new Promise((r) => setTimeout(r, 5))
      return getCaller()?.correlationId
    })

    const [seenA, seenB] = await Promise.all([chain(a), chain(b)])
    expect(seenA).toBe('a')
    expect(seenB).toBe('b')
  })

  it('getCaller() returns undefined again after runWithCaller scope ends', () => {
    const c = makeCaller({ correlationId: 'temp' })
    runWithCaller(c, () => {
      expect(getCaller()).toBe(c)
    })
    expect(getCaller()).toBeUndefined()
  })
})
