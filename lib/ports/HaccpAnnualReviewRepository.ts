/**
 * lib/ports/HaccpAnnualReviewRepository.ts
 *
 * The F-19 PR5 Cluster D "annual review" persistence port — the interface the
 * app owns over haccp_annual_reviews, described in BUSINESS operations. Pure
 * TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * Lifecycle: list (created_at DESC), create draft, fetch-current, sign-off,
 * update.
 *
 * ⚠ `createDraft` is the ONE clean 409 in this PR. The unique-draft index
 * (idx_annual_reviews_one_draft) lets only one unlocked review exist; a second
 * insert fails with Postgres `23505`. The adapter maps `23505` → `ConflictError`
 * with the EXACT route message INSIDE the adapter (ADR-0002 — the raw code never
 * crosses the port boundary, mirroring UsersRepository.createUser). PR6's route
 * catch turns ConflictError into the 409. Every other DB error → ServiceError.
 *
 * ⚠ `findCurrent` returns null on miss — the route's `.single()` errors on 0
 * rows; the adapter treats that as `null` (not a thrown ServiceError) so PR6's
 * `fetchErr || !current` → 404 ('Review not found') path is preserved at the
 * route edge.
 */

import type {
  AnnualReviewRow,
  AnnualReviewCreatePersist,
  AnnualReviewCurrent,
  AnnualReviewSignOffPersist,
  AnnualReviewUpdatePersist,
} from "@/lib/domain";

export interface HaccpAnnualReviewRepository {
  /** All reviews, created_at DESC. → GET /annual-review. */
  listReviews(): Promise<readonly AnnualReviewRow[]>;
  /** Insert a draft; throws ConflictError on 23505 (unique-draft). → POST. */
  createDraft(payload: AnnualReviewCreatePersist): Promise<AnnualReviewRow>;
  /** Fetch-before-update read; null on miss (route decides the 404). → PATCH. */
  findCurrent(id: string): Promise<AnnualReviewCurrent | null>;
  /** Sign-off UPDATE (sets locked=true + signer/approver). → PATCH (sign_off). */
  signOff(
    id: string,
    payload: AnnualReviewSignOffPersist,
  ): Promise<AnnualReviewRow>;
  /** Regular UPDATE (checklist/action_plan + updated_at). → PATCH. */
  update(
    id: string,
    payload: AnnualReviewUpdatePersist,
  ): Promise<AnnualReviewRow>;
}
