/**
 * lib/domain/goodsIn.ts
 *
 * Single source of truth for the Goods In (CCP 1) delivery-intake temperature
 * band rule. Pure TypeScript — no framework or vendor imports
 * (`processRoom.ts` twin).
 *
 * The band rule is consumed by BOTH the screen
 * (`app/haccp/delivery/page.tsx` — live verdict tile + chip copy) AND the
 * server (`lib/services/HaccpDailyChecksService.ts` — the persisted
 * `temp_status`), so the two can never drift apart. The duplicated hardcoded
 * band tables this file replaces once let poultry pass at ≤8°C when the legal
 * limit is ≤4°C.
 *
 * Band VALUES live in `haccp_goods_in_thresholds` (admin-edited, audit-logged)
 * — this module holds only the RULE. There are deliberately no band literals
 * here: resolution is FAIL-CLOSED (a missing category row throws; callers must
 * never substitute a hardcoded or looser ruler).
 *
 * Status strings are the existing DB values `pass` / `urgent` / `fail`
 * (urgent = amber / conditional accept) — do NOT rename them.
 */

/**
 * A configurable Goods In band row for one product category, sourced from
 * `haccp_goods_in_thresholds`.
 *
 * - `pass_max_c === null` → the category has NO temperature CCP (dry goods):
 *   every delivery passes on temperature.
 * - `amber_max_c === null` (with a non-null `pass_max_c`) → no amber band:
 *   `pass_max_c` is the hard reject line.
 */
export interface GoodsInThreshold {
  readonly id: string;
  readonly category: string;
  readonly label: string;
  readonly pass_max_c: number | null;
  readonly amber_max_c: number | null;
  readonly position?: number;
}

/**
 * Admin PATCH body for a Goods In threshold row. Only the numbers move — the
 * band STRUCTURE (which categories have an amber band / a temperature CCP at
 * all) is code-locked: a value's null-ness cannot be changed via the app.
 */
export interface UpdateGoodsInThresholdInput {
  readonly id: string;
  readonly pass_max_c: number | null;
  readonly amber_max_c: number | null;
}

/**
 * Resolve the threshold row for a category, strictly BY KEY — FAIL CLOSED.
 * A missing row is a food-safety fault, not something to paper over: we throw
 * (→ route 500 / disabled entry) rather than grade against another category's
 * limits or a hardcoded fallback, either of which could false-pass a CCP.
 */
export function resolveGoodsInThreshold(
  thresholds: readonly GoodsInThreshold[],
  category: string,
): GoodsInThreshold {
  const row = thresholds.find((t) => t.category === category);
  if (!row) {
    throw new Error(
      `Goods In threshold missing for category: ${category} — refusing to grade (fail-closed)`,
    );
  }
  return row;
}

/**
 * The shared CCP-1 traffic-light rule (DB values in, verdict out):
 *   no temperature CCP (pass_max null)      → pass
 *   temp null / NaN                          → fail   (server semantics — the
 *                                              screen keeps its own "no temp
 *                                              typed yet → no verdict" pre-check
 *                                              BEFORE calling this)
 *   temp <= pass_max                         → pass
 *   amber_max set && temp <= amber_max       → urgent (conditional accept, CA)
 *   otherwise                                → fail   (reject)
 */
export function goodsInStatus(
  temp: number | null,
  t: GoodsInThreshold,
): "pass" | "urgent" | "fail" {
  if (t.pass_max_c === null) return "pass";
  if (temp === null || Number.isNaN(temp)) return "fail";
  if (temp <= Number(t.pass_max_c)) return "pass";
  if (t.amber_max_c !== null && temp <= Number(t.amber_max_c)) return "urgent";
  return "fail";
}

/**
 * Human copy for a category chip / numpad header, derived from the row values
 * so an admin threshold edit self-updates the wording everywhere.
 */
export function describeGoodsInBands(t: GoodsInThreshold): {
  limit: string;
  detail: string;
} {
  if (t.pass_max_c === null) {
    return {
      limit: "Ambient",
      detail: "No temperature CCP — visual / condition check only",
    };
  }
  const p = Number(t.pass_max_c);
  if (t.amber_max_c === null) {
    return {
      limit: `≤${p}°C`,
      detail: `≤${p}°C pass · >${p}°C reject`,
    };
  }
  const a = Number(t.amber_max_c);
  // En dash reads fine between positive values (5–8°C); "to" avoids the
  // unreadable "-18–-15°C" when a bound is negative.
  const range = p < 0 || a < 0 ? `${p} to ${a}` : `${p}–${a}`;
  return {
    limit: `≤${a}°C (target ≤${p}°C)`,
    detail: `≤${p}°C pass · ${range}°C conditional accept · >${a}°C reject`,
  };
}
