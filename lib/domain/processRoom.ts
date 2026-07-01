/**
 * lib/domain/processRoom.ts
 *
 * Single source of truth for process-room (CCP 3 + SOP 1) corrective-action
 * causes, the number-pad entry-bound sanity check, and — the improvement over
 * cold-storage — the pass/amber/critical BAND derivation. Pure TypeScript — no
 * framework or vendor imports.
 *
 * The cause list is consumed by BOTH the screen
 * (`app/haccp/process-room/page.tsx` → PROCESS_ROOM_CAUSES) AND the server
 * (`lib/services/HaccpDailyChecksService.ts`), so they can never drift apart —
 * the same duplication that once let legitimate cold-storage causes be rejected.
 *
 * The band helper is likewise shared by BOTH the client screen (to colour the
 * tiles) AND the server service (to persist the band), so the traffic-light rule
 * has exactly one definition.
 *
 * The entry bound (−50 °C … +50 °C inclusive) is a fat-finger guard on the
 * number pad — wider than cold-storage's −40…+30 because the room-ambient point
 * can legitimately read warmer. It does NOT touch band classification.
 */

/** Corrective-action cause options for a CCP 3 deviation (7). */
export const PROCESS_ROOM_CAUSES = [
  "A/C or cooling failure",
  "Doors left open",
  "Product held in room too long",
  "Batch too large",
  "Equipment failure",
  "Power interruption",
  "Other",
] as const;

export type ProcessRoomCause = (typeof PROCESS_ROOM_CAUSES)[number];

/** Inclusive lower/upper sanity bound for a manual temperature entry (°C). */
export const PROCESS_ROOM_MIN_TEMP_C = -50;
export const PROCESS_ROOM_MAX_TEMP_C = 50;

/** True when `temp` is a finite number within [MIN, MAX] inclusive. */
export function isProcessRoomTempInRange(temp: number): boolean {
  return (
    Number.isFinite(temp) &&
    temp >= PROCESS_ROOM_MIN_TEMP_C &&
    temp <= PROCESS_ROOM_MAX_TEMP_C
  );
}

/**
 * A configurable pass/amber/critical threshold row for a process-room
 * measurement point (Product core / Room ambient), sourced from
 * `haccp_process_room_thresholds`.
 */
export interface ProcessRoomThreshold {
  readonly id: string;
  readonly name: string;
  readonly target_temp_c: number;
  readonly max_temp_c: number;
  readonly active?: boolean;
  readonly position?: number;
}

/**
 * Traffic-light rule shared by the screen and the server:
 *   temp <= target           → pass    (green)
 *   target < temp <= max      → amber
 *   temp > max                → critical (red)
 */
export function processRoomBand(
  temp: number,
  targetC: number,
  maxC: number,
): "pass" | "amber" | "critical" {
  return temp <= targetC ? "pass" : temp <= maxC ? "amber" : "critical";
}
