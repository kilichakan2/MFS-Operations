/**
 * lib/adapters/fake/HaccpDailyChecksRepository.ts
 *
 * In-memory implementation of `HaccpDailyChecksRepository`
 * (lib/ports/HaccpDailyChecksRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter
 * so the service / use-case unit tests can rely on parity.
 *
 * It records every inserted persist payload AS-IS (so tests can assert the
 * exact row) and hands back a deterministic incrementing id so the use-case can
 * link CA rows. Lookups (supplier, active units, counts) are seedable.
 *
 * Construction:
 *   - `createFakeHaccpDailyChecksRepository(seed?)` factory — tests inject the
 *     supplier/unit directories + counts the route logic reads.
 *   - `fakeHaccpDailyChecksRepository` singleton — empty; barrel symmetry.
 *
 * 23505 conflict simulation: seed `conflictOn` with the method names that
 * should throw ConflictError (drives the clean-409 path the route returns).
 */

import type {
  DeliveryListResult,
  DeliveryRange,
  DeliverySupplier,
  DeliveryPersist,
  ColdStorageListResult,
  ColdStorageUnit,
  ColdStoragePersist,
  ColdStorageInsertedRow,
  CalibrationRecord,
  CalibrationCertifiedPersist,
  CalibrationManualPersist,
  CleaningEntry,
  CleaningPersist,
  ProcessRoomListResult,
  ProcessingTempPersist,
  DailyDiaryPersist,
  MincePrepListResult,
  MincePersist,
  MeatPrepPersist,
  TimeSeparationPersist,
  ReturnRow,
  ReturnPersist,
} from "@/lib/domain";
import type { HaccpDailyChecksRepository } from "@/lib/ports";
import { ConflictError } from "@/lib/errors";

/** The insert methods that can raise a 23505 → ConflictError. */
export type HaccpConflictMethod =
  | "insertDelivery"
  | "insertColdStorageReadings"
  | "insertProcessingTemp"
  | "insertDailyDiary"
  | "insertMince"
  | "insertMeatPrep";

/** Optional directories + counts the route logic reads. */
export interface FakeHaccpDailyChecksSeed {
  /** supplier id → resolved supplier (the POST delivery supplier check). */
  readonly suppliers?: Readonly<Record<string, DeliverySupplier>>;
  /** active cold-storage units (the POST threshold lookup). */
  readonly coldStorageUnits?: readonly ColdStorageUnit[];
  /** table+date → existing run count (delivery_number / batch sequencing). */
  readonly counts?: Readonly<Record<string, number>>;
  /** methods that should throw ConflictError (23505 simulation). */
  readonly conflictOn?: readonly HaccpConflictMethod[];
  /** canned list reads (PR2 read paths; PR1 tests rarely need these). */
  readonly deliveryList?: DeliveryListResult;
  readonly coldStorageList?: ColdStorageListResult;
  readonly calibrationList?: readonly CalibrationRecord[];
  readonly cleaningList?: readonly CleaningEntry[];
  readonly processRoomList?: ProcessRoomListResult;
  readonly mincePrepList?: MincePrepListResult;
  readonly returnsList?: readonly ReturnRow[];
}

