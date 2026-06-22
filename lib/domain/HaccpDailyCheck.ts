/**
 * lib/domain/HaccpDailyCheck.ts
 *
 * Domain types for the 7 daily-check sub-domains (F-19 PR1): delivery,
 * cold-storage, calibration, cleaning, process-room (temps + diary), mince-prep
 * (mince + meatprep + timesep) and product-return.
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * MODELING NOTE (design decision 2 — resolved at Render as Ousterhout would):
 *   ONE cohesive file for all 7 sub-domains rather than 7 per-sub-domain files.
 *   These are pure type declarations sharing a common skeleton
 *   (`submitted_by`/`date`/`time_*`, the `corrective_action_required` flag, and
 *   the shared `CAPayload`) — they are the seven faces of one daily-check
 *   ledger. Splitting them would create SHALLOW modules (each file almost
 *   entirely interface, no behaviour to hide) and widen the barrel's import
 *   surface without hiding anything. One cohesive file is the deeper choice and
 *   matches precedent (Cash put 3 tables in one Cash.ts; Visit put
 *   visits+notes in one Visit.ts).
 *
 * Boundary discipline (ADR-0002): the GET-list rows carry the RAW columns the
 * routes return today (snake_case, joins as `users` etc.) so PR2's wire output
 * stays byte-identical — presentation transforms (if any) stay in the routes.
 * The POST inputs are the route bodies as the app's own vocabulary.
 */

// ─── shared ──────────────────────────────────────────────────────────────────

/** A `{ name }` user join the GET reads resolve against (`users!inner(name)`). */
export interface HaccpUserRef {
  readonly name: string;
}

/**
 * The per-track corrective-action payload the deviating daily-check forms POST.
 * `action` is NOT in the payload — the server derives `action_taken` from the
 * deviation context. Used by delivery / cold-storage / calibration / cleaning /
 * process-room / mince-prep. (delivery/cold-storage/process-room mark `notes`
 * optional; calibration/cleaning/mince-prep send it as a string — modelled as
 * optional so all callers fit.)
 */
export interface CAPayload {
  readonly cause: string;
  readonly disposition: string;
  readonly recurrence: string;
  readonly notes?: string;
}

// ─── 1. delivery ─────────────────────────────────────────────────────────────

/** GET /api/haccp/delivery list row — verbatim `.select` columns. */
export interface DeliveryRow {
  readonly id: string;
  readonly date: string;
  readonly time_of_delivery: string;
  readonly supplier: string;
  readonly product: string;
  readonly product_category: string;
  readonly species: string | null;
  readonly temperature_c: number | null;
  readonly temp_status: string;
  readonly covered_contaminated: string;
  readonly contamination_notes: string | null;
  readonly notes: string | null;
  readonly born_in: string | null;
  readonly reared_in: string | null;
  readonly slaughter_site: string | null;
  readonly cut_site: string | null;
  readonly batch_number: string | null;
  readonly delivery_number: number | null;
  readonly allergens_identified: boolean;
  readonly allergen_notes: string | null;
  readonly submitted_at: string;
  readonly users: HaccpUserRef | HaccpUserRef[] | null;
}

/** A supplier lookup row (GET delivery supplier list). */
export interface DeliverySupplierRow {
  readonly id: string;
  readonly name: string;
  readonly categories: unknown;
}

/** Everything the GET /api/haccp/delivery screen needs. */
export interface DeliveryListResult {
  readonly date: string;
  readonly deliveries: readonly DeliveryRow[];
  readonly suppliers: readonly DeliverySupplierRow[];
  readonly next_number: number;
}

/** The delivery date range selector. */
export type DeliveryRange = "today" | "week" | "last_week";

/** POST /api/haccp/delivery body. */
export interface CreateDeliveryInput {
  readonly supplier_id?: string;
  readonly supplier_name?: string;
  readonly product: string;
  readonly product_category: string;
  readonly temperature_c: number | null;
  readonly covered_contaminated: string;
  readonly contamination_type?: string;
  readonly contamination_notes?: string;
  readonly notes?: string;
  readonly born_in?: string;
  readonly reared_in?: string;
  readonly slaughter_site?: string;
  readonly cut_site?: string;
  readonly allergens_identified: boolean;
  readonly allergen_notes?: string;
  readonly corrective_action_temp?: CAPayload;
  readonly corrective_action_contam?: CAPayload;
}

