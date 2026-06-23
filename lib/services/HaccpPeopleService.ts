/**
 * lib/services/HaccpPeopleService.ts
 *
 * The F-19 PR4 Cluster C "people / fitness-to-work" service — business
 * orchestration for the three staff record types (new_staff_declaration,
 * return_to_work, visitor) AND the SHARED visitor-row builder used by both the
 * staff people route and the public visitor kiosk. Factory here, wiring in
 * `lib/wiring/haccp.ts`; depends on the `people` port alone (lint-enforced,
 * ADR-0002 / F-TD-11).
 *
 * The pure logic the routes do today — the required-field `validate…` cascades
 * (EXACT 400 strings, IN ORDER), the illness-type mapping, and the per-path row
 * builders — is LIFTED here so it gets unit-tested now and the routes shrink to
 * "validate → build → write → reply".
 *
 * DETERMINISM (constraint 8): every builder takes `now: Date` (for
 * `manager_signed_at`) and `today: string` (the route-edge `todayUK()` result)
 * IN, and `userId` IN. The service NEVER calls `new Date()` and NEVER computes a
 * date — both the EN-CA (people) and EN-GB (kiosk) `todayUK()` stay route-edge
 * (R3), and the auth-agnostic `userId` is the cookie user OR the fixed kiosk id
 * (the service does not know which — R7).
 *
 * R1 (4 insert maps over one table): each builder sets EXACTLY its path's columns
 * and OMITS the rest, so each insert object's key set matches the route's literal
 * object key set byte-for-byte. Do NOT add columns a path didn't set.
 *
 * R2/R4 divergences stay at the ROUTE edge: `validateVisitor` validates ONLY the
 * three shared visitor fields (visitor_name/company/reason); the manager-signoff
 * check and the `health_questions`/`fit_for_work` defaults are applied by each
 * route and passed in as concrete values, so the shared builder stays honestly
 * shared and neither route's behaviour shifts.
 *
 * NO ConflictError path — Cluster C has no clean 409 today.
 */

import type {
  HealthRecordsListResult,
  HealthRecordPersist,
  CreateNewStaffDeclarationInput,
  CreateReturnToWorkInput,
  CreateVisitorInput,
} from "@/lib/domain";
import type { HaccpPeopleRepository } from "@/lib/ports";

// ─── result helpers ──────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function reject(status: number, message: string): ValidationResult {
  return { ok: false, status, message };
}

/** Map page shorthand to DB constraint values (people/route.ts:98-103). An
 *  unmapped token passes through unchanged. */
function mapIllnessType(illness_type: string): string {
  const illnessTypeMap: Record<string, string> = {
    gi: "gastrointestinal",
    other: "other_illness",
    serious: "serious_illness",
  };
  return illnessTypeMap[illness_type] ?? illness_type;
}

// ─── deps + interface ────────────────────────────────────────────────────────

export interface HaccpPeopleServiceDeps {
  readonly people: HaccpPeopleRepository;
}

export interface HaccpPeopleService {
  /** GET — { records } (submitted_at DESC, limit 50, users!submitted_by(name)). */
  getRecords(): Promise<HealthRecordsListResult>;

  insertHealthRecord(payload: HealthRecordPersist): Promise<void>;

  // ── new_staff_declaration ──
  validateNewStaffDeclaration(
    input: CreateNewStaffDeclarationInput,
  ): ValidationResult;
  buildNewStaffDeclaration(args: {
    input: CreateNewStaffDeclarationInput;
    userId: string;
    now: Date;
    today: string;
  }): HealthRecordPersist;

  // ── return_to_work ──
  validateReturnToWork(input: CreateReturnToWorkInput): ValidationResult;
  buildReturnToWork(args: {
    input: CreateReturnToWorkInput;
    userId: string;
    now: Date;
    today: string;
  }): HealthRecordPersist;

