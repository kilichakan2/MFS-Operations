/**
 * tests/unit/errors/NotFoundError.test.ts
 *
 * Spec for the 404 subclass. Asserts the static httpStatus/code,
 * the JSON body shape, production-mode redaction, and context
 * propagation.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { AppError } from '@/lib/errors/AppError'

describe('NotFoundError', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is an instance of AppError', () => {
    expect(new NotFoundError('missing')).toBeInstanceOf(AppError)
  })

  it('httpStatus is 404 and code is NOT_FOUND', () => {
    const err = new NotFoundError('missing')
    expect(err.httpStatus).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
  })

  it('name is "NotFoundError"', () => {
    expect(new NotFoundError('missing').name).toBe('NotFoundError')
  })

  it('toJSON() emits the documented body in dev mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const err = new NotFoundError('order 42 not found')
    const body = err.toJSON()
    expect(body.code).toBe('NOT_FOUND')
    expect(body.message).toBe('order 42 not found')
  })

  it('toJSON() strips cause and stack in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const err = new NotFoundError('missing', { cause: new Error('inner') })
    const body = err.toJSON()
    expect(body.cause).toBeUndefined()
    expect(body.stack).toBeUndefined()
  })

  it('surfaces context in the JSON body', () => {
    const err = new NotFoundError('missing', { context: { orderId: 42 } })
    expect(err.toJSON().context).toEqual({ orderId: 42 })
  })
})
