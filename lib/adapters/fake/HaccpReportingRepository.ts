/**
 * lib/adapters/fake/HaccpReportingRepository.ts
 *
 * In-memory implementation of `HaccpReportingRepository`
 * (lib/ports/HaccpReportingRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter
 * so the service unit tests can assert the shaping reproduces each route's exact
 * response shape.
 *
 * It returns the seeded raw row-collections AS-IS — the adapter does NO shaping
 * (parity with the real adapter), so the service is what's under test. Each
 * method's seed is optional; missing seeds yield the empty/null shapes a
 * not-run period-filtered read would produce.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createFakeHaccpReportingRepository(seed?)` factory — tests inject the read
 *     fixtures per method.
 *   - `fakeHaccpReportingRepository` singleton — empty; barrel symmetry.
 */

import type {
  HaccpReportingRepository,
} from "@/lib/ports";
import type {
  TodayStatusData,
  OverviewData,
  AnnualReviewRawData,
  AuditHeatmapRawData,
  AuditSectionRawData,
  AuditExportRawData,
} from "@/lib/domain";

/** Per-method read fixtures. The fake hands each back verbatim. */
export interface FakeHaccpReportingSeed {
  readonly todayStatus?: TodayStatusData;
  readonly overview?: OverviewData;
  /**
   * The annual-review reads. Period-filtered collections (health, cleaning,
   * deliveryTemps, goodsIn, returns, complaints) come back as the seeded value
   * when from&to are present, else `null` (mirroring the real adapter, which
   * does not run those reads without dates).
   */
  readonly annualReview?: AnnualReviewRawData;
  readonly auditHeatmap?: AuditHeatmapRawData;
  /** Keyed by section name → that section's raw read. */
  readonly auditSections?: Record<string, AuditSectionRawData>;
  readonly auditExport?: AuditExportRawData;
}

const EMPTY_TODAY: TodayStatusData = {
  cold: [],
  room: [],
  diary: [],
  cleaning: [],
  deliveries: [],
  mince: [],
  returns: [],
  ccas: [],
  weekly: [],
  monthly: [],
  cal: [],
  training: [],
};

const EMPTY_OVERVIEW: OverviewData = {
  deliveries: [],
  coldStorage: [],
  processingTemps: [],
  dailyDiary: [],
  cleaning: [],
  mince: [],
  meatprep: [],
  returns: [],
  calibration: [],
  correctiveActions: [],
};

const EMPTY_ANNUAL: AnnualReviewRawData = {
  staffRaw: [],
  allergenRaw: [],
  healthRaw: null,
  cleaningRaw: null,
  calibRaw: [],
  unitsRaw: [],
  tempsRaw: [],
  deliveryTempsRaw: null,
  suppliersRaw: [],
  specsRaw: [],
  goodsInRaw: null,
  caAllRaw: [],
  returnsRaw: null,
  complaintsRaw: null,
  ffRaw: null,
  fdRaw: null,
};

const EMPTY_HEATMAP: AuditHeatmapRawData = {
  deliveries: [],
  coldStorageTemps: [],
  processingTemps: [],
  dailyDiary: [],
  cleaningLog: [],
  minceLog: [],
  calibrationLog: [],
};

const EMPTY_EXPORT: AuditExportRawData = {
  deliveries: [],
  deliveriesCa: {},
  coldStorage: [],
  coldStorageCa: {},
  processTemps: [],
  processTempsCa: {},
  diary: [],
  cleaning: [],
  cleaningCa: {},
  calibration: [],
  calibrationCa: {},
  mince: [],
  minceCa: {},
  returns: [],
  cas: [],
  weekly: [],
  monthly: [],
  health: [],
  staffTraining: [],
  allergenTraining: [],
};

export function createFakeHaccpReportingRepository(
  seed?: FakeHaccpReportingSeed,
): HaccpReportingRepository {
  return {
    async fetchTodayStatus(): Promise<TodayStatusData> {
      return seed?.todayStatus ?? EMPTY_TODAY;
    },

    async fetchOverview(): Promise<OverviewData> {
      return seed?.overview ?? EMPTY_OVERVIEW;
    },

    async fetchAnnualReviewData(
      from: string | null,
      to: string | null,
    ): Promise<AnnualReviewRawData> {
      const base = seed?.annualReview ?? EMPTY_ANNUAL;
      // Mirror the real adapter: period-filtered collections are not read
      // (come back null) when from&to are absent.
      if (from && to) return base;
      return {
        ...base,
        healthRaw: null,
        cleaningRaw: null,
        deliveryTempsRaw: null,
        goodsInRaw: null,
        returnsRaw: null,
        complaintsRaw: null,
      };
    },

    async fetchAuditHeatmap(): Promise<AuditHeatmapRawData> {
      return seed?.auditHeatmap ?? EMPTY_HEATMAP;
    },

    async fetchAuditSection(section: string): Promise<AuditSectionRawData> {
      return (
        seed?.auditSections?.[section] ?? {
          section,
          rows: [],
        }
      );
    },

    async fetchAuditExportData(): Promise<AuditExportRawData> {
      return seed?.auditExport ?? EMPTY_EXPORT;
    },
  };
}

export const fakeHaccpReportingRepository: HaccpReportingRepository =
  createFakeHaccpReportingRepository();
