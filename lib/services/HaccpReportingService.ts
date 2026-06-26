/**
 * lib/services/HaccpReportingService.ts
 *
 * F-19 PR7 Cluster E — the reporting service: ALL the shaping the 6 read-only
 * HACCP reporting routes do today (today-status tile inference + overdue clock,
 * overview tallies + missing-days, annual-review SALSA blocks 3.2–3.9, audit
 * heatmap date-grids, per-section audit shaping, and the 14-tab Excel workbook
 * assembly). Depends on TWO ports — `HaccpReportingRepository` (the reads) +
 * `SpreadsheetExporter` (rows → xlsx). Never on a vendor, never on the adapters
 * folder (lint-pinned, ADR-0002 / F-TD-11). Factory only — wiring holds the
 * singleton.
 *
 * Every tally / fallback (`?? '—'`) / `slice()` truncation / label map / dedup
 * key / sort order is LIFTED VERBATIM from its route so the PR8 re-point is
 * byte-identical (the parity unit tests are the safety net).
 *
 * DETERMINISM: `getTodayStatus(now: Date)` takes the clock as an argument — the
 * route calls `new Date()` inline 5+ times; here every `today`/`weekStart`/
 * `monthStart`/`nowHour`/`getDay()`/last-day-of-month derives from the single
 * injected `now`, so the overdue-cutoff logic is testable deterministically.
 * PR8's route passes `new Date()`. (Risk B2.)
 */

import type {
  HaccpReportingRepository,
  SpreadsheetExporter,
  SheetSpec,
} from "@/lib/ports";
import type {
  TodayStatusResponse,
  OverviewResponse,
  AnnualReviewResponse,
  AuditHeatmapResponse,
  AuditSectionResponse,
  DayMap,
  ReportingCaMap,
} from "@/lib/domain";

export interface HaccpReportingServiceDeps {
  readonly reporting: HaccpReportingRepository;
  readonly spreadsheet: SpreadsheetExporter;
}

export interface HaccpReportingService {
  getTodayStatus(now: Date): Promise<TodayStatusResponse>;
  getOverview(from: string, to: string): Promise<OverviewResponse>;
  getAnnualReviewData(
    from: string | null,
    to: string | null,
  ): Promise<AnnualReviewResponse>;
  getAuditHeatmap(from: string, to: string): Promise<AuditHeatmapResponse>;
  getAuditSection(
    section: string,
    from: string,
    to: string,
  ): Promise<AuditSectionResponse>;
  /**
   * Reads via repo, assembles the 14 SheetSpec arrays, calls
   * spreadsheet.toXlsxBuffer, returns the buffer. Does NOT set HTTP headers or
   * the filename — that stays in the route (PR8).
   */
  buildAuditWorkbook(from: string, to: string): Promise<Buffer>;
  /**
   * F-25 — today's overdue status for the HACCP alarm cron. `now` is INJECTED
   * (no `new Date()`): derives `today = todayUKFrom(now)` + `nowHour =
   * now.getHours()`, reads via `reporting.fetchAlarmOverdueInputs(today)`, and
   * applies the EXACT thresholds the cron route used (cold/room AM≥10 PM≥14;
   * diary opening≥10 closing≥17). Returns the SAME shape `getOverdueItems`
   * consumes. @throws ServiceError (propagated from the read).
   */
  getAlarmOverdueStatus(now: Date): Promise<{
    cold_storage: { am_overdue: boolean; pm_overdue: boolean };
    processing_room: { am_overdue: boolean; pm_overdue: boolean };
    daily_diary: { opening_overdue: boolean; closing_overdue: boolean };
    unresolved_cas: number;
  }>;
}

// ─── clock helpers (derive everything from the injected `now`) ───────────────

