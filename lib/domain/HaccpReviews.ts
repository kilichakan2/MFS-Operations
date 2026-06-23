/**
 * lib/domain/HaccpReviews.ts
 *
 * Domain types for the F-19 PR5 Cluster D "reviews" hexagon — the HACCP
 * weekly + monthly reviews (haccp_weekly_review, haccp_monthly_review) and the
 * corrective-action (CA) side-effect those POSTs auto-create.
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * Boundary discipline (ADR-0002): the GET-list rows carry the RAW columns the
 * route returns today (snake_case, with the `users!inner(name)` join) so the
 * wire output stays byte-identical. The POST bodies are the app's own input
 * vocabulary; the derived insert rows are the `…Persist` shapes.
 *
 * ⚠ NAMING (R-B4): `MonthlyReviewRow` / `MonthlyReviewPersist` ALREADY exist in
 * the domain barrel for the Cluster B *allergen* monthly review — a DIFFERENT
 * table. To avoid a barrel clash, THIS hexagon prefixes its types `Review*`
 * (ReviewWeeklyRow / ReviewMonthlyRow / ReviewWeeklyPersist / ReviewMonthlyPersist
 * / CreateReviewWeeklyInput / CreateReviewMonthlyInput). The CA insert type and
 * the user-ref are kept MODULE-LOCAL (NOT re-exported) to avoid colliding with
 * `HaccpUserRef` / `HealthRecordUserRef` and the shared `CorrectiveActionInsert`.
 */

/**
 * Module-local user-ref for the weekly/monthly `users!inner(name)` joins.
 * INNER join — a row with a null `submitted_by` is dropped. NOT re-exported from
 * the barrel (would collide with `HaccpUserRef` / `HealthRecordUserRef`).
 */
export interface ReviewUserRef {
  readonly name: string;
}

// ─── 1. weekly review ──────────────────────────────────────────────────────────

/**
 * GET /api/haccp/reviews weekly list row — verbatim `.select` columns
 * (reviews/route.ts:59):
 * 'id, week_ending, date, assessments, submitted_at, users!inner(name)'.
 */
export interface ReviewWeeklyRow {
  readonly id: string;
  readonly week_ending: string;
  readonly date: string;
  readonly assessments: unknown;
  readonly submitted_at: string;
  readonly users: ReviewUserRef;
}

/** The assessments array element the route filters on (reviews/route.ts:115). */
export interface WeeklyAssessmentItem {
  readonly id: string;
  readonly label: string;
  readonly state: string;
  readonly action?: string;
  readonly caHint?: string;
}

/** Weekly POST body (reviews/route.ts:103). */
export interface CreateReviewWeeklyInput {
  readonly week_ending?: string;
  readonly assessments?: WeeklyAssessmentItem[];
}

/** Derived insert row for haccp_weekly_review (reviews/route.ts:109). */
export interface ReviewWeeklyPersist {
  readonly submitted_by: string;
  readonly week_ending: string;
  readonly date: string; // today (todayUK() injected at the route edge)
  readonly assessments: unknown;
}

// ─── 2. monthly review ─────────────────────────────────────────────────────────

/**
 * GET /api/haccp/reviews monthly list row — verbatim `.select` columns
 * (reviews/route.ts:64):
 * 'id, month_year, date, equipment_checks, facilities_checks,
 *  haccp_system_review, further_notes, submitted_at, users!inner(name)'.
 */
export interface ReviewMonthlyRow {
  readonly id: string;
  readonly month_year: string;
  readonly date: string;
  readonly equipment_checks: unknown;
  readonly facilities_checks: unknown;
  readonly haccp_system_review: unknown;
  readonly further_notes: string | null;
  readonly submitted_at: string;
  readonly users: ReviewUserRef;
}

/** The haccp_system_review array element the route filters on (reviews/route.ts:158). */
export interface MonthlySystemItem {
  readonly id: string;
  readonly label: string;
  readonly result: string;
  readonly notes?: string;
  readonly caHint?: string;
  readonly invertFail?: boolean;
}

/** Monthly POST body (reviews/route.ts:138). */
export interface CreateReviewMonthlyInput {
  readonly month_year?: string;
  readonly equipment_checks?: unknown;
  readonly facilities_checks?: unknown;
  readonly haccp_system_review?: MonthlySystemItem[];
  readonly further_notes?: string;
}

/** Derived insert row for haccp_monthly_review (reviews/route.ts:146-150). */
export interface ReviewMonthlyPersist {
  readonly submitted_by: string;
  readonly month_year: string;
  readonly date: string; // today (todayUK() injected at the route edge)
  readonly equipment_checks: unknown;
  readonly facilities_checks: unknown;
  readonly haccp_system_review: unknown;
  readonly further_notes: string | null; // further_notes?.trim() || null
}

// ─── 3. corrective-action side-effect (DEAD-CODE modelling) ─────────────────────

/**
 * The EXACT insert object the reviews POST builds for each failed item
 * (reviews/route.ts:119-129 weekly, :163-173 monthly).
 *
 * ⚠ MODULE-LOCAL on purpose — do NOT reuse `CorrectiveActionInsert` from
 * HaccpCorrectiveAction.ts: its `HaccpCASourceTable` union does NOT carry the two
 * NEW literals `haccp_weekly_review` / `haccp_monthly_review`. The reviews CA
 * writer is a DIFFERENT writer over the SAME table with two new source-table
 * literals. Widening the shared union would touch Cluster A's domain — kept apart.
 */
export interface ReviewCorrectiveActionInsert {
  readonly actioned_by: string;
  readonly source_table: "haccp_weekly_review" | "haccp_monthly_review";
  readonly source_id: string;
  readonly ccp_ref: string;
  readonly deviation_description: string;
  readonly action_taken: string;
  readonly product_disposition: "assess";
  readonly recurrence_prevention: string;
  readonly management_verification_required: true;
}

// ─── GET response shape ─────────────────────────────────────────────────────────

/**
 * The EXACT GET /api/haccp/reviews response shape (reviews/route.ts:78-83).
 * Key order: weekly, monthly, weekly_done, monthly_done.
 */
export interface ReviewsListResult {
  readonly weekly: readonly ReviewWeeklyRow[];
  readonly monthly: readonly ReviewMonthlyRow[];
  readonly weekly_done: boolean;
  readonly monthly_done: boolean;
}
