/**
 * lib/adapters/supabase/HaccpReportingRepository.ts
 *
 * Supabase implementation of `HaccpReportingRepository`
 * (lib/ports/HaccpReportingRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js`. The ONLY file that imports the vendor SDK for
 * the 6 read-only HACCP reporting routes' reads.
 *
 * Boundary discipline (ADR-0002 line 27): every `.select(…)` column list, every
 * `.gte/.lte/.eq/.order/.limit` chain, and every CA-merge fetch is copied
 * VERBATIM from its route (today-status / overview / annual-review·data /
 * audit·heatmap / audit / audit·export), so the wire output stays byte-identical
 * after the PR8 re-point. The adapter does NO shaping — it returns the raw row
 * collections (+ CA maps) the service tallies.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpReportingRepository(client)` factory.
 *   - `supabaseHaccpReportingRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key), matching the access
 *     the 6 routes have today.
 *
 * Error contract: reads return [] / null on miss; a DB failure throws
 * ServiceError (the PR8 route wraps to its current 500/`dErr.message` reply).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import type { HaccpReportingRepository } from "@/lib/ports";
import type {
  TodayStatusData,
  OverviewData,
  AnnualReviewRawData,
  AuditHeatmapRawData,
  AuditSectionRawData,
  AuditExportRawData,
  ReportingCaMap,
} from "@/lib/domain";

type Rows = Record<string, unknown>[];

export function createSupabaseHaccpReportingRepository(
  client: SupabaseClient,
): HaccpReportingRepository {
  /** Fetch a CA map keyed by source_id for one source table + id set. */
  async function fetchCaMap(
    sourceTable: string,
    ids: string[],
    cols: string,
  ): Promise<ReportingCaMap> {
    const map: ReportingCaMap = {};
    if (ids.length === 0) return map;
    const { data } = await client
      .from("haccp_corrective_actions")
      .select(cols)
      .eq("source_table", sourceTable)
      .in("source_id", ids);
    for (const ca of (data ?? []) as unknown as Rows) {
      map[ca.source_id as string] = ca as unknown as ReportingCaMap[string];
    }
    return map;
  }

  const CA_FULL =
    "id, source_id, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, management_verification_required, resolved, verified_at";
  const CA_EXPORT =
    "source_id, deviation_description, action_taken, product_disposition, resolved";
  const CA_EXPORT_LITE =
    "source_id, deviation_description, action_taken, resolved";

  return {
    // ── today-status ───────────────────────────────────────────────────────
    async fetchTodayStatus(
      today: string,
      weekStart: string,
      monthStart: string,
    ): Promise<TodayStatusData> {
      const [cold, room, diary, cleaning, deliveries, mince, returns, ccas, weekly, monthly, cal, training] =
        await Promise.all([
          client.from("haccp_cold_storage_temps").select("session").eq("date", today),
          client.from("haccp_processing_temps").select("session").eq("date", today),
          client.from("haccp_daily_diary").select("phase").eq("date", today),
          client.from("haccp_cleaning_log").select("submitted_at, issues").eq("date", today).order("submitted_at", { ascending: false }).limit(20),
          client.from("haccp_deliveries").select("temp_status").eq("date", today),
          client.from("haccp_mince_log").select("id, input_temp_pass, output_temp_pass, corrective_action").eq("date", today),
          client.from("haccp_returns").select("id, return_code").eq("date", today),
          client.from("haccp_corrective_actions").select("id").eq("resolved", false),
          client.from("haccp_weekly_review").select("id").gte("week_ending", weekStart).limit(1),
          client.from("haccp_monthly_review").select("id").gte("month_year", monthStart).limit(1),
          client.from("haccp_calibration_log").select("id, ice_water_pass, boiling_water_pass").gte("date", monthStart).limit(10),
          client.from("haccp_staff_training").select("refresh_date").not("refresh_date", "is", null),
        ]);

      return {
        cold: (cold.data ?? []) as TodayStatusData["cold"],
        room: (room.data ?? []) as TodayStatusData["room"],
        diary: (diary.data ?? []) as TodayStatusData["diary"],
        cleaning: (cleaning.data ?? []) as TodayStatusData["cleaning"],
        deliveries: (deliveries.data ?? []) as TodayStatusData["deliveries"],
        mince: (mince.data ?? []) as TodayStatusData["mince"],
        returns: (returns.data ?? []) as TodayStatusData["returns"],
        ccas: (ccas.data ?? []) as TodayStatusData["ccas"],
        weekly: (weekly.data ?? []) as TodayStatusData["weekly"],
        monthly: (monthly.data ?? []) as TodayStatusData["monthly"],
        cal: (cal.data ?? []) as TodayStatusData["cal"],
        training: (training.data ?? []) as TodayStatusData["training"],
      };
    },

    // ── overview ─────────────────────────────────────────────────────────────
    async fetchOverview(from: string, to: string): Promise<OverviewData> {
      const [deliveries, coldStorage, processingTemps, dailyDiary, cleaning, mince, meatprep, returns, calibration, corrActions] =
        await Promise.all([
          client.from("haccp_deliveries").select("date, temp_status, corrective_action_required, product_category").gte("date", from).lte("date", to),
          client.from("haccp_cold_storage_temps").select("date, temp_status, session").gte("date", from).lte("date", to),
          client.from("haccp_processing_temps").select("date, session, product_temp_pass, room_temp_pass").gte("date", from).lte("date", to),
          client.from("haccp_daily_diary").select("date, phase, issues").gte("date", from).lte("date", to),
          client.from("haccp_cleaning_log").select("date, issues, what_was_cleaned").gte("date", from).lte("date", to),
          client.from("haccp_mince_log").select("date, product_species, input_temp_pass, output_temp_pass, corrective_action").gte("date", from).lte("date", to),
          client.from("haccp_meatprep_log").select("date, product_name, input_temp_pass, output_temp_pass, corrective_action").gte("date", from).lte("date", to),
          client.from("haccp_returns").select("date, return_code, disposition, temperature_c").gte("date", from).lte("date", to),
          client.from("haccp_calibration_log").select("date, calibration_mode, ice_water_pass, boiling_water_pass").gte("date", from).lte("date", to),
          client.from("haccp_corrective_actions").select("ccp_ref, management_verification_required, verified_at, source_table").gte("submitted_at", from + "T00:00:00Z").lte("submitted_at", to + "T23:59:59Z"),
        ]);

      return {
        deliveries: (deliveries.data ?? []) as OverviewData["deliveries"],
        coldStorage: (coldStorage.data ?? []) as OverviewData["coldStorage"],
        processingTemps: (processingTemps.data ?? []) as OverviewData["processingTemps"],
        dailyDiary: (dailyDiary.data ?? []) as OverviewData["dailyDiary"],
        cleaning: (cleaning.data ?? []) as OverviewData["cleaning"],
        mince: (mince.data ?? []) as OverviewData["mince"],
        meatprep: (meatprep.data ?? []) as OverviewData["meatprep"],
        returns: (returns.data ?? []) as OverviewData["returns"],
        calibration: (calibration.data ?? []) as OverviewData["calibration"],
        correctiveActions: (corrActions.data ?? []) as OverviewData["correctiveActions"],
      };
    },

    // ── annual-review/data ───────────────────────────────────────────────────
    async fetchAnnualReviewData(
      from: string | null,
      to: string | null,
    ): Promise<AnnualReviewRawData> {
      // 3.2 training (current state)
      const { data: staffRaw, error: staffErr } = await client
        .from("haccp_staff_training")
        .select("staff_name, job_role, training_type, completion_date, refresh_date, supervisor_name")
        .order("staff_name", { ascending: true })
        .order("training_type", { ascending: true })
        .order("completion_date", { ascending: false });
      if (staffErr) throw new ServiceError("Failed to load staff training", { cause: staffErr });

      const { data: allergenRaw, error: allergenErr } = await client
        .from("haccp_allergen_training")
        .select("staff_name, job_role, certification_date, refresh_date")
        .order("staff_name", { ascending: true })
        .order("certification_date", { ascending: false });
      if (allergenErr) throw new ServiceError("Failed to load allergen training", { cause: allergenErr });

      // 3.3 health (period)
      let healthRaw: Rows | null = null;
      if (from && to) {
        const { data, error } = await client
          .from("haccp_health_records")
          .select(
            "id, record_type, date, staff_name, fit_for_work, exclusion_reason," +
              "illness_type, absence_from, absence_to, symptom_free_48h, return_date," +
              "visitor_name, visitor_company, visitor_declaration_confirmed",
          )
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: false });
        if (error) throw new ServiceError("Failed to load health records", { cause: error });
        healthRaw = (data ?? []) as unknown as Rows;
      }

      // 3.4 cleaning (period)
      let cleaningRaw: AnnualReviewRawData["cleaningRaw"] = null;
      if (from && to) {
        const { data, error } = await client
          .from("haccp_cleaning_log")
          .select("date, issues, what_did_you_do, sanitiser_temp_c")
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: false });
        if (error) throw new ServiceError("Failed to load cleaning log", { cause: error });
        cleaningRaw = (data ?? []) as AnnualReviewRawData["cleaningRaw"];
      }

      // 3.6 calibration (latest per thermometer)
      const { data: calibRaw, error: calibErr } = await client
        .from("haccp_calibration_log")
        .select("thermometer_id, calibration_mode, date, cert_reference, ice_water_result_c, ice_water_pass, boiling_water_result_c, boiling_water_pass")
        .order("thermometer_id", { ascending: true })
        .order("date", { ascending: false })
        .order("submitted_at", { ascending: false });
      if (calibErr) throw new ServiceError("Failed to load calibration log", { cause: calibErr });

      // 3.6 cold storage units + temps
      const { data: unitsRaw, error: unitsErr } = await client
        .from("haccp_cold_storage_units")
        .select("id, name, unit_type, target_temp_c, max_temp_c")
        .eq("active", true)
        .order("position", { ascending: true });
      if (unitsErr) throw new ServiceError("Failed to load cold storage units", { cause: unitsErr });

      const { data: tempsRaw, error: tempsErr } = await client
        .from("haccp_cold_storage_temps")
        .select("unit_id, temperature_c, temp_status, date, session")
        .order("date", { ascending: false })
        .order("submitted_at", { ascending: false });
      if (tempsErr) throw new ServiceError("Failed to load cold storage temps", { cause: tempsErr });

      // 3.6 delivery temps (period)
      let deliveryTempsRaw: AnnualReviewRawData["deliveryTempsRaw"] = null;
      if (from && to) {
        const { data, error } = await client
          .from("haccp_deliveries")
          .select("temp_status")
          .gte("date", from)
          .lte("date", to)
          .neq("product_category", "dry_goods");
        if (error) throw new ServiceError("Failed to load delivery temps", { cause: error });
        deliveryTempsRaw = (data ?? []) as AnnualReviewRawData["deliveryTempsRaw"];
      }

      // 3.7 suppliers
      const { data: suppliersRaw, error: suppliersErr } = await client
        .from("haccp_suppliers")
        .select("date_approved, fsa_approval_no, cert_type, cert_expiry")
        .eq("active", true);
      if (suppliersErr) throw new ServiceError("Failed to load suppliers", { cause: suppliersErr });

      // 3.7 specs
      const { data: specsRaw } = await client
        .from("haccp_product_specs")
        .select("reviewed_at")
        .eq("active", true);

      // 3.7 goods-in BLS (period)
      let goodsInRaw: AnnualReviewRawData["goodsInRaw"] = null;
      if (from && to) {
        const { data, error } = await client
          .from("haccp_deliveries")
          .select("batch_number, product_category, born_in, slaughter_site, cut_site")
          .gte("date", from)
          .lte("date", to);
        if (error) throw new ServiceError("Failed to load goods-in", { cause: error });
        goodsInRaw = (data ?? []) as AnnualReviewRawData["goodsInRaw"];
      }

      // 3.8 corrective actions (all)
      const { data: caAllRaw, error: caAllErr } = await client
        .from("haccp_corrective_actions")
        .select("source_table, resolved, submitted_at");
      if (caAllErr) throw new ServiceError("Failed to load corrective actions", { cause: caAllErr });

      // 3.8 returns (period)
      let returnsRaw: AnnualReviewRawData["returnsRaw"] = null;
      if (from && to) {
        const { data, error } = await client
          .from("haccp_returns")
          .select("return_code")
          .gte("date", from)
          .lte("date", to);
        if (error) throw new ServiceError("Failed to load returns", { cause: error });
        returnsRaw = (data ?? []) as AnnualReviewRawData["returnsRaw"];
      }

      // 3.8 complaints (period, created_at)
      let complaintsRaw: AnnualReviewRawData["complaintsRaw"] = null;
      if (from && to) {
        const { data, error } = await client
          .from("complaints")
          .select("status")
          .gte("created_at", from)
          .lte("created_at", to + "T23:59:59Z");
        if (error) throw new ServiceError("Failed to load complaints", { cause: error });
        complaintsRaw = (data ?? []) as AnnualReviewRawData["complaintsRaw"];
      }

      // 3.9 food fraud + food defence (latest)
      const { data: ffRaw } = await client
        .from("haccp_food_fraud_assessments")
        .select("version, issue_date, next_review_date")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: fdRaw } = await client
        .from("haccp_food_defence_plans")
        .select("version, issue_date, next_review_date")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        staffRaw: (staffRaw ?? []) as AnnualReviewRawData["staffRaw"],
        allergenRaw: (allergenRaw ?? []) as AnnualReviewRawData["allergenRaw"],
        healthRaw,
        cleaningRaw,
        calibRaw: (calibRaw ?? []) as AnnualReviewRawData["calibRaw"],
        unitsRaw: (unitsRaw ?? []) as AnnualReviewRawData["unitsRaw"],
        tempsRaw: (tempsRaw ?? []) as AnnualReviewRawData["tempsRaw"],
        deliveryTempsRaw,
        suppliersRaw: (suppliersRaw ?? []) as AnnualReviewRawData["suppliersRaw"],
        specsRaw: (specsRaw ?? []) as AnnualReviewRawData["specsRaw"],
        goodsInRaw,
        caAllRaw: (caAllRaw ?? []) as AnnualReviewRawData["caAllRaw"],
        returnsRaw,
        complaintsRaw,
        ffRaw: (ffRaw ?? null) as AnnualReviewRawData["ffRaw"],
        fdRaw: (fdRaw ?? null) as AnnualReviewRawData["fdRaw"],
      };
    },

    // ── audit/heatmap ──────────────────────────────────────────────────────
    async fetchAuditHeatmap(
      from: string,
      to: string,
    ): Promise<AuditHeatmapRawData> {
      const [deliveries, coldStorageTemps, processingTemps, dailyDiary, cleaningLog, minceLog, calibrationLog] =
        await Promise.all([
          client.from("haccp_deliveries").select("date, temp_status, corrective_action_required").gte("date", from).lte("date", to),
          client.from("haccp_cold_storage_temps").select("date, session, temp_status, corrective_action_required").gte("date", from).lte("date", to),
          client.from("haccp_processing_temps").select("date, session, within_limits, corrective_action_required").gte("date", from).lte("date", to),
          client.from("haccp_daily_diary").select("date, phase, issues").gte("date", from).lte("date", to),
          client.from("haccp_cleaning_log").select("date, issues").gte("date", from).lte("date", to),
          client.from("haccp_mince_log").select("date, input_temp_pass, output_temp_pass, corrective_action").gte("date", from).lte("date", to),
          client.from("haccp_calibration_log").select("date, calibration_mode, ice_water_pass, boiling_water_pass").gte("date", from).lte("date", to),
        ]);

      return {
        deliveries: (deliveries.data ?? []) as AuditHeatmapRawData["deliveries"],
        coldStorageTemps: (coldStorageTemps.data ?? []) as AuditHeatmapRawData["coldStorageTemps"],
        processingTemps: (processingTemps.data ?? []) as AuditHeatmapRawData["processingTemps"],
        dailyDiary: (dailyDiary.data ?? []) as AuditHeatmapRawData["dailyDiary"],
        cleaningLog: (cleaningLog.data ?? []) as AuditHeatmapRawData["cleaningLog"],
        minceLog: (minceLog.data ?? []) as AuditHeatmapRawData["minceLog"],
        calibrationLog: (calibrationLog.data ?? []) as AuditHeatmapRawData["calibrationLog"],
      };
    },

    // ── audit (per section) ──────────────────────────────────────────────────
    async fetchAuditSection(
      section: string,
      from: string,
      to: string,
    ): Promise<AuditSectionRawData> {
      if (section === "deliveries") {
        const { data, error } = await client
          .from("haccp_deliveries")
          .select(`id, date, time_of_delivery, supplier, product, species, product_category, temperature_c, temp_status, covered_contaminated, contamination_notes, contamination_type, corrective_action_required, batch_number, delivery_number, born_in, reared_in, slaughter_site, cut_site, notes, allergens_identified, allergen_notes, users!submitted_by ( name )`)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: false })
          .order("time_of_delivery", { ascending: false });
        if (error) throw new ServiceError(error.message, { cause: error });
        const rows = (data ?? []) as Rows;
        const caMap = await fetchCaMap("haccp_deliveries", rows.map((d) => d.id as string), CA_FULL);
        return { section, rows, caMap };
      }

      if (section === "cold_storage") {
        const { data, error } = await client
          .from("haccp_cold_storage_temps")
          .select(`id, date, session, temperature_c, temp_status, comments, corrective_action_required, unit_id, submitted_at, users!submitted_by ( name ), haccp_cold_storage_units!unit_id ( name, unit_type, target_temp_c, max_temp_c )`)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: false })
          .order("session", { ascending: true });
        if (error) throw new ServiceError(error.message, { cause: error });
        const rows = (data ?? []) as Rows;
        const caMap = await fetchCaMap("haccp_cold_storage_temps", rows.map((t) => t.id as string), CA_FULL);
        return { section, rows, caMap };
      }

      if (section === "process_room") {
        const [tempsRes, diaryRes] = await Promise.all([
          client.from("haccp_processing_temps")
            .select(`id, date, session, product_temp_c, room_temp_c, product_within_limit, room_within_limit, within_limits, corrective_action_required, users!submitted_by ( name )`)
            .gte("date", from).lte("date", to)
            .order("date", { ascending: false }).order("session", { ascending: true }),
          client.from("haccp_daily_diary")
            .select(`id, date, phase, check_results, issues, what_did_you_do, users!submitted_by ( name )`)
            .gte("date", from).lte("date", to)
            .order("date", { ascending: false }).order("phase", { ascending: true }),
        ]);
        if (tempsRes.error) throw new ServiceError(tempsRes.error.message, { cause: tempsRes.error });
        if (diaryRes.error) throw new ServiceError(diaryRes.error.message, { cause: diaryRes.error });
        const rows = (tempsRes.data ?? []) as Rows;
        const secondaryRows = (diaryRes.data ?? []) as Rows;
        const caMap = await fetchCaMap("haccp_processing_temps", rows.map((t) => t.id as string), CA_FULL);
        const diaryCaMap = await fetchCaMap("haccp_daily_diary", secondaryRows.map((d) => d.id as string), "id, source_id, ccp_ref, deviation_description, action_taken, resolved");
        return { section, rows, secondaryRows, caMap, diaryCaMap };
      }

      if (section === "cleaning") {
        const { data, error } = await client
          .from("haccp_cleaning_log")
          .select(`id, date, time_of_clean, what_was_cleaned, issues, what_did_you_do, sanitiser_temp_c, verified_by, users!submitted_by ( name )`)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: false })
          .order("time_of_clean", { ascending: false });
        if (error) throw new ServiceError(error.message, { cause: error });
        const rows = (data ?? []) as Rows;
        const caMap = await fetchCaMap("haccp_cleaning_log", rows.map((c) => c.id as string), "id, source_id, ccp_ref, deviation_description, action_taken, product_disposition, management_verification_required, resolved, verified_at");
        return { section, rows, caMap };
      }

      if (section === "calibration") {
        const { data, error } = await client
          .from("haccp_calibration_log")
          .select(`id, date, time_of_check, thermometer_id, calibration_mode, ice_water_result_c, ice_water_pass, boiling_water_result_c, boiling_water_pass, action_taken, cert_reference, purchase_date, verified_by, users!submitted_by ( name )`)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: false })
          .order("time_of_check", { ascending: false });
        if (error) throw new ServiceError(error.message, { cause: error });
        const rows = (data ?? []) as Rows;
        const caMap = await fetchCaMap("haccp_calibration_log", rows.map((c) => c.id as string), "id, source_id, ccp_ref, deviation_description, action_taken, product_disposition, management_verification_required, resolved, verified_at");
        return { section, rows, caMap };
      }

      if (section === "mince") {
        const { data, error } = await client
          .from("haccp_mince_log")
          .select(`id, date, time_of_production, batch_code, product_species, output_mode, kill_date, days_from_kill, kill_date_within_limit, input_temp_c, output_temp_c, input_temp_pass, output_temp_pass, corrective_action, source_batch_numbers, users!submitted_by ( name )`)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: false })
          .order("time_of_production", { ascending: false });
        if (error) throw new ServiceError(error.message, { cause: error });
        const rows = (data ?? []) as Rows;
        const caMap = await fetchCaMap("haccp_mince_log", rows.map((r) => r.id as string), "id, source_id, ccp_ref, deviation_description, action_taken, product_disposition, management_verification_required, resolved, verified_at");
        return { section, rows, caMap };
      }

      if (section === "returns") {
        const { data, error } = await client
          .from("haccp_returns")
          .select(`id, date, time_of_return, customer, product, return_code, return_code_notes, temperature_c, disposition, never_resell_reason, corrective_action, source_batch_number, verified_by, users!submitted_by ( name )`)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: false });
        if (error) throw new ServiceError(error.message, { cause: error });
        return { section, rows: (data ?? []) as Rows };
      }

      if (section === "ccas") {
        const { data, error } = await client
          .from("haccp_corrective_actions")
          .select(`id, submitted_at, source_table, source_id, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, management_verification_required, resolved, verified_at, actioned_by_user:users!actioned_by ( name ), verified_by_user:users!verified_by ( name )`)
          .gte("submitted_at", from + "T00:00:00").lte("submitted_at", to + "T23:59:59")
          .order("submitted_at", { ascending: false });
        if (error) throw new ServiceError(error.message, { cause: error });
        return { section, rows: (data ?? []) as Rows };
      }

      if (section === "reviews") {
        const [weeklyRes, monthlyRes] = await Promise.all([
          client.from("haccp_weekly_review")
            .select("id, week_ending, date, assessments, users!submitted_by ( name )")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_monthly_review")
            .select("id, month_year, date, equipment_checks, facilities_checks, haccp_system_review, further_notes, users!submitted_by ( name )")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
        ]);
        return {
          section,
          rows: (weeklyRes.data ?? []) as Rows,
          secondaryRows: (monthlyRes.data ?? []) as Rows,
        };
      }

      if (section === "health") {
        const { data, error } = await client
          .from("haccp_health_records")
          .select(`id, date, record_type, staff_name, visitor_name, visitor_company, visitor_reason, fit_for_work, exclusion_reason, illness_type, absence_from, absence_to, symptom_free_48h, medical_certificate_provided, manager_signed_name, users!submitted_by ( name )`)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: false });
        if (error) throw new ServiceError(error.message, { cause: error });
        return { section, rows: (data ?? []) as Rows };
      }

      if (section === "training") {
        const [staffRes, allergenRes] = await Promise.all([
          client.from("haccp_staff_training")
            .select("id, staff_name, job_role, training_type, document_version, completion_date, refresh_date, supervisor_name, confirmation_items, submitted_at")
            .gte("completion_date", from).lte("completion_date", to)
            .order("completion_date", { ascending: false }),
          client.from("haccp_allergen_training")
            .select("id, staff_name, job_role, training_completed, certification_date, refresh_date, supervisor_name, confirmation_items, submitted_at")
            .gte("certification_date", from).lte("certification_date", to)
            .order("certification_date", { ascending: false }),
        ]);
        return {
          section,
          rows: (staffRes.data ?? []) as Rows,
          secondaryRows: (allergenRes.data ?? []) as Rows,
        };
      }

      // Unknown section — return empty rows; the service maps to the 400-equivalent.
      return { section, rows: [] };
    },

    // ── audit/export ───────────────────────────────────────────────────────
    async fetchAuditExportData(
      from: string,
      to: string,
    ): Promise<AuditExportRawData> {
      const [deliveriesRes, coldRes, tempsRes, diaryRes, cleaningRes, calRes, minceRes, returnsRes, casRes, weeklyRes, monthlyRes, healthRes, staffRes, allergenRes] =
        await Promise.all([
          client.from("haccp_deliveries")
            .select(`id, date, time_of_delivery, supplier, product, species, product_category, temperature_c, temp_status, covered_contaminated, contamination_notes, contamination_type, corrective_action_required, batch_number, delivery_number, born_in, reared_in, slaughter_site, cut_site, notes, allergens_identified, allergen_notes, users!submitted_by ( name )`)
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_cold_storage_temps")
            .select(`id, date, session, temperature_c, temp_status, comments, submitted_at, users!submitted_by ( name ), haccp_cold_storage_units!unit_id ( name, unit_type, target_temp_c, max_temp_c )`)
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_processing_temps")
            .select("id, date, session, product_temp_c, room_temp_c, product_within_limit, room_within_limit, within_limits, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_daily_diary")
            .select("id, date, phase, check_results, issues, what_did_you_do, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_cleaning_log")
            .select("id, date, time_of_clean, what_was_cleaned, issues, what_did_you_do, sanitiser_temp_c, verified_by, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_calibration_log")
            .select("id, date, time_of_check, thermometer_id, calibration_mode, ice_water_result_c, ice_water_pass, boiling_water_result_c, boiling_water_pass, action_taken, cert_reference, purchase_date, verified_by, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_mince_log")
            .select("id, date, time_of_production, batch_code, product_species, output_mode, kill_date, days_from_kill, kill_date_within_limit, input_temp_c, output_temp_c, input_temp_pass, output_temp_pass, corrective_action, source_batch_numbers, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_returns")
            .select("date, time_of_return, customer, product, return_code, temperature_c, disposition, corrective_action, source_batch_number, verified_by, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_corrective_actions")
            .select("submitted_at, source_table, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, management_verification_required, resolved, verified_at, actioned_by_user:users!actioned_by(name)")
            .gte("submitted_at", from + "T00:00:00").lte("submitted_at", to + "T23:59:59")
            .order("submitted_at", { ascending: false }),
          client.from("haccp_weekly_review")
            .select("week_ending, assessments, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_monthly_review")
            .select("month_year, equipment_checks, facilities_checks, haccp_system_review, further_notes, users!submitted_by(name)")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_health_records")
            .select("date, record_type, staff_name, visitor_name, visitor_company, fit_for_work, exclusion_reason, illness_type, absence_from, absence_to, manager_signed_name")
            .gte("date", from).lte("date", to).order("date", { ascending: false }),
          client.from("haccp_staff_training")
            .select("staff_name,job_role,training_type,document_version,completion_date,refresh_date,supervisor_name")
            .gte("completion_date", from).lte("completion_date", to).order("completion_date", { ascending: false }),
          client.from("haccp_allergen_training")
            .select("staff_name,job_role,training_completed,certification_date,refresh_date,supervisor_name,confirmation_items")
            .gte("certification_date", from).lte("certification_date", to).order("certification_date", { ascending: false }),
        ]);

      const deliveries = (deliveriesRes.data ?? []) as Rows;
      const coldStorage = (coldRes.data ?? []) as Rows;
      const processTemps = (tempsRes.data ?? []) as Rows;
      const cleaning = (cleaningRes.data ?? []) as Rows;
      const calibration = (calRes.data ?? []) as Rows;
      const mince = (minceRes.data ?? []) as Rows;

      const [deliveriesCa, coldStorageCa, processTempsCa, cleaningCa, calibrationCa, minceCa] =
        await Promise.all([
          fetchCaMap("haccp_deliveries", deliveries.map((d) => d.id as string), CA_EXPORT),
          fetchCaMap("haccp_cold_storage_temps", coldStorage.map((t) => t.id as string), CA_EXPORT),
          fetchCaMap("haccp_processing_temps", processTemps.map((t) => t.id as string), CA_EXPORT),
          fetchCaMap("haccp_cleaning_log", cleaning.map((c) => c.id as string), CA_EXPORT_LITE),
          fetchCaMap("haccp_calibration_log", calibration.map((c) => c.id as string), CA_EXPORT_LITE),
          fetchCaMap("haccp_mince_log", mince.map((r) => r.id as string), CA_EXPORT_LITE),
        ]);

      return {
        deliveries,
        deliveriesCa,
        coldStorage,
        coldStorageCa,
        processTemps,
        processTempsCa,
        diary: (diaryRes.data ?? []) as Rows,
        cleaning,
        cleaningCa,
        calibration,
        calibrationCa,
        mince,
        minceCa,
        returns: (returnsRes.data ?? []) as Rows,
        cas: (casRes.data ?? []) as Rows,
        weekly: (weeklyRes.data ?? []) as Rows,
        monthly: (monthlyRes.data ?? []) as Rows,
        health: (healthRes.data ?? []) as Rows,
        staffTraining: (staffRes.data ?? []) as Rows,
        allergenTraining: (allergenRes.data ?? []) as Rows,
      };
    },
  };
}

export const supabaseHaccpReportingRepository: HaccpReportingRepository =
  createSupabaseHaccpReportingRepository(supabaseService);
