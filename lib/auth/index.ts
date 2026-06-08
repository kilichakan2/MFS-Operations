/**
 * lib/auth/index.ts
 *
 * Barrel re-export for the auth module. Import surface for callers:
 *   `import { requireRole } from '@/lib/auth'`
 *
 * Today (F-03) the module exports a single helper. Future adopter
 * PRs may add more (e.g. a `requirePermission` helper for
 * field-level checks), at which point the barrel grows by one line
 * per export.
 */
export { requireRole } from "./session";
