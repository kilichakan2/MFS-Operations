/**
 * lib/services/HaccpAssessmentsService.ts
 *
 * The Cluster B "standing registers" service (F-19 PR3) — business orchestration
 * for the 5 register groups (allergen-assessment, allergen monthly-reviews,
 * food-defence, food-fraud, product-specs). Factory here, wiring in
 * `lib/wiring/haccp.ts`; depends on the `assessments` port alone, never on
 * another service and never on the adapters folder (lint-enforced, ADR-0002 /
 * F-TD-11).
 *
 * The pure register logic the routes do today — the required-field `validate…`
 * cascades (with the routes' EXACT 400 strings), the two `review_due`
 * predicates, the `build…Persist` row builders and the monthly-review
 * aggregation — is LIFTED here so it gets unit-tested now and PR3's routes
 * shrink to "validate → build → write → reply". Lifting deepens the service and
 * concentrates the logic in one tested place.
 *
 * DETERMINISM (constraint 8): every "now"/"today" decision is passed IN as a
 * `now: Date` parameter — the service NEVER reaches for `new Date()`. The
 * monthly-review date maths is IMPORTED from `@/lib/allergen/monthlyReviewUtils`
 * (a pure, vendor-free module — allowed by ADR-0002, like `@/lib/errors`) rather
 * than copied, so there is one source of truth and the existing util test stays
 * green.
 *
 * NO ConflictError path — Cluster B has no clean 409 today; the adapter throws
 * ServiceError on every DB error and the route catch returns its existing 500.
 */

import type {
  AllergenAssessmentListResult,
  AllergenAssessmentRow,
  AllergenAssessmentPersist,
  CreateAllergenAssessmentInput,
  MonthlyReviewRow,
  MonthlyReviewResult,
  RunMonthlyReviewInput,
  FoodDefenceListResult,
  FoodDefenceRow,
  FoodDefencePersist,
  CreateFoodDefenceInput,
  FoodFraudListResult,
  FoodFraudRow,
  FoodFraudPersist,
  CreateFoodFraudInput,
  ProductSpecListResult,
  ProductSpecRow,
  ProductSpecPersist,
  CreateProductSpecInput,
} from "@/lib/domain";
import type { HaccpAssessmentsRepository } from "@/lib/ports";
import {
  monthDateRange,
  deriveSiteStatus,
  buildCategoryBreakdown,
} from "@/lib/allergen/monthlyReviewUtils";

// ─── result helpers ──────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function reject(status: number, message: string): ValidationResult {
  return { ok: false, status, message };
}

/** The monthly-review run outcome: a 400 rejection OR the success result. */
export type RunMonthlyReviewResult =
  | { ok: false; status: number; message: string }
  | { ok: true; result: MonthlyReviewResult };

// ─── deps + interface ────────────────────────────────────────────────────────

export interface HaccpAssessmentsServiceDeps {
  readonly assessments: HaccpAssessmentsRepository;
}

export interface HaccpAssessmentsService {
  // ── 1. allergen-assessment ──
  listAllergenAssessments(): Promise<AllergenAssessmentListResult>;
  validateAllergenAssessment(
    input: CreateAllergenAssessmentInput,
  ): ValidationResult;
  buildAllergenAssessmentPersist(args: {
    input: CreateAllergenAssessmentInput;
    userId: string;
    now: Date;
  }): AllergenAssessmentPersist;
  insertAllergenAssessment(
    payload: AllergenAssessmentPersist,
  ): Promise<AllergenAssessmentRow>;

  // ── 2. allergen monthly-reviews ──
  listMonthlyReviews(): Promise<readonly MonthlyReviewRow[]>;
  runMonthlyReview(args: {
    input: RunMonthlyReviewInput;
    userId: string;
    now: Date;
  }): Promise<RunMonthlyReviewResult>;

  // ── 3. food-defence ──
  getFoodDefence(now: Date): Promise<FoodDefenceListResult>;
  validateFoodDefence(input: CreateFoodDefenceInput): ValidationResult;
  buildFoodDefencePersist(args: {
    input: CreateFoodDefenceInput;
    userId: string;
  }): FoodDefencePersist;
  insertFoodDefencePlan(payload: FoodDefencePersist): Promise<FoodDefenceRow>;

