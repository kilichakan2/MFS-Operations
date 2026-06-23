/**
 * lib/adapters/supabase/HaccpTrainingRepository.ts
 *
 * Supabase implementation of `HaccpTrainingRepository`
 * (lib/ports/HaccpTrainingRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the `lib/adapters/supabase`
 * tree at `.eslintrc.json`). The ONLY file that imports the vendor SDK for the
 * two Cluster C training tables.
 *
 * Boundary discipline (ADR-0002 line 27): every `.select(…)` column list and
 * every insert payload is copied VERBATIM from `app/api/haccp/training/route.ts`
 * (the F-19 PR4 re-point replaces those inline calls), so the wire output stays
 * byte-identical. NOTE the Cluster C difference from Cluster B: the training GET
 * selects are FLAT column lists — NO user join. The reads MUST NOT add a join.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpTrainingRepository(client)` factory.
 *   - `supabaseHaccpTrainingRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract: reads return [] on miss; every DB failure throws ServiceError.
 * The inserts return void (the route discards the inserted row — no `.select()`).
 * NO ConflictError — Cluster C has no clean 409 path today; every DB error stays
 * a 500.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  StaffTrainingRow,
  StaffTrainingPersist,
  AllergenTrainingRow,
  AllergenTrainingPersist,
} from "@/lib/domain";
import type { HaccpTrainingRepository } from "@/lib/ports";

// ─── verbatim select strings (the byte-identity anchor) ──────────────────────

const STAFF_TRAINING_COLS =
  "id, staff_name, job_role, training_type, document_version, completion_date, refresh_date, supervisor_name, confirmation_items, submitted_at";

const ALLERGEN_TRAINING_COLS =
  "id, staff_name, job_role, training_completed, certification_date, refresh_date, reviewed_by, confirmation_items, supervisor_name, document_version, submitted_at";

export function createSupabaseHaccpTrainingRepository(
  client: SupabaseClient,
): HaccpTrainingRepository {
  return {
    async listStaffTraining(): Promise<readonly StaffTrainingRow[]> {
      const { data, error } = await client
        .from("haccp_staff_training")
        .select(STAFF_TRAINING_COLS)
        .order("submitted_at", { ascending: false })
        .limit(100);
      if (error) {
        log.error("HaccpTrainingRepository.listStaffTraining DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load staff training", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as StaffTrainingRow[];
    },

    async listAllergenTraining(): Promise<readonly AllergenTrainingRow[]> {
      const { data, error } = await client
        .from("haccp_allergen_training")
        .select(ALLERGEN_TRAINING_COLS)
        .order("submitted_at", { ascending: false })
        .limit(100);
      if (error) {
        log.error("HaccpTrainingRepository.listAllergenTraining DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load allergen training", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as AllergenTrainingRow[];
    },

    async insertStaffTraining(payload: StaffTrainingPersist): Promise<void> {
      const { error } = await client
        .from("haccp_staff_training")
        .insert(payload as unknown as Record<string, unknown>);
      if (error) {
        log.error("HaccpTrainingRepository.insertStaffTraining DB error", {
          error: error.message,
        });
        throw new ServiceError("Insert failed", { cause: error });
      }
    },

    async insertAllergenTraining(
      payload: AllergenTrainingPersist,
    ): Promise<void> {
      const { error } = await client
        .from("haccp_allergen_training")
        .insert(payload as unknown as Record<string, unknown>);
      if (error) {
        log.error("HaccpTrainingRepository.insertAllergenTraining DB error", {
          error: error.message,
        });
        throw new ServiceError("Insert failed", { cause: error });
      }
    },
  };
}

export const supabaseHaccpTrainingRepository: HaccpTrainingRepository =
  createSupabaseHaccpTrainingRepository(supabaseService);
