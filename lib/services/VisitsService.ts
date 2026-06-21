/**
 * lib/services/VisitsService.ts
 *
 * The Visits service (F-18) — business orchestration for the Visits domain.
 * Factory here, wiring in `lib/wiring/visits.ts`; depends on the `visits`
 * port alone, never on another service and never on the adapters folder
 * (lint-enforced, ADR-0002 / F-TD-11).
 *
 * The service carries the validation cascades currently inline in the routes,
 * returning typed {status, message} rejections with the routes' EXACT message
 * strings (mirroring ComplaintsService.validateCreate):
 *   - validateCreate: the screen3/sync `missing[]` cascade
 *     (`customer_id or prospect_name required` /
 *      `only one of customer_id/prospect_name allowed` / `visit_type` /
 *      `outcome` / `commitment_detail`).
 *   - validatePipelineStatus: screen3/visit PATCH's id / pipeline_status
 *     required checks + the valid-status set
 *     (`Invalid status. Must be one of: …`). The UUID regex stays in the route.
 *   - validateNote: screen3/visit/notes' visit_id / body required checks.
 *   - validateUpdateNote: screen3/visit/notes PATCH's id / body required checks.
 *
 * The `visit_type`/`outcome` `replace(/_/g, ' ')` display transforms stay in
 * the routes (PR2) — the domain carries the raw enums. Everything else is a
 * thin passthrough to the repository so PR2's routes call ONE object.
 */

import type {
  Visit,
  VisitDetail,
  VisitNote,
  CreateVisitInput,
  CreatedVisit,
  ProspectLocation,
  UpdatePipelineStatusInput,
  CreateVisitNoteInput,
  UpdateVisitNoteInput,
  AdminVisitFilter,
} from "@/lib/domain";
import { VALID_PIPELINE_STATUSES } from "@/lib/domain";
import type { VisitsRepository } from "@/lib/ports";

// ─── Repository bundle ──────────────────────────────────────

export interface VisitsServiceDeps {
  readonly visits: VisitsRepository;
}

// ─── Validation result ──────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

// ─── The VisitsService interface ────────────────────────────

export interface VisitsService {
  /** Validate a create-visit request. Returns ok | a typed rejection
   *  {status, message} mirroring screen3/sync's `Missing: …` 400 exactly. */
  validateCreate(input: CreateVisitInput): ValidationResult;

  /** Validate a pipeline-status update. Mirrors screen3/visit PATCH's required
   *  checks + the valid-status set (the UUID regex stays in the route). */
  validatePipelineStatus(input: {
    id: string | null | undefined;
    status: string | null | undefined;
  }): ValidationResult;

  /** Validate a create-note request. Mirrors screen3/visit/notes' required
   *  checks (the UUID regex stays in the route — presentation). */
  validateNote(input: {
    visitId: string | null | undefined;
    body: string | null | undefined;
  }): ValidationResult;

  /** Validate an edit-note request. Mirrors screen3/visit/notes PATCH's
   *  required checks (the UUID regex stays in the route — presentation). */
  validateUpdateNote(input: {
    id: string | null | undefined;
    body: string | null | undefined;
  }): ValidationResult;

  createVisit(input: CreateVisitInput): Promise<CreatedVisit>;
  updateProspectLocation(loc: ProspectLocation): Promise<void>;
  listForCaller(opts: {
    userId: string;
    isManager: boolean;
  }): Promise<readonly Visit[]>;
  deleteOwnVisit(id: string, userId: string): Promise<void>;
  updatePipelineStatus(
    input: UpdatePipelineStatusInput,
  ): Promise<{ id: string } | null>;
  verifyVisitOwnership(visitId: string, userId: string): Promise<boolean>;
  listNotes(visitId: string): Promise<readonly VisitNote[]>;
  createNote(input: CreateVisitNoteInput): Promise<VisitNote>;
  updateNote(input: UpdateVisitNoteInput): Promise<VisitNote | null>;
  findDetailById(id: string): Promise<VisitDetail | null>;
  listAllWithFilters(filter: AdminVisitFilter): Promise<readonly Visit[]>;
}

// ─── The factory ────────────────────────────────────────────

export function createVisitsService(deps: VisitsServiceDeps): VisitsService {
  const { visits } = deps;

  return {
    validateCreate(input: CreateVisitInput): ValidationResult {
      // Mirror screen3/sync's `missing[]` cascade order + message exactly.
      const missing: string[] = [];
      if (!input.customerId && !input.prospectName) {
        missing.push("customer_id or prospect_name required");
      }
      if (input.customerId && input.prospectName) {
        missing.push("only one of customer_id/prospect_name allowed");
      }
      if (!input.visitType) missing.push("visit_type");
      if (!input.outcome) missing.push("outcome");
      if (input.commitmentMade && !input.commitmentDetail) {
        missing.push("commitment_detail");
      }
      if (missing.length > 0) {
        return {
          ok: false,
          status: 400,
          message: `Missing: ${missing.join(", ")}`,
        };
      }
      return { ok: true };
    },

    validatePipelineStatus(input): ValidationResult {
      // Mirror screen3/visit PATCH's required checks + valid-status set.
      if (!input.id) {
        return { ok: false, status: 400, message: "id required" };
      }
      if (!input.status) {
        return { ok: false, status: 400, message: "pipeline_status required" };
      }
      if (
        !VALID_PIPELINE_STATUSES.includes(
          input.status as (typeof VALID_PIPELINE_STATUSES)[number],
        )
      ) {
        return {
          ok: false,
          status: 400,
          message: `Invalid status. Must be one of: ${VALID_PIPELINE_STATUSES.join(", ")}`,
        };
      }
      return { ok: true };
    },

    validateNote(input): ValidationResult {
      // Mirror screen3/visit/notes POST/GET required checks.
      if (!input.visitId) {
        return { ok: false, status: 400, message: "visit_id required" };
      }
      if (!input.body?.trim()) {
        return { ok: false, status: 400, message: "body required" };
      }
      return { ok: true };
    },

    validateUpdateNote(input): ValidationResult {
      // Mirror screen3/visit/notes PATCH required checks.
      if (!input.id) {
        return { ok: false, status: 400, message: "id required" };
      }
      if (!input.body?.trim()) {
        return { ok: false, status: 400, message: "body required" };
      }
      return { ok: true };
    },

    createVisit: (input) => visits.createVisit(input),
    updateProspectLocation: (loc) => visits.updateProspectLocation(loc),
    listForCaller: (opts) => visits.listForCaller(opts),
    deleteOwnVisit: (id, userId) => visits.deleteOwnVisit(id, userId),
    updatePipelineStatus: (input) => visits.updatePipelineStatus(input),
    verifyVisitOwnership: (visitId, userId) =>
      visits.verifyVisitOwnership(visitId, userId),
    listNotes: (visitId) => visits.listNotes(visitId),
    createNote: (input) => visits.createNote(input),
    updateNote: (input) => visits.updateNote(input),
    findDetailById: (id) => visits.findDetailById(id),
    listAllWithFilters: (filter) => visits.listAllWithFilters(filter),
  };
}