/** A resolved active supplier (the supplier_id lookup on POST). */
export interface DeliverySupplier {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

/** The derived-write payload inserted into `haccp_deliveries`. */
export interface DeliveryPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_delivery: string;
  readonly supplier: string;
  readonly supplier_id: string | null;
  readonly product: string;
  readonly product_category: string;
  readonly temperature_c: number | null;
  readonly temp_status: string;
  readonly covered_contaminated: string;
  readonly contamination_type: string | null;
  readonly contamination_notes: string | null;
  readonly corrective_action_required: boolean;
  readonly notes: string | null;
  readonly born_in: string | null;
  readonly reared_in: string | null;
  readonly slaughter_site: string | null;
  readonly cut_site: string | null;
  readonly delivery_number: number;
  readonly batch_number: string;
  readonly allergens_identified: boolean;
  readonly allergen_notes: string | null;
}

// ─── 2. cold-storage ─────────────────────────────────────────────────────────

/** A cold-storage unit config row. */
export interface ColdStorageUnit {
  readonly id: string;
  readonly name: string;
  readonly unit_type: string;
  readonly target_temp_c: number;
  readonly max_temp_c: number;
}

/** One stored reading row (GET cold-storage readings). */
export interface ColdStorageReading {
  readonly unit_id: string;
  readonly session: string;
  readonly temperature_c: number;
  readonly temp_status: string;
  readonly comments: string | null;
}

/** Everything the GET /api/haccp/cold-storage screen needs. */
export interface ColdStorageListResult {
  readonly units: readonly ColdStorageUnit[];
  readonly readings: readonly ColdStorageReading[];
  readonly date: string;
}

/** One submitted reading (POST cold-storage). */
export interface ColdStorageReadingInput {
  readonly unit_id: string;
  readonly temperature_c: number;
  readonly unit_type: string;
}

/** POST /api/haccp/cold-storage body. */
export interface CreateColdStorageReadingsInput {
  readonly session: "AM" | "PM";
  readonly date: string;
  readonly readings: readonly ColdStorageReadingInput[];
  readonly comments: string;
  readonly corrective_action?: CAPayload;
}

/** The derived row inserted into `haccp_cold_storage_temps`. */
export interface ColdStoragePersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly session: string;
  readonly unit_id: string;
  readonly temperature_c: number;
  readonly temp_status: string;
  readonly comments: string | null;
  readonly corrective_action_required: boolean;
}

/** What `insertColdStorageReadings` selects back to link CA rows. */
export interface ColdStorageInsertedRow {
  readonly id: string;
  readonly unit_id: string;
  readonly temperature_c: number;
  readonly temp_status: string;
}

// ─── 3. calibration ──────────────────────────────────────────────────────────

/** GET /api/haccp/calibration list row — verbatim `.select` columns. */
export interface CalibrationRecord {
  readonly id: string;
  readonly date: string;
  readonly time_of_check: string;
  readonly thermometer_id: string;
  readonly calibration_mode: string;
  readonly cert_reference: string | null;
  readonly purchase_date: string | null;
  readonly ice_water_result_c: number | null;
  readonly ice_water_pass: boolean | null;
  readonly boiling_water_result_c: number | null;
  readonly boiling_water_pass: boolean | null;
  readonly action_taken: string | null;
  readonly verified_by: string | null;
  readonly submitted_at: string;
  readonly users: HaccpUserRef | HaccpUserRef[] | null;
}

/** POST /api/haccp/calibration body — certified-probe mode. */
export interface CreateCalibrationCertifiedInput {
  readonly calibration_mode: "certified_probe";
  readonly thermometer_id: string;
  readonly cert_reference: string;
  readonly purchase_date: string;
  readonly notes?: string;
  readonly verified_by: string;
}

