/**
 * lib/adapters/supabase/HaccpReviewsRepository.ts
 *
 * Supabase implementation of `HaccpReviewsRepository`
 * (lib/ports/HaccpReviewsRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js`. The ONLY file that imports the vendor SDK for
 * the two Cluster D review tables + their corrective-action side-effect.
 *
 * Boundary discipline (ADR-0002 line 27): every `.select(…)` column list and
 * every insert is copied VERBATIM from `app/api/haccp/reviews/route.ts` (the F-19
 * PR6 re-point replaces those inline calls), so the wire output stays byte-
 * identical. The weekly/monthly reads carry the `users!inner(name)` join.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpReviewsRepository(client)` factory.
 *   - `supabaseHaccpReviewsRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract:
 *   - reads return [] on miss; every read/insert DB failure throws ServiceError;
 *   - inserts return `{ id }` (the route does `.insert(...).select('id').single()`
 *     and uses inserted.id as the CA source_id);
 *   - `insertCorrectiveActions` is BEST-EFFORT — it logs and does NOT throw on
 *     failure, exactly reproducing the route's console.error-and-continue
 *     (reviews/route.ts:131, 175), so the review's success reply is unchanged.
 *   - NO ConflictError — Cluster D's review tables have no clean 409 today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  ReviewWeeklyRow,
  ReviewWeeklyPersist,
  ReviewMonthlyRow,
  ReviewMonthlyPersist,
  ReviewCorrectiveActionInsert,
} from "@/lib/domain";
import type { HaccpReviewsRepository } from "@/lib/ports";

// ─── verbatim select strings (the byte-identity anchor) ──────────────────────

const WEEKLY_COLS =
  "id, week_ending, date, assessments, submitted_at, users!inner(name)";

const MONTHLY_COLS =
  "id, month_year, date, equipment_checks, facilities_checks, haccp_system_review, further_notes, submitted_at, users!inner(name)";

export function createSupabaseHaccpReviewsRepository(
  client: SupabaseClient,
): HaccpReviewsRepository {
  return {
    async listWeeklyReviews(): Promise<readonly ReviewWeeklyRow[]> {
      const { data, error } = await client
        .from("haccp_weekly_review")
        .select(WEEKLY_COLS)
        .order("submitted_at", { ascending: false })
        .limit(10);
      if (error) {
        log.error("HaccpReviewsRepository.listWeeklyReviews DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load weekly reviews", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as ReviewWeeklyRow[];
    },

    async listMonthlyReviews(): Promise<readonly ReviewMonthlyRow[]> {
      const { data, error } = await client
        .from("haccp_monthly_review")
        .select(MONTHLY_COLS)
        .order("submitted_at", { ascending: false })
        .limit(6);
      if (error) {
        log.error("HaccpReviewsRepository.listMonthlyReviews DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load monthly reviews", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as ReviewMonthlyRow[];
    },

    async insertWeeklyReview(
      payload: ReviewWeeklyPersist,
    ): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_weekly_review")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        log.error("HaccpReviewsRepository.insertWeeklyReview DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", { cause: error ?? undefined });
      }
      return { id: (data as { id: string }).id };
    },

    async insertMonthlyReview(
      payload: ReviewMonthlyPersist,
    ): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_monthly_review")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        log.error("HaccpReviewsRepository.insertMonthlyReview DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", { cause: error ?? undefined });
      }
      return { id: (data as { id: string }).id };
    },

    async insertCorrectiveActions(
      rows: readonly ReviewCorrectiveActionInsert[],
    ): Promise<void> {
      // BEST-EFFORT: mirror the route's console.error-and-continue
      // (reviews/route.ts:131, 175). On failure we log and RETURN — never throw,
      // so the review's success reply is unchanged.
      const { error } = await client
        .from("haccp_corrective_actions")
        .insert(rows as unknown as Record<string, unknown>[]);
      if (error) {
        log.error("HaccpReviewsRepository.insertCorrectiveActions DB error", {
          error: error.message,
        });
      }
    },
  };
}

export const supabaseHaccpReviewsRepository: HaccpReviewsRepository =
  createSupabaseHaccpReviewsRepository(supabaseService);
