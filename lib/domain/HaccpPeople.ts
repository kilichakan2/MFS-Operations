/**
 * lib/domain/HaccpPeople.ts
 *
 * Domain types for the F-19 PR4 Cluster C "people / fitness-to-work" hexagon —
 * the haccp_health_records table, SHARED by the staff people route (3 record
 * types: new_staff_declaration, return_to_work, visitor) AND the public visitor
 * kiosk. Append-only.
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * Boundary discipline (ADR-0002): the GET-list row carries the RAW columns the
 * route returns today (snake_case) so the wire output stays byte-identical. NOTE
 * the join here is `users!submitted_by(name)` — the key is `users` (NON-aliased,
 * NON-inner), so a row with a null submitted_by still returns with `users: null`.
 *
 * R11 (barrel collision): `HealthRecordUserRef` is the user-ref for THIS module.
 * It is deliberately a DISTINCT name from `HaccpDailyCheck.ts`'s `HaccpUserRef`
 * (already exported from the barrel) AND is kept module-local — only
 * `HealthRecordRow` / `HealthRecordsListResult` / the input + persist types are
 * re-exported from `lib/domain/index.ts`.
 *
 * R1 (4 insert maps over one table): `HealthRecordPersist` is the SUPERSET of
 * every column any of the 4 write paths sets. Each builder fills exactly its
 * path's columns and OMITS the rest, so each insert object's key set matches the
 * route's literal object key set byte-for-byte.
 */

/**
 * The users!submitted_by(name) join target — key is `users` (NON-aliased,
 * NON-inner). Module-local (NOT re-exported) to avoid colliding with
 * `HaccpUserRef` from HaccpDailyCheck.ts in the domain barrel.
 */
export type HealthRecordUserRef = { readonly name: string } | null;

/**
 * GET /api/haccp/people list row — verbatim `.select` columns
 * (people/route.ts:29), including the `users!submitted_by(name)` join.
 */
export interface HealthRecordRow {
  readonly id: string;
  readonly record_type: string;
  readonly date: string;
  readonly staff_name: string | null;
  readonly visitor_name: string | null;
  readonly visitor_company: string | null;
  readonly fit_for_work: boolean;
  readonly health_questions: unknown;
  readonly exclusion_reason: string | null;
  readonly illness_type: string | null;
  readonly absence_from: string | null;
  readonly absence_to: string | null;
  readonly manager_signed_name: string | null;
  readonly submitted_at: string;
  readonly users: HealthRecordUserRef;
}

/** The EXACT GET /api/haccp/people response shape. */
export interface HealthRecordsListResult {
  readonly records: readonly HealthRecordRow[];
}

// ─── POST inputs (one per record-type) ──────────────────────────────────────────

export interface CreateNewStaffDeclarationInput {
  readonly staff_name?: string;
  readonly start_date?: string; // validated but NOT written to a column (people:67)
  readonly health_questions?: unknown;
  readonly fit_for_work?: boolean;
  readonly exclusion_reason?: string;
  readonly manager_signed_by?: string;
}

export interface CreateReturnToWorkInput {
  readonly staff_name?: string;
  readonly absence_from?: string;
  readonly absence_to?: string;
  readonly illness_type?: string;
  readonly health_questions?: unknown;
  readonly symptom_free_48h?: boolean | null;
  readonly medical_certificate_provided?: boolean | null;
  readonly manager_signed_by?: string;
}

export interface CreateVisitorInput {
  readonly visitor_name?: string;
  readonly visitor_company?: string;
  readonly visitor_reason?: string;
  readonly health_questions?: unknown;
  readonly visitor_declaration_confirmed?: boolean;
  readonly manager_signed_by?: string;
  readonly fit_for_work?: boolean; // kiosk path only reads this
}

// ─── Persist row (superset of all 4 insert maps — R1) ────────────────────────────

/**
 * The SUPERSET of every column any haccp_health_records write path sets. Each
 * builder fills exactly its path's columns and OMITS the rest (so the insert
 * object key set matches each route's literal object byte-for-byte). All columns
 * are optional here; the builders enforce per-path presence.
 */
export interface HealthRecordPersist {
  readonly submitted_by: string;
  readonly record_type: string;
  readonly date: string;
  readonly staff_name?: string;
  readonly health_questions?: unknown;
  readonly fit_for_work?: boolean;
  readonly exclusion_reason?: string | null;
  readonly manager_signed_name: string;
  readonly manager_signed_at: string;
  readonly absence_from?: string | null;
  readonly absence_to?: string | null;
  readonly return_date?: string;
  readonly illness_type?: string;
  readonly symptom_free_48h?: boolean | null;
  readonly medical_certificate_provided?: boolean | null;
  readonly visitor_name?: string;
  readonly visitor_company?: string;
  readonly visitor_reason?: string;
  readonly visitor_declaration_confirmed?: boolean;
}
