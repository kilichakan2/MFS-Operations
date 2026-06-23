/**
 * lib/domain/HaccpAssessment.ts
 *
 * Domain types for the 5 Cluster B "standing register" groups (F-19 PR3):
 * allergen-assessment, allergen monthly-reviews, food-defence, food-fraud and
 * product-specs.
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * MODELING NOTE (design decision — mirrors Cluster A's `HaccpDailyCheck.ts`):
 *   ONE cohesive file for all 5 register groups rather than 5 per-group files.
 *   These five share a common skeleton — a `created_by`/`reviewed_by`/
 *   `assessed_by` user-ref, a `next_review_date`/`reviewed_at` review cadence,
 *   an `active`/version notion and the SAME role-gate — they are five faces of
 *   one "standing registers" ledger. Splitting them would create SHALLOW
 *   modules (each file almost entirely interface, no behaviour to hide) and
 *   widen the barrel's import surface without hiding anything.
 *
 * Boundary discipline (ADR-0002): the GET-list rows carry the RAW columns the
 * routes return today (snake_case, ALIASED joins as `assessor`/`reviewer`/etc.)
 * so the PR3 wire output stays byte-identical. NOTE the Cluster B difference
 * from Cluster A: these joins are ALIASED and NON-inner (`assessor:assessed_by
 * (name)`), so the join target can be `null` (the row is NOT filtered out) and
 * the JSON key is the alias, not `users`. The POST/PATCH bodies are modelled as
 * the app's own input vocabulary; the derived insert/upsert rows are the
 * `…Persist` shapes.
 */

// ─── shared ──────────────────────────────────────────────────────────────────

/**
 * A `{ name }` user join the GET reads resolve against (aliased, NON-inner —
 * `assessor:assessed_by(name)`). Because the join is not `!inner`, a row with a
 * null user-ref still returns with the join target `null`.
 */
export type HaccpUserRef = { readonly name: string } | null;

// ─── 1. allergen-assessment ──────────────────────────────────────────────────

/** GET /api/haccp/allergen-assessment list row — verbatim `.select` columns. */
export interface AllergenAssessmentRow {
  readonly id: string;
  readonly site_status: string;
  readonly raw_materials: unknown;
  readonly cross_contam_risk: string | null;
  readonly procedure_notes: string | null;
  readonly assessed_at: string;
  readonly next_review_date: string;
  readonly assessor: HaccpUserRef;
  readonly updater: HaccpUserRef;
}

/** The EXACT GET response shape (`assessment` = latest, backward-compatible). */
export interface AllergenAssessmentListResult {
  readonly assessment: AllergenAssessmentRow | null;
  readonly all_assessments: readonly AllergenAssessmentRow[];
}

/** POST /api/haccp/allergen-assessment body. */
export interface CreateAllergenAssessmentInput {
  readonly site_status: string;
  readonly raw_materials?: unknown;
  readonly cross_contam_risk?: string;
  readonly procedure_notes?: string;
  readonly next_review_date: string;
}

/** The derived insert row for `haccp_allergen_assessment`. */
export interface AllergenAssessmentPersist {
  readonly assessed_by: string;
  readonly assessed_at: string;
  readonly next_review_date: string;
  readonly site_status: string;
  readonly raw_materials: unknown;
  readonly cross_contam_risk: string;
  readonly procedure_notes: string | null;
  readonly updated_by: string;
  readonly updated_at: string;
}

// ─── 2. allergen monthly-reviews ─────────────────────────────────────────────

/** GET /api/haccp/.../monthly-reviews list row — verbatim `.select` columns. */
export interface MonthlyReviewRow {
  readonly id: string;
  readonly month_year: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly total_deliveries: number;
  readonly allergen_detections: number;
  readonly category_breakdown: Record<string, number>;
  readonly detection_details: unknown;
  readonly site_status: string;
  readonly reviewed_at: string;
  readonly notes: string | null;
  readonly reviewer: HaccpUserRef;
}

