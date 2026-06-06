/**
 * tests/unit/errors/ServiceError.test.ts
 *
 * Spec for the catch-all 500 subclass. The key assertion is that
 * `cause` propagates server-side (reference equality preserved) but
 * is stripped from the wire body in production.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { ServiceError } from '@/lib/errors/ServiceError'
import { AppError } from '@/lib/errors/AppError'

describe('ServiceError', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is an instance of AppError', () => {
    expect(new ServiceError('downstream')).toBeInstanceOf(AppError)
  })

  it('httpStatus is 500 and code is SERVICE_ERROR', () => {
    const err = new ServiceError('downstream')
    expect(err.httpStatus).toBe(500)
    expect(err.code).toBe('SERVICE_ERROR')
  })

  it('name is "ServiceError"', () => {
    expect(new ServiceError('x').name).toBe('ServiceError')
  })

  it('preserves cause reference equality on the instance', () => {
    const original = new Error('downstream blew up')
    const err = new ServiceError('wrap', { cause: original })
    expect((err as { cause?: unknown }).cause).toBe(original)
  })

  it('toJSON() includes serialised cause in dev mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const original = new Error('downstream')
    const err = new ServiceError('wrap', { cause: original })
    const body = err.toJSON()
    expect(body.cause).toMatchObject({ name: 'Error', message: 'downstream' })
  })

  it('toJSON() strips cause and stack in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const err = new ServiceError('wrap', { cause: new Error('downstream') })
    const body = err.toJSON()
    expect(body.cause).toBeUndefined()
    expect(body.stack).toBeUndefined()
    // Sanity: status/code/message still present.
    expect(body.code).toBe('SERVICE_ERROR')
    expect(body.message).toBe('wrap')
  })
})
