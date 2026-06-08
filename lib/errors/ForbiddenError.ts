/**
 * lib/errors/ForbiddenError.ts
 *
 * Thrown when a request is authenticated but lacks the role / permission
 * required for the requested action. Maps to HTTP 403.
 *
 * When to use it: `requireRole(...)` throws this when the resolved
 * primary + secondaries union has no overlap with the route's
 * allowedRoles. Any helper that decides "I know who you are but you're
 * not allowed" throws this.
 *
 * When NOT to use it: the caller has no identity at all (use
 * `UnauthorizedError` — that's a 401). The HTTP spec is clear: 401
 * for "not authenticated", 403 for "authenticated but not allowed".
 */
import { AppError } from "./AppError";

export class ForbiddenError extends AppError {
  readonly httpStatus = 403;
  readonly code = "FORBIDDEN";
}