/** The delivery rows the POST reads to aggregate a monthly review. */
export interface MonthlyReviewDeliveryRow {
  readonly id: string;
  readonly date: string;
  readonly supplier: string;
  readonly product: string;
  readonly product_category: string;
  readonly allergens_identified: boolean;
  readonly allergen_notes: string | null;
  readonly batch_number: string | null;
}

/** POST /api/haccp/.../monthly-reviews body. */
export interface RunMonthlyReviewInput {
  readonly month_year: string;
  readonly notes?: string;
}

/** The derived UPSERT row for `haccp_allergen_monthly_reviews`. */
export interface MonthlyReviewPersist {
  readonly month_year: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly total_deliveries: number;
  readonly allergen_detections: number;
  readonly category_breakdown: Record<string, number>;
  readonly detection_details: ReadonlyArray<{
    readonly date: string;
    readonly supplier: string;
    readonly product: string;
    readonly category: string;
    readonly batch_number: string | null;
    readonly allergen_notes: string | null;
  }>;
  readonly site_status: string;
  readonly reviewed_by: string;
  readonly reviewed_at: string;
  readonly notes: string | null;
}

/** The EXACT POST response shape for a run monthly review. */
export interface MonthlyReviewResult {
  readonly review: MonthlyReviewRow;
  readonly total_deliveries: number;
  readonly detections: number;
  readonly site_status: string;
  readonly already_existed: false;
}

// ─── 3. food-defence ─────────────────────────────────────────────────────────

/** GET /api/haccp/food-defence list row — verbatim `.select` columns. */
export interface FoodDefenceRow {
  readonly id: string;
  readonly version: string;
  readonly issue_date: string;
  readonly next_review_date: string;
  readonly team: unknown;
  readonly physical_perimeter: unknown;
  readonly physical_internal: unknown;
  readonly cyber_controls: unknown;
  readonly backup_recovery: unknown;
  readonly emergency_contacts: unknown;
  readonly personnel_notes: string | null;
  readonly goods_notes: string | null;
  readonly incident_notes: string | null;
  readonly created_at: string;
  readonly preparer: HaccpUserRef;
  readonly approver: HaccpUserRef;
  readonly creator: HaccpUserRef;
}

/** The EXACT GET response shape for food-defence. */
export interface FoodDefenceListResult {
  readonly plans: readonly FoodDefenceRow[];
  readonly latest: FoodDefenceRow | null;
  readonly review_due: boolean;
}

/** POST /api/haccp/food-defence body. */
export interface CreateFoodDefenceInput {
  readonly version: string;
  readonly issue_date: string;
  readonly next_review_date: string;
  readonly team?: unknown;
  readonly physical_perimeter?: unknown;
  readonly physical_internal?: unknown;
  readonly cyber_controls?: unknown;
  readonly backup_recovery?: unknown;
  readonly emergency_contacts?: unknown;
  readonly personnel_notes?: string;
  readonly goods_notes?: string;
  readonly incident_notes?: string;
  readonly prepared_by?: string;
  readonly approved_by?: string;
}

/** The derived insert row for `haccp_food_defence_plans`. */
export interface FoodDefencePersist {
  readonly version: string;
  readonly issue_date: string;
  readonly next_review_date: string;
  readonly team: unknown;
  readonly physical_perimeter: unknown;
  readonly physical_internal: unknown;
  readonly cyber_controls: unknown;
  readonly backup_recovery: unknown;
  readonly emergency_contacts: unknown;
  readonly personnel_notes: string | null;
  readonly goods_notes: string | null;
  readonly incident_notes: string | null;
  readonly prepared_by: string | null;
  readonly approved_by: string | null;
  readonly created_by: string;
}

// ─── 4. food-fraud ───────────────────────────────────────────────────────────

