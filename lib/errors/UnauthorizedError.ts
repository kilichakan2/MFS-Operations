/**
 * lib/errors/UnauthorizedError.ts
 *
 * Thrown when no valid identity is present on a request — missing or
 * malformed authentication credentials. Maps to HTTP 401.
 *
 * When to use it: `requireRole(...)` throws this when the
 * x-mfs-user-id header is missing/empty or x-mfs-user-role is
 * missing/unknown. Any helper that decides "the caller has no
 * identity we can check against" throws this.
 *
 * When NOT to use it: the caller IS identified but is forbidden from
 * the action (use `ForbiddenError` — that's a 403, semantically
 * "I know who you are but you're not allowed").
 */
import { AppError } from "./AppError";

export class UnauthorizedError extends AppError {
  readonly httpStatus = 401;
  readonly code = "UNAUTHORIZED";
}
