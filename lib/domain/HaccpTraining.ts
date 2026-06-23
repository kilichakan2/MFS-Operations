/**
 * lib/domain/HaccpTraining.ts
 *
 * Domain types for the F-19 PR4 Cluster C "training" hexagon — staff training
 * (butchery_process_room / warehouse_operative) and allergen-awareness training.
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * Boundary discipline (ADR-0002): the GET-list rows carry the RAW columns the
 * route returns today (snake_case, flat — NO user join) so the wire output stays
 * byte-identical. The POST bodies are modelled as the app's own input vocabulary;
 * the derived insert rows are the `…Persist` shapes.
 *
 * Two distinct tables live in this one cluster:
 *   - haccp_staff_training (training_type, completion_date, supervisor_signed_at)
 *   - haccp_allergen_training (training_completed, certification_date, NO
 *     supervisor_signed_at) — different table + different column names.
 * Both are append-only.
 */

// ─── 1. staff training ─────────────────────────────────────────────────────────

/**
 * GET /api/haccp/training list row (staff) — verbatim `.select` columns
 * (training/route.ts:26). Flat — NO user join.
 */
export interface StaffTrainingRow {
  readonly id: string;
  readonly staff_name: string;
  readonly job_role: string;
  readonly training_type: string;
  readonly document_version: string;
  readonly completion_date: string;
  readonly refresh_date: string;
  readonly supervisor_name: string;
  readonly confirmation_items: unknown;
  readonly submitted_at: string;
}

/** Staff-training POST body (butchery_process_room | warehouse_operative). */
export interface CreateStaffTrainingInput {
  readonly training_type: string; // 'butchery_process_room' | 'warehouse_operative'
  readonly staff_name?: string;
  readonly job_role?: string;
  readonly document_version?: string;
  readonly completion_date?: string;
  readonly refresh_date?: string;
  readonly supervisor?: string;
  readonly confirmation_items?: unknown;
}

/** Derived insert row for haccp_staff_training (training/route.ts:79-90). */
export interface StaffTrainingPersist {
  readonly logged_by: string;
  readonly staff_name: string; // .trim()
  readonly job_role: string; // .trim()
  readonly training_type: string; // the input training_type, verbatim
  readonly document_version: string; // .trim()
  readonly completion_date: string;
  readonly refresh_date: string;
  readonly supervisor_name: string; // supervisor.trim()
  readonly supervisor_signed_at: string; // now.toISOString()
  readonly confirmation_items: unknown; // confirmation_items ?? {}
}

// ─── 2. allergen training ──────────────────────────────────────────────────────

/**
 * GET /api/haccp/training list row (allergen) — verbatim `.select` columns
 * (training/route.ts:31). Flat — NO user join.
 */
export interface AllergenTrainingRow {
  readonly id: string;
  readonly staff_name: string;
  readonly job_role: string;
  readonly training_completed: string;
  readonly certification_date: string;
  readonly refresh_date: string;
  readonly reviewed_by: string | null;
  readonly confirmation_items: unknown;
  readonly supervisor_name: string;
  readonly document_version: string | null;
  readonly submitted_at: string;
}

/** Allergen-training POST body (allergen_awareness). */
export interface CreateAllergenTrainingInput {
  readonly staff_name?: string;
  readonly job_role?: string;
  readonly certification_date?: string;
  readonly refresh_date?: string;
  readonly supervisor?: string;
  readonly confirmation_items?: unknown;
}

/** Derived insert row for haccp_allergen_training (training/route.ts:115-124). */
export interface AllergenTrainingPersist {
  readonly logged_by: string;
  readonly staff_name: string; // .trim()
  readonly job_role: string; // .trim()
  readonly training_completed: "allergen_awareness"; // HARDCODED literal
  readonly certification_date: string;
  readonly refresh_date: string;
  readonly supervisor_name: string; // supervisor.trim()
  readonly confirmation_items: unknown; // confirmation_items ?? {}
}

// ─── GET response shape ─────────────────────────────────────────────────────────

/** The EXACT GET /api/haccp/training response shape (key order: staff, allergen). */
export interface TrainingListResult {
  readonly staff: readonly StaffTrainingRow[];
  readonly allergen: readonly AllergenTrainingRow[];
}