/** GET /api/haccp/food-fraud list row — verbatim `.select` columns. */
export interface FoodFraudRow {
  readonly id: string;
  readonly version: string;
  readonly issue_date: string;
  readonly next_review_date: string;
  readonly risks: unknown;
  readonly supply_chain: unknown;
  readonly mitigation_notes: string | null;
  readonly created_at: string;
  readonly preparer: HaccpUserRef;
  readonly approver: HaccpUserRef;
  readonly creator: HaccpUserRef;
}

/** The EXACT GET response shape for food-fraud. */
export interface FoodFraudListResult {
  readonly assessments: readonly FoodFraudRow[];
  readonly latest: FoodFraudRow | null;
  readonly review_due: boolean;
}

/** POST /api/haccp/food-fraud body. */
export interface CreateFoodFraudInput {
  readonly version: string;
  readonly issue_date: string;
  readonly next_review_date: string;
  readonly risks: unknown;
  readonly supply_chain?: unknown;
  readonly mitigation_notes?: string;
  readonly prepared_by?: string;
  readonly approved_by?: string;
}

/** The derived insert row for `haccp_food_fraud_assessments`. */
export interface FoodFraudPersist {
  readonly version: string;
  readonly issue_date: string;
  readonly next_review_date: string;
  readonly risks: unknown;
  readonly supply_chain: unknown;
  readonly mitigation_notes: string | null;
  readonly prepared_by: string | null;
  readonly approved_by: string | null;
  readonly created_by: string;
}

// ─── 5. product-specs ────────────────────────────────────────────────────────

/** GET /api/haccp/product-specs list row — verbatim `.select` columns. */
export interface ProductSpecRow {
  readonly id: string;
  readonly product_name: string;
  readonly description: string | null;
  readonly ingredients: string | null;
  readonly allergens: unknown;
  readonly allergen_notes: string | null;
  readonly portion_weight_g: number | null;
  readonly storage_temp_c: number | null;
  readonly shelf_life_chilled_days: number | null;
  readonly shelf_life_frozen_days: number | null;
  readonly packaging_type: string | null;
  readonly micro_limits: string | null;
  readonly version: string;
  readonly reviewed_at: string | null;
  readonly active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly reviewer: HaccpUserRef;
  readonly creator: HaccpUserRef;
}

/** A product-spec row plus the derived `review_due` flag the GET adds per row. */
export type ProductSpecWithReviewDue = ProductSpecRow & {
  readonly review_due: boolean;
};

/** The EXACT GET response shape for product-specs. */
export interface ProductSpecListResult {
  readonly specs: readonly ProductSpecWithReviewDue[];
  readonly review_due_count: number;
}

/** POST /api/haccp/product-specs body. */
export interface CreateProductSpecInput {
  readonly product_name: string;
  readonly description?: string;
  readonly ingredients?: string;
  readonly allergens?: unknown;
  readonly allergen_notes?: string;
  readonly portion_weight_g?: number;
  readonly storage_temp_c?: number;
  readonly shelf_life_chilled_days?: number;
  readonly shelf_life_frozen_days?: number;
  readonly packaging_type?: string;
  readonly micro_limits?: string;
  readonly version?: string;
  readonly reviewed_at?: string;
  readonly reviewed_by?: string;
}

/** The derived insert row for `haccp_product_specs` (POST). */
export interface ProductSpecPersist {
  readonly product_name: string;
  readonly description: string | null;
  readonly ingredients: string | null;
  readonly allergens: unknown;
  readonly allergen_notes: string | null;
  readonly portion_weight_g: number | null;
  readonly storage_temp_c: number | null;
  readonly shelf_life_chilled_days: number | null;
  readonly shelf_life_frozen_days: number | null;
  readonly packaging_type: string | null;
  readonly micro_limits: string | null;
  readonly version: string;
  readonly reviewed_at: string | null;
  readonly reviewed_by: string | null;
  readonly created_by: string;
  readonly updated_at: string;
}
