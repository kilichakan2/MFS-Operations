/**
 * lib/domain/HaccpReporting.ts
 *
 * F-19 PR7 Cluster E — owned domain types for the 6 read-only HACCP reporting
 * routes (today-status, overview, annual-review/data, audit/heatmap, audit
 * per-section, audit/export). Pure TypeScript: NO framework import, NO vendor
 * import. The app's own shapes — vendor row types never leak past the adapter.
 *
 * Two families of types:
 *   1. `…Raw…` — the raw-ish row collections the `HaccpReportingRepository` port
 *      returns. Each row mirrors EXACTLY the `.select(...)` column list of the
 *      current route (the byte-identity anchor). The adapter does the multi-table
 *      reads + the CA-merge fetches and maps vendor rows to these.
 *   2. `…Response` — the exact response object each route returns today. The
 *      `HaccpReportingService` produces these; the PR8 re-point is byte-identical.
 *
 * The shaping (tallies, inference, grids, SALSA blocks, sheet assembly) lives in
 * the SERVICE, not here and not in the adapter. These types are pure description.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

/** A single heatmap cell, keyed by date in the route responses. */
export interface DayMark {
  has_records: boolean;
  has_deviations: boolean;
}
/** A heatmap section: `{ 'YYYY-MM-DD': DayMark }`. */
export type DayMap = Record<string, DayMark>;

/**
 * A corrective-action row as the audit section + export reads fetch it, keyed by
 * `source_id`. Full field set (the audit per-section read); the export read uses
 * a subset (deviation/action/disposition/resolved) — the service only touches
 * the fields each route touches.
 */
export interface ReportingCaRow {
  id?: string;
  ccp_ref?: string;
  deviation_description?: string;
  action_taken?: string;
  product_disposition?: string | null;
  recurrence_prevention?: string | null;
  management_verification_required?: boolean;
  resolved: boolean;
  verified_at?: string | null;
}
/** CA map keyed by `source_id` (the routes' `casMap` / `cas`). */
export type ReportingCaMap = Record<string, ReportingCaRow>;

// ─────────────────────────────────────────────────────────────────────────────
// 1) today-status  (app/api/haccp/today-status/route.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface TodayStatusData {
  /** haccp_cold_storage_temps.select('session').eq('date', today) */
  readonly cold: readonly { session: string }[];
  /** haccp_processing_temps.select('session').eq('date', today) */
  readonly room: readonly { session: string }[];
  /** haccp_daily_diary.select('phase').eq('date', today) */
  readonly diary: readonly { phase: string }[];
  /** haccp_cleaning_log.select('submitted_at, issues')…order desc limit 20 */
  readonly cleaning: readonly {
    submitted_at?: string;
    issues?: boolean;
  }[];
  /** haccp_deliveries.select('temp_status').eq('date', today) */
  readonly deliveries: readonly { temp_status: string }[];
  /** haccp_mince_log.select('id, input_temp_pass, output_temp_pass, corrective_action') */
  readonly mince: readonly {
    id: string;
    input_temp_pass?: boolean;
    output_temp_pass?: boolean;
    corrective_action?: string;
  }[];
  /** haccp_returns.select('id, return_code').eq('date', today) */
  readonly returns: readonly { id: string; return_code?: string }[];
  /** haccp_corrective_actions.select('id').eq('resolved', false) */
  readonly ccas: readonly { id: string }[];
  /** haccp_weekly_review.select('id').gte('week_ending', weekStart).limit(1) */
  readonly weekly: readonly { id: string }[];
  /** haccp_monthly_review.select('id').gte('month_year', monthStart).limit(1) */
  readonly monthly: readonly { id: string }[];
  /** haccp_calibration_log.select('id, ice_water_pass, boiling_water_pass')…limit 10 */
  readonly cal: readonly {
    id: string;
    ice_water_pass?: boolean;
    boiling_water_pass?: boolean;
  }[];
  /** haccp_staff_training.select('refresh_date').not('refresh_date','is',null) */
  readonly training: readonly { refresh_date?: string }[];
}

