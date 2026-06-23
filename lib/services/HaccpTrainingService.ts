/**
 * lib/services/HaccpTrainingService.ts
 *
 * The F-19 PR4 Cluster C "training" service — business orchestration for staff
 * training (butchery_process_room / warehouse_operative) and allergen-awareness
 * training. Factory here, wiring in `lib/wiring/haccp.ts`; depends on the
 * `training` port alone, never on another service and never on the adapters
 * folder (lint-enforced, ADR-0002 / F-TD-11).
 *
 * The pure logic the route does today — the required-field `validate…` cascades
 * (with the route's EXACT 400 strings, IN ORDER) and the `build…Persist` row
 * builders — is LIFTED here so it gets unit-tested now and the route shrinks to
 * "validate → build → write → reply".
 *
 * DETERMINISM (constraint 8): the staff `build…` takes `now: Date` IN and NEVER
 * calls `new Date()` (it sets `supervisor_signed_at = now.toISOString()`). The
 * allergen build needs no clock (its insert has no timestamp column).
 *
 * NO ConflictError path — Cluster C has no clean 409 today; the adapter throws
 * ServiceError on every DB error and the route catch returns its existing 500.
 *
 * ⚠ PRESERVED QUIRK (R5): the allergen path returns 'Completion date required'
 * (NOT 'Certification date required') when certification_date is missing. This
 * matches training/route.ts:111 verbatim — do NOT "fix" it.
 */

import type {
  StaffTrainingRow,
  StaffTrainingPersist,
  CreateStaffTrainingInput,
  AllergenTrainingRow,
  AllergenTrainingPersist,
  CreateAllergenTrainingInput,
  TrainingListResult,
} from "@/lib/domain";
import type { HaccpTrainingRepository } from "@/lib/ports";

// ─── result helpers ──────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function reject(status: number, message: string): ValidationResult {
  return { ok: false, status, message };
}

// ─── deps + interface ────────────────────────────────────────────────────────

export interface HaccpTrainingServiceDeps {
  readonly training: HaccpTrainingRepository;
}

export interface HaccpTrainingService {
  /** GET — { staff, allergen } (both submitted_at DESC, limit 100). */
  getTraining(): Promise<TrainingListResult>;

  // ── staff training ──
  validateStaffTraining(input: CreateStaffTrainingInput): ValidationResult;
  buildStaffTrainingPersist(args: {
    input: CreateStaffTrainingInput;
    userId: string;
    now: Date;
  }): StaffTrainingPersist;
  insertStaffTraining(payload: StaffTrainingPersist): Promise<void>;

  // ── allergen training ──
  validateAllergenTraining(input: CreateAllergenTrainingInput): ValidationResult;
  buildAllergenTrainingPersist(args: {
    input: CreateAllergenTrainingInput;
    userId: string;
  }): AllergenTrainingPersist;
  insertAllergenTraining(payload: AllergenTrainingPersist): Promise<void>;
}

export function createHaccpTrainingService(
  deps: HaccpTrainingServiceDeps,
): HaccpTrainingService {
  const { training } = deps;

  return {
    async getTraining(): Promise<TrainingListResult> {
      const [staff, allergen]: [
        readonly StaffTrainingRow[],
        readonly AllergenTrainingRow[],
      ] = await Promise.all([
        training.listStaffTraining(),
        training.listAllergenTraining(),
      ]);
      return { staff, allergen };
    },

    // ── staff training ──
    validateStaffTraining(input): ValidationResult {
      if (!input.staff_name?.trim()) return reject(400, "Staff name required");
      if (!input.job_role?.trim()) return reject(400, "Job role required");
      if (!input.document_version?.trim())
        return reject(400, "Document version required");
      if (!input.completion_date) return reject(400, "Completion date required");
      if (!input.refresh_date) return reject(400, "Refresh date required");
      if (!input.supervisor?.trim())
        return reject(400, "Supervisor name required");
      return { ok: true };
    },

    buildStaffTrainingPersist({ input, userId, now }): StaffTrainingPersist {
      return {
        logged_by: userId,
        staff_name: input.staff_name!.trim(),
        job_role: input.job_role!.trim(),
        training_type: input.training_type,
        document_version: input.document_version!.trim(),
        completion_date: input.completion_date!,
        refresh_date: input.refresh_date!,
        supervisor_name: input.supervisor!.trim(),
        supervisor_signed_at: now.toISOString(),
        confirmation_items: input.confirmation_items ?? {},
      };
    },

    insertStaffTraining: (payload) => training.insertStaffTraining(payload),

    // ── allergen training ──
    validateAllergenTraining(input): ValidationResult {
      if (!input.staff_name?.trim()) return reject(400, "Staff name required");
      if (!input.job_role?.trim()) return reject(400, "Job role required");
      // ⚠ PRESERVED QUIRK (R5): 'Completion date required', NOT 'Certification
      // date required' — matches training/route.ts:111 verbatim.
      if (!input.certification_date)
        return reject(400, "Completion date required");
      if (!input.refresh_date) return reject(400, "Refresh date required");
      if (!input.supervisor?.trim())
        return reject(400, "Supervisor name required");
      return { ok: true };
    },

    buildAllergenTrainingPersist({ input, userId }): AllergenTrainingPersist {
      return {
        logged_by: userId,
        staff_name: input.staff_name!.trim(),
        job_role: input.job_role!.trim(),
        training_completed: "allergen_awareness",
        certification_date: input.certification_date!,
        refresh_date: input.refresh_date!,
        supervisor_name: input.supervisor!.trim(),
        confirmation_items: input.confirmation_items ?? {},
      };
    },

    insertAllergenTraining: (payload) =>
      training.insertAllergenTraining(payload),
  };
}
