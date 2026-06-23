/**
 * lib/services/HaccpAnnualReviewService.ts
 *
 * The F-19 PR5 Cluster D "annual review" service — business orchestration for
 * the SALSA 3.1 annual systems review lifecycle (list / create draft / update /
 * sign-off). Factory here, wiring in `lib/wiring/haccp.ts`; depends on the
 * `annualReview` port alone, never on another service and never on the adapters
 * folder (lint-enforced, ADR-0002 / F-TD-11).
 *
 * IMPORTS the pure helpers from `@/lib/annualReview/sections`
 * (buildInitialChecklist, buildInitialActionPlan, isValidStatus,
 * isValidReviewPeriod, canSignOff) — does NOT reimplement them (the spec bars
 * rewriting that file).
 *
 * DETERMINISM (constraint 8): the build…Persist functions take `now: Date` IN
 * (the route's `new Date()` for updated_at / signed_off_at, computed at the route
 * edge). The service NEVER calls `new Date()`.
 *
 * Lifecycle modelling: the locked-record guard (current.locked → 409) and the
 * not-found guard (findCurrent === null → 404) are ROUTE-EDGE branch decisions in
 * PR6 that consume `findCurrent`'s result — the service exposes `findCurrent` and
 * the validators so PR6 re-points byte-identically. The sign-off mutation
 * (locked=true + signer/approver) is fully modelled in buildSignOffPersist.
 */

import {
  buildInitialChecklist,
  buildInitialActionPlan,
  isValidStatus,
  isValidReviewPeriod,
  canSignOff,
  type Checklist,
} from "@/lib/annualReview/sections";
import type {
  AnnualReviewListResult,
  CreateAnnualReviewInput,
  AnnualReviewCreatePersist,
  UpdateAnnualReviewInput,
  AnnualReviewCurrent,
  AnnualReviewSignOffPersist,
  AnnualReviewUpdatePersist,
  AnnualReviewRow,
} from "@/lib/domain";
import type { HaccpAnnualReviewRepository } from "@/lib/ports";

// ─── result helpers ──────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function reject(status: number, message: string): ValidationResult {
  return { ok: false, status, message };
}

// ─── deps + interface ────────────────────────────────────────────────────────

export interface HaccpAnnualReviewServiceDeps {
  readonly annualReview: HaccpAnnualReviewRepository;
}

export interface HaccpAnnualReviewService {
  /** GET — { reviews } (created_at DESC). */
  getReviews(): Promise<AnnualReviewListResult>;

  // ── create draft ──
  validateCreate(input: CreateAnnualReviewInput): ValidationResult;
  buildCreatePersist(args: {
    input: CreateAnnualReviewInput;
    userId: string;
    now: Date;
  }): AnnualReviewCreatePersist;
  createDraft(payload: AnnualReviewCreatePersist): Promise<AnnualReviewRow>;

  // ── update / sign-off ──
  /**
   * Validates the PATCH body IN the route's order (annual-review/route.ts:134,
   * 153-170, 175-185). `currentChecklist` is the fetched record's checklist —
   * used for the canSignOff fallback when the input omits a checklist.
   */
  validatePatch(args: {
    input: UpdateAnnualReviewInput;
    currentChecklist: Checklist;
  }): ValidationResult;
  buildSignOffPersist(args: {
    input: UpdateAnnualReviewInput;
    current: AnnualReviewCurrent;
    userId: string;
    now: Date;
  }): AnnualReviewSignOffPersist;
  buildUpdatePersist(args: {
    input: UpdateAnnualReviewInput;
    now: Date;
  }): AnnualReviewUpdatePersist;
  findCurrent(id: string): Promise<AnnualReviewCurrent | null>;
  signOff(
    id: string,
    payload: AnnualReviewSignOffPersist,
  ): Promise<AnnualReviewRow>;
  update(
    id: string,
    payload: AnnualReviewUpdatePersist,
  ): Promise<AnnualReviewRow>;
}

