/**
 * lib/errors/withErrors.ts
 *
 * Higher-Order-Function wrapper for Next.js App Router route handlers.
 *
 * What it hides:
 *   - Translation from a thrown `AppError` to a `Response` with the
 *     correct HTTP status + JSON body.
 *   - Catch-all for non-`AppError` throws — returns a safe 500 with a
 *     generic body so unexpected vendor messages never reach the wire.
 *   - Logging the original (unknown) error server-side so debugging
 *     remains possible.
 *
 * When to use it: every route handler in `app/api/**` from F-08 onward.
 * Wrap once at the export — internal try/catch around domain errors
 * becomes unnecessary (and counter-productive) once the route is
 * wrapped.
 *
 * When NOT to use it: edge functions that genuinely need to return a
 * non-JSON body (file streams, redirects) on the error path. Those
 * stay manual until a streaming variant is designed.
 *
 * Production safety: `AppError.toJSON()` already strips cause/stack
 * before this code sees them. For unknown errors, the wrapper returns
 * only `'Internal Server Error'` — never the raw `err.message`.
 *
 * Logger: `console.error` is a stub. F-FND-03 (observability) replaces
 * it with structured logging + correlation IDs. Do not "optimise" this
 * to a no-op — the log line is the only diagnostic until F-FND-03.
 *
 * Usage:
 *   export const POST = withErrors(async (req: NextRequest) => {
 *     const order = await OrdersService.create(...)   // may throw AppError
 *     return NextResponse.json({ order }, { status: 201 })
 *   })
 *
 * F-FND-02 ships the wrapper. F-08 (Orders) is the first PR to apply it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { AppError } from './AppError'

export type RouteHandler<Args extends unknown[] = []> = (
  req: NextRequest,
  ...rest: Args
) => Promise<Response>

export function withErrors<Args extends unknown[]>(
  handler: RouteHandler<Args>
): RouteHandler<Args> {
  return async (req: NextRequest, ...rest: Args): Promise<Response> => {
    try {
      return await handler(req, ...rest)
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json(err.toJSON(), { status: err.httpStatus })
      }
      // Unknown error — log original, return safe 500.
      console.error('[withErrors] unknown error', err)
      const safeBody = {
        code:    'INTERNAL_ERROR',
        message: 'Internal Server Error',
      }
      return NextResponse.json(safeBody, { status: 500 })
    }
  }
}
