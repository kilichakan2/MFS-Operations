/**
 * lib/domain/AuditLogEntry.ts
 *
 * The owned shape of ONE audit-log row (F-20 PR3 — pulls F-TD-31 forward).
 *
 * Pure TypeScript — no vendor import. Today the import routes write this as a
 * loose object inline against the raw Supabase client; now it has a contract so
 * the routes go through the AuditLogRepository port and never touch the vendor.
 *
 * Field-for-field identical to the `audit_log` columns the two import routes
 * already write: user_id, screen, action, record_id, summary.
 */

/** One audit-log entry the app owns. The adapter maps these to audit_log columns. */
export interface AuditLogEntry {
  user_id: string;
  screen: string;
  action: string;
  record_id: string | null;
  summary: string;
}
