/**
 * lib/services/ComplaintsService.ts
 *
 * The Complaints service (F-17) — business orchestration for the Complaints
 * domain. Factory here, wiring in `lib/wiring/complaints.ts`; depends on the
 * `complaints` port alone, never on another service and never on the adapters
 * folder (lint-enforced, ADR-0002 / F-TD-11).
 *
 * The service carries the validation cascades currently inline in the routes,
 * returning typed {status, message} rejections with the routes' EXACT message
 * strings (mirroring CashService.validateEntry):
 *   - validateCreate: the screen2/sync `missing[]` cascade + the
 *     resolved⇒resolution_note rule.
 *   - validateResolve: screen2/resolve's complaint_id / resolution_note
 *     required checks (the UUID regex stays in the route — presentation).
 *   - validateNote: screen2/note's complaint_id / body required checks
 *     (UUID regex stays in the route).
 *
 * The `category.replace(/_/g, ' ')` display transform stays in the route
 * (PR2) — the domain carries the raw enum. Everything else is a thin
 * passthrough to the repository so PR2's routes call ONE object.
 */

import type {
  Complaint,
  ComplaintDetail,
  ComplaintEmailContext,
  CreateComplaintInput,
  CreatedComplaint,
  ResolveComplaintInput,
  CreateNoteInput,
  CreatedNote,
} from "@/lib/domain";
import type { ComplaintsRepository } from "@/lib/ports";

// ─── Repository bundle ──────────────────────────────────────

export interface ComplaintsServiceDeps {
  readonly complaints: ComplaintsRepository;
}

// ─── Validation result ──────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

// ─── The ComplaintsService interface ────────────────────────

export interface ComplaintsService {
  listAllWithNotes(): Promise<readonly Complaint[]>;
  listOpen(): Promise<readonly Complaint[]>;
  findDetailById(id: string): Promise<ComplaintDetail | null>;

  /** Validate a create-complaint request. Returns ok | a typed rejection
   *  {status, message} mirroring screen2/sync's `Missing: …` 400 exactly. */
  validateCreate(input: CreateComplaintInput): ValidationResult;

  /** Validate a resolve request. Mirrors screen2/resolve's required checks
   *  (the UUID regex stays in the route — presentation). */
  validateResolve(input: ResolveComplaintInput): ValidationResult;

  /** Validate a create-note request. Mirrors screen2/note's required checks
   *  (the UUID regex stays in the route — presentation). */
  validateNote(input: CreateNoteInput): ValidationResult;

  createComplaint(input: CreateComplaintInput): Promise<CreatedComplaint>;
  resolveOpen(input: ResolveComplaintInput): Promise<{ id: string } | null>;
  findEmailContext(id: string): Promise<ComplaintEmailContext | null>;
  createNote(input: CreateNoteInput): Promise<CreatedNote>;
}

// ─── The factory ────────────────────────────────────────────

export function createComplaintsService(
  deps: ComplaintsServiceDeps,
): ComplaintsService {
  const { complaints } = deps;

  return {
    listAllWithNotes: () => complaints.listAllWithNotes(),
    listOpen: () => complaints.listOpen(),
    findDetailById: (id) => complaints.findDetailById(id),

    validateCreate(input: CreateComplaintInput): ValidationResult {
      // Mirror screen2/sync's `missing[]` cascade order + message exactly.
      const missing: string[] = [];
      if (!input.customerId) missing.push("customer_id");
      if (!input.category) missing.push("category");
      if (!input.description || input.description.trim().length < 5) {
        missing.push("description");
      }
      if (!input.receivedVia) missing.push("received_via");
      if (!input.status) missing.push("status");
      if (input.status === "resolved" && !input.resolutionNote?.trim()) {
        missing.push("resolution_note");
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

    validateResolve(input: ResolveComplaintInput): ValidationResult {
      // Mirror screen2/resolve's required checks (UUID regex stays in route).
      if (!input.complaintId?.trim()) {
        return { ok: false, status: 400, message: "complaint_id required" };
      }
      if (!input.resolutionNote?.trim()) {
        return { ok: false, status: 400, message: "resolution_note required" };
      }
      return { ok: true };
    },

    validateNote(input: CreateNoteInput): ValidationResult {
      // Mirror screen2/note's required checks (UUID regex stays in route).
      if (!input.complaintId?.trim()) {
        return { ok: false, status: 400, message: "complaint_id required" };
      }
      if (!input.body?.trim()) {
        return { ok: false, status: 400, message: "body required" };
      }
      return { ok: true };
    },

    createComplaint: (input) => complaints.createComplaint(input),
    resolveOpen: (input) => complaints.resolveOpen(input),
    findEmailContext: (id) => complaints.findEmailContext(id),
    createNote: (input) => complaints.createNote(input),
  };
}
