/**
 * lib/ports/HaccpCorrectiveActionsRepository.ts
 *
 * The shared Corrective-Actions ledger port (F-19) — the persistence interface
 * the app owns over `haccp_corrective_actions`, described in BUSINESS
 * operations. Pure TypeScript: imports domain types only, never an adapter or a
 * vendor SDK.
 *
 * The CA ledger is a SHARED write-target hub: the 7 daily-check sub-domains file
 * CA rows into it via the `(source_table, source_id)` pattern, and the admin
 * verification queue + sign-off read/resolve from the same table. Three
 * operations, each mapping 1:1 to a PR2 route operation:
 *
 *   insertMany             → the 6 deviating daily-check writers' CA fan-out
 *   listVerificationQueue  → GET   /api/haccp/corrective-actions (admin queue)
 *   signOff                → PATCH /api/haccp/corrective-actions/[id]
 *
 * Boundary discipline (ADR-0002): the adapter maps Postgres errors to app-owned
 * errors INSIDE the adapter; callers see only `@/lib/domain` types and
 * `@/lib/errors`. `insertMany` accepts the rows AS-IS (no normalisation) so PR2
 * sends byte-identical payloads — the per-writer `resolved`/`null` nuances are
 * preserved by the caller, not the port.
 *
 * NOTE the `ca_write_failed` soft-fail contract (a CA-insert failure is logged,
 * NOT thrown — the daily-check still succeeds) lives at the USE-CASE level, not
 * here. This port's `insertMany` throws ServiceError on a DB failure like every
 * other write; the use-case catches it.
 */

import type {
  CorrectiveActionInsert,
  CorrectiveActionQueue,
} from "@/lib/domain";

export interface HaccpCorrectiveActionsRepository {
  /** Insert N corrective-action rows AS-IS (no normalisation). Throws
   *  ServiceError on a DB failure. A no-op when `rows` is empty.
   *  → the deviating daily-check writers' CA fan-out. */
  insertMany(rows: readonly CorrectiveActionInsert[]): Promise<void>;

  /** The admin verification queue: unresolved (needs verification, not yet
   *  verified) + the 20 most recently resolved.
   *  → GET /api/haccp/corrective-actions. */
  listVerificationQueue(): Promise<CorrectiveActionQueue>;

  /** Sign off a corrective action: set verified_by / verified_at / resolved on
   *  the row, filtered to `management_verification_required = true`.
   *  → PATCH /api/haccp/corrective-actions/[id]. */
  signOff(id: string, verifiedBy: string): Promise<void>;
}