export interface TodayStatusResponse {
  cold_storage: {
    am_done: boolean;
    pm_done: boolean;
    am_overdue: boolean;
    pm_overdue: boolean;
  };
  processing_room: {
    am_done: boolean;
    pm_done: boolean;
    am_overdue: boolean;
    pm_overdue: boolean;
  };
  daily_diary: {
    opening: boolean;
    operational: boolean;
    closing: boolean;
    opening_overdue: boolean;
    operational_overdue: boolean;
    closing_overdue: boolean;
  };
  cleaning: {
    count_today: number;
    has_issues_today: boolean;
    overdue: boolean;
    last_logged_at: string | null;
  };
  deliveries: { count_today: number; deviations: number };
  mince_runs: { count_today: number; has_deviations: boolean };
  product_returns: { count_today: number; has_safety_returns: boolean };
  corrective_actions: { open: number };
  calibration_due: boolean;
  calibration_done: boolean;
  calibration_pass: boolean;
  weekly_review_due: boolean;
  weekly_review_overdue: boolean;
  monthly_review_due: boolean;
  monthly_review_overdue: boolean;
  training_overdue: number;
  training_due_soon: number;
  total_checks: number;
  completed_checks: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) overview  (app/api/haccp/overview/route.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface OverviewData {
  readonly deliveries: readonly {
    date: string;
    temp_status: string;
    corrective_action_required: boolean;
    product_category: string;
  }[];
  readonly coldStorage: readonly {
    date: string;
    temp_status: string;
    session: string;
  }[];
  readonly processingTemps: readonly {
    date: string;
    session: string;
    product_temp_pass: boolean | null;
    room_temp_pass: boolean | null;
  }[];
  readonly dailyDiary: readonly {
    date: string;
    phase: string;
    issues: boolean | null;
  }[];
  readonly cleaning: readonly {
    date: string;
    issues: boolean | null;
    what_was_cleaned: string | null;
  }[];
  readonly mince: readonly {
    date: string;
    product_species: string;
    input_temp_pass: boolean | null;
    output_temp_pass: boolean | null;
    corrective_action: string | null;
  }[];
  readonly meatprep: readonly {
    date: string;
    product_name: string;
    input_temp_pass: boolean | null;
    output_temp_pass: boolean | null;
    corrective_action: string | null;
  }[];
  readonly returns: readonly {
    date: string;
    return_code: string;
    disposition: string;
    temperature_c: number | null;
  }[];
  readonly calibration: readonly {
    date: string;
    calibration_mode: string;
    ice_water_pass: boolean | null;
    boiling_water_pass: boolean | null;
  }[];
  readonly correctiveActions: readonly {
    ccp_ref: string;
    management_verification_required: boolean | null;
    verified_at: string | null;
    source_table: string;
  }[];
}

export interface OverviewResponse {
  from: string;
  to: string;
  expected_days: string[];
  goods_in: {
    total: number;
    entries_by_date: string[];
    temp_fails: number;
    temp_urgent: number;
    ca_raised: number;
  };
  cold_storage: {
    total: number;
    entries_by_date: string[];
    missing_days: string[];
    fails: number;
    urgent: number;
  };
  process_room: {
    total: number;
    entries_by_date: string[];
    missing_days: string[];
    product_fails: number;
    room_fails: number;
    diary_issues: number;
  };
  cleaning: {
    total: number;
    entries_by_date: string[];
    missing_days: string[];
    issues: number;
  };
  mince: {
    total: number;
    entries_by_date: string[];
    deviations: number;
    by_species: Record<string, number>;
  };
  meatprep: {
    total: number;
    entries_by_date: string[];
    deviations: number;
  };
  returns: {
    total: number;
    entries_by_date: string[];
    by_code: Record<string, number>;
    dispositions: Record<string, number>;
  };
  calibration: {
    done: boolean;
    total: number;
    any_fail: boolean;
  };
  corrective_actions: {
    total: number;
    unresolved: number;
    by_ccp: Record<string, number>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) annual-review/data  (app/api/haccp/annual-review/data/route.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnualReviewRawData {
  /** staff training, ordered staff_name ↑ / training_type ↑ / completion_date ↓ */
  readonly staffRaw: readonly {
    staff_name: string;
    job_role: string | null;
    training_type: string;
    completion_date: string;
    refresh_date: string;
    supervisor_name: string | null;
  }[];
  /** allergen training, ordered staff_name ↑ / certification_date ↓ */
  readonly allergenRaw: readonly {
    staff_name: string;
    job_role: string | null;
    certification_date: string;
    refresh_date: string;
  }[];
  /** 3.3 health records — period-filtered; null when no from&to */
  readonly healthRaw: readonly Record<string, unknown>[] | null;
  /** 3.4 cleaning — period-filtered; null when no from&to */
  readonly cleaningRaw:
    | readonly {
        date: string;
        issues: boolean | null;
        what_did_you_do: string | null;
        sanitiser_temp_c: number | null;
      }[]
    | null;
  /** 3.6 calibration latest-per-thermometer source rows */
  readonly calibRaw: readonly {
    thermometer_id: string;
    calibration_mode: string;
    date: string;
    cert_reference: string | null;
    ice_water_result_c: number | null;
    ice_water_pass: boolean | null;
    boiling_water_result_c: number | null;
    boiling_water_pass: boolean | null;
  }[];
  /** 3.6 active cold-storage units, ordered position ↑ */
  readonly unitsRaw: readonly {
    id: string;
    name: string;
    unit_type: string;
    target_temp_c: number;
    max_temp_c: number;
  }[];
  /** 3.6 cold-storage temps (all), ordered date ↓ / submitted_at ↓ */
  readonly tempsRaw: readonly {
    unit_id: string;
    temperature_c: number;
    temp_status: string;
    date: string;
    session: string;
  }[];
  /** 3.6 delivery temps — period-filtered, neq dry_goods; null when no from&to */
  readonly deliveryTempsRaw: readonly { temp_status: string }[] | null;
  /** 3.7 active suppliers */
  readonly suppliersRaw: readonly {
    date_approved: string | null;
    fsa_approval_no: string | null;
    cert_type: string | null;
    cert_expiry: string | null;
  }[];
  /** 3.7 active product specs */
  readonly specsRaw: readonly { reviewed_at: string | null }[];
  /** 3.7 goods-in BLS — period-filtered; null when no from&to */
  readonly goodsInRaw:
    | readonly {
        batch_number: string | null;
        product_category: string;
        born_in: string | null;
        slaughter_site: string | null;
        cut_site: string | null;
      }[]
    | null;
  /** 3.8 all corrective actions (not period-filtered at the read) */
  readonly caAllRaw: readonly {
    source_table: string;
    resolved: boolean;
    submitted_at: string | null;
  }[];
  /** 3.8 returns — period-filtered; null when no from&to */
  readonly returnsRaw: readonly { return_code: string }[] | null;
  /** 3.8 complaints — period-filtered by created_at; null when no from&to */
  readonly complaintsRaw: readonly { status: string }[] | null;
  /** 3.9 latest food-fraud assessment (maybeSingle) */
  readonly ffRaw: {
    version: string | null;
    issue_date: string | null;
    next_review_date: string;
  } | null;
  /** 3.9 latest food-defence plan (maybeSingle) */
  readonly fdRaw: {
    version: string | null;
    issue_date: string | null;
    next_review_date: string;
  } | null;
}

/* The response is a passthrough object keyed by SALSA section number. Modelled
 * loosely (the route builds nested objects with mixed shapes); the test asserts
 * exact equality against the route output. */
export interface AnnualReviewResponse {
  "3.2": {
    staff_training: readonly Record<string, unknown>[];
    allergen_training: readonly Record<string, unknown>[];
  };
  "3.3": {
    new_staff: unknown[];
    exclusions: unknown[];
    visitors: unknown[];
  };
  "3.4": {
    total: number;
    issues_count: number;
    issues_list: { date: string; what_did_you_do: string | null }[];
    sanitiser_checks: number;
    low_temp_list: { date: string; sanitiser_temp_c: number }[];
    last_log_date: string | null;
  };
  "3.6": {
    calibration: readonly Record<string, unknown>[];
    cold_storage: {
      name: string;
      unit_type: string;
      target_temp_c: number;
      max_temp_c: number;
      latest: {
        temperature_c: number;
        temp_status: string;
        date: string;
        session: string;
      } | null;
    }[];
    delivery_temps: {
      total: number;
      pass: number;
      urgent: number;
      fail: number;
      temp_cas: number;
    };
  };
  "3.7": {
    supplier_stats: {
      total: number;
      formally_approved: number;
      fsa_approved: number;
      expired_certs: number;
      expiring_60_days: number;
    };
    spec_stats: { total: number; review_due: number };
    goods_in: {
      total: number;
      has_batch: number;
      meat_total: number;
      meat_bls_complete: number;
    };
  };
  "3.8": {
    ca_stats: {
      total_open: number;
      total_resolved: number;
      in_period: number;
      open_by_source: { source: string; count: number }[];
    };
    returns_stats: {
      total: number;
      by_code: { code: string; label: string; count: number }[];
    };
    complaints_stats: { total: number; open: number; resolved: number };
  };
  "3.9": {
    food_fraud: {
      exists: boolean;
      version: string | null;
      issue_date: string | null;
      next_review: string | null;
      review_due: boolean;
    };
    food_defence: {
      exists: boolean;
      version: string | null;
      issue_date: string | null;
      next_review: string | null;
      review_due: boolean;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) audit/heatmap  (app/api/haccp/audit/heatmap/route.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditHeatmapRawData {
  readonly deliveries: readonly {
    date: string;
    temp_status: string;
    corrective_action_required: boolean;
  }[];
  readonly coldStorageTemps: readonly {
    date: string;
    session: string;
    temp_status: string;
    corrective_action_required: boolean;
  }[];
  readonly processingTemps: readonly {
    date: string;
    session: string;
    within_limits: boolean | null;
    corrective_action_required: boolean;
  }[];
  readonly dailyDiary: readonly {
    date: string;
    phase: string;
    issues: boolean | null;
  }[];
  readonly cleaningLog: readonly { date: string; issues: boolean | null }[];
  readonly minceLog: readonly {
    date: string;
    input_temp_pass: boolean | null;
    output_temp_pass: boolean | null;
    corrective_action: string | null;
  }[];
  readonly calibrationLog: readonly {
    date: string;
    calibration_mode: string;
    ice_water_pass: boolean | null;
    boiling_water_pass: boolean | null;
  }[];
}

export interface AuditHeatmapResponse {
  deliveries: DayMap;
  cold_am: DayMap;
  cold_pm: DayMap;
  room_am: DayMap;
  room_pm: DayMap;
  diary_open: DayMap;
  diary_operational: DayMap;
  diary_close: DayMap;
  cleaning: DayMap;
  mince: DayMap;
  calibration: DayMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) audit (per section)  (app/api/haccp/audit/route.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each section's raw read. The adapter runs the section's select(s) + its
 * CA-merge fetch and returns the joined rows AS the route reads them (the
 * `users!submitted_by(name)` join is mapped to a `users: { name } | null`
 * shape; the service applies the `?? '—'` fallback). For the union we use a
 * tagged shape so the service can narrow by `section`.
 */
export interface AuditSectionRawData {
  /** echo of the requested section */
  readonly section: string;
  /** the section's primary rows (deliveries/cold/cleaning/cal/mince/returns/
   *  ccas/health), OR temps for process_room */
  readonly rows: readonly Record<string, unknown>[];
  /** process_room diary rows; reviews monthly rows */
  readonly secondaryRows?: readonly Record<string, unknown>[];
  /** the section's CA map keyed by source_id (deliveries/cold/process temps/
   *  cleaning/cal/mince) */
  readonly caMap?: ReportingCaMap;
  /** process_room diary CA map keyed by source_id */
  readonly diaryCaMap?: ReportingCaMap;
}

/** The audit-section responses vary; modelled loosely, asserted exactly. */
export type AuditSectionResponse = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// 6) audit/export  (app/api/haccp/audit/export/route.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All raw row collections + CA maps the 14-tab export workbook needs. Each row
 * collection mirrors the export route's per-sheet `.select(...)`. The service
 * assembles the 14 SheetSpec arrays (with the verbatim headers, label maps,
 * `slice` truncations and `!cols` widths) and calls the SpreadsheetExporter.
 */
export interface AuditExportRawData {
  readonly deliveries: readonly Record<string, unknown>[];
  readonly deliveriesCa: ReportingCaMap;
  readonly coldStorage: readonly Record<string, unknown>[];
  readonly coldStorageCa: ReportingCaMap;
  readonly processTemps: readonly Record<string, unknown>[];
  readonly processTempsCa: ReportingCaMap;
  readonly diary: readonly Record<string, unknown>[];
  readonly cleaning: readonly Record<string, unknown>[];
  readonly cleaningCa: ReportingCaMap;
  readonly calibration: readonly Record<string, unknown>[];
  readonly calibrationCa: ReportingCaMap;
  readonly mince: readonly Record<string, unknown>[];
  readonly minceCa: ReportingCaMap;
  readonly returns: readonly Record<string, unknown>[];
  readonly cas: readonly Record<string, unknown>[];
  readonly weekly: readonly Record<string, unknown>[];
  readonly monthly: readonly Record<string, unknown>[];
  readonly health: readonly Record<string, unknown>[];
  readonly staffTraining: readonly Record<string, unknown>[];
  readonly allergenTraining: readonly Record<string, unknown>[];
}
