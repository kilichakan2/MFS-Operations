/**
 * tests/integration/observability.test.ts
 *
 * Integration spec for the F-FND-02 ↔ F-FND-03 loop:
 *   withRequestContext(withErrors(handler))
 *
 * Asserts that a correlation ID generated (or echoed) at the HOF
 * boundary appears BOTH on the outgoing response (x-request-id
 * header) AND on the structured log line emitted by withErrors'
 * unknown-error path. That round-trip is the single most important
 * guarantee in F-FND-03 — if it passes, the module is functionally
 * complete and ready for F-08 to start wrapping real routes.
 *
 * No DB, no live HTTP — only NextRequest + Response plumbing. Lives
 * in the integration suite because it exercises a framework-level
 * composition (NextRequest-typed handler), not because it needs
 * fixtures.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { withErrors } from '@/lib/errors/withErrors'
import { ServiceError } from '@/lib/errors'
import { withRequestContext } from '@/lib/observability/withRequestContext'

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/test', { headers })
}

describe('withRequestContext + withErrors integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('threads a generated correlationId through response header AND log line on ServiceError', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // ServiceError is an AppError subclass — withErrors translates it
    // to a 500/SERVICE_ERROR JSON body. The structured logger should
    // NOT fire for AppError (it's only the unknown-error path that
    // logs). Use a plain Error to exercise the log path AND assert
    // x-request-id propagation in one go.
    const route = withRequestContext(withErrors(async () => {
      throw new Error('whoops')
    }))

    const res = await route(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal Server Error' })

    const correlationId = res.headers.get('x-request-id')
    expect(correlationId).toMatch(/^[0-9a-f]{16}$/)

    expect(errSpy).toHaveBeenCalledTimes(1)
    const line = errSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.level).toBe('error')
    expect(parsed.msg).toBe('[withErrors] unknown error')
    expect(parsed.correlationId).toBe(correlationId)
    expect(parsed.error).toMatchObject({
      name:    'Error',
      message: 'whoops',
    })
    expect(typeof parsed.error.stack).toBe('string')
  })

  it('preserves AppError contract (ServiceError → 500/SERVICE_ERROR, no log line)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = withRequestContext(withErrors(async () => {
      throw new ServiceError('boom')
    }))

    const res = await route(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('SERVICE_ERROR')
    expect(body.message).toBe('boom')
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/)
    // AppError path does NOT use the unknown-error logger.
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('echoes upstream x-request-id on response AND log line', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = withRequestContext(withErrors(async () => {
      throw new Error('trace-me')
    }))

    const res = await route(makeRequest({ 'x-request-id': 'trace-abc-123' }))
    expect(res.headers.get('x-request-id')).toBe('trace-abc-123')
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string)
    expect(parsed.correlationId).toBe('trace-abc-123')
  })

  it('authenticated request: log line carries userId + role from middleware headers', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = withRequestContext(withErrors(async () => {
      throw new Error('auth-context')
    }))

    await route(makeRequest({
      'x-mfs-user-id':   'u-1',
      'x-mfs-user-role': 'admin',
    }))
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string)
    expect(parsed.userId).toBe('u-1')
    expect(parsed.role).toBe('admin')
    expect(parsed.correlationId).toMatch(/^[0-9a-f]{16}$/)
  })

  it('unauthenticated request: log line omits userId/role but keeps correlationId', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = withRequestContext(withErrors(async () => {
      throw new Error('no-auth-context')
    }))

    await route(makeRequest())
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string)
    expect(parsed.userId).toBeUndefined()
    expect(parsed.role).toBeUndefined()
    expect(parsed.correlationId).toMatch(/^[0-9a-f]{16}$/)
  })

  it('successful response also carries x-request-id', async () => {
    const route = withRequestContext(withErrors(async () =>
      NextResponse.json({ ok: true }, { status: 200 })
    ))
    const res = await route(makeRequest())
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/)
  })
})
