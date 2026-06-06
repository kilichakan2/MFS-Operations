/**
 * lib/errors/NotFoundError.ts
 *
 * Thrown when a domain entity could not be located by the given key.
 *
 * When to use it: lookup-by-id misses, missing parent records, deleted
 * rows. Maps to HTTP 404.
 *
 * When NOT to use it: schema-validation failures (use `ValidationError`),
 * authorisation misses (the caller exists but lacks access — that's
 * a separate auth concern, not a 404).
 */
import { AppError } from './AppError'

export class NotFoundError extends AppError {
  readonly httpStatus = 404
  readonly code       = 'NOT_FOUND'
}
