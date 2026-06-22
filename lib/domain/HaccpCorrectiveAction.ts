/**
 * lib/domain/HaccpCorrectiveAction.ts
 *
 * The shared Corrective-Actions ledger domain (F-19 PR1). The 7 daily-check
 * sub-domains all file into ONE `haccp_corrective_actions` table via the
 * `(source_table, source_id)` hub pattern — a CA row links back to the
 * daily-check row that triggered it. The admin verification queue
 * (corrective-actions GET) + sign-off (corrective-actions/[id] PATCH) read and
 * resolve from the same table.
 *
 * Pure TypeScript: no framework imports, no vendor imports. Vendor column names
 * (snake_case) are carried VERBATIM on the insert shape so the PR2 re-point
 * writes byte-identical payloads — the CA writers are NOT uniform (delivery sets
 * `resolved:false`; the process-room diary writes `null` disposition/recurrence;
 * timesep writes NO CA row at all), so the insert type accepts each row AS-IS
 * with no normalisation.
 */

// The (source_table, source_id) hub pattern — a CA row links back to the
// daily-check row. The nine source tables verified against the 7 route files.
export type HaccpCASourceTable =
  | "haccp_deliveries"
  | "haccp_cold_storage_temps"
  | "haccp_calibration_log"
  | "haccp_cleaning_log"
  | "haccp_processing_temps"
  | "haccp_daily_diary"
  | "haccp_mince_log"
  | "haccp_meatprep_log"
  | "haccp_returns";

/**
 * One row to INSERT into `haccp_corrective_actions`. Keys are the EXACT insert
 * keys the routes use today (snake_case carried verbatim so PR2 inserts
 * byte-identical payloads). The payloads are NOT uniform across the 7 writers:
 *   - delivery sets `resolved: false` explicitly on all 3 rows; the other
 *     writers omit it (DB default applies);
 *   - `product_disposition` / `recurrence_prevention` are `null` for the
 *     process-room diary CA rows, mapped enums / strings elsewhere.
 * The CA port accepts the row AS-IS — no normalisation — so each PR2 caller
 * builds the exact object it builds today.
 */
export interface CorrectiveActionInsert {
  readonly actioned_by: string;
  readonly source_table: HaccpCASourceTable;
  readonly source_id: string;
  readonly ccp_ref: string;
  readonly deviation_description: string;
  readonly action_taken: string;
  readonly product_disposition: string | null;
  readonly recurrence_prevention: string | null;
  readonly management_verification_required: boolean;
  /** delivery sets resolved:false explicitly; others omit (DB default). */
  readonly resolved?: boolean;
}

/** A small `{ name }` author/verifier join, resolved on the queue reads. */
export interface CANameRef {
  readonly name: string;
}

/**
 * One unresolved row in the admin verification queue
 * (corrective-actions GET — the `.eq('management_verification_required', true)
 * .is('verified_at', null)` list). Columns carried verbatim from the route
 * select so the wire output stays byte-identical after PR2.
 */
export interface CorrectiveActionQueueRow {
  readonly id: string;
  readonly submitted_at: string;
  readonly ccp_ref: string;
  readonly deviation_description: string;
  readonly action_taken: string;
  readonly product_disposition: string | null;
  readonly recurrence_prevention: string | null;
  readonly source_table: string;
  readonly management_verification_required: boolean;
  /** users!actioned_by(name) — the actioning operator. */
  readonly users: CANameRef | CANameRef[] | null;
}

/**
 * One recently-resolved row in the admin queue (corrective-actions GET — the
 * `.not('verified_at', 'is', null).order('verified_at', desc).limit(20)` list).
 */
export interface CorrectiveActionResolvedRow {
  readonly id: string;
  readonly submitted_at: string;
  readonly verified_at: string;
  readonly ccp_ref: string;
  readonly deviation_description: string;
  readonly action_taken: string;
  readonly source_table: string;
  /** users!actioned_by(name) — the actioning operator. */
  readonly users: CANameRef | CANameRef[] | null;
  /** verifier:users!verified_by(name) — the signing-off admin. */
  readonly verifier: CANameRef | CANameRef[] | null;
}

/** Both lists returned by the admin verification-queue read. */
export interface CorrectiveActionQueue {
  readonly unresolved: readonly CorrectiveActionQueueRow[];
  readonly resolved: readonly CorrectiveActionResolvedRow[];
}
