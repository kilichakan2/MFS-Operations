/**
 * lib/adapters/supabase/HaccpAnnualReviewRepository.ts
 *
 * Supabase implementation of `HaccpAnnualReviewRepository`
 * (lib/ports/HaccpAnnualReviewRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js`. The ONLY file that imports the vendor SDK for
 * haccp_annual_reviews.
 *
 * Boundary discipline (ADR-0002 line 27): every `.select(…)` column list and
 * every update payload is copied VERBATIM from
 * `app/api/haccp/annual-review/route.ts` (the F-19 PR6 re-point replaces those
 * inline calls), so the wire output stays byte-identical. The list select carries
 * the aliased signer/approver/creator joins and is returned AS-IS — no remap.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpAnnualReviewRepository(client)` factory.
 *   - `supabaseHaccpAnnualReviewRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract:
 *   - `createDraft` maps Postgres `23505` (unique-draft index) → ConflictError
 *     with the EXACT route message INSIDE the adapter (ADR-0002 — the raw code
 *     never crosses the boundary); every other DB error → ServiceError;
 *   - `findCurrent` returns `null` on `error || !data` (the route's `.single()`
 *     errors on 0 rows → the 404 decision stays downstream at the route edge);
 *   - listReviews/signOff/update throw ServiceError on DB error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError, ConflictError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  AnnualReviewRow,
  AnnualReviewCreatePersist,
  AnnualReviewCurrent,
  AnnualReviewSignOffPersist,
  AnnualReviewUpdatePersist,
} from "@/lib/domain";
import type { HaccpAnnualReviewRepository } from "@/lib/ports";

// ─── verbatim select strings (the byte-identity anchor) ──────────────────────

// annual-review/route.ts:37-44.
const ANNUAL_LIST_COLS = `
        id, review_year, review_period_from, review_period_to,
        checklist, action_plan,
        locked, signed_off_at, approved_at, updated_at, created_at,
        signer:signed_off_by  ( name ),
        approver:approved_by  ( name ),
        creator:created_by    ( name )
      `;

// annual-review/route.ts:141.
const ANNUAL_CURRENT_COLS = "id, locked, checklist";

export function createSupabaseHaccpAnnualReviewRepository(
  client: SupabaseClient,
): HaccpAnnualReviewRepository {
  return {
    async listReviews(): Promise<readonly AnnualReviewRow[]> {
      const { data, error } = await client
        .from("haccp_annual_reviews")
        .select(ANNUAL_LIST_COLS)
        .order("created_at", { ascending: false });
      if (error) {
        log.error("HaccpAnnualReviewRepository.listReviews DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load annual reviews", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as AnnualReviewRow[];
    },

    async createDraft(
      payload: AnnualReviewCreatePersist,
    ): Promise<AnnualReviewRow> {
      const { data, error } = await client
        .from("haccp_annual_reviews")
        .insert(payload as unknown as Record<string, unknown>)
        .select()
        .single();
      if (error) {
        // Unique-draft index violation = draft already exists. Map 23505 →
        // ConflictError INSIDE the adapter so the raw code never crosses the
        // port boundary (ADR-0002); PR6's route catch turns it into the 409.
        if ((error as { code?: string }).code === "23505") {
          throw new ConflictError(
            "A draft review already exists. Complete or delete it before starting a new one.",
            { cause: error },
          );
        }
        log.error("HaccpAnnualReviewRepository.createDraft DB error", {
          error: error.message,
        });
        throw new ServiceError("Annual review create failed", { cause: error });
      }
      return data as unknown as AnnualReviewRow;
    },

    async findCurrent(id: string): Promise<AnnualReviewCurrent | null> {
      const { data, error } = await client
        .from("haccp_annual_reviews")
        .select(ANNUAL_CURRENT_COLS)
        .eq("id", id)
        .single();
      // The route treats `fetchErr || !current` as a 404 — return null here so
      // that 404 decision stays downstream at the route edge (no thrown error).
      if (error || !data) return null;
      return data as unknown as AnnualReviewCurrent;
    },

    async signOff(
      id: string,
      payload: AnnualReviewSignOffPersist,
    ): Promise<AnnualReviewRow> {
      const { data, error } = await client
        .from("haccp_annual_reviews")
        .update(payload as unknown as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        log.error("HaccpAnnualReviewRepository.signOff DB error", {
          error: error.message,
        });
        throw new ServiceError("Annual review sign-off failed", {
          cause: error,
        });
      }
      return data as unknown as AnnualReviewRow;
    },

    async update(
      id: string,
      payload: AnnualReviewUpdatePersist,
    ): Promise<AnnualReviewRow> {
      const { data, error } = await client
        .from("haccp_annual_reviews")
        .update(payload as unknown as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        log.error("HaccpAnnualReviewRepository.update DB error", {
          error: error.message,
        });
        throw new ServiceError("Annual review update failed", { cause: error });
      }
      return data as unknown as AnnualReviewRow;
    },
  };
}

export const supabaseHaccpAnnualReviewRepository: HaccpAnnualReviewRepository =
  createSupabaseHaccpAnnualReviewRepository(supabaseService);
