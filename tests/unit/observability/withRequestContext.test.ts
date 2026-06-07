/**
 * tests/unit/observability/withRequestContext.test.ts
 *
 * Unit spec for the route-handler HOF. Exercises the wrapper directly
 * with `NextRequest` instances — no live HTTP, no DB.
 *
 * Coverage:
 *   - Correlation ID generated when no x-request-id header present
 *     (16-char hex, length-bounded).
 *   - Existing x-request-id header is reused.
 *   - Empty / oversize x-request-id is rejected; HOF generates instead.
 *   - userId derived from x-mfs-user-id; null when absent.
 *   - role derived from x-mfs-user-role; null when absent or unknown.
 *   - Handler observes the caller via getCaller() (proves ALS binding).
 *   - Outgoing response carries x-request-id matching the chosen ID.
 *   - Inner-handler-set x-request-id is NOT overwritten (idempotency).
 *   - Handler signature preserved at the type level.
 */

import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { withRequestContext } from '@/lib/observability/withRequestContext'
import { getCaller } from '@/lib/observability/context'

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/test', { headers })
}

describe('withRequestContext', () => {
  it('generates a 16-char hex correlation ID when no x-request-id header is present', async () => {
    let observedCid: string | undefined
    const handler = withRequestContext(async () => {
      observedCid = getCaller()?.correlationId
      return new Response(null, { status: 204 })
    })
    const res = await handler(makeRequest())
    expect(observedCid).toMatch(/^[0-9a-f]{16}$/)
    expect(res.headers.get('x-request-id')).toBe(observedCid)
  })

  it('reuses an incoming x-request-id header', async () => {
    let observedCid: string | undefined
    const handler = withRequestContext(async () => {
      observedCid = getCaller()?.correlationId
      return new Response(null, { status: 204 })
    })
    const res = await handler(makeRequest({ 'x-request-id': 'trace-abc-123' }))
    expect(observedCid).toBe('trace-abc-123')
    expect(res.headers.get('x-request-id')).toBe('trace-abc-123')
  })

  it('rejects an empty x-request-id and generates instead', async () => {
    let observedCid: string | undefined
    const handler = withRequestContext(async () => {
      observedCid = getCaller()?.correlationId
      return new Response(null, { status: 204 })
    })
    await handler(makeRequest({ 'x-request-id': '   ' }))
    expect(observedCid).toMatch(/^[0-9a-f]{16}$/)
  })

  it('rejects an oversize x-request-id (length > 128) and generates instead', async () => {
    let observedCid: string | undefined
    const big = 'x'.repeat(129)
    const handler = withRequestContext(async () => {
      observedCid = getCaller()?.correlationId
      return new Response(null, { status: 204 })
    })
    await handler(makeRequest({ 'x-request-id': big }))
    expect(observedCid).toMatch(/^[0-9a-f]{16}$/)
    expect(observedCid).not.toBe(big)
  })

  it('derives userId from x-mfs-user-id; null when header absent', async () => {
    let observed: { userId: string | null } | undefined
    const handler = withRequestContext(async () => {
      const c = getCaller()
      observed = { userId: c?.userId ?? null }
      return new Response(null, { status: 204 })
    })
    await handler(makeRequest({ 'x-mfs-user-id': 'u-42' }))
    expect(observed?.userId).toBe('u-42')

    await handler(makeRequest())
    expect(observed?.userId).toBeNull()
  })

  it('derives role from x-mfs-user-role; null when absent or unknown', async () => {
    let observedRole: string | null | undefined
    const handler = withRequestContext(async () => {
      observedRole = getCaller()?.role ?? null
      return new Response(null, { status: 204 })
    })

    await handler(makeRequest({ 'x-mfs-user-role': 'admin' }))
    expect(observedRole).toBe('admin')

    await handler(makeRequest({ 'x-mfs-user-role': 'butcher' }))
    expect(observedRole).toBe('butcher')

    await handler(makeRequest({ 'x-mfs-user-role': 'superuser' }))
    expect(observedRole).toBeNull()

    await handler(makeRequest())
    expect(observedRole).toBeNull()
  })

  it('the wrapped handler observes the caller via getCaller() (ALS binding works through the HOF)', async () => {
    let cidSeen: string | undefined
    const handler = withRequestContext(async () => {
      await Promise.resolve()
      cidSeen = getCaller()?.correlationId
      return new Response(null, { status: 204 })
    })
    const res = await handler(makeRequest({ 'x-request-id': 'als-cid' }))
    expect(cidSeen).toBe('als-cid')
    expect(res.headers.get('x-request-id')).toBe('als-cid')
  })

  it('does not overwrite x-request-id set by the inner handler (idempotency)', async () => {
    const handler = withRequestContext(async () =>
      new Response(null, {
        status:  204,
        headers: { 'x-request-id': 'inner-wins' },
      })
    )
    const res = await handler(makeRequest({ 'x-request-id': 'outer' }))
    expect(res.headers.get('x-request-id')).toBe('inner-wins')
  })

  it('preserves the handler signature at the type level', () => {
    // Compile-time assertion: withRequestContext returns a function
    // with the same signature it was given.
    const handler = async (_req: NextRequest): Promise<Response> =>
      new Response(null, { status: 204 })
    const wrapped = withRequestContext(handler)
    type Same = typeof wrapped extends typeof handler ? true : false
    const ok: Same = true
    expect(ok).toBe(true)
  })
})
