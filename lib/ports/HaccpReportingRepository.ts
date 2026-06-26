/**
 * lib/ports/HaccpReportingRepository.ts
 *
 * F-19 PR7 Cluster E — the deep, READ-ONLY reporting port the app owns over the
 * cross-table HACCP reporting reads (the 6 admin reporting routes). Pure
 * TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * ONE deep port, not six thin per-route ports: the reporting reads are
 * cross-table aggregators that don't map onto any single write-domain, so they
 * get their own read-only reporting socket (Ousterhout: one fat socket for "give
 * me the reporting rows", not six shallow ones).
 *
 * Boundary discipline (ADR-0002): the adapter runs the multi-table reads + the
 * per-table CA-merge fetches and returns the raw-ish typed row collections (each
 * row mirroring the route's `.select(...)` columns VERBATIM — the byte-identity
 * anchor). The adapter does NO shaping — ALL tallying / inference / date-grids /
 * SALSA section assembly / sheet assembly lives in the SERVICE.
 *
 * NOTE: `complaints` (a NON-HACCP table) is read inside `fetchAnnualReviewData` —
 * that read is a cross-domain aggregator and correctly belongs to this port.
 */

import type {
  TodayStatusData,
  OverviewData,
  AnnualReviewRawData,
  AuditHeatmapRawData,
  AuditSectionRawData,
  AuditExportRawData,
  AlarmOverdueInputs,
} from "@/lib/domain";

export interface HaccpReportingRepository {
  /**
   * today-status route: 12 today/period-scoped reads. The adapter runs the
   * Promise.all of 12 selects and returns each table's rows as-is. The service
   * does ALL tile inference + overdue-clock logic.
   */
  fetchTodayStatus(
    today: string,
    weekStart: string,
    monthStart: string,
  ): Promise<TodayStatusData>;

  /**
   * overview route: 10 range-scoped reads (deliveries, cold, processing, diary,
   * cleaning, mince, meatprep, returns, calibration, corrective_actions).
   */
  fetchOverview(from: string, to: string): Promise<OverviewData>;

  /**
   * annual-review/data route: 15 reads incl. non-HACCP `complaints`. Some are
   * current-state (training, suppliers, specs, units, food-fraud, food-defence),
   * some are period-filtered (health, cleaning, deliveries, returns, complaints).
   * The period-filtered reads only fire when `from&to` are present — the adapter
   * mirrors that (nullable from/to; the period-filtered collections come back
   * `null` when dates are absent).
   */
  fetchAnnualReviewData(
    from: string | null,
    to: string | null,
  ): Promise<AnnualReviewRawData>;

  /**
   * audit/heatmap route: 7 range-scoped lightweight reads. Service builds the
   * per-section DayMap grids.
   */
  fetchAuditHeatmap(from: string, to: string): Promise<AuditHeatmapRawData>;

  /**
   * audit route: ONE section per call (11 sections). The adapter runs the
   * section's read(s) + its CA-merge fetch and returns the raw rows + CA map(s).
   * Service does the row-merge, summary counts, and per-section heatmap.
   */
  fetchAuditSection(
    section: string,
    from: string,
    to: string,
  ): Promise<AuditSectionRawData>;

  /**
   * audit/export route: 14 reads feeding 14 sheets. Adapter returns all raw row
   * collections + their CA maps; service assembles the 14 SheetSpec arrays.
   */
  fetchAuditExportData(from: string, to: string): Promise<AuditExportRawData>;

  /**
   * F-25 — the 4 raw reads the HACCP overdue-alarm cron does today (cold
   * sessions, room sessions, diary phases for `today`, + the unresolved-CA
   * count). The adapter runs the Promise.all and returns the raw arrays/count;
   * ALL nowHour-threshold logic stays in the SERVICE (pure). @throws ServiceError.
   */
  fetchAlarmOverdueInputs(today: string): Promise<AlarmOverdueInputs>;
}
