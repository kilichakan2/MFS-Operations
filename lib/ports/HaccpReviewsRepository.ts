/**
 * lib/ports/HaccpReviewsRepository.ts
 *
 * The F-19 PR5 Cluster D "reviews" persistence port — the interface the app owns
 * over the two HACCP review tables (haccp_weekly_review, haccp_monthly_review)
 * plus the corrective-action (CA) side-effect over haccp_corrective_actions.
 * Pure TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * ⚠ The inserts return `{ id: string }` (NOT void — the Cluster C difference):
 * the route does `.insert(...).select('id').single()` and then uses
 * `inserted.id` as the CA `source_id` (reviews/route.ts:110, 123, 151, 167). So
 * this port MUST hand back the inserted id. The `{ id }` is the minimal shape the
 * CA writer needs — it matches the route's `.select('id')`.
 *
 * ⚠ `insertCorrectiveActions` is BEST-EFFORT by contract: in the route a CA-insert
 * failure is SWALLOWED — `console.error(...)`, NO throw, NO non-200
 * (reviews/route.ts:131, 175). So the CA write is FIRE-AND-FORGET: the adapter
 * catches its own DB error, logs via `log.error`, and RETURNS (does NOT throw),
 * preserving the route's "review still succeeds even if the CA write fails"
 * semantics. PR6 re-points byte-identically.
 *
 * Boundary discipline (ADR-0002): the adapter maps snake_case columns to the
 * domain row shapes and throws ServiceError on every (non-CA) DB failure INSIDE
 * the adapter; reads define errors out of existence (empty on miss). NO
 * ConflictError path — Cluster D's reviews tables have no clean 409 today.
 */

import type {
  ReviewWeeklyRow,
  ReviewWeeklyPersist,
  ReviewMonthlyRow,
  ReviewMonthlyPersist,
  ReviewCorrectiveActionInsert,
} from "@/lib/domain";

export interface HaccpReviewsRepository {
  /** Weekly reviews, submitted_at DESC, limit 10. → GET /reviews (weekly). */
  listWeeklyReviews(): Promise<readonly ReviewWeeklyRow[]>;
  /** Monthly reviews, submitted_at DESC, limit 6. → GET /reviews (monthly). */
  listMonthlyReviews(): Promise<readonly ReviewMonthlyRow[]>;
  /** Insert a weekly review; returns the new row id (CA source_id). → POST. */
  insertWeeklyReview(payload: ReviewWeeklyPersist): Promise<{ id: string }>;
  /** Insert a monthly review; returns the new row id (CA source_id). → POST. */
  insertMonthlyReview(payload: ReviewMonthlyPersist): Promise<{ id: string }>;
  /**
   * Best-effort CA write — logs and does NOT throw on failure (parity with the
   * route's console.error-and-continue at reviews/route.ts:131, 175).
   */
  insertCorrectiveActions(
    rows: readonly ReviewCorrectiveActionInsert[],
  ): Promise<void>;
}
