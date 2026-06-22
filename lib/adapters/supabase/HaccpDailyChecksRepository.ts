/**
 * lib/adapters/supabase/HaccpDailyChecksRepository.ts
 *
 * Supabase implementation of `HaccpDailyChecksRepository`
 * (lib/ports/HaccpDailyChecksRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the `lib/adapters/supabase`
 * tree at `.eslintrc.json`). The ONLY file that imports the vendor SDK for the
 * 7 daily-check tables.
 *
 * Boundary discipline (ADR-0002 line 27): every `.select(…)` column list and
 * every insert payload key-set is copied VERBATIM from the 7 route files the PR2
 * re-point will replace, so the wire output stays byte-identical. The persist
 * payloads arrive from the service already shaped exactly as the routes build
 * them — the adapter only forwards them.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpDailyChecksRepository(client)` factory.
 *   - `supabaseHaccpDailyChecksRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract: reads return []/null on miss; every DB failure throws
 * ServiceError; `23505` (unique_violation) maps to ConflictError on every insert
 * that has a clean 409 path in the route today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError, ConflictError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  DeliveryListResult,
  DeliveryRange,
  DeliveryRow,
  DeliverySupplierRow,
  DeliverySupplier,
  DeliveryPersist,
  ColdStorageListResult,
  ColdStorageUnit,
  ColdStorageReading,
  ColdStoragePersist,
  ColdStorageInsertedRow,
  CalibrationRecord,
  CalibrationCertifiedPersist,
  CalibrationManualPersist,
  CleaningEntry,
  CleaningPersist,
  ProcessRoomListResult,
  ProcessingTempRow,
  DailyDiaryRow,
  ProcessingTempPersist,
  DailyDiaryPersist,
  MincePrepListResult,
  MinceLogRow,
  MeatPrepLogRow,
  TimeSeparationRow,
  MincePrepDeliveryRow,
  MinceBatchSummary,
  MincePersist,
  MeatPrepPersist,
  TimeSeparationPersist,
  ReturnRow,
  ReturnPersist,
} from "@/lib/domain";
import type { HaccpDailyChecksRepository } from "@/lib/ports";

// ─── verbatim select strings (the byte-identity anchor) ──────────────────────

const DELIVERY_COLS = `
        id, date, time_of_delivery, supplier, product, product_category, species,
        temperature_c, temp_status, covered_contaminated, contamination_notes, notes,
        born_in, reared_in, slaughter_site, cut_site, batch_number, delivery_number,
        allergens_identified, allergen_notes,
        submitted_at, users!inner(name)
      `;

const CALIBRATION_COLS = `
        id, date, time_of_check, thermometer_id,
        calibration_mode, cert_reference, purchase_date,
        ice_water_result_c, ice_water_pass,
        boiling_water_result_c, boiling_water_pass,
        action_taken, verified_by, submitted_at,
        users!inner(name)
      `;

const CLEANING_COLS = `
        id,
        date,
        time_of_clean,
        what_was_cleaned,
        issues,
        what_did_you_do,
        verified_by,
        sanitiser_temp_c,
        submitted_at,
        submitted_by,
        users!inner(name)
      `;

const RETURN_COLS = `
        id, date, time_of_return, customer, product,
        temperature_c, return_code, return_code_notes,
        disposition, corrective_action, verified_by, submitted_at,
        users!inner(name)
      `;

// mince-prep: copy the multi-line template literals verbatim (route lines 202-213).
const MINCE_SELECT = `id, date, time_of_production, batch_code, product_species, kill_date,
                     days_from_kill, kill_date_within_limit, input_temp_c, output_temp_c,
                     input_temp_pass, output_temp_pass, output_mode,
                     source_batch_numbers, corrective_action, submitted_at, users!inner(name)`;
const MEATPREP_SELECT = `id, date, time_of_production, batch_code, product_name, product_species,
                     kill_date, days_from_kill, input_temp_c, output_temp_c,
                     input_temp_pass, output_temp_pass, output_mode,
                     allergens_present, label_check_completed,
                     source_batch_numbers, corrective_action, submitted_at, users!inner(name)`;
const TIMESEP_SELECT = `id, date, time_of_entry, plain_products_end_time, clean_completed_time,
                     allergen_products_start_time, clean_verified_by, allergens_in_production,
                     corrective_action, submitted_at, users!inner(name)`;
const MINCEPREP_DELIVERY_SELECT = `id, supplier, product, product_category, batch_number, slaughter_site,
                 born_in, delivery_number, date, temperature_c, temp_status`;

// ─── date/week helpers (verbatim) ────────────────────────────────────────────

/** Monday of the current ISO week through today (en-CA local), per the route. */
function weekRange(today: string): { weekStart: string } {
  const d = new Date(today + "T00:00:00");
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
  return { weekStart: d.toLocaleDateString("en-CA") };
}
function lastWeekRange(today: string): {
  lastWeekStart: string;
  lastWeekEnd: string;
} {
  const start = new Date(today + "T00:00:00");
  const startDay = start.getDay() === 0 ? 7 : start.getDay();
  start.setDate(start.getDate() - (startDay - 1) - 7);
  const end = new Date(today + "T00:00:00");
  const endDay = end.getDay() === 0 ? 7 : end.getDay();
  end.setDate(end.getDate() - endDay);
  return {
    lastWeekStart: start.toLocaleDateString("en-CA"),
    lastWeekEnd: end.toLocaleDateString("en-CA"),
  };
}
function todayUK(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function nDaysAgoUK(n: number): string {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - n * 24);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function sixMonthsAgoUK(): string {
  return new Date(new Date().setMonth(new Date().getMonth() - 6)).toLocaleDateString(
    "en-CA",
    { timeZone: "Europe/London" },
  );
}

function is23505(error: { code?: string } | null): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

export function createSupabaseHaccpDailyChecksRepository(
  client: SupabaseClient,
): HaccpDailyChecksRepository {
  return {
    // ── 1. delivery ──────────────────────────────────────────
    async listDeliveries(range: DeliveryRange): Promise<DeliveryListResult> {
      const today = todayUK();
      const { weekStart } = weekRange(today);
      const { lastWeekStart, lastWeekEnd } = lastWeekRange(today);

      const baseQuery = client.from("haccp_deliveries").select(DELIVERY_COLS);
      const [deliveries, suppliers] = await Promise.all([
        (range === "week"
          ? baseQuery.gte("date", weekStart).lte("date", today)
          : range === "last_week"
            ? baseQuery.gte("date", lastWeekStart).lte("date", lastWeekEnd)
            : baseQuery.eq("date", today)
        )
          .order("date", { ascending: false })
          .order("delivery_number", { ascending: false }),
        client
          .from("haccp_suppliers")
          .select("id, name, categories")
          .eq("active", true)
          .order("name"),
      ]);

      if (deliveries.error) {
        log.error("HaccpDailyChecksRepository.listDeliveries DB error", {
          error: deliveries.error.message,
        });
        throw new ServiceError("Failed to load deliveries", {
          cause: deliveries.error,
        });
      }
      if (suppliers.error) {
        log.error("HaccpDailyChecksRepository.listDeliveries suppliers DB error", {
          error: suppliers.error.message,
        });
        throw new ServiceError("Failed to load suppliers", {
          cause: suppliers.error,
        });
      }

      const allDeliveries = (deliveries.data ??
        []) as unknown as DeliveryRow[];
      const nextNumber =
        allDeliveries.filter((d) => d.date === today).length + 1;

      return {
        date: today,
        deliveries: allDeliveries,
        suppliers: (suppliers.data ?? []) as unknown as DeliverySupplierRow[],
        next_number: nextNumber,
      };
    },

    async findSupplierForDelivery(
      supplierId: string,
    ): Promise<DeliverySupplier | null> {
      const { data, error } = await client
        .from("haccp_suppliers")
        .select("id, name, active")
        .eq("id", supplierId)
        .single();
      // The route treats (supErr || !sup) as "Unknown supplier" → null here.
      if (error || !data) return null;
      return data as unknown as DeliverySupplier;
    },

    async countDeliveriesOn(date: string): Promise<number> {
      const { count, error } = await client
        .from("haccp_deliveries")
        .select("*", { count: "exact", head: true })
        .eq("date", date);
      if (error) {
        log.error("HaccpDailyChecksRepository.countDeliveriesOn DB error", {
          error: error.message,
        });
        throw new ServiceError("Count failed", { cause: error });
      }
      return count ?? 0;
    },

    async insertDelivery(payload: DeliveryPersist): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_deliveries")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        if (is23505(error)) {
          throw new ConflictError(
            "Another delivery was logged at the same moment. Please retry.",
          );
        }
        log.error("HaccpDailyChecksRepository.insertDelivery DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },

    // ── 2. cold-storage ──────────────────────────────────────
    async listColdStorage(date: string): Promise<ColdStorageListResult> {
      const [units, readings] = await Promise.all([
        client
          .from("haccp_cold_storage_units")
          .select("id, name, unit_type, target_temp_c, max_temp_c")
          .eq("active", true)
          .order("position"),
        client
          .from("haccp_cold_storage_temps")
          .select("unit_id, session, temperature_c, temp_status, comments")
          .eq("date", date),
      ]);

      if (units.error) {
        log.error("HaccpDailyChecksRepository.listColdStorage units DB error", {
          error: units.error.message,
        });
        throw new ServiceError("Failed to load units", { cause: units.error });
      }
      // The route only 500s on units.error; readings.error falls through to [].
      return {
        units: (units.data ?? []) as unknown as ColdStorageUnit[],
        readings: (readings.data ?? []) as unknown as ColdStorageReading[],
        date,
      };
    },

    async listActiveColdStorageUnits(): Promise<readonly ColdStorageUnit[]> {
      const { data, error } = await client
        .from("haccp_cold_storage_units")
        .select("id, name, unit_type, target_temp_c, max_temp_c")
        .eq("active", true);
      if (error) {
        log.error(
          "HaccpDailyChecksRepository.listActiveColdStorageUnits DB error",
          { error: error.message },
        );
        throw new ServiceError("Could not load active units", { cause: error });
      }
      return (data ?? []) as unknown as ColdStorageUnit[];
    },

    async insertColdStorageReadings(
      rows: readonly ColdStoragePersist[],
    ): Promise<readonly ColdStorageInsertedRow[]> {
      const { data, error } = await client
        .from("haccp_cold_storage_temps")
        .insert(rows as unknown as Record<string, unknown>[])
        .select("id, unit_id, temperature_c, temp_status");
      if (error || !data) {
        if (is23505(error)) {
          throw new ConflictError(
            "This session has already been submitted for one or more units.",
          );
        }
        log.error(
          "HaccpDailyChecksRepository.insertColdStorageReadings DB error",
          { error: error?.message },
        );
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no rows returned"),
        });
      }
      return data as unknown as ColdStorageInsertedRow[];
    },

    // ── 3. calibration ───────────────────────────────────────
    async listCalibration(): Promise<readonly CalibrationRecord[]> {
      const { data, error } = await client
        .from("haccp_calibration_log")
        .select(CALIBRATION_COLS)
        .gte("date", sixMonthsAgoUK())
        .order("submitted_at", { ascending: false });
      if (error) {
        log.error("HaccpDailyChecksRepository.listCalibration DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load calibration log", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as CalibrationRecord[];
    },

    async insertCalibrationCertified(
      payload: CalibrationCertifiedPersist,
    ): Promise<void> {
      const { error } = await client
        .from("haccp_calibration_log")
        .insert(payload as unknown as Record<string, unknown>);
      if (error) {
        log.error(
          "HaccpDailyChecksRepository.insertCalibrationCertified DB error",
          { error: error.message },
        );
        throw new ServiceError("Insert failed", { cause: error });
      }
    },

    async insertCalibrationManual(
      payload: CalibrationManualPersist,
    ): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_calibration_log")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        log.error(
          "HaccpDailyChecksRepository.insertCalibrationManual DB error",
          { error: error?.message },
        );
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },

    // ── 4. cleaning ──────────────────────────────────────────
    async listCleaning(): Promise<readonly CleaningEntry[]> {
      const today = todayUK();
      const { data, error } = await client
        .from("haccp_cleaning_log")
        .select(CLEANING_COLS)
        .eq("date", today)
        .order("submitted_at", { ascending: false });
      if (error) {
        log.error("HaccpDailyChecksRepository.listCleaning DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load cleaning log", { cause: error });
      }
      return (data ?? []) as unknown as CleaningEntry[];
    },

    async insertCleaning(payload: CleaningPersist): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_cleaning_log")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        log.error("HaccpDailyChecksRepository.insertCleaning DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },

    // ── 5. process-room ──────────────────────────────────────
    async listProcessRoom(date: string): Promise<ProcessRoomListResult> {
      const [temps, diary] = await Promise.all([
        client
          .from("haccp_processing_temps")
          .select(
            "session, product_temp_c, room_temp_c, product_within_limit, room_within_limit, within_limits, submitted_at",
          )
          .eq("date", date)
          .order("submitted_at"),
        client
          .from("haccp_daily_diary")
          .select("phase, check_results, issues, what_did_you_do, submitted_at")
          .eq("date", date)
          .order("submitted_at"),
      ]);

      if (temps.error) {
        log.error("HaccpDailyChecksRepository.listProcessRoom temps DB error", {
          error: temps.error.message,
        });
        throw new ServiceError("Failed to load processing temps", {
          cause: temps.error,
        });
      }
      if (diary.error) {
        log.error("HaccpDailyChecksRepository.listProcessRoom diary DB error", {
          error: diary.error.message,
        });
        throw new ServiceError("Failed to load diary", { cause: diary.error });
      }

      return {
        date,
        temps: (temps.data ?? []) as unknown as ProcessingTempRow[],
        diary: (diary.data ?? []) as unknown as DailyDiaryRow[],
      };
    },

    async insertProcessingTemp(
      payload: ProcessingTempPersist,
    ): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_processing_temps")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        if (is23505(error)) {
          throw new ConflictError(
            `This ${payload.session} check has already been submitted for today.`,
          );
        }
        log.error("HaccpDailyChecksRepository.insertProcessingTemp DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },

    async insertDailyDiary(
      payload: DailyDiaryPersist,
    ): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_daily_diary")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        if (is23505(error)) {
          const phase = payload.phase;
          throw new ConflictError(
            `${phase[0].toUpperCase() + phase.slice(1)} checks have already been submitted for today.`,
          );
        }
        log.error("HaccpDailyChecksRepository.insertDailyDiary DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },

    // ── 6. mince-prep ────────────────────────────────────────
    async listMincePrep(range: DeliveryRange): Promise<MincePrepListResult> {
      const today = todayUK();
      const since16 = nDaysAgoUK(16);
      const { weekStart } = weekRange(today);
      const { lastWeekStart, lastWeekEnd } = lastWeekRange(today);

      const [mince, meatprep, timesep, deliveries] = await Promise.all([
        (range === "week"
          ? client
              .from("haccp_mince_log")
              .select(MINCE_SELECT)
              .gte("date", weekStart)
              .lte("date", today)
          : range === "last_week"
            ? client
                .from("haccp_mince_log")
                .select(MINCE_SELECT)
                .gte("date", lastWeekStart)
                .lte("date", lastWeekEnd)
            : client.from("haccp_mince_log").select(MINCE_SELECT).eq("date", today)
        )
          .order("date", { ascending: false })
          .order("submitted_at", { ascending: false }),

        (range === "week"
          ? client
              .from("haccp_meatprep_log")
              .select(MEATPREP_SELECT)
              .gte("date", weekStart)
              .lte("date", today)
          : range === "last_week"
            ? client
                .from("haccp_meatprep_log")
                .select(MEATPREP_SELECT)
                .gte("date", lastWeekStart)
                .lte("date", lastWeekEnd)
            : client
                .from("haccp_meatprep_log")
                .select(MEATPREP_SELECT)
                .eq("date", today)
        )
          .order("date", { ascending: false })
          .order("submitted_at", { ascending: false }),

        (range === "week"
          ? client
              .from("haccp_time_separation_log")
              .select(TIMESEP_SELECT)
              .gte("date", weekStart)
              .lte("date", today)
          : range === "last_week"
            ? client
                .from("haccp_time_separation_log")
                .select(TIMESEP_SELECT)
                .gte("date", lastWeekStart)
                .lte("date", lastWeekEnd)
            : client
                .from("haccp_time_separation_log")
                .select(TIMESEP_SELECT)
                .eq("date", today)
        )
          .order("date", { ascending: false })
          .order("submitted_at", { ascending: false }),

        client
          .from("haccp_deliveries")
          .select(MINCEPREP_DELIVERY_SELECT)
          .gte("date", since16)
          .not("batch_number", "is", null)
          .order("date", { ascending: false })
          .order("delivery_number", { ascending: true }),
      ]);

      if (mince.error) {
        log.error("HaccpDailyChecksRepository.listMincePrep mince DB error", {
          error: mince.error.message,
        });
        throw new ServiceError("Failed to load mince log", {
          cause: mince.error,
        });
      }
      if (meatprep.error) {
        log.error("HaccpDailyChecksRepository.listMincePrep meatprep DB error", {
          error: meatprep.error.message,
        });
        throw new ServiceError("Failed to load meatprep log", {
          cause: meatprep.error,
        });
      }
      if (timesep.error) {
        log.error("HaccpDailyChecksRepository.listMincePrep timesep DB error", {
          error: timesep.error.message,
        });
        throw new ServiceError("Failed to load timesep log", {
          cause: timesep.error,
        });
      }
      if (deliveries.error) {
        log.error(
          "HaccpDailyChecksRepository.listMincePrep deliveries DB error",
          { error: deliveries.error.message },
        );
        throw new ServiceError("Failed to load deliveries", {
          cause: deliveries.error,
        });
      }

      const minceRows = (mince.data ?? []) as unknown as MinceLogRow[];
      const minceBatches: MinceBatchSummary[] = minceRows.map((r) => ({
        id: r.id,
        batch_code: r.batch_code,
        species: r.product_species,
        kill_date: r.kill_date,
        output_mode: r.output_mode,
        submitted_at: r.submitted_at,
      }));

      return {
        date: today,
        mince: minceRows,
        meatprep: (meatprep.data ?? []) as unknown as MeatPrepLogRow[],
        timesep: (timesep.data ?? []) as unknown as TimeSeparationRow[],
        deliveries: (deliveries.data ??
          []) as unknown as MincePrepDeliveryRow[],
        mince_batches: minceBatches,
      };
    },

    async countMinceRuns(
      table: "haccp_mince_log" | "haccp_meatprep_log",
      date: string,
    ): Promise<number> {
      const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("date", date);
      if (error) {
        log.error("HaccpDailyChecksRepository.countMinceRuns DB error", {
          table,
          error: error.message,
        });
        throw new ServiceError("Count failed", { cause: error });
      }
      return count ?? 0;
    },

    async insertMince(payload: MincePersist): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_mince_log")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        if (is23505(error)) {
          throw new ConflictError(
            "Duplicate submission — batch code already exists today",
          );
        }
        log.error("HaccpDailyChecksRepository.insertMince DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },

    async insertMeatPrep(payload: MeatPrepPersist): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_meatprep_log")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        if (is23505(error)) {
          throw new ConflictError(
            "Duplicate submission — batch code already exists today",
          );
        }
        log.error("HaccpDailyChecksRepository.insertMeatPrep DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },

    async insertTimeSeparation(
      payload: TimeSeparationPersist,
    ): Promise<void> {
      const { error } = await client
        .from("haccp_time_separation_log")
        .insert(payload as unknown as Record<string, unknown>);
      if (error) {
        log.error("HaccpDailyChecksRepository.insertTimeSeparation DB error", {
          error: error.message,
        });
        throw new ServiceError("Insert failed", { cause: error });
      }
    },

    // ── 7. product-return ────────────────────────────────────
    async listReturns(): Promise<readonly ReturnRow[]> {
      const today = todayUK();
      const { data, error } = await client
        .from("haccp_returns")
        .select(RETURN_COLS)
        .eq("date", today)
        .order("submitted_at", { ascending: false });
      if (error) {
        log.error("HaccpDailyChecksRepository.listReturns DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load returns", { cause: error });
      }
      return (data ?? []) as unknown as ReturnRow[];
    },

    async insertReturn(payload: ReturnPersist): Promise<{ id: string }> {
      const { data, error } = await client
        .from("haccp_returns")
        .insert(payload as unknown as Record<string, unknown>)
        .select("id")
        .single();
      if (error || !data) {
        log.error("HaccpDailyChecksRepository.insertReturn DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return { id: (data as { id: string }).id };
    },
  };
}

export const supabaseHaccpDailyChecksRepository: HaccpDailyChecksRepository =
  createSupabaseHaccpDailyChecksRepository(supabaseService);
