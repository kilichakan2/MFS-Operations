/**
 * tests/unit/observability/Caller.test.ts
 *
 * Unit spec for the `Caller` factory + type shape.
 *
 * Coverage:
 *   - Factory returns the documented shape.
 *   - Defaults for userId/role are `null`.
 *   - Explicit `null` survives the factory.
 *   - The returned object's shape is stable across calls.
 *   - `Role` union accepts the six known literals; rejects unknown
 *     at the type level (compile-time assertion).
 *
 * Note (ARCH-FU-01): the `Role` union and its runtime mirror moved to
 * `lib/domain/Role.ts`; the role-SET parity assertions now live in
 * `lib/domain/Role.test.ts`. This file keeps the `makeCaller`
 * factory-shape cases plus the type-level Role acceptance/rejection
 * cases (which exercise `Caller.role`). `Role` is imported from its
 * new domain home; `makeCaller`/`Caller` from observability.
 */

import { describe, it, expect } from 'vitest'
import { makeCaller, type Caller } from '@/lib/observability/Caller'
import type { Role } from '@/lib/domain'

describe('makeCaller', () => {
  it('returns a Caller with defaults when only correlationId is supplied', () => {
    const c = makeCaller({ correlationId: 'cid-1' })
    expect(c).toEqual({
      userId:        null,
      role:          null,
      correlationId: 'cid-1',
    })
  })

  it('returns the supplied fields verbatim', () => {
    const c = makeCaller({ userId: 'u-1', role: 'admin', correlationId: 'cid-2' })
    expect(c).toEqual({
      userId:        'u-1',
      role:          'admin',
      correlationId: 'cid-2',
    })
  })

  it('explicit null for userId/role survives the factory', () => {
    const c = makeCaller({ userId: null, role: null, correlationId: 'cid-3' })
    expect(c.userId).toBeNull()
    expect(c.role).toBeNull()
  })

  it('shape is stable across calls (same keys, same order)', () => {
    const a = makeCaller({ correlationId: 'a' })
    const b = makeCaller({ correlationId: 'b' })
    expect(Object.keys(a)).toEqual(Object.keys(b))
    expect(Object.keys(a)).toEqual(['userId', 'role', 'correlationId'])
  })

  it('accepts all six known roles at the type level', () => {
    const roles: Role[] = ['warehouse', 'office', 'sales', 'admin', 'driver', 'butcher']
    for (const r of roles) {
      const c = makeCaller({ role: r, correlationId: 'x' })
      expect(c.role).toBe(r)
    }
  })

  it('rejects unknown role values at the type level', () => {
    // Compile-time assertion: unknown role strings are a TS error.
    // @ts-expect-error — 'superuser' is not in the Role union
    const c: Caller = makeCaller({ role: 'superuser', correlationId: 'x' })
    expect(c.role).toBe('superuser')
  })
})
