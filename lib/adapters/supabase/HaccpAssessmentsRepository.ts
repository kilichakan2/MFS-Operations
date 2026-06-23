/**
 * lib/adapters/supabase/HaccpAssessmentsRepository.ts
 *
 * Supabase implementation of `HaccpAssessmentsRepository`
 * (lib/ports/HaccpAssessmentsRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the `lib/adapters/supabase`
 * tree at `.eslintrc.json`). The ONLY file that imports the vendor SDK for the
 * 5 Cluster B register tables.
 *
 * Boundary discipline (ADR-0002 line 27): every `.select(…)` column list and
 * every insert/upsert/update payload is copied VERBATIM from the 5 route files
 * the PR3 re-point replaces, so the wire output stays byte-identical. The
 * persist payloads arrive from the service already shaped exactly as the routes
 * build them — the adapter only forwards them.
 *
 * BYTE-IDENTITY NUANCE (the Cluster B difference from Cluster A): these GET
 * selects use ALIASED, NON-inner joins (`assessor:assessed_by(name)`,
 * `reviewer:reviewed_by(name)`, …), NOT Cluster A's `users!inner(name)`.
 * Consequences carried verbatim: (a) the JSON key is the ALIAS, not `users`;
 * (b) a row with a null user-ref still returns (the user object is `null`), it
 * is NOT filtered out. Some routes have inconsistent whitespace inside the join
 * parens (`( name )` vs `(name)`) — copied verbatim to keep the diff a pure move.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpAssessmentsRepository(client)` factory.
 *   - `supabaseHaccpAssessmentsRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract: reads return []/null on miss; every DB failure throws
 * ServiceError. NO ConflictError — Cluster B has no clean 409 path today; every
 * DB error stays a 500.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
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

// ─── verbatim select strings (the byte-identity anchor) ──────────────────────

const ALLERGEN_ASSESSMENT_COLS = `
        id, site_status, raw_materials, cross_contam_risk, procedure_notes,
        assessed_at, next_review_date,
        assessor:assessed_by(name),
        updater:updated_by(name)
      `;

const MONTHLY_REVIEW_COLS = `
        id, month_year, period_start, period_end,
        total_deliveries, allergen_detections, category_breakdown,
        detection_details, site_status, reviewed_at, notes,
        reviewer:reviewed_by ( name )
      `;

const MONTHLY_REVIEW_DELIVERY_COLS =
  "id, date, supplier, product, product_category, allergens_identified, allergen_notes, batch_number";

const FOOD_DEFENCE_COLS = `
        id, version, issue_date, next_review_date,
        team, physical_perimeter, physical_internal,
        cyber_controls, backup_recovery, emergency_contacts,
        personnel_notes, goods_notes, incident_notes, created_at,
        preparer:prepared_by ( name ),
        approver:approved_by ( name ),
        creator:created_by   ( name )
      `;

const FOOD_FRAUD_COLS = `
        id, version, issue_date, next_review_date,
        risks, supply_chain, mitigation_notes, created_at,
        preparer:prepared_by ( name ),
        approver:approved_by ( name ),
        creator:created_by   ( name )
      `;

const PRODUCT_SPEC_COLS = `
        id, product_name, description, ingredients, allergens, allergen_notes,
        portion_weight_g, storage_temp_c,
        shelf_life_chilled_days, shelf_life_frozen_days,
        packaging_type, micro_limits,
        version, reviewed_at, active,
        created_at, updated_at,
        reviewer:reviewed_by ( name ),
        creator:created_by   ( name )
      `;

export function createSupabaseHaccpAssessmentsRepository(
  client: SupabaseClient,
): HaccpAssessmentsRepository {
  return {
    // ── 1. allergen-assessment ──────────────────────────────
    async listAllergenAssessments(): Promise<AllergenAssessmentListResult> {
      const { data, error } = await client
        .from("haccp_allergen_assessment")
        .select(ALLERGEN_ASSESSMENT_COLS)
        .order("assessed_at", { ascending: false });
      if (error) {
        log.error("HaccpAssessmentsRepository.listAllergenAssessments DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load allergen assessments", {
          cause: error,
        });
      }
      const all = (data ?? []) as unknown as AllergenAssessmentRow[];
      const latest = all[0] ?? null;
      return { assessment: latest, all_assessments: all };
    },

    async insertAllergenAssessment(
      payload: AllergenAssessmentPersist,
    ): Promise<AllergenAssessmentRow> {
      const { data, error } = await client
        .from("haccp_allergen_assessment")
        .insert(payload as unknown as Record<string, unknown>)
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpAssessmentsRepository.insertAllergenAssessment DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return data as unknown as AllergenAssessmentRow;
    },

    // ── 2. allergen monthly-reviews ─────────────────────────
    async listMonthlyReviews(): Promise<readonly MonthlyReviewRow[]> {
      const { data, error } = await client
        .from("haccp_allergen_monthly_reviews")
        .select(MONTHLY_REVIEW_COLS)
        .order("period_start", { ascending: false });
      if (error) {
        log.error("HaccpAssessmentsRepository.listMonthlyReviews DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load monthly reviews", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as MonthlyReviewRow[];
    },

    async listDeliveriesInRange(
      start: string,
      end: string,
    ): Promise<readonly MonthlyReviewDeliveryRow[]> {
      const { data, error } = await client
        .from("haccp_deliveries")
        .select(MONTHLY_REVIEW_DELIVERY_COLS)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (error) {
        log.error("HaccpAssessmentsRepository.listDeliveriesInRange DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load deliveries", { cause: error });
      }
      return (data ?? []) as unknown as MonthlyReviewDeliveryRow[];
    },

    async upsertMonthlyReview(
      payload: MonthlyReviewPersist,
    ): Promise<MonthlyReviewRow> {
      const { data, error } = await client
        .from("haccp_allergen_monthly_reviews")
        .upsert(payload as unknown as Record<string, unknown>, {
          onConflict: "month_year",
        })
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpAssessmentsRepository.upsertMonthlyReview DB error", {
          error: error?.message,
        });
        throw new ServiceError("Upsert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return data as unknown as MonthlyReviewRow;
    },

    // ── 3. food-defence ─────────────────────────────────────
    async listFoodDefencePlans(): Promise<readonly FoodDefenceRow[]> {
      const { data, error } = await client
        .from("haccp_food_defence_plans")
        .select(FOOD_DEFENCE_COLS)
        .order("created_at", { ascending: false });
      if (error) {
        log.error("HaccpAssessmentsRepository.listFoodDefencePlans DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load food defence plans", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as FoodDefenceRow[];
    },

    async insertFoodDefencePlan(
      payload: FoodDefencePersist,
    ): Promise<FoodDefenceRow> {
      const { data, error } = await client
        .from("haccp_food_defence_plans")
        .insert(payload as unknown as Record<string, unknown>)
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpAssessmentsRepository.insertFoodDefencePlan DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return data as unknown as FoodDefenceRow;
    },

    // ── 4. food-fraud ───────────────────────────────────────
    async listFoodFraudAssessments(): Promise<readonly FoodFraudRow[]> {
      const { data, error } = await client
        .from("haccp_food_fraud_assessments")
        .select(FOOD_FRAUD_COLS)
        .order("created_at", { ascending: false });
      if (error) {
        log.error("HaccpAssessmentsRepository.listFoodFraudAssessments DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load food fraud assessments", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as FoodFraudRow[];
    },

    async insertFoodFraudAssessment(
      payload: FoodFraudPersist,
    ): Promise<FoodFraudRow> {
      const { data, error } = await client
        .from("haccp_food_fraud_assessments")
        .insert(payload as unknown as Record<string, unknown>)
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpAssessmentsRepository.insertFoodFraudAssessment DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return data as unknown as FoodFraudRow;
    },

    // ── 5. product-specs ────────────────────────────────────
    async listActiveProductSpecs(): Promise<readonly ProductSpecRow[]> {
      const { data, error } = await client
        .from("haccp_product_specs")
        .select(PRODUCT_SPEC_COLS)
        .eq("active", true)
        .order("product_name", { ascending: true });
      if (error) {
        log.error("HaccpAssessmentsRepository.listActiveProductSpecs DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load product specs", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as ProductSpecRow[];
    },

    async insertProductSpec(
      payload: ProductSpecPersist,
    ): Promise<ProductSpecRow> {
      const { data, error } = await client
        .from("haccp_product_specs")
        .insert(payload as unknown as Record<string, unknown>)
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpAssessmentsRepository.insertProductSpec DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return data as unknown as ProductSpecRow;
    },

    async updateProductSpec(
      id: string,
      updates: Record<string, unknown>,
    ): Promise<ProductSpecRow> {
      const { data, error } = await client
        .from("haccp_product_specs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error || !data) {
        log.error("HaccpAssessmentsRepository.updateProductSpec DB error", {
          error: error?.message,
        });
        throw new ServiceError("Update failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return data as unknown as ProductSpecRow;
    },
  };
}

export const supabaseHaccpAssessmentsRepository: HaccpAssessmentsRepository =
  createSupabaseHaccpAssessmentsRepository(supabaseService);
