/**
 * lib/domain/coldStorage.ts
 *
 * Single source of truth for cold-storage (CCP 2) corrective-action causes and
 * the number-pad entry-bound sanity check. Pure TypeScript — no framework or
 * vendor imports.
 *
 * The cause list is consumed by BOTH the screen
 * (`app/haccp/cold-storage/page.tsx` → CAUSE_OPTIONS) AND the server
 * (`lib/services/HaccpDailyChecksService.ts` → VALID_COLD_STORAGE_CAUSES), so
 * they can never drift apart again — that duplication is what let two
 * legitimate causes ("Defrost cycle — scheduled temperature rise", "High
 * ambient room temperature") be rejected with a 400.
 *
 * The entry bound (−40 °C … +30 °C inclusive) is a fat-finger guard on the
 * number pad — it does NOT touch pass/amber/critical classification. A genuine
 * deviation (e.g. +12 °C in a chiller) is in-range and still allowed; only
 * physically impossible values (300, −99) are blocked.
 */

/** Corrective-action cause options for a CCP 2 deviation (8). */
export const COLD_STORAGE_CAUSES = [
  "Door left open",
  "Unit overloaded",
  "Seal damaged",
  "Equipment failure",
  "Power interruption",
  "Defrost cycle — scheduled temperature rise",
  "High ambient room temperature",
  "Other",
] as const;

export type ColdStorageCause = (typeof COLD_STORAGE_CAUSES)[number];

/** Inclusive lower/upper sanity bound for a manual temperature entry (°C). */
export const COLD_STORAGE_MIN_TEMP_C = -40;
export const COLD_STORAGE_MAX_TEMP_C = 30;

/** True when `temp` is a finite number within [MIN, MAX] inclusive. */
export function isColdStorageTempInRange(temp: number): boolean {
  return (
    Number.isFinite(temp) &&
    temp >= COLD_STORAGE_MIN_TEMP_C &&
    temp <= COLD_STORAGE_MAX_TEMP_C
  );
}
