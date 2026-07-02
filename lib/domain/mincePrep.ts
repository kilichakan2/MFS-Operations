/**
 * lib/domain/mincePrep.ts
 *
 * Single source of truth for the Mince & Meat Prep (CCP-M1 / CCP-M2 / CCP-MP1)
 * grading rules. Pure TypeScript — no framework or vendor imports
 * (`goodsIn.ts` / `processRoom.ts` twin).
 *
 * The rules are consumed by BOTH the screen (`app/haccp/mince/page.tsx` — live
 * verdict tiles + numpad tone + chip copy) AND the server
 * (`lib/services/HaccpDailyChecksService.ts` — the persisted
 * `input_temp_pass` / `output_temp_pass` booleans and the CA fan-out), so the
 * two can never drift apart.
 *
 * Threshold VALUES live in `haccp_mince_thresholds` (admin-edited,
 * audit-logged) — this module holds only the RULE. There are deliberately no
 * band literals here: resolution is FAIL-CLOSED (a missing key throws; callers
 * must never substitute a hardcoded or looser ruler).
 *
 * ⚠️ AMBER IS DISPLAY ONLY (spec-critical — the deliberate divergence from
 * goods-in's saves-free "urgent" conditional-accept band):
 *   - `minceTempStatus` is the 3-state DISPLAY verdict (tile/badge/numpad
 *     colour). It is NOT persisted anywhere — no DB string carries it.
 *   - `minceTempPass` is THE server/persist authority: the persisted
 *     `*_temp_pass` booleans, the 400-requires-CA validation, the CCA popup
 *     trigger and the CA-register writes ALL key on it. It is deliberately
 *     blind to amber: an amber reading is pass:false ⇒ corrective action still
 *     required and filed, exactly as before the amber band existed.
 */

/**
 * A configurable mince/meat-prep threshold row, sourced from
 * `haccp_mince_thresholds`.
 *
 * - `kind: "temp"` — `pass_max` / `amber_max` are °C ceilings (amber is the
 *   display-band ceiling).
 * - `kind: "kill_days"` — `pass_max` is max days from kill; `amber_max` is
 *   always NULL (kill-day grading is BINARY, structurally — DB CHECK).
 *   `pass_max === null` → no app-enforced kill-day limit (`imported_vac`,
 *   Hakan's explicit documented deviation — register §4).
 */
export interface MinceThreshold {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly kind: "temp" | "kill_days";
  readonly pass_max: number | null;
  readonly amber_max: number | null;
  readonly position?: number;
}

/**
 * Admin PATCH body for a mince threshold row. Only the numbers move — the
 * band STRUCTURE (which rows have an amber band / a limit at all) is
 * code-locked: a value's null-ness cannot be changed via the app.
 */
export interface UpdateMinceThresholdInput {
  readonly id: string;
  readonly pass_max: number | null;
  readonly amber_max: number | null;
}

/**
 * Derive the threshold key for a temperature channel. Input channels ignore
 * the output mode; any mode string other than 'frozen' grades as chilled
 * (mirrors the persisted `output_mode ?? "chilled"` default).
 */
export function minceTempKey(
  form: "mince" | "meatprep",
  channel: "input" | "output",
  mode: string,
): string {
  const prefix = form === "mince" ? "mince" : "prep";
  if (channel === "input") return `${prefix}_input`;
  return `${prefix}_output_${mode === "frozen" ? "frozen" : "chilled"}`;
}

/**
 * Resolve the threshold row for a key, strictly BY KEY — FAIL CLOSED.
 * A missing row is a food-safety fault, not something to paper over: we throw
 * (→ route 500 / disabled entry) rather than grade against another channel's
 * limits or a hardcoded fallback, either of which could false-pass a CCP.
 */
export function resolveMinceThreshold(
  thresholds: readonly MinceThreshold[],
  key: string,
): MinceThreshold {
  const row = thresholds.find((t) => t.key === key);
  if (!row) {
    throw new Error(
      `Mince/prep threshold missing for key: ${key} — refusing to grade (fail-closed)`,
    );
  }
  return row;
}

/**
 * The 3-state DISPLAY verdict (DB values in, colour out):
 *   temp null / NaN                     → fail
 *   temp <= pass_max                    → pass
 *   amber_max set && temp <= amber_max  → amber (warning COLOUR only)
 *   otherwise                           → fail
 *
 * NOT persisted anywhere — unlike goods-in's 'urgent', no DB string carries
 * it. The paperwork path uses `minceTempPass` below.
 */
export function minceTempStatus(
  temp: number | null,
  t: MinceThreshold,
): "pass" | "amber" | "fail" {
  if (temp === null || Number.isNaN(temp)) return "fail";
  if (t.pass_max !== null && temp <= Number(t.pass_max)) return "pass";
  if (t.amber_max !== null && temp <= Number(t.amber_max)) return "amber";
  return "fail";
}

/**
 * THE persisted/paperwork rule: `minceTempStatus(...) === 'pass'`.
 * Amber ⇒ false ⇒ CA required + filed (spec-critical — see header).
 */
export function minceTempPass(temp: number | null, t: MinceThreshold): boolean {
  return minceTempStatus(temp, t) === "pass";
}

/** Kill-day pass: no limit (pass_max null) → always true; else days ≤ limit. */
export function minceKillDaysPass(days: number, t: MinceThreshold): boolean {
  if (t.pass_max === null) return true;
  return days <= Number(t.pass_max);
}

/** Kill-day hard block: a limited species over its limit — DO NOT MINCE. */
export function minceKillDaysHardFail(
  days: number,
  t: MinceThreshold,
): boolean {
  return t.pass_max !== null && days > Number(t.pass_max);
}

/**
 * Human copy for a channel chip / numpad header, derived from the row values
 * so an admin threshold edit self-updates the wording everywhere. The
 * "warning" band is display-only — the copy calls anything above the pass
 * line a deviation band or warning band, never a softer acceptance.
 */
export function describeMinceBand(t: MinceThreshold): {
  limit: string;
  detail: string;
} {
  if (t.kind === "kill_days") {
    if (t.pass_max === null) {
      return {
        limit: "No limit",
        detail: "no kill-day limit — recorded for traceability",
      };
    }
    const d = Number(t.pass_max);
    return { limit: `max ${d} days`, detail: `max ${d} days from kill` };
  }
  const p = Number(t.pass_max);
  if (t.amber_max === null || Number(t.amber_max) === p) {
    return {
      limit: `≤${p}°C`,
      detail: `≤${p}°C pass · >${p}°C deviation`,
    };
  }
  const a = Number(t.amber_max);
  // En dash reads fine between positive values (7–8°C); "to" avoids the
  // unreadable "-18–-17°C" when a bound is negative.
  const range = p < 0 || a < 0 ? `${p} to ${a}` : `${p}–${a}`;
  return {
    limit: `≤${p}°C`,
    detail: `≤${p}°C pass · ${range}°C warning · >${a}°C deviation`,
  };
}
