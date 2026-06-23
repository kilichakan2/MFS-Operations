/**
 * lib/ports/HaccpAssessmentsRepository.ts
 *
 * The 5-group Cluster B persistence port (F-19 PR3) — the interface the app
 * owns over the HACCP "standing register" tables (allergen-assessment, allergen
 * monthly-reviews, food-defence, food-fraud, product-specs), described in
 * BUSINESS operations. Pure TypeScript: imports domain types only, never an
 * adapter or a vendor SDK.
 *
 * THREE distinct persistence models live in this one cluster — kept as distinct
 * methods so the move can't homogenise one into another:
 *   - append-only insert (allergen-assessment, food-defence, food-fraud): every
 *     POST inserts a fresh row, never overwrites.
 *   - UPSERT-on-month_year (monthly-reviews): re-running a month OVERWRITES it.
 *   - in-place UPDATE by id + active:false soft-delete (product-specs).
 *
 * Boundary discipline (ADR-0002): the adapter maps snake_case columns to the
 * domain row shapes (carrying the ALIASED, NON-inner join keys
 * `assessor`/`updater`/`reviewer`/`preparer`/`approver`/`creator` verbatim) and
 * throws ServiceError on every DB failure INSIDE the adapter; reads define
 * errors out of existence (null/empty on miss).
 *
 * NO ConflictError path — Cluster B has NO clean 409 today; every DB error
 * surfaces as a 500. Do NOT add a 23505 → ConflictError mapping.
 */

import type {
  AllergenAssessmentListResult,
  AllergenAssessmentRow,
  AllergenAssessmentPersist,
  MonthlyReviewRow,
  MonthlyReviewDeliveryRow,
  MonthlyReviewPersist,
  FoodDefenceRow,
  FoodDefencePersist,
  FoodFraudRow,
  FoodFraudPersist,
  ProductSpecRow,
  ProductSpecPersist,
} from "@/lib/domain";

export interface HaccpAssessmentsRepository {
  // ── 1. allergen-assessment ───────────────────────────────────
  /** All assessments (assessed_at DESC) + latest. → GET /allergen-assessment. */
  listAllergenAssessments(): Promise<AllergenAssessmentListResult>;
  /** Append a fresh assessment row; returns the inserted row. Never overwrites.
   *  → POST /allergen-assessment. */
  insertAllergenAssessment(
    payload: AllergenAssessmentPersist,
  ): Promise<AllergenAssessmentRow>;

  // ── 2. allergen monthly-reviews ──────────────────────────────
  /** All monthly reviews (period_start DESC). → GET /…/monthly-reviews. */
  listMonthlyReviews(): Promise<readonly MonthlyReviewRow[]>;
  /** Deliveries in [start,end] for aggregation. → POST /…/monthly-reviews. */
  listDeliveriesInRange(
    start: string,
    end: string,
  ): Promise<readonly MonthlyReviewDeliveryRow[]>;
  /** UPSERT on month_year (re-run overwrites the month). Returns the saved row.
   *  → POST /…/monthly-reviews. */
  upsertMonthlyReview(payload: MonthlyReviewPersist): Promise<MonthlyReviewRow>;

  // ── 3. food-defence ──────────────────────────────────────────
  /** All plan versions (created_at DESC). → GET /food-defence. */
  listFoodDefencePlans(): Promise<readonly FoodDefenceRow[]>;
  /** Append a new plan version; returns the inserted row. → POST /food-defence. */
  insertFoodDefencePlan(payload: FoodDefencePersist): Promise<FoodDefenceRow>;

  // ── 4. food-fraud ────────────────────────────────────────────
  /** All assessment versions (created_at DESC). → GET /food-fraud. */
  listFoodFraudAssessments(): Promise<readonly FoodFraudRow[]>;
  /** Append a new assessment version; returns inserted row. → POST /food-fraud. */
  insertFoodFraudAssessment(payload: FoodFraudPersist): Promise<FoodFraudRow>;

  // ── 5. product-specs ─────────────────────────────────────────
  /** Active specs (product_name ASC). → GET /product-specs. */
  listActiveProductSpecs(): Promise<readonly ProductSpecRow[]>;
  /** Insert a new spec; returns the inserted row. → POST /product-specs. */
  insertProductSpec(payload: ProductSpecPersist): Promise<ProductSpecRow>;
  /** In-place UPDATE by id (active:false = soft-delete). Returns updated row.
   *  `updates` already includes updated_at = now and the conditional allergens.
   *  → PATCH /product-specs. */
  updateProductSpec(
    id: string,
    updates: Record<string, unknown>,
  ): Promise<ProductSpecRow>;
}
