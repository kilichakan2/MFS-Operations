/**
 * lib/wiring/auditLog.ts — composition root for the AuditLog port (F-20 PR3)
 *
 * The ONE business-layer file where the AuditLogRepository port is bolted to its
 * concrete Supabase adapter (same F-TD-11 rule as the other wiring files: only
 * composition roots import from `@/lib/adapters/*`, pinned by
 * tests/unit/lint/no-adapter-imports.test.ts).
 *
 * This is a BARE repository singleton (like `geocoder`), NOT a service — there
 * is no business logic to wrap; `record` is already the whole surface. Building
 * an AuditLogService pass-through would be a shallow module (the deletion test
 * fails: deleting it just moves the one call back to the route unchanged).
 *
 * Security posture: the SERVICE-ROLE singleton (master key, RLS bypassed) STAYS
 * as the one-line rollback parachute. F-RLS-04i ADDS the per-request
 * authenticated `auditLogForCaller(userId)` factory: it mints a short-lived DB
 * token, builds a per-caller authenticated client (Postgres `authenticated` role)
 * and binds the AuditLogRepository adapter to it, so the inserted row's `user_id`
 * is checked against the GUC by the `audit_log_insert` WITH CHECK (user_id = GUC)
 * policy. LIVE as of F-RLS-04i: the two import routes call it (caller id from the
 * tamper-proof `x-mfs-user-id` header). Per-request — NEVER memoize (a memoized
 * client would leak one caller's identity to another).
 *
 * Rip-out contract: swapping audit_log's DB vendor = one new adapter + this line.
 */
import {
  supabaseAuditLogRepository, // keep — service-role parachute singleton
  createSupabaseAuditLogRepository, // NEW — per-caller repo
  authenticatedClientForCaller, // NEW
} from "@/lib/adapters/supabase";
import type { AuditLogRepository } from "@/lib/ports";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const auditLog: AuditLogRepository = supabaseAuditLogRepository;

/** Build an AuditLogRepository bound to ONE caller (Postgres `authenticated`
 *  role), so the inserted row's `user_id` satisfies the `audit_log_insert` WITH
 *  CHECK (user_id = GUC) policy. Per-request — NEVER memoize (a memoized client
 *  would leak one caller's identity to another). The `auditLog` singleton above
 *  STAYS as the rollback parachute. */
export async function auditLogForCaller(
  callerUserId: string,
): Promise<AuditLogRepository> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createSupabaseAuditLogRepository(client);
}
