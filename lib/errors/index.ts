/**
 * lib/errors/index.ts
 *
 * Barrel re-export for the typed error contract + framework handler.
 * Import surface for callers: `import { NotFoundError, withErrors }
 * from '@/lib/errors'`.
 */
export { AppError, type ErrorBody } from "./AppError";
export { NotFoundError } from "./NotFoundError";
export { ConflictError } from "./ConflictError";
export { UnauthorizedError } from "./UnauthorizedError";
export { ForbiddenError } from "./ForbiddenError";
export { ValidationError, type ValidationErrorBody } from "./ValidationError";
export { ServiceError } from "./ServiceError";
export { withErrors, type RouteHandler } from "./withErrors";
