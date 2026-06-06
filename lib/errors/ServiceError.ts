/**
 * lib/errors/ServiceError.ts
 *
 * Catch-all for unexpected downstream failures — DB timeouts, upstream
 * vendor 500s, anything the service layer couldn't classify more
 * precisely. Maps to HTTP 500.
 *
 * When to use it: wrap an unknown `cause` so the original error is
 * preserved server-side without leaking detail to the client. The HOF
 * handler will strip the `cause` chain from production responses
 * automatically.
 *
 * When NOT to use it: any case where a more specific subclass fits
 * (NotFound / Conflict / Validation). Defaulting to ServiceError is
 * a smell — it usually means the call site needs a precise error type.
 */
import { AppError } from './AppError'

export class ServiceError extends AppError {
  readonly httpStatus = 500
  readonly code       = 'SERVICE_ERROR'
}
