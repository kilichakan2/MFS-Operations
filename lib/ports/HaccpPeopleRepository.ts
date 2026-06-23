/**
 * lib/ports/HaccpPeopleRepository.ts
 *
 * The F-19 PR4 Cluster C "people / fitness-to-work" persistence port — the
 * interface the app owns over the haccp_health_records table, SHARED by the
 * staff people route (3 record types) AND the public visitor kiosk. Pure
 * TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * The table is append-only — every POST inserts a fresh row. The insert returns
 * `void`: both routes return `{ ok: true }` and DISCARD the inserted row today
 * (no `.select()`), so the port does NOT add a `.select().single()`.
 *
 * Boundary discipline (ADR-0002): the adapter maps snake_case columns to the
 * domain row shape (carrying the `users!submitted_by(name)` join key `users`
 * verbatim) and throws ServiceError on every DB failure INSIDE the adapter;
 * reads define errors out of existence (empty on miss). NO ConflictError path —
 * Cluster C has NO clean 409 today; every DB error surfaces as a 500.
 */

import type { HealthRecordRow, HealthRecordPersist } from "@/lib/domain";

export interface HaccpPeopleRepository {
  /** Recent health records (all types), submitted_at DESC, limit 50, with the
   *  users!submitted_by(name) join. → GET /people. */
  listHealthRecords(): Promise<readonly HealthRecordRow[]>;
  /** Append a health record (any record_type). → POST /people + POST /visitor. */
  insertHealthRecord(payload: HealthRecordPersist): Promise<void>;
}
