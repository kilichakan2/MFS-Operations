/**
 * lib/services/HaccpReviewsService.ts
 *
 * The F-19 PR5 Cluster D "reviews" service — business orchestration for the
 * HACCP weekly + monthly reviews and the corrective-action (CA) side-effect.
 * Factory here, wiring in `lib/wiring/haccp.ts`; depends on the `reviews` port
 * alone, never on another service and never on the adapters folder (lint-
 * enforced, ADR-0002 / F-TD-11).
 *
 * The pure logic the route does today — the required-field `validate…` cascades
 * (with the route's EXACT 400 strings, IN ORDER), the `build…Persist` row
 * builders, and the CA-row builders (the dead-code modelling of the route's
 * problem-ticket auto-creation) — is LIFTED here so it gets unit-tested now and
 * the PR6 re-point is "validate → build → write → reply".
 *
 * DETERMINISM (constraint 8): the build…Persist functions take `today: string`
 * IN (the route's `todayUK()` EN-CA result, computed at the route edge) and the
 * date-window helpers (thisWeekMonday/Sunday/thisMonthRange) STAY at the route
 * edge — `getReviews` takes the computed `monday/sunday/mFrom/mTo` IN. The
 * service NEVER calls `new Date()`.
 *
 * ⚠ CA byte-exactness (R-B1): `buildWeeklyCorrectiveActions` and
 * `buildMonthlySystemCorrectiveActions` reproduce the route's mapping EXACTLY —
 * every field, every fallback string verbatim, including the `invertFail` flip.
 * Returns `[]` when no problems, so PR6 calls `insertCorrectiveActions` only when
 * length > 0 (matching reviews/route.ts:118, 162).
 */

import type {
  ReviewWeeklyRow,
  ReviewWeeklyPersist,
  CreateReviewWeeklyInput,
  ReviewMonthlyRow,
  ReviewMonthlyPersist,
  CreateReviewMonthlyInput,
  MonthlySystemItem,
  ReviewCorrectiveActionInsert,
  ReviewsListResult,
} from "@/lib/domain";
import type { HaccpReviewsRepository } from "@/lib/ports";

// ─── result helpers ──────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function reject(status: number, message: string): ValidationResult {
  return { ok: false, status, message };
}

// ─── deps + interface ────────────────────────────────────────────────────────

export interface HaccpReviewsServiceDeps {
  readonly reviews: HaccpReviewsRepository;
}

export interface HaccpReviewsService {
  /**
   * GET — { weekly, monthly, weekly_done, monthly_done } (key order). The date
   * windows are computed at the route edge (timezone-dependent) and passed IN.
   */
  getReviews(args: {
    monday: string;
    sunday: string;
    mFrom: string;
    mTo: string;
  }): Promise<ReviewsListResult>;

  // ── weekly ──
  validateWeekly(input: CreateReviewWeeklyInput): ValidationResult;
  buildWeeklyPersist(args: {
    input: CreateReviewWeeklyInput;
    userId: string;
    today: string;
  }): ReviewWeeklyPersist;
  buildWeeklyCorrectiveActions(args: {
    input: CreateReviewWeeklyInput;
    userId: string;
    reviewId: string;
    weekEnding: string;
  }): readonly ReviewCorrectiveActionInsert[];
  insertWeeklyReview(payload: ReviewWeeklyPersist): Promise<{ id: string }>;

  // ── monthly ──
  validateMonthly(input: CreateReviewMonthlyInput): ValidationResult;
  buildMonthlyPersist(args: {
    input: CreateReviewMonthlyInput;
    userId: string;
    today: string;
  }): ReviewMonthlyPersist;
  buildMonthlySystemCorrectiveActions(args: {
    input: CreateReviewMonthlyInput;
    userId: string;
    reviewId: string;
    monthYear: string;
  }): readonly ReviewCorrectiveActionInsert[];
  insertMonthlyReview(payload: ReviewMonthlyPersist): Promise<{ id: string }>;

  // ── CA write (best-effort, never throws) ──
  insertCorrectiveActions(
    rows: readonly ReviewCorrectiveActionInsert[],
  ): Promise<void>;
}

