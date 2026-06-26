/**
 * lib/ports/AuditLogRepository.ts
 *
 * The AuditLog port — the app's own socket for "persist one audit row" (F-20
 * PR3, pulls F-TD-31 forward). The two import routes write their "who imported
 * what, when" logbook line through this instead of touching the raw Supabase
 * client.
 *
 * Pure TypeScript: imports the domain `AuditLogEntry` only, never an adapter or
 * a vendor SDK.
 *
 * Posture (await-blocking — DECISION, see the plan): today both routes
 * `await supabase.from('audit_log').insert(...)` BEFORE returning 201, so a
 * slow/failed audit insert delays the response exactly as today. `record` is
 * await-blocking to preserve that timing. It is the WHOLE surface (write-only,
 * no read-back) — the deepest possible interface.
 *
 * Error contract: `record` throws ServiceError on a DB failure. NOTE the callers
 * MUST `.catch(log)` the call — today the routes IGNORE the `{ error }` result,
 * so an audit-write failure NEVER fails an already-succeeded import. The route
 * preserves that with `await auditLog.record(...).catch(log)` (see R-AUDIT).
 */

import type { AuditLogEntry } from "@/lib/domain";

export interface AuditLogRepository {
  /** Persist ONE audit row. Await-blocking (callers await before responding,
   *  matching today's inline insert). @throws ServiceError on DB failure. */
  record(entry: AuditLogEntry): Promise<void>;
}
