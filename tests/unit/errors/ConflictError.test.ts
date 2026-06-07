/**
 * tests/unit/errors/ConflictError.test.ts
 *
 * Spec for the 409 subclass. Same shape of assertions as the other
 * status-only subclasses.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { ConflictError } from '@/lib/errors/ConflictError'
import { AppError } from '@/lib/errors/AppError'

describe('ConflictError', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is an instance of AppError', () => {
    expect(new ConflictError('clash')).toBeInstanceOf(AppError)
  })

  it('httpStatus is 409 and code is CONFLICT', () => {
    const err = new ConflictError('duplicate key')
    expect(err.httpStatus).toBe(409)
    expect(err.code).toBe('CONFLICT')
  })

  it('name is "ConflictError"', () => {
    expect(new ConflictError('clash').name).toBe('ConflictError')
  })

  it('toJSON() emits the documented body in dev mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const err = new ConflictError('already dispatched')
    const body = err.toJSON()
    expect(body.code).toBe('CONFLICT')
    expect(body.message).toBe('already dispatched')
  })

  it('toJSON() strips cause and stack in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const err = new ConflictError('clash', { cause: new Error('inner') })
    const body = err.toJSON()
    expect(body.cause).toBeUndefined()
    expect(body.stack).toBeUndefined()
  })

  it('surfaces context in the JSON body', () => {
    const err = new ConflictError('clash', { context: { version: 3 } })
    expect(err.toJSON().context).toEqual({ version: 3 })
  })
})
