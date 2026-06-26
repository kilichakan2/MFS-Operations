/**
 * lib/adapters/supabase/AuditLogRepository.ts
 *
 * Supabase implementation of `AuditLogRepository` (lib/ports/AuditLogRepository.ts).
 * One of the adapter files allowed to import `@supabase/supabase-js` (the
 * lib/adapters/supabase tree is allow-listed at .eslintrc.json). The ONLY new
 * place the SDK is touched in F-20 PR3.
 *
 * Boundary discipline (ADR-0002 line 27): the `AuditLogEntry` domain fields are
 * mapped to the audit_log column names inside this file; the vendor error shape
 * is mapped to a ServiceError and never leaks past this boundary.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseAuditLogRepository(client)` factory — tests pass
 *     getServiceClient().
 *   - `supabaseAuditLogRepository` singleton — pre-wired against supabaseService.
 *
 * Error contract: `record` throws ServiceError on a DB failure (mirrors the
 * other write adapters). The IMPORT routes `.catch(log)` the call so an audit
 * failure never fails an already-succeeded import (today's behaviour — R-AUDIT).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { AuditLogEntry } from "@/lib/domain";
import type { AuditLogRepository } from "@/lib/ports";

export function createSupabaseAuditLogRepository(
  client: SupabaseClient,
): AuditLogRepository {
  return {
    async record(entry: AuditLogEntry): Promise<void> {
      const { error } = await client.from("audit_log").insert({
        user_id: entry.user_id,
        screen: entry.screen,
        action: entry.action,
        record_id: entry.record_id,
        summary: entry.summary,
      });
      if (error) {
        log.error("AuditLogRepository.record DB error", {
          error: error.message,
        });
        throw new ServiceError("Audit write failed", { cause: error });
      }
    },
  };
}

export const supabaseAuditLogRepository: AuditLogRepository =
  createSupabaseAuditLogRepository(supabaseService);
