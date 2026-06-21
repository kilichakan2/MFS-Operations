/**
 * lib/ports/VisitsRepository.ts
 *
 * The Visits port (F-18) — the persistence interface the app owns across
 * the two visit tables (visits, visit_notes), described in BUSINESS
 * operations, not vendor calls. Pure TypeScript: imports domain types only,
 * never an adapter or a vendor SDK.
 *
 * Every method maps 1:1 to a PR2 route operation — none is speculative:
 *
 *   createVisit            → POST   /api/screen3/sync
 *   updateProspectLocation → PATCH  /api/screen3/sync (geocode, fire-and-forget)
 *   listForCaller          → GET    /api/screen3/today
 *   deleteOwnVisit         → DELETE /api/screen3/visit
 *   updatePipelineStatus   → PATCH  /api/screen3/visit
 *   verifyVisitOwnership   → sales gate for /api/screen3/visit/notes
 *   listNotes              → GET    /api/screen3/visit/notes
 *   createNote             → POST   /api/screen3/visit/notes
 *   updateNote             → PATCH  /api/screen3/visit/notes
 *   findDetailById         → GET    /api/detail/visit
 *   listAllWithFilters     → GET    /api/admin/visits
 *
 * Boundary discipline (ADR-0002 line 27): the adapter maps snake_case
 * columns to camelCase domain fields and Postgres error codes to app-owned
 * errors INSIDE the adapter; callers see only `@/lib/domain` types and
 * `@/lib/errors`. Reads define errors out of existence (null/empty on miss);
 * every DB failure throws ServiceError. The screen3/sync 23505/409 case is
 * NOT an error — it maps to `duplicate: true` (the route returns 200).
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

export interface VisitsRepository {
  /** Insert OR upsert (on_conflict=id) a visit; returns the new id.
   *  duplicate=true on 23505/409 (offline replay — NOT an error, route
   *  returns 200). → POST /api/screen3/sync. */
  createVisit(input: CreateVisitInput): Promise<CreatedVisit>;

  /** Fire-and-forget geocode PATCH writing prospect_lat/lng + approximate
   *  flag back to the row. Best-effort: swallow errors (the route does the
   *  same — geocoding is non-fatal). → PATCH /api/screen3/sync. */
  updateProspectLocation(loc: ProspectLocation): Promise<void>;

  /** Visits for the caller, newest first. Manager → all reps; sales → own.
   *  → GET /api/screen3/today. */
  listForCaller(opts: {
    userId: string;
    isManager: boolean;
  }): Promise<readonly Visit[]>;

  /** Permanently delete a visit owned by userId (owner-only filter).
   *  → DELETE /api/screen3/visit. */
  deleteOwnVisit(id: string, userId: string): Promise<void>;

  /** Update pipeline_status; manager updates any, sales only own. Returns the
   *  id, or null if no row matched the owner filter (404 branch).
   *  → PATCH /api/screen3/visit. */
  updatePipelineStatus(
    input: UpdatePipelineStatusInput,
  ): Promise<{ id: string } | null>;

  /** Sales gate: does this visit belong to userId? → /api/screen3/visit/notes. */
  verifyVisitOwnership(visitId: string, userId: string): Promise<boolean>;

  /** All notes for a visit, oldest first (author resolved).
   *  → GET /api/screen3/visit/notes. */
  listNotes(visitId: string): Promise<readonly VisitNote[]>;

  /** Insert a note; returns the new note with author resolved.
   *  → POST /api/screen3/visit/notes. */
  createNote(input: CreateVisitNoteInput): Promise<VisitNote>;

  /** Edit a note (author-only unless manager). Returns the updated note, or
   *  null if no row matched (404 branch — W1: use maybeSingle, never throw on
   *  a no-match). → PATCH /api/screen3/visit/notes. */
  updateNote(input: UpdateVisitNoteInput): Promise<VisitNote | null>;

  /** One visit by id with the customer id+name pair resolved. null on miss.
   *  → GET /api/detail/visit. */
  findDetailById(id: string): Promise<VisitDetail | null>;

  /** All visits in a date range with optional rep/type/outcome filters,
   *  newest first, limited to 200. → GET /api/admin/visits. */
  listAllWithFilters(filter: AdminVisitFilter): Promise<readonly Visit[]>;
}