/** POST /api/haccp/calibration body — manual ice/boiling test mode. */
export interface CreateCalibrationManualInput {
  readonly calibration_mode?: string;
  readonly thermometer_id: string;
  readonly ice_water_result_c: number;
  readonly boiling_water_result_c: number;
  readonly action_taken?: string;
  readonly verified_by: string;
  readonly corrective_action?: CAPayload;
}

/** The certified-probe insert payload. */
export interface CalibrationCertifiedPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_check: string;
  readonly thermometer_id: string;
  readonly calibration_mode: "certified_probe";
  readonly cert_reference: string;
  readonly purchase_date: string;
  readonly verified_by: string;
  readonly action_taken: string | null;
}

/** The manual-test insert payload. */
export interface CalibrationManualPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_check: string;
  readonly thermometer_id: string;
  readonly calibration_mode: "manual";
  readonly ice_water_result_c: number;
  readonly ice_water_pass: boolean;
  readonly boiling_water_result_c: number;
  readonly boiling_water_pass: boolean;
  readonly verified_by: string;
  readonly action_taken: string | null;
}

// ─── 4. cleaning ─────────────────────────────────────────────────────────────

/** GET /api/haccp/cleaning list row — verbatim `.select` columns. */
export interface CleaningEntry {
  readonly id: string;
  readonly date: string;
  readonly time_of_clean: string;
  readonly what_was_cleaned: string;
  readonly issues: boolean;
  readonly what_did_you_do: string | null;
  readonly verified_by: string;
  readonly sanitiser_temp_c: number | null;
  readonly submitted_at: string;
  readonly submitted_by: string;
  readonly users: HaccpUserRef | HaccpUserRef[] | null;
}

/** POST /api/haccp/cleaning body. */
export interface CreateCleaningInput {
  readonly what_was_cleaned: string;
  readonly issues: boolean;
  readonly what_did_you_do?: string;
  readonly verified_by: string;
  readonly sanitiser_temp_c?: number;
  readonly corrective_action?: CAPayload;
}

/** The derived row inserted into `haccp_cleaning_log`. */
export interface CleaningPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_clean: string;
  readonly what_was_cleaned: string;
  readonly issues: boolean;
  readonly verified_by: string;
  readonly sanitiser_temp_c: number | null;
  readonly what_did_you_do: string | null;
}

// ─── 5. process-room (temps + diary) ─────────────────────────────────────────

/** GET process-room temps row — verbatim `.select` columns. */
export interface ProcessingTempRow {
  readonly session: string;
  readonly product_temp_c: number;
  readonly room_temp_c: number;
  readonly product_within_limit: boolean;
  readonly room_within_limit: boolean;
  readonly within_limits: boolean;
  readonly submitted_at: string;
}

/** GET process-room diary row — verbatim `.select` columns. */
export interface DailyDiaryRow {
  readonly phase: string;
  readonly check_results: Record<string, boolean>;
  readonly issues: boolean;
  readonly what_did_you_do: string | null;
  readonly submitted_at: string;
}

/** Everything the GET /api/haccp/process-room screen needs. */
export interface ProcessRoomListResult {
  readonly date: string;
  readonly temps: readonly ProcessingTempRow[];
  readonly diary: readonly DailyDiaryRow[];
}

/** POST process-room temps body (type='temps'). */
export interface CreateProcessingTempInput {
  readonly session: "AM" | "PM";
  readonly date: string;
  readonly product_temp_c: number;
  readonly room_temp_c: number;
  readonly corrective_action?: CAPayload;
}

/** POST process-room diary body (type='diary'). */
export interface CreateDailyDiaryInput {
  readonly phase: "opening" | "operational" | "closing";
  readonly date: string;
  readonly check_results: Record<string, boolean>;
  readonly issues: boolean;
  readonly what_did_you_do?: string;
}

/** The derived row inserted into `haccp_processing_temps`. */
export interface ProcessingTempPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly session: string;
  readonly product_temp_c: number;
  readonly room_temp_c: number;
  readonly product_within_limit: boolean;
  readonly room_within_limit: boolean;
  readonly within_limits: boolean;
  readonly corrective_action_required: boolean;
}

