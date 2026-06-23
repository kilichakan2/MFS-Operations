/**
 * lib/adapters/fake/HaccpAssessmentsRepository.ts
 *
 * In-memory implementation of `HaccpAssessmentsRepository`
 * (lib/ports/HaccpAssessmentsRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter
 * so the service unit tests can rely on parity.
 *
 * It records every inserted/upserted/updated payload AS-IS (so tests can assert
 * the exact row) and hands back a canned row built from the payload. Reads are
 * seedable. The monthly-review UPSERT is modelled honestly: re-running the SAME
 * `month_year` OVERWRITES the prior entry (one row per month, last write wins) —
 * the central Cluster B "do not homogenise" pin.
 *
 * Construction:
 *   - `createFakeHaccpAssessmentsRepository(seed?)` factory — tests inject the
 *     read fixtures (assessments, reviews, deliveries, plans, specs).
 *   - `fakeHaccpAssessmentsRepository` singleton — empty; barrel symmetry.
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
import type { HaccpAssessmentsRepository } from "@/lib/ports";

/** Optional read fixtures the service reads back. */
export interface FakeHaccpAssessmentsSeed {
  readonly allergenAssessments?: readonly AllergenAssessmentRow[];
  readonly monthlyReviews?: readonly MonthlyReviewRow[];
  readonly deliveries?: readonly MonthlyReviewDeliveryRow[];
  readonly foodDefencePlans?: readonly FoodDefenceRow[];
  readonly foodFraudAssessments?: readonly FoodFraudRow[];
  readonly productSpecs?: readonly ProductSpecRow[];
}

/** A test-inspectable Fake assessments repository: exposes recorded writes. */
export interface FakeHaccpAssessmentsRepository
  extends HaccpAssessmentsRepository {
  readonly insertedAllergenAssessments: readonly AllergenAssessmentPersist[];
  readonly upsertedMonthlyReviews: readonly MonthlyReviewPersist[];
  readonly insertedFoodDefencePlans: readonly FoodDefencePersist[];
  readonly insertedFoodFraudAssessments: readonly FoodFraudPersist[];
  readonly insertedProductSpecs: readonly ProductSpecPersist[];
  readonly productSpecUpdates: readonly {
    id: string;
    updates: Record<string, unknown>;
  }[];
  /** Every range pair passed to `listDeliveriesInRange`, in call order. */
  readonly deliveryRangeQueries: readonly { start: string; end: string }[];
}

let nextFakeId = 1;
function fakeId(prefix: string): string {
  return `fake-${prefix}-${nextFakeId++}`;
}

