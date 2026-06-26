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
// MapVisit is a pure presentation type (no vendor/framework import) declared in
// lib/services/mapScene.ts; the map/data route RE-EXPORTS it (a locked
// invariant). Same type-only boundary note as CustomersRepository's MapCustomer.
import type { MapVisit } from "@/lib/services/mapScene";

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

  // ── F-20 PR2 — admin insights reads ──────────────────────────────────────

  /** Prospects-this-week list: visits with a non-null prospect_name in
   *  [from,to], newest first, rep join resolved. → GET /api/admin/prospects.
   *  Selects: id, created_at, prospect_name, prospect_postcode, outcome,
   *  visit_type, pipeline_status, users!visits_user_id_fkey(name).
   *
   *  RISK R1: this read preserves the RAW null `pipeline_status` (it does NOT
   *  apply `toVisit`'s `?? 'Logged'` default), so the route's
   *  `pipelineStatus ? … : null` reproduces today's `stage` exactly. */
  listProspects(window: { from: string; to: string }): Promise<readonly Visit[]>;

  /** At-risk list: visits with outcome IN (at_risk, lost) in [from,to], newest
   *  first, customer + rep joins resolved. → GET /api/admin/at-risk.
   *  Selects: id, created_at, outcome, customer_id, prospect_name, user_id,
   *  customers(name), users!visits_user_id_fkey(name). */
  listAtRisk(window: { from: string; to: string }): Promise<readonly Visit[]>;

  /** Unreviewed-commitments list: visits with commitment_made=true and
   *  created_at < to (optional >= from), OLDEST first, joins resolved.
   *  → GET /api/admin/commitments.
   *  Selects: id, created_at, commitment_detail, customer_id, prospect_name,
   *  user_id, customers(name), users!visits_user_id_fkey(name).
   *
   *  Window contract (byte-identity critical): `lt('created_at', to)` (NOT lte)
   *  and `gte('created_at', from)` ONLY when `from` is non-null. ASC order. */
  listCommitments(window: {
    from: string | null;
    to: string;
  }): Promise<readonly Visit[]>;

  // ── F-20 PR3 — Map View read ───────────────────────────────────────────────

  /** Visits for the Map View (map/data). Returns BOTH existing-customer visits
   *  (joining customers.lat/lng) AND prospect visits (prospect_lat/lng), mapped
   *  to the flat MapVisit shape, newest first, each side capped at 500. Rows
   *  whose resolved lat/lng is null are skipped (customer side). The two sides
   *  are combined customer-visits FIRST then prospect-visits (order matters for
   *  byte-identity). Optional date window filters created_at (gte from / lte to,
   *  each applied only when present). @throws ServiceError on DB failure. */
  listForMap(window: {
    from: string | null;
    to: string | null;
  }): Promise<readonly MapVisit[]>;
}