/** A test-inspectable Fake daily-checks repository. */
export interface FakeHaccpDailyChecksRepository
  extends HaccpDailyChecksRepository {
  readonly deliveryInserts: readonly DeliveryPersist[];
  readonly coldStorageInserts: readonly (readonly ColdStoragePersist[])[];
  readonly calibrationCertifiedInserts: readonly CalibrationCertifiedPersist[];
  readonly calibrationManualInserts: readonly CalibrationManualPersist[];
  readonly cleaningInserts: readonly CleaningPersist[];
  readonly processingTempInserts: readonly ProcessingTempPersist[];
  readonly diaryInserts: readonly DailyDiaryPersist[];
  readonly minceInserts: readonly MincePersist[];
  readonly meatPrepInserts: readonly MeatPrepPersist[];
  readonly timeSeparationInserts: readonly TimeSeparationPersist[];
  readonly returnInserts: readonly ReturnPersist[];
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

const EMPTY_DELIVERY_LIST: DeliveryListResult = {
  date: "",
  deliveries: [],
  suppliers: [],
  next_number: 1,
};
const EMPTY_COLD_STORAGE_LIST: ColdStorageListResult = {
  units: [],
  readings: [],
  date: "",
};
const EMPTY_PROCESS_ROOM_LIST: ProcessRoomListResult = {
  date: "",
  temps: [],
  diary: [],
};
const EMPTY_MINCE_PREP_LIST: MincePrepListResult = {
  date: "",
  mince: [],
  meatprep: [],
  timesep: [],
  deliveries: [],
  mince_batches: [],
};

export function createFakeHaccpDailyChecksRepository(
  seed?: FakeHaccpDailyChecksSeed,
): FakeHaccpDailyChecksRepository {
  const deliveryInserts: DeliveryPersist[] = [];
  const coldStorageInserts: (readonly ColdStoragePersist[])[] = [];
  const calibrationCertifiedInserts: CalibrationCertifiedPersist[] = [];
  const calibrationManualInserts: CalibrationManualPersist[] = [];
  const cleaningInserts: CleaningPersist[] = [];
  const processingTempInserts: ProcessingTempPersist[] = [];
  const diaryInserts: DailyDiaryPersist[] = [];
  const minceInserts: MincePersist[] = [];
  const meatPrepInserts: MeatPrepPersist[] = [];
  const timeSeparationInserts: TimeSeparationPersist[] = [];
  const returnInserts: ReturnPersist[] = [];

  const conflictOn = new Set(seed?.conflictOn ?? []);
  function guardConflict(method: HaccpConflictMethod): void {
    if (conflictOn.has(method)) {
      throw new ConflictError(`duplicate (${method})`);
    }
  }

  return {
    get deliveryInserts() {
      return deliveryInserts;
    },
    get coldStorageInserts() {
      return coldStorageInserts;
    },
    get calibrationCertifiedInserts() {
      return calibrationCertifiedInserts;
    },
    get calibrationManualInserts() {
      return calibrationManualInserts;
    },
    get cleaningInserts() {
      return cleaningInserts;
    },
    get processingTempInserts() {
      return processingTempInserts;
    },
    get diaryInserts() {
      return diaryInserts;
    },
    get minceInserts() {
      return minceInserts;
    },
    get meatPrepInserts() {
      return meatPrepInserts;
    },
    get timeSeparationInserts() {
      return timeSeparationInserts;
    },
    get returnInserts() {
      return returnInserts;
    },

    // ── 1. delivery ──────────────────────────────────────────
    async listDeliveries(_range: DeliveryRange): Promise<DeliveryListResult> {
      void _range;
      return seed?.deliveryList ?? EMPTY_DELIVERY_LIST;
    },
    async findSupplierForDelivery(
      supplierId: string,
    ): Promise<DeliverySupplier | null> {
      return seed?.suppliers?.[supplierId] ?? null;
    },
    async countDeliveriesOn(date: string): Promise<number> {
      return seed?.counts?.[`haccp_deliveries:${date}`] ?? 0;
    },
    async insertDelivery(payload: DeliveryPersist): Promise<{ id: string }> {
      guardConflict("insertDelivery");
      deliveryInserts.push(payload);
      return { id: nextId() };
    },

    // ── 2. cold-storage ──────────────────────────────────────
    async listColdStorage(date: string): Promise<ColdStorageListResult> {
      return seed?.coldStorageList ?? { ...EMPTY_COLD_STORAGE_LIST, date };
    },
    async listActiveColdStorageUnits(): Promise<readonly ColdStorageUnit[]> {
      return seed?.coldStorageUnits ?? [];
    },
    async insertColdStorageReadings(
      rows: readonly ColdStoragePersist[],
    ): Promise<readonly ColdStorageInsertedRow[]> {
      guardConflict("insertColdStorageReadings");
      coldStorageInserts.push(rows);
      return rows.map((r) => ({
        id: nextId(),
        unit_id: r.unit_id,
        temperature_c: r.temperature_c,
        temp_status: r.temp_status,
      }));
    },

    // ── 3. calibration ───────────────────────────────────────
    async listCalibration(): Promise<readonly CalibrationRecord[]> {
      return seed?.calibrationList ?? [];
    },
    async insertCalibrationCertified(
      payload: CalibrationCertifiedPersist,
    ): Promise<void> {
      calibrationCertifiedInserts.push(payload);
    },
    async insertCalibrationManual(
      payload: CalibrationManualPersist,
    ): Promise<{ id: string }> {
      calibrationManualInserts.push(payload);
      return { id: nextId() };
    },

    // ── 4. cleaning ──────────────────────────────────────────
    async listCleaning(): Promise<readonly CleaningEntry[]> {
      return seed?.cleaningList ?? [];
    },
    async insertCleaning(payload: CleaningPersist): Promise<{ id: string }> {
      cleaningInserts.push(payload);
      return { id: nextId() };
    },

    // ── 5. process-room ──────────────────────────────────────
    async listProcessRoom(date: string): Promise<ProcessRoomListResult> {
      return seed?.processRoomList ?? { ...EMPTY_PROCESS_ROOM_LIST, date };
    },
    async insertProcessingTemp(
      payload: ProcessingTempPersist,
    ): Promise<{ id: string }> {
      guardConflict("insertProcessingTemp");
      processingTempInserts.push(payload);
      return { id: nextId() };
    },
    async insertDailyDiary(
      payload: DailyDiaryPersist,
    ): Promise<{ id: string }> {
      guardConflict("insertDailyDiary");
      diaryInserts.push(payload);
      return { id: nextId() };
    },

    // ── 6. mince-prep ────────────────────────────────────────
    async listMincePrep(_range: DeliveryRange): Promise<MincePrepListResult> {
      void _range;
      return seed?.mincePrepList ?? EMPTY_MINCE_PREP_LIST;
    },
    async countMinceRuns(
      table: "haccp_mince_log" | "haccp_meatprep_log",
      date: string,
    ): Promise<number> {
      return seed?.counts?.[`${table}:${date}`] ?? 0;
    },
    async insertMince(payload: MincePersist): Promise<{ id: string }> {
      guardConflict("insertMince");
      minceInserts.push(payload);
      return { id: nextId() };
    },
    async insertMeatPrep(payload: MeatPrepPersist): Promise<{ id: string }> {
      guardConflict("insertMeatPrep");
      meatPrepInserts.push(payload);
      return { id: nextId() };
    },
    async insertTimeSeparation(
      payload: TimeSeparationPersist,
    ): Promise<void> {
      timeSeparationInserts.push(payload);
    },

    // ── 7. product-return ────────────────────────────────────
    async listReturns(): Promise<readonly ReturnRow[]> {
      return seed?.returnsList ?? [];
    },
    async insertReturn(payload: ReturnPersist): Promise<{ id: string }> {
      returnInserts.push(payload);
      return { id: nextId() };
    },
  };
}

export const fakeHaccpDailyChecksRepository: HaccpDailyChecksRepository =
  createFakeHaccpDailyChecksRepository();