/** The derived row inserted into `haccp_daily_diary`. */
export interface DailyDiaryPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly phase: string;
  readonly check_results: Record<string, boolean>;
  readonly issues: boolean;
  readonly what_did_you_do: string | null;
}

// ─── 6. mince-prep (mince + meatprep + timesep) ──────────────────────────────

/** GET mince-prep mince row — verbatim `.select` columns. */
export interface MinceLogRow {
  readonly id: string;
  readonly date: string;
  readonly time_of_production: string;
  readonly batch_code: string;
  readonly product_species: string;
  readonly kill_date: string | null;
  readonly days_from_kill: number | null;
  readonly kill_date_within_limit: boolean | null;
  readonly input_temp_c: number | null;
  readonly output_temp_c: number | null;
  readonly input_temp_pass: boolean | null;
  readonly output_temp_pass: boolean | null;
  readonly output_mode: string | null;
  readonly source_batch_numbers: readonly string[] | null;
  readonly corrective_action: string | null;
  readonly submitted_at: string;
  readonly users: HaccpUserRef | HaccpUserRef[] | null;
}

/** GET mince-prep meatprep row — verbatim `.select` columns. */
export interface MeatPrepLogRow {
  readonly id: string;
  readonly date: string;
  readonly time_of_production: string;
  readonly batch_code: string;
  readonly product_name: string;
  readonly product_species: string | null;
  readonly kill_date: string | null;
  readonly days_from_kill: number | null;
  readonly input_temp_c: number | null;
  readonly output_temp_c: number | null;
  readonly input_temp_pass: boolean | null;
  readonly output_temp_pass: boolean | null;
  readonly output_mode: string | null;
  readonly allergens_present: readonly string[] | null;
  readonly label_check_completed: boolean | null;
  readonly source_batch_numbers: readonly string[] | null;
  readonly corrective_action: string | null;
  readonly submitted_at: string;
  readonly users: HaccpUserRef | HaccpUserRef[] | null;
}

/** GET mince-prep timesep row — verbatim `.select` columns. */
export interface TimeSeparationRow {
  readonly id: string;
  readonly date: string;
  readonly time_of_entry: string;
  readonly plain_products_end_time: string | null;
  readonly clean_completed_time: string;
  readonly allergen_products_start_time: string | null;
  readonly clean_verified_by: string;
  readonly allergens_in_production: string;
  readonly corrective_action: string | null;
  readonly submitted_at: string;
  readonly users: HaccpUserRef | HaccpUserRef[] | null;
}

/** A recent delivery row offered to the mince-prep screen (16-day window). */
export interface MincePrepDeliveryRow {
  readonly id: string;
  readonly supplier: string;
  readonly product: string;
  readonly product_category: string;
  readonly batch_number: string | null;
  readonly slaughter_site: string | null;
  readonly born_in: string | null;
  readonly delivery_number: number | null;
  readonly date: string;
  readonly temperature_c: number | null;
  readonly temp_status: string;
}

/** A compact today's-mince-batch summary the screen offers as prep sources. */
export interface MinceBatchSummary {
  readonly id: string;
  readonly batch_code: string;
  readonly species: string;
  readonly kill_date: string | null;
  readonly output_mode: string | null;
  readonly submitted_at: string;
}

/** Everything the GET /api/haccp/mince-prep screen needs. */
export interface MincePrepListResult {
  readonly date: string;
  readonly mince: readonly MinceLogRow[];
  readonly meatprep: readonly MeatPrepLogRow[];
  readonly timesep: readonly TimeSeparationRow[];
  readonly deliveries: readonly MincePrepDeliveryRow[];
  readonly mince_batches: readonly MinceBatchSummary[];
}

/** POST mince-prep body — mince form. */
export interface CreateMinceInput {
  readonly form: "mince";
  readonly date?: string;
  readonly product_species: string;
  readonly kill_date: string;
  readonly input_temp_c: number;
  readonly output_temp_c: number;
  readonly output_mode?: string;
  readonly source_batch_numbers?: readonly string[];
  readonly source_delivery_ids?: readonly string[];
  readonly corrective_action?: CAPayload;
}

