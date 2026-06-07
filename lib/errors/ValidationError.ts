/**
 * lib/errors/ValidationError.ts
 *
 * Thrown when an incoming request fails schema or invariant validation.
 * Carries a per-field error map so the client can render messages next
 * to the offending inputs. Maps to HTTP 400.
 *
 * What it hides: the per-field `fields` map shape (a stable contract
 * for clients — `Record<fieldName, string[]>`) and the rule that
 * `fields` is NEVER stripped in production. Stack and cause are
 * stripped; `fields` are the point of the error and the client needs
 * them to render UI.
 *
 * When to use it: zod/joi schema failures, multi-field business-rule
 * failures (e.g. "delivery date must be after order date").
 *
 * When NOT to use it: missing rows (use `NotFoundError`), state
 * collisions (use `ConflictError`).
 */
import { AppError, type ErrorBody } from './AppError'

export interface ValidationErrorBody extends ErrorBody {
  fields: Record<string, string[]>
}

export class ValidationError extends AppError {
  readonly httpStatus = 400
  readonly code       = 'VALIDATION_ERROR'
  readonly fields:    Record<string, string[]>

  constructor(
    message: string,
    fields: Record<string, string[]>,
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, options)
    this.fields = fields
  }

  toJSON(): ValidationErrorBody {
    return { ...super.toJSON(), fields: this.fields }
  }
}
