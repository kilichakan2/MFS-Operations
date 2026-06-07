/**
 * tests/integration/withErrors.test.ts
 *
 * Integration spec for the framework-level `withErrors` HOF. Exercises
 * the wrapper end-to-end with `NextRequest` / `Response` instances —
 * no live HTTP, no DB. The test lives in the integration suite because
 * it touches the framework boundary (`NextRequest`-typed handler,
 * `NextResponse` body), not because it needs DB fixtures.
 *
 * The integration suite's `_loadEnv.ts` loads `.env.test.local` if
 * present and silently no-ops if absent (dotenv default), so this
 * test runs cleanly with or without the env file.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { withErrors } from '@/lib/errors/withErrors'
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ServiceError,
} from '@/lib/errors'

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/test')
}

describe('withErrors', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('passes through a successful Response unchanged', async () => {
    const handler = withErrors(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status:  200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('translates NotFoundError → 404 with NOT_FOUND body', async () => {
    const handler = withErrors(async () => {
      throw new NotFoundError('order 42 not found')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
    expect(body.message).toBe('order 42 not found')
  })

  it('translates ConflictError → 409 with CONFLICT body', async () => {
    const handler = withErrors(async () => {
      throw new ConflictError('duplicate key')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('CONFLICT')
    expect(body.message).toBe('duplicate key')
  })

  it('translates ValidationError → 400 with fields map in body', async () => {
    const fields = { email: ['required'], age: ['must be >= 18'] }
    const handler = withErrors(async () => {
      throw new ValidationError('bad input', fields)
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.fields).toEqual(fields)
  })

  it('translates ServiceError → 500 with SERVICE_ERROR body', async () => {
    const handler = withErrors(async () => {
      throw new ServiceError('downstream blew up')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('SERVICE_ERROR')
    expect(body.message).toBe('downstream blew up')
  })

  it('catches a plain Error → safe 500 INTERNAL_ERROR body, logs original', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = new Error('vendor secret leak')
    const handler = withErrors(async () => {
      throw original
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({
      code:    'INTERNAL_ERROR',
      message: 'Internal Server Error',
    })
    // Original error logged server-side so debugging is possible.
    expect(spy).toHaveBeenCalledWith('[withErrors] unknown error', original)
  })

  it('catches a non-Error throw (string literal) → safe 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = withErrors(async () => {
      throw 'bad string'
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({
      code:    'INTERNAL_ERROR',
      message: 'Internal Server Error',
    })
  })

  it('strips cause and stack from response body in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const handler = withErrors(async () => {
      throw new ServiceError('wrap', { cause: new Error('downstream secret') })
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.cause).toBeUndefined()
    expect(body.stack).toBeUndefined()
    // Sanity: status/code/message still present.
    expect(body.code).toBe('SERVICE_ERROR')
    expect(body.message).toBe('wrap')
  })

  it('includes cause and stack in dev mode (NODE_ENV !== production)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const handler = withErrors(async () => {
      throw new ServiceError('wrap', { cause: new Error('downstream') })
    })
    const res = await handler(makeRequest())
    const body = await res.json()
    expect(body.cause).toBeDefined()
    expect(body.cause).toMatchObject({ name: 'Error', message: 'downstream' })
    expect(typeof body.stack).toBe('string')
  })

  it('preserves the handler signature at the type level', () => {
    // Compile-time assertion: withErrors returns a function with the
    // same signature it was given. If this stops compiling, downstream
    // route migrations would need signature edits — that breaks the
    // strangler-fig migration contract.
    const handler = async (_req: NextRequest): Promise<Response> =>
      new Response(null, { status: 204 })
    const wrapped = withErrors(handler)
    type Same = typeof wrapped extends typeof handler ? true : false
    const ok: Same = true
    expect(ok).toBe(true)
  })
})
