/**
 * tests/unit/observability/log.test.ts
 *
 * Unit spec for the structured logger.
 *
 * Coverage:
 *   - log.info writes one JSON line to console.log.
 *   - The line parses as JSON with level/msg/ts.
 *   - Without active context: no correlationId/userId/role keys.
 *   - With active context: all three keys present.
 *   - log.warn → console.warn; log.error → console.error.
 *   - extra `fields` arg merged into the line; later wins on collision.
 *   - Logger never throws — JSON.stringify failure falls back to a
 *     primitive line.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { log } from '@/lib/observability/log'
import { runWithCaller } from '@/lib/observability/context'
import { makeCaller } from '@/lib/observability/Caller'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('log', () => {
  it('log.info writes one JSON line to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('hello')
    expect(spy).toHaveBeenCalledTimes(1)
    const arg = spy.mock.calls[0][0] as string
    expect(typeof arg).toBe('string')
    const parsed = JSON.parse(arg)
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('hello')
    expect(typeof parsed.ts).toBe('string')
    expect(() => new Date(parsed.ts).toISOString()).not.toThrow()
  })

  it('omits correlationId/userId/role when no context is active', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('no-context')
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.correlationId).toBeUndefined()
    expect(parsed.userId).toBeUndefined()
    expect(parsed.role).toBeUndefined()
  })

  it('merges Caller fields when context is active', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const caller = makeCaller({ userId: 'u-9', role: 'admin', correlationId: 'cid-9' })
    runWithCaller(caller, () => log.info('with-context'))
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.correlationId).toBe('cid-9')
    expect(parsed.userId).toBe('u-9')
    expect(parsed.role).toBe('admin')
  })

  it('omits null userId/role when context has them null but keeps correlationId', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const caller = makeCaller({ correlationId: 'cid-null' })
    runWithCaller(caller, () => log.info('null-fields'))
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.correlationId).toBe('cid-null')
    expect(parsed.userId).toBeUndefined()
    expect(parsed.role).toBeUndefined()
  })

  it('log.warn routes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log.warn('careful')
    expect(spy).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.level).toBe('warn')
    expect(parsed.msg).toBe('careful')
  })

  it('log.error routes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log.error('boom')
    expect(spy).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.level).toBe('error')
    expect(parsed.msg).toBe('boom')
  })

  it('merges extra fields into the JSON line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('with-fields', { route: '/api/x', durationMs: 42 })
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.route).toBe('/api/x')
    expect(parsed.durationMs).toBe(42)
  })

  it('caller-supplied fields override reserved keys (later wins — documented rule)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const caller = makeCaller({ userId: 'u-10', correlationId: 'cid-orig' })
    runWithCaller(caller, () =>
      log.info('collision', { correlationId: 'cid-override', userId: 'u-override' })
    )
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.correlationId).toBe('cid-override')
    expect(parsed.userId).toBe('u-override')
  })

  it('never throws — falls back to a primitive line if JSON.stringify fails', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('stringify boom')
    })
    expect(() => log.error('primitive-fallback')).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('error: primitive-fallback')
    stringifySpy.mockRestore()
  })
})