export function createHaccpAnnualReviewService(
  deps: HaccpAnnualReviewServiceDeps,
): HaccpAnnualReviewService {
  const { annualReview } = deps;

  return {
    async getReviews(): Promise<AnnualReviewListResult> {
      return { reviews: await annualReview.listReviews() };
    },

    // ── create draft ──
    validateCreate(input): ValidationResult {
      // annual-review/route.ts:72-80 — IN ORDER.
      if (!input.review_year?.trim())
        return reject(400, "Review year label is required");
      if (
        !isValidReviewPeriod(
          input.review_period_from ?? "",
          input.review_period_to ?? "",
        )
      )
        return reject(
          400,
          "Invalid review period — from must be before to, and to cannot be in the future",
        );
      return { ok: true };
    },

    buildCreatePersist({ input, userId, now }): AnnualReviewCreatePersist {
      // annual-review/route.ts:85-93.
      return {
        review_year: input.review_year!.trim(),
        review_period_from: input.review_period_from!,
        review_period_to: input.review_period_to!,
        checklist: buildInitialChecklist(),
        action_plan: buildInitialActionPlan(),
        locked: false,
        created_by: userId,
        updated_at: now.toISOString(),
      };
    },

    createDraft: (payload) => annualReview.createDraft(payload),

    // ── update / sign-off ──
    validatePatch({ input, currentChecklist }): ValidationResult {
      // annual-review/route.ts:134 — id required.
      if (!input.id) return reject(400, "Review ID required");

      // annual-review/route.ts:153-170 — checklist-shape validation loop.
      if (input.checklist) {
        for (const [sectionKey, section] of Object.entries(input.checklist)) {
          if (!Array.isArray(section.items)) {
            return reject(400, `Section ${sectionKey}: items must be an array`);
          }
          for (const item of section.items) {
            if (!isValidStatus(item.status)) {
              return reject(
                400,
                `Section ${sectionKey}: invalid status "${item.status}" — must be ok, na, action, or null`,
              );
            }
          }
        }
      }

      // annual-review/route.ts:173-185 — sign-off path validation.
      if (input.sign_off) {
        const { approved_by, approved_at } = input.sign_off;
        if (!approved_by || !approved_at) {
          return reject(
            400,
            "approved_by and approved_at required for sign-off",
          );
        }
        const checklistToUse = input.checklist ?? currentChecklist;
        if (!canSignOff(false, checklistToUse)) {
          return reject(
            400,
            "Cannot sign off — not all checklist sections are complete",
          );
        }
      }

      return { ok: true };
    },

    buildSignOffPersist({
      input,
      current,
      userId,
      now,
    }): AnnualReviewSignOffPersist {
      // annual-review/route.ts:179, 189-198.
      const checklistToUse = input.checklist ?? current.checklist;
      return {
        checklist: checklistToUse,
        action_plan: input.action_plan ?? undefined,
        signed_off_by: userId,
        signed_off_at: now.toISOString(),
        approved_by: input.sign_off!.approved_by,
        approved_at: input.sign_off!.approved_at,
        locked: true,
        updated_at: now.toISOString(),
      };
    },

    buildUpdatePersist({ input, now }): AnnualReviewUpdatePersist {
      // annual-review/route.ts:208-210 — updated_at always; checklist/
      // action_plan only when truthy.
      const persist: {
        updated_at: string;
        checklist?: Checklist;
        action_plan?: AnnualReviewUpdatePersist["action_plan"];
      } = { updated_at: now.toISOString() };
      if (input.checklist) persist.checklist = input.checklist;
      if (input.action_plan) persist.action_plan = input.action_plan;
      return persist;
    },

    findCurrent: (id) => annualReview.findCurrent(id),
    signOff: (id, payload) => annualReview.signOff(id, payload),
    update: (id, payload) => annualReview.update(id, payload),
  };
}
