/**
 * lib/domain/HaccpAlarm.ts
 *
 * Owned domain types for the HACCP overdue-alarm cron (F-25).
 *
 * Pure TypeScript — no vendor import, no framework import. The alarm cron used
 * to read four HACCP tables inline against the raw Supabase client and shape
 * the overdue status in the route; now the raw reads return this owned input
 * shape and ALL nowHour-threshold inference lives in the reporting service.
 *
 * `AlarmOverdueInputs` is the raw-ish result of the four reads the cron does
 * today (cold sessions, room sessions, diary phases for `today`, + the
 * unresolved-CA count). The adapter runs the Promise.all and returns these
 * arrays/count verbatim; the service maps them to the overdue status shape the
 * `getOverdueItems` helper consumes.
 */

/** The four raw reads the alarm cron does today, returned by the reporting
 *  adapter's `fetchAlarmOverdueInputs(today)`. */
export interface AlarmOverdueInputs {
  /** `session` values from haccp_cold_storage_temps where date = today ('AM' | 'PM'). */
  readonly coldSessions: readonly string[];
  /** `session` values from haccp_processing_temps where date = today. */
  readonly roomSessions: readonly string[];
  /** `phase` values from haccp_daily_diary where date = today ('opening' | 'closing' | …). */
  readonly diaryPhases: readonly string[];
  /** Count of haccp_corrective_actions where resolved = false. */
  readonly unresolvedCas: number;
}