  // ── 4. food-fraud ──
  getFoodFraud(now: Date): Promise<FoodFraudListResult>;
  validateFoodFraud(input: CreateFoodFraudInput): ValidationResult;
  buildFoodFraudPersist(args: {
    input: CreateFoodFraudInput;
    userId: string;
  }): FoodFraudPersist;
  insertFoodFraudAssessment(payload: FoodFraudPersist): Promise<FoodFraudRow>;

  // ── 5. product-specs ──
  getProductSpecs(now: Date): Promise<ProductSpecListResult>;
  validateProductSpec(input: CreateProductSpecInput): ValidationResult;
  buildProductSpecPersist(args: {
    input: CreateProductSpecInput;
    userId: string;
    now: Date;
  }): ProductSpecPersist;
  insertProductSpec(payload: ProductSpecPersist): Promise<ProductSpecRow>;
  updateProductSpec(
    id: string,
    updates: Record<string, unknown>,
  ): Promise<ProductSpecRow>;
}

/** `now` minus 12 calendar months — mirrors the route's `setFullYear(-1)`. */
function twelveMonthsBefore(now: Date): Date {
  const d = new Date(now.getTime());
  d.setFullYear(d.getFullYear() - 1);
  return d;
}

export function createHaccpAssessmentsService(
  deps: HaccpAssessmentsServiceDeps,
): HaccpAssessmentsService {
  const { assessments } = deps;

  return {
    // ── 1. allergen-assessment ──
    listAllergenAssessments: () => assessments.listAllergenAssessments(),

    validateAllergenAssessment(input): ValidationResult {
      if (!input.site_status || !input.next_review_date) {
        return reject(400, "site_status and next_review_date required");
      }
      return { ok: true };
    },

    buildAllergenAssessmentPersist({
      input,
      userId,
      now,
    }): AllergenAssessmentPersist {
      const iso = now.toISOString();
      return {
        assessed_by: userId,
        assessed_at: iso,
        next_review_date: input.next_review_date,
        site_status: input.site_status,
        raw_materials: input.raw_materials ?? [],
        cross_contam_risk: input.cross_contam_risk ?? "",
        procedure_notes: input.procedure_notes ?? null,
        updated_by: userId,
        updated_at: iso,
      };
    },

    insertAllergenAssessment: (payload) =>
      assessments.insertAllergenAssessment(payload),

    // ── 2. allergen monthly-reviews ──
    listMonthlyReviews: () => assessments.listMonthlyReviews(),

    async runMonthlyReview({ input, userId, now }): Promise<RunMonthlyReviewResult> {
      const range = monthDateRange(input.month_year);
      if (!range) {
        return {
          ok: false,
          status: 400,
          message: "Invalid month format — expected YYYY-MM",
        };
      }

      const rows = await assessments.listDeliveriesInRange(
        range.start,
        range.end,
      );

      const totalDeliveries = rows.length;
      const detections = rows.filter((d) => d.allergens_identified === true);
      const allergenDetections = detections.length;
      const categoryBreakdown = buildCategoryBreakdown(
        rows as unknown as Array<{ product_category: string }>,
      );
      const siteStatus = deriveSiteStatus(totalDeliveries, allergenDetections);

      const detectionDetails = detections.map((d) => ({
        date: d.date,
        supplier: d.supplier,
        product: d.product,
        category: d.product_category,
        batch_number: d.batch_number ?? null,
        allergen_notes: d.allergen_notes ?? null,
      }));

      const saved = await assessments.upsertMonthlyReview({
        month_year: input.month_year,
        period_start: range.start,
        period_end: range.end,
        total_deliveries: totalDeliveries,
        allergen_detections: allergenDetections,
        category_breakdown: categoryBreakdown,
        detection_details: detectionDetails,
        site_status: siteStatus,
        reviewed_by: userId,
        reviewed_at: now.toISOString(),
        notes: input.notes?.trim() || null,
      });

      return {
        ok: true,
        result: {
          review: saved,
          total_deliveries: totalDeliveries,
          detections: allergenDetections,
          site_status: siteStatus,
          already_existed: false,
        },
      };
    },

    // ── 3. food-defence ──
    async getFoodDefence(now): Promise<FoodDefenceListResult> {
      const plans = await assessments.listFoodDefencePlans();
      const latest = plans[0] ?? null;
      const review_due = latest
        ? new Date(latest.next_review_date) < now
        : true;
      return { plans, latest, review_due };
    },

    validateFoodDefence(input): ValidationResult {
      if (!input.version?.trim()) return reject(400, "Version required");
      if (!input.issue_date) return reject(400, "Issue date required");
      if (!input.next_review_date) return reject(400, "Review date required");
      return { ok: true };
    },

    buildFoodDefencePersist({ input, userId }): FoodDefencePersist {
      return {
        version: input.version.trim(),
        issue_date: input.issue_date,
        next_review_date: input.next_review_date,
        team: Array.isArray(input.team) ? input.team : [],
        physical_perimeter: Array.isArray(input.physical_perimeter)
          ? input.physical_perimeter
          : [],
        physical_internal: Array.isArray(input.physical_internal)
          ? input.physical_internal
          : [],
        cyber_controls: Array.isArray(input.cyber_controls)
          ? input.cyber_controls
          : [],
        backup_recovery: Array.isArray(input.backup_recovery)
          ? input.backup_recovery
          : [],
        emergency_contacts: Array.isArray(input.emergency_contacts)
          ? input.emergency_contacts
          : [],
        personnel_notes: input.personnel_notes?.trim() || null,
        goods_notes: input.goods_notes?.trim() || null,
        incident_notes: input.incident_notes?.trim() || null,
        prepared_by: input.prepared_by || null,
        approved_by: input.approved_by || null,
        created_by: userId,
      };
    },

    insertFoodDefencePlan: (payload) =>
      assessments.insertFoodDefencePlan(payload),

    // ── 4. food-fraud ──
    async getFoodFraud(now): Promise<FoodFraudListResult> {
      const list = await assessments.listFoodFraudAssessments();
      const latest = list[0] ?? null;
      const review_due = latest
        ? new Date(latest.next_review_date) < now
        : true;
      return { assessments: list, latest, review_due };
    },

    validateFoodFraud(input): ValidationResult {
      if (!input.version?.trim()) return reject(400, "Version required");
      if (!input.issue_date) return reject(400, "Issue date required");
      if (!input.next_review_date) return reject(400, "Review date required");
      if (!Array.isArray(input.risks))
        return reject(400, "Risks must be an array");
      return { ok: true };
    },

    buildFoodFraudPersist({ input, userId }): FoodFraudPersist {
      return {
        version: input.version.trim(),
        issue_date: input.issue_date,
        next_review_date: input.next_review_date,
        risks: input.risks,
        supply_chain: Array.isArray(input.supply_chain)
          ? input.supply_chain
          : [],
        mitigation_notes: input.mitigation_notes?.trim() || null,
        prepared_by: input.prepared_by || null,
        approved_by: input.approved_by || null,
        created_by: userId,
      };
    },

    insertFoodFraudAssessment: (payload) =>
      assessments.insertFoodFraudAssessment(payload),

    // ── 5. product-specs ──
    async getProductSpecs(now): Promise<ProductSpecListResult> {
      const rows = await assessments.listActiveProductSpecs();
      const twelveMonthsAgo = twelveMonthsBefore(now);
      const specs = rows.map((s) => ({
        ...s,
        review_due:
          !s.reviewed_at || new Date(s.reviewed_at) < twelveMonthsAgo,
      }));
      return {
        specs,
        review_due_count: specs.filter((s) => s.review_due).length,
      };
    },

    validateProductSpec(input): ValidationResult {
      if (!input.product_name?.trim())
        return reject(400, "Product name is required");
      return { ok: true };
    },

    buildProductSpecPersist({ input, userId, now }): ProductSpecPersist {
      return {
        product_name: input.product_name.trim(),
        description: input.description?.trim() || null,
        ingredients: input.ingredients?.trim() || null,
        allergens:
          Array.isArray(input.allergens) && input.allergens.length > 0
            ? input.allergens
            : null,
        allergen_notes: input.allergen_notes?.trim() || null,
        portion_weight_g: input.portion_weight_g || null,
        storage_temp_c: input.storage_temp_c || null,
        shelf_life_chilled_days: input.shelf_life_chilled_days || null,
        shelf_life_frozen_days: input.shelf_life_frozen_days || null,
        packaging_type: input.packaging_type?.trim() || null,
        micro_limits: input.micro_limits?.trim() || null,
        version: input.version?.trim() || "V1.0",
        reviewed_at: input.reviewed_at || null,
        reviewed_by: input.reviewed_by || null,
        created_by: userId,
        updated_at: now.toISOString(),
      };
    },

    insertProductSpec: (payload) => assessments.insertProductSpec(payload),

    updateProductSpec: (id, updates) =>
      assessments.updateProductSpec(id, updates),
  };
}