  // ── visitor (SHARED — people-visitor path + public kiosk) ──
  validateVisitor(input: CreateVisitorInput): ValidationResult;
  buildVisitorHealthRecord(args: {
    input: CreateVisitorInput;
    userId: string;
    now: Date;
    today: string;
  }): HealthRecordPersist;
}

export function createHaccpPeopleService(
  deps: HaccpPeopleServiceDeps,
): HaccpPeopleService {
  const { people } = deps;

  return {
    async getRecords(): Promise<HealthRecordsListResult> {
      return { records: await people.listHealthRecords() };
    },

    insertHealthRecord: (payload) => people.insertHealthRecord(payload),

    // ── new_staff_declaration (people/route.ts:66-80) ──
    validateNewStaffDeclaration(input): ValidationResult {
      if (!input.staff_name?.trim()) return reject(400, "Staff name required");
      if (!input.start_date) return reject(400, "Start date required");
      if (!input.manager_signed_by)
        return reject(400, "Manager sign-off required");
      return { ok: true };
    },

    buildNewStaffDeclaration({ input, userId, now, today }): HealthRecordPersist {
      // start_date is validated but NOT written (people:67/70-80).
      return {
        submitted_by: userId,
        record_type: "new_staff_declaration",
        date: today,
        staff_name: input.staff_name!.trim(),
        health_questions: input.health_questions,
        fit_for_work: input.fit_for_work ?? true,
        exclusion_reason: input.exclusion_reason?.trim() || null,
        manager_signed_name: input.manager_signed_by!.trim(),
        manager_signed_at: now.toISOString(),
      };
    },

    // ── return_to_work (people/route.ts:93-120) ──
    validateReturnToWork(input): ValidationResult {
      if (!input.staff_name?.trim()) return reject(400, "Staff name required");
      if (!input.illness_type) return reject(400, "Illness type required");
      if (!input.manager_signed_by)
        return reject(400, "Manager sign-off required");
      return { ok: true };
    },

    buildReturnToWork({ input, userId, now, today }): HealthRecordPersist {
      return {
        submitted_by: userId,
        record_type: "return_to_work",
        date: today,
        staff_name: input.staff_name!.trim(),
        absence_from: input.absence_from || null,
        absence_to: input.absence_to || null,
        return_date: today,
        illness_type: mapIllnessType(input.illness_type!),
        health_questions: input.health_questions,
        symptom_free_48h: input.symptom_free_48h ?? null,
        medical_certificate_provided:
          input.medical_certificate_provided ?? null,
        fit_for_work: true,
        manager_signed_name: input.manager_signed_by!.trim(),
        manager_signed_at: now.toISOString(),
      };
    },

    // ── visitor (SHARED) — validate ONLY the three shared fields (R2/R4) ──
    validateVisitor(input): ValidationResult {
      if (!input.visitor_name?.trim())
        return reject(400, "Visitor name required");
      if (!input.visitor_company?.trim()) return reject(400, "Company required");
      if (!input.visitor_reason?.trim())
        return reject(400, "Visit reason required");
      return { ok: true };
    },

    /**
     * SHARED visitor-row builder. The caller (route) has ALREADY resolved the
     * divergent `health_questions` and `fit_for_work` defaults (R2) and runs its
     * own manager-signoff check (R4), so this builder assembles the row from
     * concrete values + the injected userId/now/today only.
     */
    buildVisitorHealthRecord({ input, userId, now, today }): HealthRecordPersist {
      return {
        submitted_by: userId,
        record_type: "visitor",
        date: today,
        visitor_name: input.visitor_name!.trim(),
        visitor_company: input.visitor_company!.trim(),
        visitor_reason: input.visitor_reason!.trim(),
        health_questions: input.health_questions,
        visitor_declaration_confirmed:
          input.visitor_declaration_confirmed ?? false,
        fit_for_work: input.fit_for_work ?? false,
        manager_signed_name: input.manager_signed_by!.trim(),
        manager_signed_at: now.toISOString(),
      };
    },
  };
}
