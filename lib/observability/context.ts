/**
 * lib/observability/context.ts
 *
 * AsyncLocalStorage-backed context store for the active `Caller`.
 *
 * What this hides:
 *   The ALS instance is module-private. Callers access state via the
 *   two exported functions only — `runWithCaller` to set it,
 *   `getCaller` to read it. Consumers never see the storage type.
 *
 * When to use it:
 *   - `withRequestContext` (the HTTP HOF) calls `runWithCaller` once
 *     per request.
 *   - Application code (services, adapters, the logger) calls
 *     `getCaller()` to read identity + correlation data.
 *
 * When NOT to use it:
 *   - Do NOT call `runWithCaller` from inside a service to "set" a
 *     caller — the caller must be established at the boundary
 *     (HTTP edge) so every nested await observes the same identity.
 *
 * RUNTIME REQUIREMENT: Node runtime ONLY. AsyncLocalStorage is not
 * available on the Edge runtime. Routes wrapped by withRequestContext
 * MUST NOT declare `export const runtime = 'edge'`. Edge support is
 * deferred to a future unit (the design would need a header-threaded
 * fallback or a Promise-chain runner).
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Caller } from './Caller'

const als = new AsyncLocalStorage<Caller>()

/**
 * Returns the active `Caller`, or `undefined` if no context is bound
 * (e.g. background job, test that didn't wrap, route not yet migrated).
 */
export function getCaller(): Caller | undefined {
  return als.getStore()
}

/**
 * Run `fn` inside an ALS scope bound to `caller`. Any `getCaller()`
 * call within `fn` — including across `await` boundaries — sees this
 * caller. Returns whatever `fn` returns.
 */
export function runWithCaller<T>(caller: Caller, fn: () => T | Promise<T>): T | Promise<T> {
  return als.run(caller, fn)
}
