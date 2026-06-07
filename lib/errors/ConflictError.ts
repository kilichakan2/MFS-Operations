/**
 * lib/errors/ConflictError.ts
 *
 * Thrown when a request collides with current state — duplicate keys,
 * stale optimistic-concurrency tokens, attempts to mutate a frozen
 * record. Maps to HTTP 409.
 *
 * When to use it: unique-constraint violations, version mismatches,
 * "this order is already dispatched" guards.
 *
 * When NOT to use it: input is malformed before any state is consulted
 * (use `ValidationError`), or the resource simply doesn't exist
 * (use `NotFoundError`).
 */
import { AppError } from './AppError'

export class ConflictError extends AppError {
  readonly httpStatus = 409
  readonly code       = 'CONFLICT'
}