function todayUKFrom(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function weekStartFrom(now: Date): string {
  const d = new Date(now.getTime());
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function monthStartFrom(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

// ─── small row helpers (the `?? '—'` user-name fallback the routes apply) ────

function userName(row: Record<string, unknown>): string {
  return (row.users as { name: string } | null)?.name ?? "—";
}

/**
 * Merge a raw row with derived fields, PRESERVING the index signature so the
 * shaping below can read original columns (`temp_status`, `date`, …). Spreading
 * a `Record<string, unknown>` into an object literal drops the index signature
 * in TS's inferred type, so we re-assert it here.
 */
type MergedRow = Record<string, unknown> & {
  submitted_by_name?: string;
  ca?: import("@/lib/domain").ReportingCaRow | null;
  [key: string]: unknown;
};
function merge(
  row: Record<string, unknown>,
  extra: Record<string, unknown>,
): MergedRow {
  return { ...row, ...extra } as MergedRow;
}

export function createHaccpReportingService(
  deps: HaccpReportingServiceDeps,
): HaccpReportingService {
  const { reporting, spreadsheet } = deps;

  return {
    // ═══════════════════════════════════════════════════════════════════════
    // 1) today-status  (today-status/route.ts:32-144)
    // ═══════════════════════════════════════════════════════════════════════
    async getTodayStatus(now: Date): Promise<TodayStatusResponse> {
      const today = todayUKFrom(now);
      const weekStart = weekStartFrom(now);
      const monthStart = monthStartFrom(now);

      const nowHour = now.getHours();
      const openingOverdueCutoff = 10;
      const operationalOverdueCutoff = 13;
      const closingOverdueCutoff = 17;
      const amOverdueCutoff = 10;
      const pmOverdueCutoff = 14;

      const data = await reporting.fetchTodayStatus(
        today,
        weekStart,
        monthStart,
      );

      const coldSessions = (data.cold ?? []).map((r) => r.session);
      const roomSessions = (data.room ?? []).map((r) => r.session);
      const phases = (data.diary ?? []).map((r) => r.phase);

      const amColdDone = coldSessions.includes("AM");
      const pmColdDone = coldSessions.includes("PM");
      const amRoomDone = roomSessions.includes("AM");
      const pmRoomDone = roomSessions.includes("PM");

      const total = 6;
      let done = 0;
      if (amColdDone) done++;
      if (pmColdDone) done++;
      if (amRoomDone) done++;
      if (pmRoomDone) done++;
      if (phases.includes("opening")) done++;
      if (phases.includes("closing")) done++;

      const cleaning = data.cleaning ?? [];
      const deliveries = data.deliveries ?? [];
      const mince = data.mince ?? [];
      const returns = data.returns ?? [];
      const ccas = data.ccas ?? [];
      const weekly = data.weekly ?? [];
      const monthly = data.monthly ?? [];
      const cal = data.cal ?? [];
      const training = data.training ?? [];

      return {
        cold_storage: {
          am_done: amColdDone,
          pm_done: pmColdDone,
          am_overdue: !amColdDone && nowHour >= amOverdueCutoff,
          pm_overdue: !pmColdDone && nowHour >= pmOverdueCutoff,
        },
        processing_room: {
          am_done: amRoomDone,
          pm_done: pmRoomDone,
          am_overdue: !amRoomDone && nowHour >= amOverdueCutoff,
          pm_overdue: !pmRoomDone && nowHour >= pmOverdueCutoff,
        },
        daily_diary: {
          opening: phases.includes("opening"),
          operational: phases.includes("operational"),
          closing: phases.includes("closing"),
          opening_overdue:
            !phases.includes("opening") && nowHour >= openingOverdueCutoff,
          operational_overdue:
            !phases.includes("operational") &&
            nowHour >= operationalOverdueCutoff,
          closing_overdue:
            !phases.includes("closing") && nowHour >= closingOverdueCutoff,
        },
        cleaning: {
          count_today: cleaning.length,
          has_issues_today: cleaning.some((r) => r.issues),
          overdue: cleaning.length === 0 && nowHour >= 15,
          last_logged_at: cleaning[0]?.submitted_at ?? null,
        },
        deliveries: {
          count_today: deliveries.length,
          deviations: deliveries.filter((d) => d.temp_status !== "pass").length,
        },
        mince_runs: {
          count_today: mince.length,
          has_deviations: mince.some(
            (row) =>
              row.input_temp_pass === false ||
              row.output_temp_pass === false ||
              !!row.corrective_action,
          ),
        },
        product_returns: {
          count_today: returns.length,
          has_safety_returns: returns.some((r) =>
            ["RC01", "RC02", "RC04", "RC05"].includes(r.return_code ?? ""),
          ),
        },
        corrective_actions: { open: ccas.length },
        calibration_due: cal.length === 0,
        calibration_done: cal.length > 0,
        calibration_pass:
          cal.length > 0 &&
          cal.every(
            (row) =>
              row.ice_water_pass !== false && row.boiling_water_pass !== false,
          ),
        weekly_review_due: weekly.length === 0,
        weekly_review_overdue:
          weekly.length === 0 && now.getDay() === 5 && nowHour >= 17,
        monthly_review_due: monthly.length === 0,
        monthly_review_overdue:
          monthly.length === 0 &&
          (() => {
            const last = new Date(
              now.getFullYear(),
              now.getMonth() + 1,
              0,
            ).getDate();
            return now.getDate() === last;
          })(),
        training_overdue: training.filter(
          (row) => row.refresh_date && new Date(row.refresh_date) < new Date(today),
        ).length,
        training_due_soon: training.filter((row) => {
          if (!row.refresh_date) return false;
          const diff =
            (new Date(row.refresh_date).getTime() - new Date(today).getTime()) /
            86400000;
          return diff >= 0 && diff <= 30;
        }).length,
        total_checks: total,
        completed_checks: done,
      };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 2) overview  (overview/route.ts:59-225)
    // ═══════════════════════════════════════════════════════════════════════
    async getOverview(from: string, to: string): Promise<OverviewResponse> {
      const expected = workingDays(from, to);
      const data = await reporting.fetchOverview(from, to);

      // Goods In
      const delivData = data.deliveries ?? [];
      const delivByDate = [...new Set(delivData.map((r) => r.date))];
      const goods_in = {
        total: delivData.length,
        entries_by_date: delivByDate.sort(),
        temp_fails: delivData.filter((r) => r.temp_status === "fail").length,
        temp_urgent: delivData.filter((r) => r.temp_status === "urgent").length,
        ca_raised: delivData.filter((r) => r.corrective_action_required).length,
      };

      // Cold Storage
      const csData = data.coldStorage ?? [];
      const csDates = [...new Set(csData.map((r) => r.date))];
      const cold_storage = {
        total: csData.length,
        entries_by_date: csDates.sort(),
        missing_days: expected.filter((d) => !csDates.includes(d)),
        fails: csData.filter((r) => r.temp_status === "fail").length,
        urgent: csData.filter((r) => r.temp_status === "urgent").length,
      };

      // Process Room
      const ptData = data.processingTemps ?? [];
      const ddData = data.dailyDiary ?? [];
      const prDates = [
        ...new Set([...ptData.map((r) => r.date), ...ddData.map((r) => r.date)]),
      ];
      const process_room = {
        total: ptData.length,
        entries_by_date: prDates.sort(),
        missing_days: expected.filter((d) => !prDates.includes(d)),
        product_fails: ptData.filter((r) => r.product_temp_pass === false).length,
        room_fails: ptData.filter((r) => r.room_temp_pass === false).length,
        diary_issues: ddData.filter((r) => r.issues).length,
      };

      // Cleaning
      const clData = data.cleaning ?? [];
      const clDates = [...new Set(clData.map((r) => r.date))];
      const cleaning_out = {
        total: clData.length,
        entries_by_date: clDates.sort(),
        missing_days: expected.filter((d) => !clDates.includes(d)),
        issues: clData.filter((r) => r.issues).length,
      };

      // Mince
      const mnData = data.mince ?? [];
      const mince_out = {
        total: mnData.length,
        entries_by_date: [...new Set(mnData.map((r) => r.date))].sort(),
        deviations: mnData.filter((r) => r.corrective_action != null).length,
        by_species: mnData.reduce(
          (acc, r) => {
            acc[r.product_species] = (acc[r.product_species] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };

      // Meat Prep
      const mpData = data.meatprep ?? [];
      const meatprep_out = {
        total: mpData.length,
        entries_by_date: [...new Set(mpData.map((r) => r.date))].sort(),
        deviations: mpData.filter((r) => r.corrective_action != null).length,
      };

      // Product Returns
      const rtData = data.returns ?? [];
      const returns_out = {
        total: rtData.length,
        entries_by_date: [...new Set(rtData.map((r) => r.date))].sort(),
        by_code: rtData.reduce(
          (acc, r) => {
            acc[r.return_code] = (acc[r.return_code] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        dispositions: rtData.reduce(
          (acc, r) => {
            acc[r.disposition] = (acc[r.disposition] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };

      // Calibration
      const calData = data.calibration ?? [];
      const calibration_out = {
        done: calData.length > 0,
        total: calData.length,
        any_fail: calData.some(
          (r) => r.ice_water_pass === false || r.boiling_water_pass === false,
        ),
      };

      // Corrective Actions
      const caData = data.correctiveActions ?? [];
      const corrective_actions = {
        total: caData.length,
        unresolved: caData.filter(
          (r) => r.management_verification_required && !r.verified_at,
        ).length,
        by_ccp: caData.reduce(
          (acc, r) => {
            acc[r.ccp_ref] = (acc[r.ccp_ref] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };

      return {
        from,
        to,
        expected_days: expected,
        goods_in,
        cold_storage,
        process_room,
        cleaning: cleaning_out,
        mince: mince_out,
        meatprep: meatprep_out,
        returns: returns_out,
        calibration: calibration_out,
        corrective_actions,
      };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 3) annual-review/data  (annual-review/data/route.ts:34-438)
    // ═══════════════════════════════════════════════════════════════════════
    async getAnnualReviewData(
      from: string | null,
      to: string | null,
    ): Promise<AnnualReviewResponse> {
      const data = await reporting.fetchAnnualReviewData(from, to);

      // ── 3.2 — Training (dedup) ─────────────────────────────────────────
      const staffSeen = new Set<string>();
      const staffTraining = (data.staffRaw ?? []).filter((r) => {
        const key = `${r.staff_name}::${r.training_type}`;
        if (staffSeen.has(key)) return false;
        staffSeen.add(key);
        return true;
      });

      const allergenSeen = new Set<string>();
      const allergenTraining = (data.allergenRaw ?? []).filter((r) => {
        if (allergenSeen.has(r.staff_name)) return false;
        allergenSeen.add(r.staff_name);
        return true;
      });

      // ── 3.3 — Health (period activity) ────────────────────────────────
      let healthData: {
        new_staff: unknown[];
        exclusions: unknown[];
        visitors: unknown[];
      } = { new_staff: [], exclusions: [], visitors: [] };

      if (from && to && data.healthRaw) {
        const records = data.healthRaw as Array<{
          record_type: string;
          [key: string]: unknown;
        }>;
        healthData = {
          new_staff: records.filter(
            (r) => r.record_type === "new_staff_declaration",
          ),
          exclusions: records.filter((r) => r.record_type === "return_to_work"),
          visitors: records.filter((r) => r.record_type === "visitor"),
        };
      }

      // ── 3.4 — Cleaning (period activity) ──────────────────────────────
      let cleaningData: {
        total: number;
        issues_count: number;
        issues_list: { date: string; what_did_you_do: string | null }[];
        sanitiser_checks: number;
        low_temp_list: { date: string; sanitiser_temp_c: number }[];
        last_log_date: string | null;
      } = {
        total: 0,
        issues_count: 0,
        issues_list: [],
        sanitiser_checks: 0,
        low_temp_list: [],
        last_log_date: null,
      };

      if (from && to && data.cleaningRaw) {
        const records = data.cleaningRaw;
        cleaningData = {
          total: records.length,
          issues_count: records.filter((r) => r.issues === true).length,
          issues_list: records
            .filter((r) => r.issues === true)
            .map((r) => ({ date: r.date, what_did_you_do: r.what_did_you_do })),
          sanitiser_checks: records.filter((r) => r.sanitiser_temp_c !== null)
            .length,
          low_temp_list: records
            .filter(
              (r) => r.sanitiser_temp_c !== null && Number(r.sanitiser_temp_c) < 82,
            )
            .map((r) => ({
              date: r.date,
              sanitiser_temp_c: Number(r.sanitiser_temp_c),
            })),
          last_log_date: records.length > 0 ? records[0].date : null,
        };
      }

      // ── 3.6 — Temperature Control ─────────────────────────────────────
      // Calibration — latest per thermometer (dedup)
      const calibSeen = new Set<string>();
      const calibration = (data.calibRaw ?? []).filter((r) => {
        if (calibSeen.has(r.thermometer_id)) return false;
        calibSeen.add(r.thermometer_id);
        return true;
      });

      // Cold storage — latest reading per unit
      const tempsByUnit = new Map<
        string,
        { temperature_c: number; temp_status: string; date: string; session: string }
      >();
      for (const t of data.tempsRaw ?? []) {
        if (!tempsByUnit.has(t.unit_id)) {
          tempsByUnit.set(t.unit_id, {
            temperature_c: Number(t.temperature_c),
            temp_status: t.temp_status,
            date: t.date,
            session: t.session,
          });
        }
      }
      const coldStorage = (data.unitsRaw ?? []).map((u) => ({
        name: u.name,
        unit_type: u.unit_type,
        target_temp_c: Number(u.target_temp_c),
        max_temp_c: Number(u.max_temp_c),
        latest: tempsByUnit.get(u.id) ?? null,
      }));

      // Delivery temps — period-filtered
      let deliveryTemps = {
        total: 0,
        pass: 0,
        urgent: 0,
        fail: 0,
        temp_cas: 0,
      };
      if (from && to && data.deliveryTempsRaw) {
        const delivs = data.deliveryTempsRaw;
        deliveryTemps = {
          total: delivs.length,
          pass: delivs.filter((d) => d.temp_status === "pass").length,
          urgent: delivs.filter((d) => d.temp_status === "urgent").length,
          fail: delivs.filter((d) => d.temp_status === "fail").length,
          temp_cas: delivs.filter((d) => d.temp_status !== "pass").length,
        };
      }

      // ── 3.7 — Supplier Control ────────────────────────────────────────
      const suppliers = data.suppliersRaw ?? [];
      const today = new Date().toISOString().slice(0, 10);
      const in60Days = new Date(Date.now() + 60 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const supplierStats = {
        total: suppliers.length,
        formally_approved: suppliers.filter((s) => s.date_approved).length,
        fsa_approved: suppliers.filter((s) => s.fsa_approval_no?.trim()).length,
        expired_certs: suppliers.filter(
          (s) => s.cert_expiry && s.cert_expiry < today,
        ).length,
        expiring_60_days: suppliers.filter(
          (s) =>
            s.cert_expiry && s.cert_expiry >= today && s.cert_expiry <= in60Days,
        ).length,
      };

      const specs = data.specsRaw ?? [];
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const specStats = {
        total: specs.length,
        review_due: specs.filter(
          (s) => !s.reviewed_at || new Date(s.reviewed_at) < oneYearAgo,
        ).length,
      };

      const MEAT_CATEGORIES = [
        "lamb",
        "beef",
        "red_meat",
        "offal",
        "frozen_beef_lamb",
      ];
      let goodsIn = {
        total: 0,
        has_batch: 0,
        meat_total: 0,
        meat_bls_complete: 0,
      };
      if (from && to && data.goodsInRaw) {
        const delivs = data.goodsInRaw;
        const meat = delivs.filter((d) =>
          MEAT_CATEGORIES.includes(d.product_category),
        );
        goodsIn = {
          total: delivs.length,
          has_batch: delivs.filter((d) => d.batch_number?.trim()).length,
          meat_total: meat.length,
          meat_bls_complete: meat.filter(
            (d) => d.born_in && d.slaughter_site && d.cut_site,
          ).length,
        };
      }

      // ── 3.8 — Incidents & Complaints ──────────────────────────────────
      const caAll = data.caAllRaw ?? [];
      const caOpen = caAll.filter((c) => !c.resolved);

      const CA_SOURCE_LABELS: Record<string, string> = {
        haccp_cold_storage_temps: "Cold storage",
        haccp_deliveries: "Deliveries",
        haccp_cleaning_log: "Cleaning",
        haccp_calibration_log: "Calibration",
        haccp_mince_log: "Mince",
        haccp_processing_temps: "Process room",
        haccp_returns: "Returns",
        haccp_weekly_review: "Weekly review",
        haccp_monthly_review: "Monthly review",
        haccp_daily_diary: "Daily diary",
      };

      const openBySource: Record<string, number> = {};
      for (const ca of caOpen) {
        const label = CA_SOURCE_LABELS[ca.source_table] ?? ca.source_table;
        openBySource[label] = (openBySource[label] ?? 0) + 1;
      }

      let caInPeriod = 0;
      if (from && to) {
        caInPeriod = caAll.filter((c) => {
          const d = c.submitted_at?.slice(0, 10) ?? "";
          return d >= from && d <= to;
        }).length;
      }

      const caStats = {
        total_open: caOpen.length,
        total_resolved: caAll.filter((c) => c.resolved).length,
        in_period: caInPeriod,
        open_by_source: Object.entries(openBySource).map(([source, count]) => ({
          source,
          count,
        })),
      };

      let returnsStats: {
        total: number;
        by_code: { code: string; label: string; count: number }[];
      } = { total: 0, by_code: [] };

      if (from && to && data.returnsRaw) {
        const RETURN_LABELS: Record<string, string> = {
          RC01: "Temperature",
          RC02: "Quality",
          RC03: "Wrong product",
          RC04: "Short shelf life",
          RC05: "Packaging",
          RC06: "Quantity",
          RC07: "Cancelled",
          RC08: "Other",
        };
        const codeMap: Record<string, number> = {};
        for (const r of data.returnsRaw) {
          codeMap[r.return_code] = (codeMap[r.return_code] ?? 0) + 1;
        }
        returnsStats = {
          total: data.returnsRaw.length,
          by_code: Object.entries(codeMap)
            .map(([code, count]) => ({
              code,
              label: RETURN_LABELS[code] ?? code,
              count,
            }))
            .sort((a, b) => b.count - a.count),
        };
      }

      let complaintsStats = { total: 0, open: 0, resolved: 0 };
      if (from && to && data.complaintsRaw) {
        const comps = data.complaintsRaw;
        complaintsStats = {
          total: comps.length,
          open: comps.filter((c) => c.status === "open").length,
          resolved: comps.filter((c) => c.status === "resolved").length,
        };
      }

      // ── 3.9 — Food Fraud & Food Defence ───────────────────────────────
      const ffRaw = data.ffRaw;
      const fdRaw = data.fdRaw;
      const todayStr = new Date().toISOString().slice(0, 10);

      const foodFraudStatus = {
        exists: !!ffRaw,
        version: ffRaw?.version ?? null,
        issue_date: ffRaw?.issue_date ?? null,
        next_review: ffRaw?.next_review_date ?? null,
        review_due: !ffRaw || ffRaw.next_review_date < todayStr,
      };
      const foodDefenceStatus = {
        exists: !!fdRaw,
        version: fdRaw?.version ?? null,
        issue_date: fdRaw?.issue_date ?? null,
        next_review: fdRaw?.next_review_date ?? null,
        review_due: !fdRaw || fdRaw.next_review_date < todayStr,
      };

      return {
        "3.2": {
          staff_training: staffTraining,
          allergen_training: allergenTraining,
        },
        "3.3": healthData,
        "3.4": cleaningData,
        "3.6": {
          calibration,
          cold_storage: coldStorage,
          delivery_temps: deliveryTemps,
        },
        "3.7": {
          supplier_stats: supplierStats,
          spec_stats: specStats,
          goods_in: goodsIn,
        },
        "3.8": {
          ca_stats: caStats,
          returns_stats: returnsStats,
          complaints_stats: complaintsStats,
        },
        "3.9": { food_fraud: foodFraudStatus, food_defence: foodDefenceStatus },
      };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 4) audit/heatmap  (audit/heatmap/route.ts:100-167)
    // ═══════════════════════════════════════════════════════════════════════
    async getAuditHeatmap(
      from: string,
      to: string,
    ): Promise<AuditHeatmapResponse> {
      const data = await reporting.fetchAuditHeatmap(from, to);

      const delivMap: DayMap = {};
      for (const r of data.deliveries ?? []) {
        mark(delivMap, r.date, r.temp_status !== "pass" || r.corrective_action_required);
      }

      const coldAmMap: DayMap = {};
      const coldPmMap: DayMap = {};
      for (const r of data.coldStorageTemps ?? []) {
        const isDeviation =
          r.temp_status !== "pass" || r.corrective_action_required;
        if (r.session === "AM") mark(coldAmMap, r.date, isDeviation);
        else mark(coldPmMap, r.date, isDeviation);
      }

      const roomAmMap: DayMap = {};
      const roomPmMap: DayMap = {};
      for (const r of data.processingTemps ?? []) {
        const isDeviation = !r.within_limits || r.corrective_action_required;
        if (r.session === "AM") mark(roomAmMap, r.date, isDeviation);
        else mark(roomPmMap, r.date, isDeviation);
      }

      const diaryOpenMap: DayMap = {};
      const diaryOperationalMap: DayMap = {};
      const diaryCloseMap: DayMap = {};
      for (const r of data.dailyDiary ?? []) {
        if (r.phase === "opening") mark(diaryOpenMap, r.date, !!r.issues);
        if (r.phase === "operational")
          mark(diaryOperationalMap, r.date, !!r.issues);
        if (r.phase === "closing") mark(diaryCloseMap, r.date, !!r.issues);
      }

      const cleanMap: DayMap = {};
      for (const r of data.cleaningLog ?? []) {
        mark(cleanMap, r.date, !!r.issues);
      }

      const minceMap: DayMap = {};
      for (const r of data.minceLog ?? []) {
        const isDeviation =
          !r.input_temp_pass || !r.output_temp_pass || !!r.corrective_action;
        mark(minceMap, r.date, isDeviation);
      }

      const calibrationMap: DayMap = {};
      for (const r of data.calibrationLog ?? []) {
        const isDev =
          r.calibration_mode === "manual" &&
          (r.ice_water_pass === false || r.boiling_water_pass === false);
        mark(calibrationMap, r.date, isDev);
      }

      return {
        deliveries: delivMap,
        cold_am: coldAmMap,
        cold_pm: coldPmMap,
        room_am: roomAmMap,
        room_pm: roomPmMap,
        diary_open: diaryOpenMap,
        diary_operational: diaryOperationalMap,
        diary_close: diaryCloseMap,
        cleaning: cleanMap,
        mince: minceMap,
        calibration: calibrationMap,
      };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 5) audit (per section)  (audit/route.ts:42-737)
    // ═══════════════════════════════════════════════════════════════════════
    async getAuditSection(
      section: string,
      from: string,
      to: string,
    ): Promise<AuditSectionResponse> {
      const data = await reporting.fetchAuditSection(section, from, to);
      const caMap = data.caMap ?? {};
      const rawRows = data.rows ?? [];

      if (section === "deliveries") {
        const rows = rawRows.map((d) =>
          merge(d, {
            submitted_by_name: userName(d),
            ca: caMap[d.id as string] ?? null,
          }),
        );
        const summary = {
          total: rows.length,
          pass: rows.filter((r) => r.temp_status === "pass").length,
          urgent: rows.filter((r) => r.temp_status === "urgent").length,
          fail: rows.filter((r) => r.temp_status === "fail").length,
          ca_count: rows.filter((r) => r.ca !== null).length,
          unresolved: rows.filter((r) => r.ca !== null && !r.ca!.resolved).length,
        };
        const deliveryHeatmap: DayMap = {};
        for (const row of rows) {
          const date = row.date as string;
          if (!deliveryHeatmap[date])
            deliveryHeatmap[date] = { has_records: false, has_deviations: false };
          deliveryHeatmap[date].has_records = true;
          if (row.temp_status !== "pass" || (row.ca && !row.ca.resolved)) {
            deliveryHeatmap[date].has_deviations = true;
          }
        }
        return { rows, summary, heatmap: { deliveries: deliveryHeatmap } };
      }

      if (section === "cold_storage") {
        const rows = rawRows.map((t) =>
          merge(t, {
            submitted_by_name: userName(t),
            unit: t.haccp_cold_storage_units ?? null,
            ca: caMap[t.id as string] ?? null,
          }),
        );
        const summary = {
          total: rows.length,
          pass: rows.filter((r) => r.temp_status === "pass").length,
          amber: rows.filter((r) => r.temp_status === "amber").length,
          critical: rows.filter((r) => r.temp_status === "critical").length,
          ca_count: rows.filter((r) => r.ca !== null).length,
          unresolved: rows.filter((r) => r.ca !== null && !r.ca!.resolved).length,
        };
        const amMap: DayMap = {};
        const pmMap: DayMap = {};
        for (const row of rows) {
          const isDeviation =
            row.temp_status !== "pass" || (row.ca && !row.ca.resolved);
          const map = row.session === "AM" ? amMap : pmMap;
          const date = row.date as string;
          if (!map[date]) map[date] = { has_records: false, has_deviations: false };
          map[date].has_records = true;
          if (isDeviation) map[date].has_deviations = true;
        }
        return { rows, summary, heatmap: { cold_am: amMap, cold_pm: pmMap } };
      }

      if (section === "process_room") {
        const diaryCaMap = data.diaryCaMap ?? {};
        const tempRows = rawRows.map((t) =>
          merge(t, {
            submitted_by_name: userName(t),
            ca: caMap[t.id as string] ?? null,
          }),
        );
        const diaryRows = (data.secondaryRows ?? []).map((d) =>
          merge(d, {
            submitted_by_name: userName(d),
            ca: diaryCaMap[d.id as string] ?? null,
          }),
        );
        const tempSummary = {
          total: tempRows.length,
          pass: tempRows.filter((r) => r.within_limits).length,
          fail: tempRows.filter((r) => !r.within_limits).length,
          ca_count: tempRows.filter((r) => r.ca !== null).length,
          unresolved: tempRows.filter((r) => r.ca !== null && !r.ca!.resolved)
            .length,
        };
        const diarySummary = {
          total: diaryRows.length,
          with_issues: diaryRows.filter((r) => r.issues).length,
          opening: diaryRows.filter((r) => r.phase === "opening").length,
          operational: diaryRows.filter((r) => r.phase === "operational").length,
          closing: diaryRows.filter((r) => r.phase === "closing").length,
        };
        const roomAmMap: DayMap = {};
        const roomPmMap: DayMap = {};
        const diaryOpenMap: DayMap = {};
        const diaryOperationalMap: DayMap = {};
        const diaryCloseMap: DayMap = {};
        for (const r of tempRows) {
          const isDev = !r.within_limits || (r.ca && !r.ca.resolved);
          const map = r.session === "AM" ? roomAmMap : roomPmMap;
          const date = r.date as string;
          if (!map[date]) map[date] = { has_records: false, has_deviations: false };
          map[date].has_records = true;
          if (isDev) map[date].has_deviations = true;
        }
        for (const r of diaryRows) {
          const isDev = r.issues;
          const date = r.date as string;
          if (r.phase === "opening") {
            if (!diaryOpenMap[date])
              diaryOpenMap[date] = { has_records: false, has_deviations: false };
            diaryOpenMap[date].has_records = true;
            if (isDev) diaryOpenMap[date].has_deviations = true;
          }
          if (r.phase === "operational") {
            if (!diaryOperationalMap[date])
              diaryOperationalMap[date] = {
                has_records: false,
                has_deviations: false,
              };
            diaryOperationalMap[date].has_records = true;
            if (isDev) diaryOperationalMap[date].has_deviations = true;
          }
          if (r.phase === "closing") {
            if (!diaryCloseMap[date])
              diaryCloseMap[date] = { has_records: false, has_deviations: false };
            diaryCloseMap[date].has_records = true;
            if (isDev) diaryCloseMap[date].has_deviations = true;
          }
        }
        return {
          tempRows,
          diaryRows,
          tempSummary,
          diarySummary,
          heatmap: {
            room_am: roomAmMap,
            room_pm: roomPmMap,
            diary_open: diaryOpenMap,
            diary_operational: diaryOperationalMap,
            diary_close: diaryCloseMap,
          },
        };
      }

      if (section === "cleaning") {
        const rows = rawRows.map((c) =>
          merge(c, {
            submitted_by_name: userName(c),
            ca: caMap[c.id as string] ?? null,
          }),
        );
        const summary = {
          total: rows.length,
          no_issues: rows.filter((r) => !r.issues).length,
          with_issues: rows.filter((r) => r.issues).length,
          sanitiser_fail: rows.filter(
            (r) =>
              r.sanitiser_temp_c !== null &&
              (r.sanitiser_temp_c as number) < 82,
          ).length,
          ca_count: rows.filter((r) => r.ca !== null).length,
          unresolved: rows.filter((r) => r.ca !== null && !r.ca!.resolved).length,
        };
        const cleanMap: DayMap = {};
        for (const r of rows) {
          const date = r.date as string;
          if (!cleanMap[date])
            cleanMap[date] = { has_records: false, has_deviations: false };
          cleanMap[date].has_records = true;
          if (r.issues || (r.ca && !r.ca.resolved)) {
            cleanMap[date].has_deviations = true;
          }
        }
        return { rows, summary, heatmap: { cleaning: cleanMap } };
      }

      if (section === "calibration") {
        const rows = rawRows.map((c) =>
          merge(c, {
            submitted_by_name: userName(c),
            ca: caMap[c.id as string] ?? null,
          }),
        );
        const manual = rows.filter((r) => r.calibration_mode === "manual");
        const certified = rows.filter(
          (r) => r.calibration_mode === "certified_probe",
        );
        const summary = {
          total: rows.length,
          manual: manual.length,
          certified: certified.length,
          pass: manual.filter((r) => r.ice_water_pass && r.boiling_water_pass)
            .length,
          fail: manual.filter(
            (r) => r.ice_water_pass === false || r.boiling_water_pass === false,
          ).length,
          ca_count: rows.filter((r) => r.ca !== null).length,
          unresolved: rows.filter((r) => r.ca !== null && !r.ca!.resolved).length,
        };
        const calMap: DayMap = {};
        for (const r of rows) {
          const date = r.date as string;
          if (!calMap[date])
            calMap[date] = { has_records: false, has_deviations: false };
          calMap[date].has_records = true;
          const isDev =
            r.calibration_mode === "manual" &&
            (r.ice_water_pass === false || r.boiling_water_pass === false);
          if (isDev || (r.ca && !r.ca.resolved)) {
            calMap[date].has_deviations = true;
          }
        }
        return { rows, summary, heatmap: { calibration: calMap } };
      }

      if (section === "mince") {
        const rows = rawRows.map((r) =>
          merge(r, {
            submitted_by_name: userName(r),
            ca: caMap[r.id as string] ?? null,
          }),
        );
        const summary = {
          total: rows.length,
          all_pass: rows.filter(
            (r) =>
              r.input_temp_pass && r.output_temp_pass && r.kill_date_within_limit,
          ).length,
          temp_fails: rows.filter(
            (r) => !r.input_temp_pass || !r.output_temp_pass,
          ).length,
          kill_fails: rows.filter((r) => !r.kill_date_within_limit).length,
          with_ca_note: rows.filter(
            (r) => !!(r.corrective_action as string | null)?.trim(),
          ).length,
          linked_cas: rows.filter((r) => r.ca !== null).length,
          unresolved: rows.filter((r) => r.ca !== null && !r.ca!.resolved).length,
        };
        const minceMap: DayMap = {};
        for (const r of rows) {
          const date = r.date as string;
          if (!minceMap[date])
            minceMap[date] = { has_records: false, has_deviations: false };
          minceMap[date].has_records = true;
          const isDev =
            !r.input_temp_pass ||
            !r.output_temp_pass ||
            !r.kill_date_within_limit ||
            !!(r.corrective_action as string | null) ||
            (r.ca && !r.ca.resolved);
          if (isDev) minceMap[date].has_deviations = true;
        }
        return { rows, summary, heatmap: { mince: minceMap } };
      }

      if (section === "returns") {
        const rows = rawRows.map((r) =>
          merge(r, { submitted_by_name: userName(r) }),
        );
        const SAFETY_CODES = ["RC01", "RC02", "RC04", "RC05"];
        const summary = {
          total: rows.length,
          safety: rows.filter((r) =>
            SAFETY_CODES.includes(r.return_code as string),
          ).length,
          non_safety: rows.filter(
            (r) => !SAFETY_CODES.includes(r.return_code as string),
          ).length,
        };
        return { rows, summary };
      }

      if (section === "ccas") {
        const rows = rawRows.map((c) =>
          merge(c, {
            actioned_by_name:
              (c.actioned_by_user as { name: string } | null)?.name ?? "—",
            verified_by_name:
              (c.verified_by_user as { name: string } | null)?.name ?? null,
            date: (c.submitted_at as string).slice(0, 10),
          }),
        );
        const summary = {
          total: rows.length,
          resolved: rows.filter((r) => r.resolved).length,
          unresolved: rows.filter((r) => !r.resolved).length,
          mgmt_req: rows.filter(
            (r) => !r.resolved && r.management_verification_required,
          ).length,
        };
        return { rows, summary };
      }

      if (section === "reviews") {
        const weeklyRows = rawRows.map((w) => {
          const assessments =
            (w.assessments as { state: string }[] | null) ?? [];
          const problems = assessments.filter(
            (a) => a.state === "problem" || a.state === "no",
          ).length;
          return merge(w, {
            submitted_by_name: userName(w),
            problem_count: problems,
            total_assessments: assessments.length,
          });
        });
        const monthlyRows = (data.secondaryRows ?? []).map((m) => {
          const equip =
            (m.equipment_checks as Record<string, boolean> | null) ?? {};
          const facil =
            (m.facilities_checks as Record<string, boolean> | null) ?? {};
          const sys =
            (m.haccp_system_review as
              | { result: string; invertFail: boolean }[]
              | null) ?? [];
          const equipFail = Object.values(equip).filter((v) => !v).length;
          const facilFail = Object.values(facil).filter((v) => !v).length;
          const sysFail = sys.filter((i) =>
            i.invertFail ? i.result === "YES" : i.result !== "YES",
          ).length;
          return merge(m, {
            submitted_by_name: userName(m),
            equip_fail: equipFail,
            facil_fail: facilFail,
            sys_fail: sysFail,
          });
        });
        return { weeklyRows, monthlyRows };
      }

      if (section === "health") {
        const rows = rawRows.map((h) =>
          merge(h, { submitted_by_name: userName(h) }),
        );
        const summary = {
          total: rows.length,
          declarations: rows.filter(
            (r) => r.record_type === "new_staff_declaration",
          ).length,
          return_to_work: rows.filter((r) => r.record_type === "return_to_work")
            .length,
          visitors: rows.filter((r) => r.record_type === "visitor").length,
          excluded: rows.filter((r) => !r.fit_for_work).length,
        };
        return { rows, summary };
      }

      if (section === "training") {
        const today = todayUKFrom(new Date());
        function refreshStatus(date: string): string {
          const diff =
            (new Date(date).getTime() - new Date(today).getTime()) / 86400000;
          if (diff < 0) return "overdue";
          if (diff <= 30) return "due_soon";
          return "current";
        }
        const staffRows = rawRows.map((r) =>
          merge(r, { status: refreshStatus(r.refresh_date as string) }),
        );
        const allergenRows = (data.secondaryRows ?? []).map((r) =>
          merge(r, { status: refreshStatus(r.refresh_date as string) }),
        );
        const summary = {
          staff_total: staffRows.length,
          allergen_total: allergenRows.length,
          overdue: [...staffRows, ...allergenRows].filter(
            (r) => r.status === "overdue",
          ).length,
          due_soon: [...staffRows, ...allergenRows].filter(
            (r) => r.status === "due_soon",
          ).length,
        };
        return { staffRows, allergenRows, summary };
      }

      return { error: `Unknown section: ${section}` };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 6) audit/export — 14-tab workbook  (audit/export/route.ts:485-524)
    // ═══════════════════════════════════════════════════════════════════════
    async buildAuditWorkbook(from: string, to: string): Promise<Buffer> {
      const data = await reporting.fetchAuditExportData(from, to);
      const sheets: SheetSpec[] = [
        deliveriesSheet(data.deliveries, data.deliveriesCa),
        coldStorageSheet(data.coldStorage, data.coldStorageCa),
        ...processRoomSheets(
          data.processTemps,
          data.processTempsCa,
          data.diary,
        ),
        cleaningSheet(data.cleaning, data.cleaningCa),
        calibrationSheet(data.calibration, data.calibrationCa),
        minceSheet(data.mince, data.minceCa),
        returnsSheet(data.returns),
        casSheet(data.cas),
        ...reviewsSheets(data.weekly, data.monthly),
        healthSheet(data.health),
        ...trainingSheets(
          data.staffTraining,
          data.allergenTraining,
          todayUKFrom(new Date()),
        ),
      ];
      return spreadsheet.toXlsxBuffer(sheets);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 7) alarm overdue status — F-25 (cron route's getOverdueStatus, lifted)
    // ═══════════════════════════════════════════════════════════════════════
    // `now` INJECTED (no `new Date()`): today + nowHour both derive from the
    // single clock so the overdue read + the thresholds agree. Thresholds are
    // VERBATIM from app/api/cron/haccp-alarm/route.ts:46-60 (cold/room AM≥10
    // PM≥14; diary opening≥10 closing≥17). Returns the exact shape
    // getOverdueItems consumes.
    async getAlarmOverdueStatus(now: Date) {
      const today = todayUKFrom(now);
      const nowHour = now.getHours();

      const inputs = await reporting.fetchAlarmOverdueInputs(today);
      const coldSessions = inputs.coldSessions;
      const roomSessions = inputs.roomSessions;
      const phases = inputs.diaryPhases;

      return {
        cold_storage: {
          am_overdue: !coldSessions.includes("AM") && nowHour >= 10,
          pm_overdue: !coldSessions.includes("PM") && nowHour >= 14,
        },
        processing_room: {
          am_overdue: !roomSessions.includes("AM") && nowHour >= 10,
          pm_overdue: !roomSessions.includes("PM") && nowHour >= 14,
        },
        daily_diary: {
          opening_overdue: !phases.includes("opening") && nowHour >= 10,
          closing_overdue: !phases.includes("closing") && nowHour >= 17,
        },
        unresolved_cas: inputs.unresolvedCas,
      };
    },
  };
}

// ─── shared helpers (module-private) ─────────────────────────────────────────

function mark(map: DayMap, date: string, isDeviation: boolean): void {
  if (!map[date]) map[date] = { has_records: false, has_deviations: false };
  map[date].has_records = true;
  if (isDeviation) map[date].has_deviations = true;
}

/** overview/route.ts:30-42 — all Mon-Fri dates between from and to inclusive. */
function workingDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) {
      days.push(cur.toLocaleDateString("en-CA"));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ─── export sheet builders — VERBATIM from audit/export/route.ts ─────────────

type Row = Record<string, unknown>;
function uName(row: Row): string {
  return (row.users as { name: string } | null)?.name ?? "—";
}

function deliveriesSheet(deliveries: readonly Row[], casMap: ReportingCaMap): SheetSpec {
  const headers = [
    "Date", "Time", "Supplier", "Product", "Species", "Category",
    "Temp °C", "Status", "Contamination", "Batch No", "Delivery No",
    "Born in", "Reared in", "Slaughter site", "Cut site", "Notes",
    "Allergens identified", "Allergen detail",
    "Submitted by", "CA logged", "CA resolved", "CA deviation", "CA action taken", "CA disposition",
  ];
  const rows = deliveries.map((d) => {
    const ca = casMap[d.id as string] ?? null;
    return [
      d.date as string,
      (d.time_of_delivery as string) ?? "",
      d.supplier as string,
      d.product as string,
      (d.species as string) ?? "",
      d.product_category as string,
      d.temperature_c as number,
      d.temp_status as string,
      d.covered_contaminated as string,
      (d.batch_number as string) ?? "",
      (d.delivery_number as string) ?? "",
      (d.born_in as string) ?? "",
      (d.reared_in as string) ?? "",
      (d.slaughter_site as string) ?? "",
      (d.cut_site as string) ?? "",
      (d.notes as string) ?? "",
      (d.allergens_identified as boolean) ? "Yes" : "No",
      (d.allergen_notes as string) ?? "",
      uName(d),
      ca ? "Yes" : "No",
      ca ? (ca.resolved ? "Yes" : "No") : "",
      ca?.deviation_description ?? "",
      ca?.action_taken ?? "",
      ca?.product_disposition ?? "",
    ];
  });
  return {
    name: "01 Deliveries",
    rows: [headers, ...rows],
    columnWidths: [12, 8, 18, 20, 12, 12, 8, 10, 18, 14, 12, 10, 10, 16, 14, 20, 14, 10, 12, 30, 30, 20],
  };
}

function coldStorageSheet(temps: readonly Row[], casMap: ReportingCaMap): SheetSpec {
  const headers = [
    "Date", "Session", "Unit", "Unit Type", "Target Temp °C", "Max Temp °C",
    "Temp °C", "Status", "Comments", "Submitted by",
    "CA logged", "CA resolved", "CA deviation", "CA action taken", "CA disposition",
  ];
  const rows = temps.map((t) => {
    const ca = casMap[t.id as string] ?? null;
    const unit = t.haccp_cold_storage_units as {
      name: string; unit_type: string; target_temp_c: number; max_temp_c: number;
    } | null;
    return [
      t.date as string, t.session as string, unit?.name ?? "—", unit?.unit_type ?? "—",
      unit?.target_temp_c ?? "", unit?.max_temp_c ?? "",
      t.temperature_c as number, t.temp_status as string, (t.comments as string) ?? "", uName(t),
      ca ? "Yes" : "No",
      ca ? (ca.resolved ? "Yes" : "No") : "",
      ca?.deviation_description ?? "",
      ca?.action_taken ?? "",
      ca?.product_disposition ?? "",
    ];
  });
  return {
    name: "02 Cold Storage",
    rows: [headers, ...rows],
    columnWidths: [12, 8, 16, 10, 14, 12, 10, 10, 20, 14, 10, 12, 30, 30, 20],
  };
}

function processRoomSheets(
  temps: readonly Row[],
  tempCasMap: ReportingCaMap,
  diary: readonly Row[],
): [SheetSpec, SheetSpec] {
  const tempHeaders = ["Date","Session","Product Temp °C","Room Temp °C","Product Pass","Room Pass","Overall","CA logged","CA resolved","CA deviation","CA action taken","CA disposition","Submitted by"];
  const tempRows = temps.map((t) => {
    const ca = tempCasMap[t.id as string] ?? null;
    return [
      t.date as string, t.session as string, t.product_temp_c as number, t.room_temp_c as number,
      (t.product_within_limit as boolean) ? "Yes" : "No",
      (t.room_within_limit as boolean) ? "Yes" : "No",
      (t.within_limits as boolean) ? "Pass" : "Fail",
      ca ? "Yes" : "No", ca ? (ca.resolved ? "Yes" : "No") : "",
      ca?.deviation_description ?? "", ca?.action_taken ?? "", ca?.product_disposition ?? "",
      uName(t),
    ];
  });
  const tempsSheet: SheetSpec = {
    name: "03a Process Room Temps",
    rows: [tempHeaders, ...tempRows],
    columnWidths: [12, 8, 14, 12, 14, 12, 10, 10, 12, 30, 30, 20, 14],
  };

  const diaryHeaders = ["Date","Phase","Checks Passed","Total Checks","Issues","Action Taken","Submitted by"];
  const diaryRows = diary.map((d) => {
    const checks = (d.check_results as Record<string, boolean> | null) ?? {};
    const vals = Object.values(checks);
    const passed = vals.filter(Boolean).length;
    return [
      d.date as string, d.phase as string, passed, vals.length,
      (d.issues as boolean) ? "Yes" : "No", (d.what_did_you_do as string) ?? "", uName(d),
    ];
  });
  const diarySheet: SheetSpec = {
    name: "03b Process Room Diary",
    rows: [diaryHeaders, ...diaryRows],
    columnWidths: [12, 14, 14, 14, 8, 30, 14],
  };
  return [tempsSheet, diarySheet];
}

function cleaningSheet(cleans: readonly Row[], casMap: ReportingCaMap): SheetSpec {
  const headers = ["Date","Time","What was cleaned","Sanitiser °C","Sanitiser pass","Issues","Action taken","Verified by","CA logged","CA resolved","CA deviation","CA action taken"];
  const rows = cleans.map((c) => {
    const ca = casMap[c.id as string] ?? null;
    const temp = c.sanitiser_temp_c as number | null;
    return [
      c.date as string, (c.time_of_clean as string)?.slice(0, 5) ?? "",
      c.what_was_cleaned as string, temp ?? "", temp !== null ? (temp >= 82 ? "Yes" : "No") : "",
      (c.issues as boolean) ? "Yes" : "No", (c.what_did_you_do as string) ?? "",
      (c.verified_by as string) ?? "",
      ca ? "Yes" : "No", ca ? (ca.resolved ? "Yes" : "No") : "",
      ca?.deviation_description ?? "", ca?.action_taken ?? "",
    ];
  });
  return {
    name: "04 Cleaning",
    rows: [headers, ...rows],
    columnWidths: [12, 8, 40, 12, 14, 8, 30, 12, 10, 12, 30, 30],
  };
}

function calibrationSheet(cals: readonly Row[], casMap: ReportingCaMap): SheetSpec {
  const headers = ["Date","Time","Probe ID","Mode","Ice water °C","Ice pass","Boiling water °C","Boiling pass","Overall","Cert reference","Purchase date","Action taken","Verified by","CA logged","CA resolved","CA deviation","CA action taken"];
  const rows = cals.map((c) => {
    const ca = casMap[c.id as string] ?? null;
    const isCert = c.calibration_mode === "certified_probe";
    const overall = isCert
      ? "Certified"
      : c.ice_water_pass && c.boiling_water_pass
        ? "Pass"
        : "Fail";
    return [
      c.date as string, (c.time_of_check as string)?.slice(0, 5) ?? "",
      c.thermometer_id as string, c.calibration_mode as string,
      (c.ice_water_result_c as number) ?? "", c.ice_water_pass !== null ? (c.ice_water_pass ? "Yes" : "No") : "",
      (c.boiling_water_result_c as number) ?? "", c.boiling_water_pass !== null ? (c.boiling_water_pass ? "Yes" : "No") : "",
      overall, (c.cert_reference as string) ?? "", (c.purchase_date as string) ?? "",
      (c.action_taken as string) ?? "", (c.verified_by as string) ?? "",
      ca ? "Yes" : "No", ca ? (ca.resolved ? "Yes" : "No") : "",
      ca?.deviation_description ?? "", ca?.action_taken ?? "",
    ];
  });
  return {
    name: "05 Calibration",
    rows: [headers, ...rows],
    columnWidths: [12, 8, 16, 12, 14, 10, 16, 12, 10, 20, 14, 30, 14, 10, 12, 30, 30],
  };
}

function minceSheet(runs: readonly Row[], casMap: ReportingCaMap): SheetSpec {
  const headers = ["Date","Time","Species","Batch code","Mode","Input temp °C","Input pass","Output temp °C","Output pass","Kill date","Days from kill","Kill limit pass","CA note","Source batches","Linked CA","CA resolved"];
  const rows = runs.map((r) => {
    const ca = casMap[r.id as string] ?? null;
    const batches = (r.source_batch_numbers as string[] | null) ?? [];
    return [
      r.date as string, (r.time_of_production as string)?.slice(0, 5) ?? "",
      r.product_species as string, r.batch_code as string, r.output_mode as string,
      r.input_temp_c as number, (r.input_temp_pass as boolean) ? "Yes" : "No",
      r.output_temp_c as number, (r.output_temp_pass as boolean) ? "Yes" : "No",
      (r.kill_date as string) ?? "", (r.days_from_kill as number) ?? "", (r.kill_date_within_limit as boolean) ? "Yes" : "No",
      (r.corrective_action as string | null) ?? "",
      batches.join(", "),
      ca ? "Yes" : "No", ca ? (ca.resolved ? "Yes" : "No") : "",
    ];
  });
  return {
    name: "06 Mince & Prep",
    rows: [headers, ...rows],
    columnWidths: [12, 8, 8, 20, 10, 14, 12, 14, 12, 12, 14, 14, 30, 20, 10, 12],
  };
}

function returnsSheet(returns: readonly Row[]): SheetSpec {
  const SAFETY = ["RC01", "RC02", "RC04", "RC05"];
  const CODE_LABELS: Record<string, string> = {
    RC01: "Temperature abuse", RC02: "Quality/condition", RC03: "Incorrect product",
    RC04: "Contamination", RC05: "Labelling/date", RC06: "Quantity",
    RC07: "Packaging damage", RC08: "Other",
  };
  const headers = ["Date","Time","Customer","Product","Return code","Code description","Safety critical","Temp °C","Disposition","Batch number","Corrective action","Verified by"];
  const rows = returns.map((r) => [
    r.date as string, (r.time_of_return as string)?.slice(0, 5) ?? "", r.customer as string, r.product as string,
    r.return_code as string, CODE_LABELS[r.return_code as string] ?? (r.return_code as string),
    SAFETY.includes(r.return_code as string) ? "Yes" : "No",
    (r.temperature_c as number) ?? "", (r.disposition as string) ?? "", (r.source_batch_number as string) ?? "",
    (r.corrective_action as string) ?? "", (r.verified_by as string) ?? "",
  ]);
  return {
    name: "07 Product Returns",
    rows: [headers, ...rows],
    columnWidths: [12, 8, 20, 20, 10, 22, 14, 10, 16, 16, 30, 14],
  };
}

function casSheet(cas: readonly Row[]): SheetSpec {
  const TABLE_LABELS: Record<string, string> = {
    haccp_deliveries: "Deliveries", haccp_cold_storage_temps: "Cold Storage",
    haccp_processing_temps: "Process Room", haccp_daily_diary: "Daily Diary",
    haccp_cleaning_log: "Cleaning", haccp_calibration_log: "Calibration",
    haccp_mince_log: "Mince & Prep", haccp_returns: "Product Returns",
    haccp_weekly_review: "Weekly Review", haccp_monthly_review: "Monthly Review",
  };
  const headers = ["Date","CCP ref","Source section","Deviation","Action taken","Product disposition","Recurrence prevention","Mgmt verification required","Resolved","Verified at","Actioned by"];
  const rows = cas.map((c) => [
    (c.submitted_at as string).slice(0, 10), c.ccp_ref as string, TABLE_LABELS[c.source_table as string] ?? (c.source_table as string),
    c.deviation_description as string, c.action_taken as string, (c.product_disposition as string) ?? "", (c.recurrence_prevention as string) ?? "",
    (c.management_verification_required as boolean) ? "Yes" : "No", (c.resolved as boolean) ? "Yes" : "No",
    c.verified_at ? (c.verified_at as string).slice(0, 10) : "",
    (c.actioned_by_user as { name: string } | null)?.name ?? "—",
  ]);
  return {
    name: "08 Corrective Actions",
    rows: [headers, ...rows],
    columnWidths: [12, 10, 16, 35, 35, 20, 30, 22, 10, 12, 14],
  };
}

function reviewsSheets(weekly: readonly Row[], monthly: readonly Row[]): [SheetSpec, SheetSpec] {
  const wHeaders = ["Week ending","Problems found","Total assessments","Issues detail","Submitted by"];
  const wRows = weekly.map((w) => {
    const items = (w.assessments as { state: string; label: string }[] | null) ?? [];
    const problems = items.filter((a) => a.state === "problem" || a.state === "no");
    return [w.week_ending as string, problems.length, items.length, problems.map((p) => p.label).join("; "), uName(w)];
  });
  const weeklySheet: SheetSpec = {
    name: "09a Weekly Reviews",
    rows: [wHeaders, ...wRows],
    columnWidths: [14, 14, 18, 60, 14],
  };

  const mHeaders = ["Month","Equipment fails","Facilities fails","System review fails","Further notes","Submitted by"];
  const mRows = monthly.map((m) => {
    const equip = (m.equipment_checks as Record<string, boolean> | null) ?? {};
    const facil = (m.facilities_checks as Record<string, boolean> | null) ?? {};
    const sys = (m.haccp_system_review as { result: string; invertFail: boolean }[] | null) ?? [];
    return [
      (m.month_year as string)?.slice(0, 7),
      Object.values(equip).filter((v) => !v).length,
      Object.values(facil).filter((v) => !v).length,
      sys.filter((i) => (i.invertFail ? i.result === "YES" : i.result !== "YES")).length,
      (m.further_notes as string) ?? "",
      uName(m),
    ];
  });
  const monthlySheet: SheetSpec = {
    name: "09b Monthly Reviews",
    rows: [mHeaders, ...mRows],
    columnWidths: [10, 16, 18, 20, 30, 14],
  };
  return [weeklySheet, monthlySheet];
}

function healthSheet(records: readonly Row[]): SheetSpec {
  const TYPE_LABELS: Record<string, string> = {
    new_staff_declaration: "Health Declaration", return_to_work: "Return to Work", visitor: "Visitor Log",
  };
  const headers = ["Date","Type","Name","Company (visitor)","Fit for work","Exclusion reason","Illness type","Absence from","Absence to","Manager signed by"];
  const rows = records.map((h) => [
    h.date as string, TYPE_LABELS[h.record_type as string] ?? (h.record_type as string),
    (h.staff_name as string | null) ?? (h.visitor_name as string | null) ?? "—",
    (h.visitor_company as string | null) ?? "",
    (h.fit_for_work as boolean) ? "Yes" : "No",
    (h.exclusion_reason as string | null) ?? "",
    (h.illness_type as string | null) ?? "",
    (h.absence_from as string | null) ?? "",
    (h.absence_to as string | null) ?? "",
    (h.manager_signed_name as string | null) ?? "",
  ]);
  return {
    name: "10 Health & People",
    rows: [headers, ...rows],
    columnWidths: [12, 18, 16, 18, 12, 25, 16, 12, 12, 16],
  };
}

function trainingSheets(
  staff: readonly Row[],
  allergen: readonly Row[],
  today: string,
): [SheetSpec, SheetSpec] {
  const TYPE_LABELS: Record<string, string> = {
    butchery_process_room: "Butchery & Process Room", warehouse_operative: "Warehouse Operative", allergen_awareness: "Allergen Awareness",
  };
  function status(date: string): string {
    const diff = (new Date(date).getTime() - new Date(today).getTime()) / 86400000;
    return diff < 0 ? "Overdue" : diff <= 30 ? "Due soon" : "Current";
  }
  const sHeaders = ["Staff name","Job role","Training type","Document version","Completed","Refresh due","Status","Supervisor"];
  const sRows = staff.map((r) => [
    r.staff_name as string, (r.job_role as string) ?? "", TYPE_LABELS[r.training_type as string] ?? (r.training_type as string),
    (r.document_version as string) ?? "", r.completion_date as string, r.refresh_date as string, status(r.refresh_date as string), (r.supervisor_name as string) ?? "",
  ]);
  const staffSheet: SheetSpec = {
    name: "11a Staff Training",
    rows: [sHeaders, ...sRows],
    columnWidths: [16, 18, 22, 14, 12, 12, 10, 14],
  };

  const aHeaders = ["Staff name","Job role","Completed","Refresh due","Status","Supervisor","Allergens confirmed","Understanding confirmed"];
  const aRows = allergen.map((r) => {
    const items = (r.confirmation_items as Record<string, boolean> | null) ?? {};
    const aCount = Object.entries(items).filter(([k, v]) => k.startsWith("a") && v).length;
    const uCount = Object.entries(items).filter(([k, v]) => k.startsWith("u") && v).length;
    return [r.staff_name as string, (r.job_role as string) ?? "", r.certification_date as string, r.refresh_date as string, status(r.refresh_date as string), (r.supervisor_name as string) ?? "", `${aCount}/14`, `${uCount}/5`];
  });
  const allergenSheet: SheetSpec = {
    name: "11b Allergen Training",
    rows: [aHeaders, ...aRows],
    columnWidths: [16, 18, 12, 12, 10, 14, 18, 22],
  };
  return [staffSheet, allergenSheet];
}
