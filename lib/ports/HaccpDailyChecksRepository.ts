/**
 * lib/ports/HaccpDailyChecksRepository.ts
 *
 * The 7-table daily-check persistence port (F-19) — the interface the app owns
 * over the daily-check log tables, described in BUSINESS operations. Pure
 * TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * Every method maps to a PR2 route read/insert. The insert methods return the
 * new row's `id` (and, for cold-storage, the per-reading id+status) so the
 * use-case can link corrective-action rows back via (source_table, source_id).
 *
 * Boundary discipline (ADR-0002): the adapter maps snake_case columns to the
 * domain row shapes and Postgres error codes to app-owned errors INSIDE the
 * adapter; reads define errors out of existence (null/empty on miss); every DB
 * failure throws ServiceError; `23505` (unique_violation) maps to ConflictError
 * on every insert that has a clean 409 path in the route today.
 */

import type {
  // delivery
  DeliveryListResult,
  DeliveryRange,
  DeliverySupplier,
  DeliveryPersist,
  // cold-storage
  ColdStorageListResult,
  ColdStorageUnit,
  ColdStoragePersist,
  ColdStorageInsertedRow,
  // calibration
  CalibrationRecord,
  CalibrationCertifiedPersist,
  CalibrationManualPersist,
  // cleaning
  CleaningEntry,
  CleaningPersist,
  // process-room
  ProcessRoomListResult,
  ProcessingTempPersist,
  DailyDiaryPersist,
  // mince-prep
  MincePrepListResult,
  MincePersist,
  MeatPrepPersist,
  TimeSeparationPersist,
  // product-return
  ReturnRow,
  ReturnPersist,
} from "@/lib/domain";

export interface HaccpDailyChecksRepository {
  // ── 1. delivery ──────────────────────────────────────────────
  /** Today / week / last-week deliveries + active suppliers + next number.
   *  → GET /api/haccp/delivery. */
  listDeliveries(range: DeliveryRange): Promise<DeliveryListResult>;
  /** Resolve a supplier by id (active-flag carried). null on miss.
   *  → POST /api/haccp/delivery supplier check. */
  findSupplierForDelivery(supplierId: string): Promise<DeliverySupplier | null>;
  /** COUNT today's deliveries (delivery_number sequencing).
   *  → POST /api/haccp/delivery. */
  countDeliveriesOn(date: string): Promise<number>;
  /** Insert a delivery; returns the new id (for CA linking). 23505 →
   *  ConflictError. → POST /api/haccp/delivery. */
  insertDelivery(payload: DeliveryPersist): Promise<{ id: string }>;

  // ── 2. cold-storage ──────────────────────────────────────────
  /** Active units + the date's readings. → GET /api/haccp/cold-storage. */
  listColdStorage(date: string): Promise<ColdStorageListResult>;
  /** Active cold-storage units (the POST threshold lookup).
   *  → POST /api/haccp/cold-storage. */
  listActiveColdStorageUnits(): Promise<readonly ColdStorageUnit[]>;
  /** Insert N readings; returns each new id+unit+status (for CA linking).
   *  23505 → ConflictError. → POST /api/haccp/cold-storage. */
  insertColdStorageReadings(
    rows: readonly ColdStoragePersist[],
  ): Promise<readonly ColdStorageInsertedRow[]>;

  // ── 3. calibration ───────────────────────────────────────────
  /** Last 6 months of calibration records, newest first.
   *  → GET /api/haccp/calibration. */
  listCalibration(): Promise<readonly CalibrationRecord[]>;
  /** Insert a certified-probe record (no id selected back — no CA path).
   *  → POST /api/haccp/calibration certified mode. */
  insertCalibrationCertified(
    payload: CalibrationCertifiedPersist,
  ): Promise<void>;
  /** Insert a manual-test record; returns the new id (for CA linking).
   *  → POST /api/haccp/calibration manual mode. */
  insertCalibrationManual(
    payload: CalibrationManualPersist,
  ): Promise<{ id: string }>;

  // ── 4. cleaning ──────────────────────────────────────────────
  /** Today's cleaning log, newest first. → GET /api/haccp/cleaning. */
  listCleaning(): Promise<readonly CleaningEntry[]>;
  /** Insert a cleaning event; returns the new id (for CA linking).
   *  → POST /api/haccp/cleaning. */
  insertCleaning(payload: CleaningPersist): Promise<{ id: string }>;

  // ── 5. process-room (temps + diary) ──────────────────────────
  /** The date's processing temps + diary entries.
   *  → GET /api/haccp/process-room. */
  listProcessRoom(date: string): Promise<ProcessRoomListResult>;
  /** Insert a processing-temp session; returns the new id (for CA linking).
   *  23505 → ConflictError. → POST /api/haccp/process-room type=temps. */
  insertProcessingTemp(
    payload: ProcessingTempPersist,
  ): Promise<{ id: string }>;
  /** Insert a diary phase; returns the new id (for CA linking). 23505 →
   *  ConflictError. → POST /api/haccp/process-room type=diary. */
  insertDailyDiary(payload: DailyDiaryPersist): Promise<{ id: string }>;

  // ── 6. mince-prep (mince + meatprep + timesep) ───────────────
  /** Today/week/last-week mince+meatprep+timesep + 16-day deliveries +
   *  today's mince batches. → GET /api/haccp/mince-prep. */
  listMincePrep(range: DeliveryRange): Promise<MincePrepListResult>;
  /** COUNT today's runs on a mince/meatprep table (batch-code sequencing).
   *  → POST /api/haccp/mince-prep. */
  countMinceRuns(
    table: "haccp_mince_log" | "haccp_meatprep_log",
    date: string,
  ): Promise<number>;
  /** Insert a mince row; returns the new id (for CA linking). 23505 →
   *  ConflictError. → POST /api/haccp/mince-prep form=mince. */
  insertMince(payload: MincePersist): Promise<{ id: string }>;
  /** Insert a meatprep row; returns the new id (for CA linking). 23505 →
   *  ConflictError. → POST /api/haccp/mince-prep form=meatprep. */
  insertMeatPrep(payload: MeatPrepPersist): Promise<{ id: string }>;
  /** Insert a time-separation row (no id selected back — no CA path).
   *  → POST /api/haccp/mince-prep form=timesep. */
  insertTimeSeparation(payload: TimeSeparationPersist): Promise<void>;

  // ── 7. product-return ────────────────────────────────────────
  /** Today's returns, newest first. → GET /api/haccp/product-return. */
  listReturns(): Promise<readonly ReturnRow[]>;
  /** Insert a return; returns the new id (for the always-on CA write).
   *  → POST /api/haccp/product-return. */
  insertReturn(payload: ReturnPersist): Promise<{ id: string }>;
}
