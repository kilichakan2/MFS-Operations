/**
 * lib/domain/HaccpAnnualReview.ts
 *
 * Domain types for the F-19 PR5 Cluster D "annual review" hexagon — the SALSA
 * 3.1 annual systems review (haccp_annual_reviews ONLY). Lifecycle: list, create
 * draft (unique-draft constraint → one draft at a time), update checklist/
 * action_plan, sign-off (locks the record).
 *
 * Pure TypeScript: no framework imports, no vendor imports. RE-USES the
 * `Checklist` / `ActionPlanItem` types by importing them from the pure,
 * vendor-free `@/lib/annualReview/sections` module (allowed — not modified here).
 *
 * Boundary discipline (ADR-0002): the GET-list row carries the join output AS
 * SUPABASE RETURNS IT — the route hands `data` straight to the wire with NO
 * remap (annual-review/route.ts:48), so the adapter must NOT normalise it. The
 * aliased single-row joins (signer/approver/creator) come back as `{ name }`,
 * `{ name }[]`, or `null` depending on FK cardinality — modelled as a union so
 * byte-identity holds (R-B2: confirm the real returned shape during ANVIL).
 */

import type { Checklist, ActionPlanItem } from "@/lib/annualReview/sections";

/**
 * Module-local user-ref for the aliased `signer:`/`approver:`/`creator:` joins.
 * NOT re-exported from the barrel (would collide with `HaccpUserRef` /
 * `HealthRecordUserRef` / `ReviewUserRef`).
 */
export interface AnnualReviewUserRef {
  readonly name: string;
}

/** A single aliased join as Supabase may return it — object, array, or null. */
export type AnnualReviewJoin =
  | AnnualReviewUserRef
  | readonly AnnualReviewUserRef[]
  | null;

/**
 * GET /api/haccp/annual-review list row — verbatim columns + aliased joins
 * (annual-review/route.ts:37-44). Returned AS-IS to the wire (no remap).
 */
export interface AnnualReviewRow {
  readonly id: string;
  readonly review_year: string;
  readonly review_period_from: string;
  readonly review_period_to: string;
  readonly checklist: Checklist;
  readonly action_plan: ActionPlanItem[];
  readonly locked: boolean;
  readonly signed_off_at: string | null;
  readonly approved_at: string | null;
  readonly updated_at: string;
  readonly created_at: string;
  readonly signer: AnnualReviewJoin;
  readonly approver: AnnualReviewJoin;
  readonly creator: AnnualReviewJoin;
}

/** POST body (annual-review/route.ts:66-70). */
export interface CreateAnnualReviewInput {
  readonly review_year?: string;
  readonly review_period_from?: string;
  readonly review_period_to?: string;
}

/** Derived insert row for haccp_annual_reviews (annual-review/route.ts:85-93). */
export interface AnnualReviewCreatePersist {
  readonly review_year: string; // .trim()
  readonly review_period_from: string;
  readonly review_period_to: string;
  readonly checklist: Checklist; // buildInitialChecklist()
  readonly action_plan: ActionPlanItem[]; // buildInitialActionPlan()
  readonly locked: false;
  readonly created_by: string;
  readonly updated_at: string; // now.toISOString()
}

/** PATCH body (annual-review/route.ts:127-132). */
export interface UpdateAnnualReviewInput {
  readonly id: string;
  readonly checklist?: Checklist;
  readonly action_plan?: ActionPlanItem[];
  readonly sign_off?: { approved_by: string; approved_at: string };
}

/** The fetch-before-update read (annual-review/route.ts:141): 'id, locked, checklist'. */
export interface AnnualReviewCurrent {
  readonly id: string;
  readonly locked: boolean;
  readonly checklist: Checklist;
}

/** The sign-off UPDATE payload (annual-review/route.ts:189-198). */
export interface AnnualReviewSignOffPersist {
  readonly checklist: Checklist;
  readonly action_plan?: ActionPlanItem[] | undefined; // action_plan ?? undefined
  readonly signed_off_by: string;
  readonly signed_off_at: string; // now.toISOString()
  readonly approved_by: string;
  readonly approved_at: string;
  readonly locked: true;
  readonly updated_at: string; // now.toISOString()
}

/**
 * The regular UPDATE payload (annual-review/route.ts:208-210), built
 * conditionally — `updated_at` always; checklist/action_plan only when truthy.
 */
export interface AnnualReviewUpdatePersist {
  readonly updated_at: string;
  readonly checklist?: Checklist;
  readonly action_plan?: ActionPlanItem[];
}

/** GET response shape (annual-review/route.ts:48): { reviews }. */
export interface AnnualReviewListResult {
  readonly reviews: readonly AnnualReviewRow[];
}
