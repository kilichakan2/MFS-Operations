/**
 * lib/errors/AppError.ts
 *
 * Base typed-error class for the application core. Hides the entire
 * vendor-neutral error semantics behind a small surface (constructor +
 * `toJSON()` + `httpStatus` + `code`) so callers throw a class instance
 * and the framework handler does the rest.
 *
 * What it hides:
 *   - HTTP status-code mapping (lives on each subclass).
 *   - Production-mode redaction of `cause` and `stack` from response
 *     bodies (handled by `toJSON()` based on `process.env.NODE_ENV`).
 *   - Serialisation of a thrown `Error` `cause` into a JSON-safe shape.
 *
 * When to use it:
 *   - Subclass it (`NotFoundError`, `ConflictError`, `ValidationError`,
 *     `ServiceError`) to carry domain meaning across layer boundaries.
 *   - Do NOT instantiate `AppError` directly — it's abstract.
 *
 * Production safety: `toJSON()` strips `cause` and `stack` when
 * `NODE_ENV === 'production'`. Dev mode keeps them for debugging.
 * `process.env.NODE_ENV` is read at call time (not module load) so
 * tests can mutate it freely without module-cache games.
 *
 * Design references:
 *   APOSD principle #11 (define errors out of existence) — class
 *     carries status, so callers don't repeat the mapping.
 *   APOSD principle #10 (pull complexity downward) — redaction logic
 *     lives once here, not in every route.
 *
 * ES2017 caveat: target predates the `Error.cause` constructor option
 * (ES2022). We assign `this.cause` ourselves rather than relying on
 * `super(message, { cause })`. Newer runtimes that support the option
 * see the field populated identically.
 */
export interface ErrorBody {
  code:     string
  message:  string
  context?: Record<string, unknown>
  cause?:   unknown   // dev mode only — stripped in production
  stack?:   string    // dev mode only — stripped in production
}

export abstract class AppError extends Error {
  abstract readonly httpStatus: number
  abstract readonly code:       string
  readonly context?: Record<string, unknown>

  constructor(
    message: string,
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message)
    this.name = this.constructor.name
    if (options?.cause !== undefined) {
      // ES2017 target: assign explicitly. Newer runtimes that support
      // the { cause } option will see the field populated identically.
      (this as { cause?: unknown }).cause = options.cause
    }
    if (options?.context !== undefined) {
      (this as { context?: Record<string, unknown> }).context = options.context
    }
  }

  toJSON(): ErrorBody {
    const body: ErrorBody = {
      code:    this.code,
      message: this.message,
    }
    if (this.context !== undefined) body.context = this.context

    // Production safety: never leak cause/stack to client.
    if (process.env.NODE_ENV !== 'production') {
      const selfCause = (this as { cause?: unknown }).cause
      if (selfCause !== undefined) {
        body.cause = serialiseCause(selfCause)
      }
      if (this.stack !== undefined) body.stack = this.stack
    }
    return body
  }
}

function serialiseCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack }
  }
  return cause
}