/** POST mince-prep body — meatprep form. */
export interface CreateMeatPrepInput {
  readonly form: "meatprep";
  readonly date?: string;
  readonly product_name: string;
  readonly product_species?: string;
  readonly kill_date?: string;
  readonly input_temp_c: number;
  readonly output_temp_c: number;
  readonly output_mode?: string;
  readonly allergens_present?: readonly string[];
  readonly label_check_completed?: boolean;
  readonly source_batch_numbers?: readonly string[];
  readonly source_delivery_ids?: readonly string[];
  readonly source_mince_batch_ids?: readonly string[];
  readonly corrective_action?: CAPayload;
}

/** POST mince-prep body — time-separation form (corrective_action is free-text). */
export interface CreateTimeSeparationInput {
  readonly form: "timesep";
  readonly date?: string;
  readonly plain_products_end_time?: string;
  readonly clean_completed_time: string;
  readonly allergen_products_start_time?: string;
  readonly clean_verified_by: string;
  readonly allergens_in_production: string;
  readonly corrective_action?: string;
}

/** The derived row inserted into `haccp_mince_log`. */
export interface MincePersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_production: string;
  readonly batch_code: string;
  readonly product_species: string;
  readonly kill_date: string;
  readonly days_from_kill: number;
  readonly kill_date_within_limit: boolean;
  readonly input_temp_c: number;
  readonly output_temp_c: number;
  readonly input_temp_pass: boolean;
  readonly output_temp_pass: boolean;
  readonly output_mode: string;
  readonly source_batch_numbers: readonly string[];
  readonly source_delivery_ids: readonly string[];
  readonly corrective_action: string | null;
}

/** The derived row inserted into `haccp_meatprep_log`. */
export interface MeatPrepPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_production: string;
  readonly batch_code: string;
  readonly product_name: string;
  readonly product_species: string | null;
  readonly kill_date: string | null;
  readonly days_from_kill: number | null;
  readonly input_temp_c: number;
  readonly output_temp_c: number;
  readonly input_temp_pass: boolean;
  readonly output_temp_pass: boolean;
  readonly output_mode: string;
  readonly allergens_present: readonly string[];
  readonly label_check_completed: boolean;
  readonly source_batch_numbers: readonly string[];
  readonly source_delivery_ids: readonly string[];
  readonly corrective_action: string | null;
}

/** The derived row inserted into `haccp_time_separation_log`. */
export interface TimeSeparationPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_entry: string;
  readonly plain_products_end_time: string | null;
  readonly clean_completed_time: string;
  readonly allergen_products_start_time: string | null;
  readonly clean_verified_by: string;
  readonly allergens_in_production: string;
  readonly corrective_action: string | null;
}

// ─── 7. product-return ───────────────────────────────────────────────────────

/** GET /api/haccp/product-return list row — verbatim `.select` columns. */
export interface ReturnRow {
  readonly id: string;
  readonly date: string;
  readonly time_of_return: string;
  readonly customer: string;
  readonly product: string;
  readonly temperature_c: number | null;
  readonly return_code: string;
  readonly return_code_notes: string | null;
  readonly disposition: string;
  readonly corrective_action: string | null;
  readonly verified_by: string;
  readonly submitted_at: string;
  readonly users: HaccpUserRef | HaccpUserRef[] | null;
}

/** POST /api/haccp/product-return body. */
export interface CreateReturnInput {
  readonly customer: string;
  readonly customer_id?: string;
  readonly product: string;
  readonly return_code: string;
  readonly return_code_notes?: string;
  readonly temperature_c?: number | null;
  readonly disposition: string;
  readonly corrective_action?: string;
  readonly verified_by: string;
  readonly source_batch_number?: string;
}

/** The derived row inserted into `haccp_returns`. */
export interface ReturnPersist {
  readonly submitted_by: string;
  readonly date: string;
  readonly time_of_return: string;
  readonly customer: string;
  readonly customer_id: string | null;
  readonly product: string;
  readonly return_code: string;
  readonly return_code_notes: string | null;
  readonly temperature_c: number | null;
  readonly disposition: string;
  readonly verified_by: string;
  readonly source_batch_number: string | null;
  readonly corrective_action: string | null;
}
