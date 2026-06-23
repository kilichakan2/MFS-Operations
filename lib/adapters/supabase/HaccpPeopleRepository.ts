/**
 * lib/adapters/supabase/HaccpPeopleRepository.ts
 *
 * Supabase implementation of `HaccpPeopleRepository`
 * (lib/ports/HaccpPeopleRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the `lib/adapters/supabase`
 * tree at `.eslintrc.json`). The ONLY file that imports the vendor SDK for the
 * haccp_health_records table (SHARED by people + the public visitor kiosk).
 *
 * Boundary discipline (ADR-0002 line 27): the `.select(…)` column list and the
 * insert payload are copied VERBATIM from `app/api/haccp/people/route.ts` +
 * `app/api/haccp/visitor/route.ts` (the F-19 PR4 re-point replaces those inline
 * calls), so the wire output stays byte-identical.
 *
 * BYTE-IDENTITY NUANCE: the join key stays `users` (the `users!submitted_by(name)`
 * join), NOT an alias. NON-inner → a row with a null submitted_by still returns
 * with `users: null`.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpPeopleRepository(client)` factory.
 *   - `supabaseHaccpPeopleRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract: reads return [] on miss; every DB failure throws ServiceError.
 * The insert returns void (both routes discard the inserted row — no `.select()`).
 * NO ConflictError — Cluster C has no clean 409 path today; every DB error stays
 * a 500.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { HealthRecordRow, HealthRecordPersist } from "@/lib/domain";
import type { HaccpPeopleRepository } from "@/lib/ports";

// ─── verbatim select string (the byte-identity anchor) ───────────────────────

const HEALTH_RECORD_COLS =
  "id, record_type, date, staff_name, visitor_name, visitor_company, fit_for_work, health_questions, exclusion_reason, illness_type, absence_from, absence_to, manager_signed_name, submitted_at, users!submitted_by(name)";

export function createSupabaseHaccpPeopleRepository(
  client: SupabaseClient,
): HaccpPeopleRepository {
  return {
    async listHealthRecords(): Promise<readonly HealthRecordRow[]> {
      const { data, error } = await client
        .from("haccp_health_records")
        .select(HEALTH_RECORD_COLS)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) {
        log.error("HaccpPeopleRepository.listHealthRecords DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load health records", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as HealthRecordRow[];
    },

    async insertHealthRecord(payload: HealthRecordPersist): Promise<void> {
      const { error } = await client
        .from("haccp_health_records")
        .insert(payload as unknown as Record<string, unknown>);
      if (error) {
        log.error("HaccpPeopleRepository.insertHealthRecord DB error", {
          error: error.message,
        });
        throw new ServiceError("Insert failed", { cause: error });
      }
    },
  };
}

export const supabaseHaccpPeopleRepository: HaccpPeopleRepository =
  createSupabaseHaccpPeopleRepository(supabaseService);