export function createHaccpReviewsService(
  deps: HaccpReviewsServiceDeps,
): HaccpReviewsService {
  const { reviews } = deps;

  return {
    async getReviews({ monday, sunday, mFrom, mTo }): Promise<ReviewsListResult> {
      const [weekly, monthly]: [
        readonly ReviewWeeklyRow[],
        readonly ReviewMonthlyRow[],
      ] = await Promise.all([
        reviews.listWeeklyReviews(),
        reviews.listMonthlyReviews(),
      ]);
      // EXACT route predicates (reviews/route.ts:75-76).
      const weekly_done = weekly.some(
        (r) => r.week_ending >= monday && r.week_ending <= sunday,
      );
      const monthly_done = monthly.some(
        (r) => r.month_year >= mFrom && r.month_year <= mTo,
      );
      return { weekly, monthly, weekly_done, monthly_done };
    },

    // ── weekly ──
    validateWeekly(input): ValidationResult {
      // reviews/route.ts:104-105 — IN ORDER.
      if (!input.week_ending) return reject(400, "Week ending date required");
      if (!input.assessments || !Array.isArray(input.assessments))
        return reject(400, "Assessments required");
      return { ok: true };
    },

    buildWeeklyPersist({ input, userId, today }): ReviewWeeklyPersist {
      // reviews/route.ts:109.
      return {
        submitted_by: userId,
        week_ending: input.week_ending!,
        date: today,
        assessments: input.assessments,
      };
    },

    buildWeeklyCorrectiveActions({
      input,
      userId,
      reviewId,
      weekEnding,
    }): readonly ReviewCorrectiveActionInsert[] {
      // reviews/route.ts:115-129 — filter state === 'problem', map verbatim.
      const problems = (input.assessments ?? []).filter(
        (i) => i.state === "problem",
      );
      return problems.map((i) => ({
        actioned_by: userId,
        source_table: "haccp_weekly_review" as const,
        source_id: reviewId,
        ccp_ref: "WEEKLY-REVIEW",
        deviation_description: `Weekly review — ${i.label}`,
        action_taken:
          i.action?.trim() ||
          `No action notes recorded at time of review — refer to weekly review record (week ending ${weekEnding})`,
        product_disposition: "assess" as const,
        recurrence_prevention: i.caHint || "Review procedures",
        management_verification_required: true as const,
      }));
    },

    insertWeeklyReview: (payload) => reviews.insertWeeklyReview(payload),

    // ── monthly ──
    validateMonthly(input): ValidationResult {
      // reviews/route.ts:139-142 — IN ORDER.
      if (!input.month_year) return reject(400, "Month/year required");
      if (!input.equipment_checks)
        return reject(400, "Equipment checks required");
      if (!input.facilities_checks)
        return reject(400, "Facilities checks required");
      if (!input.haccp_system_review)
        return reject(400, "HACCP system review required");
      return { ok: true };
    },

    buildMonthlyPersist({ input, userId, today }): ReviewMonthlyPersist {
      // reviews/route.ts:146-150.
      return {
        submitted_by: userId,
        month_year: input.month_year!,
        date: today,
        equipment_checks: input.equipment_checks,
        facilities_checks: input.facilities_checks,
        haccp_system_review: input.haccp_system_review,
        further_notes: input.further_notes?.trim() || null,
      };
    },

    buildMonthlySystemCorrectiveActions({
      input,
      userId,
      reviewId,
      monthYear,
    }): readonly ReviewCorrectiveActionInsert[] {
      // reviews/route.ts:158-173 — the invertFail flip, then map verbatim.
      const items = (input.haccp_system_review ?? []) as MonthlySystemItem[];
      const sysProblems = items.filter((i) =>
        i.invertFail ? i.result === "YES" : i.result === "NO",
      );
      return sysProblems.map((i) => ({
        actioned_by: userId,
        source_table: "haccp_monthly_review" as const,
        source_id: reviewId,
        ccp_ref: "MONTHLY-REVIEW",
        deviation_description: `Monthly HACCP review — ${i.label}`,
        action_taken:
          i.notes?.trim() ||
          `No action notes recorded at time of review — refer to monthly review record (${monthYear})`,
        product_disposition: "assess" as const,
        recurrence_prevention:
          i.caHint || "Review procedures and update HACCP plan",
        management_verification_required: true as const,
      }));
    },

    insertMonthlyReview: (payload) => reviews.insertMonthlyReview(payload),

    // ── CA write (best-effort, never throws) ──
    insertCorrectiveActions: (rows) => reviews.insertCorrectiveActions(rows),
  };
}
