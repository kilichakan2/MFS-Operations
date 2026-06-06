/**
 * tests/unit/errors/AppError.test.ts
 *
 * Unit spec for the abstract `AppError` base. Exercised via a tiny
 * in-file `TestError` subclass (the base is abstract and can't be
 * instantiated directly).
 *
 * Coverage:
 *   - Constructor accepts message only.
 *   - Constructor accepts { cause } and { context }.
 *   - `name` reflects the subclass constructor name.
 *   - `toJSON()` returns the minimum shape.
 *   - `toJSON()` includes context when present.
 *   - `toJSON()` includes cause and stack in dev mode.
 *   - `toJSON()` strips cause and stack in production mode.
 *   - `cause` propagation preserves Error reference semantics.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { AppError } from '@/lib/errors/AppError'

class TestError extends AppError {
  readonly httpStatus = 599
  readonly code       = 'TEST_ERROR'
}

describe('AppError', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('constructs with message only', () => {
    const err = new TestError('boom')
    expect(err.message).toBe('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })

  it('exposes httpStatus and code from the subclass', () => {
    const err = new TestError('boom')
    expect(err.httpStatus).toBe(599)
    expect(err.code).toBe('TEST_ERROR')
  })

  it('sets name to the subclass constructor name', () => {
    const err = new TestError('boom')
    expect(err.name).toBe('TestError')
  })

  it('accepts and stores a cause', () => {
    const original = new Error('downstream blew up')
    const err = new TestError('wrapper', { cause: original })
    expect((err as { cause?: unknown }).cause).toBe(original)
  })

  it('accepts and stores a context map', () => {
    const err = new TestError('boom', { context: { orderId: 42 } })
    expect(err.context).toEqual({ orderId: 42 })
  })

  it('toJSON() returns the minimum shape when nothing optional is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const err = new TestError('boom')
    const body = err.toJSON()
    expect(body.code).toBe('TEST_ERROR')
    expect(body.message).toBe('boom')
    expect(body.context).toBeUndefined()
    expect(body.cause).toBeUndefined()
    expect(body.stack).toBeUndefined()
  })

  it('toJSON() includes context when present (always, not gated on env)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const err = new TestError('boom', { context: { sku: 'ABC' } })
    expect(err.toJSON().context).toEqual({ sku: 'ABC' })
  })

  it('toJSON() includes cause and stack in dev mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const original = new Error('downstream')
    const err = new TestError('wrapper', { cause: original })
    const body = err.toJSON()
    expect(body.cause).toBeDefined()
    expect(body.cause).toMatchObject({ name: 'Error', message: 'downstream' })
    expect(typeof body.stack).toBe('string')
  })

  it('toJSON() strips cause and stack in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const original = new Error('downstream')
    const err = new TestError('wrapper', { cause: original })
    const body = err.toJSON()
    expect(body.cause).toBeUndefined()
    expect(body.stack).toBeUndefined()
  })

  it('serialises a non-Error cause verbatim in dev mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const err = new TestError('wrapper', { cause: { code: 'PG_42P01' } })
    expect(err.toJSON().cause).toEqual({ code: 'PG_42P01' })
  })
})
