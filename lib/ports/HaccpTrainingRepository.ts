/**
 * lib/ports/HaccpTrainingRepository.ts
 *
 * The F-19 PR4 Cluster C "training" persistence port — the interface the app
 * owns over the two HACCP training tables (haccp_staff_training,
 * haccp_allergen_training), described in BUSINESS operations. Pure TypeScript:
 * imports domain types only, never an adapter or a vendor SDK.
 *
 * Both tables are append-only — every POST inserts a fresh row, never
 * overwrites. The inserts return `void`: the routes return `{ ok: true }` and
 * DISCARD the inserted row today (no `.select()`), so the port does NOT add a
 * `.select().single()` — that would be a behaviour change + an extra round-trip.
 *
 * Boundary discipline (ADR-0002): the adapter maps snake_case columns to the
 * domain row shapes and throws ServiceError on every DB failure INSIDE the
 * adapter; reads define errors out of existence (empty on miss). NO ConflictError
 * path — Cluster C has NO clean 409 today; every DB error surfaces as a 500.
 */

import type {
  StaffTrainingRow,
  StaffTrainingPersist,
  AllergenTrainingRow,
  AllergenTrainingPersist,
} from "@/lib/domain";

export interface HaccpTrainingRepository {
  /** All staff-training rows, submitted_at DESC, limit 100. → GET /training (staff). */
  listStaffTraining(): Promise<readonly StaffTrainingRow[]>;
  /** All allergen-training rows, submitted_at DESC, limit 100. → GET /training (allergen). */
  listAllergenTraining(): Promise<readonly AllergenTrainingRow[]>;
  /** Append a staff-training row (returns void — route returns { ok:true }). → POST. */
  insertStaffTraining(payload: StaffTrainingPersist): Promise<void>;
  /** Append an allergen-training row. → POST (allergen_awareness). */
  insertAllergenTraining(payload: AllergenTrainingPersist): Promise<void>;
}
