/**
 * lib/ports/ComplaintsRepository.ts
 *
 * The Complaints port (F-17) — the persistence interface the app owns
 * across the two complaint tables (complaints, complaint_notes), described
 * in BUSINESS operations, not vendor calls. Pure TypeScript: imports domain
 * types only, never an adapter or a vendor SDK.
 *
 * Every method maps 1:1 to a PR2 route operation — none is speculative:
 *
 *   listAllWithNotes  → GET  /api/screen2/all
 *   listOpen          → GET  /api/screen2/open
 *   findDetailById    → GET  /api/detail/complaint
 *   createComplaint   → POST /api/screen2/sync
 *   resolveOpen       → POST /api/screen2/resolve
 *   findEmailContext  → resolve + note email/context read
 *   createNote        → POST /api/screen2/note
 *
 * DECISION 1 (plan): createComplaint returns the resolved customer name so
 * PR2 can build the audit summary + email WITHOUT a second customers read.
 * DECISION 2 (plan): the general audit_log write is NOT this port's job —
 * it stays a route-level cross-cutting concern for PR2 (future AuditLog port).
 *
 * Boundary discipline (ADR-0002 line 27): the adapter maps snake_case
 * columns to camelCase domain fields and Postgres error codes to app-owned
 * errors INSIDE the adapter; callers see only `@/lib/domain` types and
 * `@/lib/errors`. Reads define errors out of existence (null/empty on miss);
 * every DB failure throws ServiceError.
 */

import type {
  Complaint,
  ComplaintDetail,
  ComplaintWeekRollupRow,
  ComplaintEmailContext,
  CreateComplaintInput,
  CreatedComplaint,
  ResolveComplaintInput,
  CreateNoteInput,
  CreatedNote,
} from "@/lib/domain";

export interface ComplaintsRepository {
  /** All complaints + their full notes thread, newest first (notes populated).
   *  → GET /api/screen2/all. */
  listAllWithNotes(): Promise<readonly Complaint[]>;

  /** All OPEN complaints, newest first (notes empty — route doesn't fetch them).
   *  → GET /api/screen2/open. */
  listOpen(): Promise<readonly Complaint[]>;

  /** One complaint by id, customer id+name + logger + resolver resolved.
   *  null on miss. → GET /api/detail/complaint. */
  findDetailById(id: string): Promise<ComplaintDetail | null>;

  /** Insert a complaint (resolution fields set iff status='resolved'); returns
   *  the new id + resolved customer name. duplicate=true on 23505 (offline
   *  replay — NOT an error). → POST /api/screen2/sync. */
  createComplaint(input: CreateComplaintInput): Promise<CreatedComplaint>;

  /** Atomically set status=resolved + the three resolution fields, ONLY where
   *  the complaint is currently open. Returns the resolved id, or null if no
   *  open row matched (404 branch). → POST /api/screen2/resolve. */
  resolveOpen(input: ResolveComplaintInput): Promise<{ id: string } | null>;

  /** Read the email/audit context for a complaint (category, description,
   *  status, customer name). null on miss. → used by resolve + note flows. */
  findEmailContext(id: string): Promise<ComplaintEmailContext | null>;

  /** Insert an internal note; returns the new id + created_at. The caller has
   *  verified the complaint exists (via findEmailContext). → POST /api/screen2/note. */
  createNote(input: CreateNoteInput): Promise<CreatedNote>;

  // ── F-21 — admin dashboard reads ──────────────────────────────────────────

  /** OPEN complaints with created_at < before, customers(name)+users(name)
   *  resolved, ASC (oldest first). → dashboard Zone 1 (open>48h).
   *  Selects: id, created_at, category, description, user_id, customers(name),
   *  users!complaints_user_id_fkey(name). The returned `Complaint` carries the
   *  selected columns; un-selected fields default (status defaults to 'open' —
   *  these are all open by the filter). @throws ServiceError on DB failure. */
  listOpenOlderThan(before: string): Promise<readonly Complaint[]>;

  /** Complaints in [from,to], customers(name)+users(name) resolved, DESC
   *  (newest first), limit 50. → dashboard Zone 2 (complaints today).
   *  Selects: id, created_at, category, status, description, resolution_note,
   *  customers(name), users!complaints_user_id_fkey(name).
   *  @throws ServiceError on DB failure. */
  listTodayWithNames(window: {
    from: string;
    to: string;
  }): Promise<readonly Complaint[]>;

  /** Complaints in [from,to], category+status+created_at+resolved_at ONLY (no
   *  joins) — the category-rollup + open/total counts + avg-resolution feed.
   *  → dashboard Zone 3. RAW category carried (route/service does the .replace).
   *  @throws ServiceError on DB failure. */
  listWeekRollup(window: {
    from: string;
    to: string;
  }): Promise<readonly ComplaintWeekRollupRow[]>;
}
