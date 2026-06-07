/**
 * tests/unit/errors/ValidationError.test.ts
 *
 * Spec for the 400 subclass. The distinguishing behaviour is the
 * `fields` map: it MUST survive production-mode redaction (it's the
 * point of the error — the client renders messages from it), while
 * `cause` and `stack` are still stripped.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { ValidationError } from '@/lib/errors/ValidationError'
import { AppError } from '@/lib/errors/AppError'

describe('ValidationError', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is an instance of AppError', () => {
    expect(new ValidationError('bad', {})).toBeInstanceOf(AppError)
  })

  it('httpStatus is 400 and code is VALIDATION_ERROR', () => {
    const err = new ValidationError('bad', {})
    expect(err.httpStatus).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
  })

  it('name is "ValidationError"', () => {
    expect(new ValidationError('bad', {}).name).toBe('ValidationError')
  })

  it('exposes the fields map verbatim on the instance', () => {
    const fields = { email: ['required'], age: ['must be >= 18'] }
    const err = new ValidationError('bad', fields)
    expect(err.fields).toEqual(fields)
  })

  it('toJSON() body includes the fields map', () => {
    const fields = { email: ['required'] }
    const err = new ValidationError('bad', fields)
    const body = err.toJSON()
    expect(body.fields).toEqual(fields)
  })

  it('preserves fields shape across construction → toJSON', () => {
    const fields = {
      orderItems: ['at least one required'],
      deliveryDate: ['must be in the future', 'must be a weekday'],
    }
    const err = new ValidationError('bad', fields)
    expect(err.toJSON().fields).toEqual(fields)
  })

  it('toJSON() keeps fields in production mode (fields are not sensitive)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const fields = { email: ['required'] }
    const err = new ValidationError('bad', fields, { cause: new Error('zod') })
    const body = err.toJSON()
    expect(body.fields).toEqual(fields)
  })

  it('toJSON() strips cause and stack in production mode but keeps fields', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const fields = { email: ['required'] }
    const err = new ValidationError('bad', fields, { cause: new Error('zod') })
    const body = err.toJSON()
    expect(body.cause).toBeUndefined()
    expect(body.stack).toBeUndefined()
    expect(body.fields).toEqual(fields)
    expect(body.code).toBe('VALIDATION_ERROR')
  })
})
