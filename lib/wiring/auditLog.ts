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
 * Security posture (PR3): SERVICE-ROLE singleton (master key, RLS bypassed) —
 * the same posture the two import routes use today, and the one-line rollback
 * parachute. Per-user RLS for these routes is deferred to F-RLS-04i.
 *
 * Rip-out contract: swapping audit_log's DB vendor = one new adapter + this line.
 */
import { supabaseAuditLogRepository } from "@/lib/adapters/supabase";
import type { AuditLogRepository } from "@/lib/ports";

export const auditLog: AuditLogRepository = supabaseAuditLogRepository;