export function createFakeHaccpAssessmentsRepository(
  seed?: FakeHaccpAssessmentsSeed,
): FakeHaccpAssessmentsRepository {
  const insertedAllergenAssessments: AllergenAssessmentPersist[] = [];
  const upsertedMonthlyReviews: MonthlyReviewPersist[] = [];
  const insertedFoodDefencePlans: FoodDefencePersist[] = [];
  const insertedFoodFraudAssessments: FoodFraudPersist[] = [];
  const insertedProductSpecs: ProductSpecPersist[] = [];
  const productSpecUpdates: { id: string; updates: Record<string, unknown> }[] =
    [];
  const deliveryRangeQueries: { start: string; end: string }[] = [];

  // Live monthly-reviews store, so the upsert-overwrite is observable.
  const monthlyReviews: MonthlyReviewRow[] = [...(seed?.monthlyReviews ?? [])];
  // Live product-specs store, so update/soft-delete are observable.
  const productSpecs: ProductSpecRow[] = [...(seed?.productSpecs ?? [])];

  return {
    get insertedAllergenAssessments() {
      return insertedAllergenAssessments;
    },
    get upsertedMonthlyReviews() {
      return upsertedMonthlyReviews;
    },
    get insertedFoodDefencePlans() {
      return insertedFoodDefencePlans;
    },
    get insertedFoodFraudAssessments() {
      return insertedFoodFraudAssessments;
    },
    get insertedProductSpecs() {
      return insertedProductSpecs;
    },
    get productSpecUpdates() {
      return productSpecUpdates;
    },
    get deliveryRangeQueries() {
      return deliveryRangeQueries;
    },

    // ── 1. allergen-assessment ──
    async listAllergenAssessments(): Promise<AllergenAssessmentListResult> {
      const all = seed?.allergenAssessments ?? [];
      return { assessment: all[0] ?? null, all_assessments: all };
    },

    async insertAllergenAssessment(
      payload: AllergenAssessmentPersist,
    ): Promise<AllergenAssessmentRow> {
      insertedAllergenAssessments.push(payload);
      return {
        id: fakeId("allergen"),
        site_status: payload.site_status,
        raw_materials: payload.raw_materials,
        cross_contam_risk: payload.cross_contam_risk,
        procedure_notes: payload.procedure_notes,
        assessed_at: payload.assessed_at,
        next_review_date: payload.next_review_date,
        assessor: null,
        updater: null,
      };
    },

    // ── 2. allergen monthly-reviews ──
    async listMonthlyReviews(): Promise<readonly MonthlyReviewRow[]> {
      return monthlyReviews;
    },

    async listDeliveriesInRange(
      start: string,
      end: string,
    ): Promise<readonly MonthlyReviewDeliveryRow[]> {
      deliveryRangeQueries.push({ start, end });
      return (seed?.deliveries ?? []).filter(
        (d) => d.date >= start && d.date <= end,
      );
    },

    async upsertMonthlyReview(
      payload: MonthlyReviewPersist,
    ): Promise<MonthlyReviewRow> {
      upsertedMonthlyReviews.push(payload);
      const existingIdx = monthlyReviews.findIndex(
        (r) => r.month_year === payload.month_year,
      );
      const saved: MonthlyReviewRow = {
        id:
          existingIdx >= 0 ? monthlyReviews[existingIdx].id : fakeId("review"),
        month_year: payload.month_year,
        period_start: payload.period_start,
        period_end: payload.period_end,
        total_deliveries: payload.total_deliveries,
        allergen_detections: payload.allergen_detections,
        category_breakdown: payload.category_breakdown,
        detection_details: payload.detection_details,
        site_status: payload.site_status,
        reviewed_at: payload.reviewed_at,
        notes: payload.notes,
        reviewer: null,
      };
      if (existingIdx >= 0) monthlyReviews[existingIdx] = saved;
      else monthlyReviews.unshift(saved);
      return saved;
    },

    // ── 3. food-defence ──
    async listFoodDefencePlans(): Promise<readonly FoodDefenceRow[]> {
      return seed?.foodDefencePlans ?? [];
    },

    async insertFoodDefencePlan(
      payload: FoodDefencePersist,
    ): Promise<FoodDefenceRow> {
      insertedFoodDefencePlans.push(payload);
      return {
        id: fakeId("food-defence"),
        version: payload.version,
        issue_date: payload.issue_date,
        next_review_date: payload.next_review_date,
        team: payload.team,
        physical_perimeter: payload.physical_perimeter,
        physical_internal: payload.physical_internal,
        cyber_controls: payload.cyber_controls,
        backup_recovery: payload.backup_recovery,
        emergency_contacts: payload.emergency_contacts,
        personnel_notes: payload.personnel_notes,
        goods_notes: payload.goods_notes,
        incident_notes: payload.incident_notes,
        created_at: new Date(0).toISOString(),
        preparer: null,
        approver: null,
        creator: null,
      };
    },

    // ── 4. food-fraud ──
    async listFoodFraudAssessments(): Promise<readonly FoodFraudRow[]> {
      return seed?.foodFraudAssessments ?? [];
    },

    async insertFoodFraudAssessment(
      payload: FoodFraudPersist,
    ): Promise<FoodFraudRow> {
      insertedFoodFraudAssessments.push(payload);
      return {
        id: fakeId("food-fraud"),
        version: payload.version,
        issue_date: payload.issue_date,
        next_review_date: payload.next_review_date,
        risks: payload.risks,
        supply_chain: payload.supply_chain,
        mitigation_notes: payload.mitigation_notes,
        created_at: new Date(0).toISOString(),
        preparer: null,
        approver: null,
        creator: null,
      };
    },

    // ── 5. product-specs ──
    async listActiveProductSpecs(): Promise<readonly ProductSpecRow[]> {
      return productSpecs.filter((s) => s.active);
    },

    async insertProductSpec(
      payload: ProductSpecPersist,
    ): Promise<ProductSpecRow> {
      insertedProductSpecs.push(payload);
      const row: ProductSpecRow = {
        id: fakeId("product-spec"),
        product_name: payload.product_name,
        description: payload.description,
        ingredients: payload.ingredients,
        allergens: payload.allergens,
        allergen_notes: payload.allergen_notes,
        portion_weight_g: payload.portion_weight_g,
        storage_temp_c: payload.storage_temp_c,
        shelf_life_chilled_days: payload.shelf_life_chilled_days,
        shelf_life_frozen_days: payload.shelf_life_frozen_days,
        packaging_type: payload.packaging_type,
        micro_limits: payload.micro_limits,
        version: payload.version,
        reviewed_at: payload.reviewed_at,
        active: true,
        created_at: new Date(0).toISOString(),
        updated_at: payload.updated_at,
        reviewer: null,
        creator: null,
      };
      productSpecs.push(row);
      return row;
    },

    async updateProductSpec(
      id: string,
      updates: Record<string, unknown>,
    ): Promise<ProductSpecRow> {
      productSpecUpdates.push({ id, updates });
      const idx = productSpecs.findIndex((s) => s.id === id);
      const base: ProductSpecRow =
        idx >= 0
          ? productSpecs[idx]
          : {
              id,
              product_name: "",
              description: null,
              ingredients: null,
              allergens: null,
              allergen_notes: null,
              portion_weight_g: null,
              storage_temp_c: null,
              shelf_life_chilled_days: null,
              shelf_life_frozen_days: null,
              packaging_type: null,
              micro_limits: null,
              version: "V1.0",
              reviewed_at: null,
              active: true,
              created_at: new Date(0).toISOString(),
              updated_at: new Date(0).toISOString(),
              reviewer: null,
              creator: null,
            };
      const merged = { ...base, ...updates } as ProductSpecRow;
      if (idx >= 0) productSpecs[idx] = merged;
      return merged;
    },
  };
}

export const fakeHaccpAssessmentsRepository: HaccpAssessmentsRepository =
  createFakeHaccpAssessmentsRepository();
