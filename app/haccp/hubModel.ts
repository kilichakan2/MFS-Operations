/**
 * app/haccp/hubModel.ts
 *
 * Pure (no-React) hub logic for the HACCP kiosk landing page, extracted so the
 * tile-state inference, the overdue list, the mandatory-set checklist and the
 * per-tile SOP routing are unit-testable deterministically.
 *
 * NOTE: nothing here feeds the audio alarm. The alarm reads its own overdue
 * set via `getOverdueItems` in `lib/haccp-alarm-status.ts`, which deliberately
 * excludes the diary "operational" (mid-day) phase. Surfacing operational in
 * the UI (overdue list + room tile + mandatory set) is VISUAL ONLY and must
 * not change the alarm trigger set.
 */

import type { TileState } from '@/components/ui'

export interface TodayStatus {
  cold_storage: { am_done: boolean; pm_done: boolean; am_overdue: boolean; pm_overdue: boolean }
  processing_room: { am_done: boolean; pm_done: boolean; am_overdue: boolean; pm_overdue: boolean }
  daily_diary: {
    opening: boolean
    operational: boolean
    closing: boolean
    opening_overdue: boolean
    operational_overdue: boolean
    closing_overdue: boolean
  }
  cleaning: { count_today: number; has_issues_today: boolean; overdue: boolean; last_logged_at: string | null }
  deliveries: { count_today: number; deviations: number }
  mince_runs: { count_today: number; has_deviations: boolean }
  product_returns: { count_today: number; has_safety_returns: boolean }
  calibration_due: boolean
  calibration_done: boolean
  calibration_pass: boolean
  weekly_review_due: boolean
  weekly_review_overdue: boolean
  monthly_review_due: boolean
  monthly_review_overdue: boolean
  training_overdue: number
  training_due_soon: number
  total_checks: number
  completed_checks: number
}

// ─── progress ────────────────────────────────────────────────────────────────

export function progressPct(s: TodayStatus | null): number {
  if (!s || s.total_checks === 0) return 0
  return Math.round((s.completed_checks / s.total_checks) * 100)
}

// ─── primary tile state + badge inference ────────────────────────────────────

export function coldState(s: TodayStatus | null): TileState {
  if (!s) return 'neutral'
  if (s.cold_storage.am_done && s.cold_storage.pm_done) return 'complete'
  if (s.cold_storage.pm_overdue || s.cold_storage.am_overdue) return 'overdue'
  if (s.cold_storage.am_done) return 'due'
  return 'neutral'
}

export function coldBadge(s: TodayStatus | null): string {
  if (!s) return '—'
  if (s.cold_storage.am_done && s.cold_storage.pm_done) return 'Done'
  if (s.cold_storage.pm_overdue) return 'PM overdue'
  if (s.cold_storage.am_overdue) return 'AM overdue'
  if (s.cold_storage.am_done) return 'PM due'
  return 'AM due'
}

/**
 * Delta #4: the room tile now surfaces the diary "operational" (mid-day)
 * overdue alongside opening/closing. "complete" is unchanged (it never
 * required operational) — only the overdue signal is added.
 */
export function roomState(s: TodayStatus | null): TileState {
  if (!s) return 'neutral'
  if (
    s.processing_room.am_done &&
    s.processing_room.pm_done &&
    s.daily_diary.opening &&
    s.daily_diary.closing
  )
    return 'complete'
  if (
    s.processing_room.pm_overdue ||
    s.processing_room.am_overdue ||
    s.daily_diary.opening_overdue ||
    s.daily_diary.operational_overdue ||
    s.daily_diary.closing_overdue
  )
    return 'overdue'
  if (s.processing_room.am_done || s.daily_diary.opening) return 'due'
  return 'neutral'
}

export function roomBadge(s: TodayStatus | null): string {
  if (!s) return '—'
  if (
    s.processing_room.am_done &&
    s.processing_room.pm_done &&
    s.daily_diary.opening &&
    s.daily_diary.closing
  )
    return 'Done'
  if (s.processing_room.pm_overdue) return 'Temp PM overdue'
  if (s.daily_diary.closing_overdue) return 'Closing overdue'
  if (s.daily_diary.operational_overdue) return 'Operational overdue'
  if (s.processing_room.am_overdue) return 'Temp AM overdue'
  if (s.daily_diary.opening_overdue) return 'Opening overdue'
  if (s.processing_room.am_done) return 'Temp PM due'
  if (s.daily_diary.opening) return 'Opening done'
  return 'Opening due'
}

export function deliveryState(s: TodayStatus | null): TileState {
  if (!s) return 'neutral'
  if (s.deliveries.deviations > 0) return 'deviation'
  if (s.deliveries.count_today > 0) return 'complete'
  return 'neutral'
}

export function deliveryBadge(s: TodayStatus | null): string {
  if (!s) return '—'
  if (s.deliveries.deviations > 0)
    return `${s.deliveries.count_today} logged · ${s.deliveries.deviations} fail`
  if (s.deliveries.count_today > 0) return `${s.deliveries.count_today} logged`
  return 'None yet'
}

export function cleaningState(s: TodayStatus | null): TileState {
  if (!s) return 'neutral'
  if (s.cleaning.count_today > 0 && s.cleaning.has_issues_today) return 'deviation'
  if (s.cleaning.count_today > 0) return 'complete'
  if (s.cleaning.overdue) return 'overdue'
  return 'neutral'
}

export function cleaningBadge(s: TodayStatus | null): string {
  if (!s) return '—'
  if (s.cleaning.count_today > 0 && s.cleaning.has_issues_today)
    return `${s.cleaning.count_today} logged · issue`
  if (s.cleaning.count_today > 0) return `${s.cleaning.count_today} logged`
  if (s.cleaning.overdue) return 'Overdue'
  return 'None yet'
}

export function minceState(s: TodayStatus | null): TileState {
  if (!s) return 'neutral'
  if (s.mince_runs.has_deviations) return 'deviation'
  if (s.mince_runs.count_today > 0) return 'complete'
  return 'neutral'
}

export function minceBadge(s: TodayStatus | null): string {
  if (!s) return '—'
  if (s.mince_runs.has_deviations) return `${s.mince_runs.count_today} runs · deviation`
  if (s.mince_runs.count_today > 0) return `${s.mince_runs.count_today} runs`
  return 'None today'
}

export function returnState(s: TodayStatus | null): TileState {
  if (!s) return 'neutral'
  if (s.product_returns.has_safety_returns) return 'deviation'
  if (s.product_returns.count_today > 0) return 'complete'
  return 'neutral'
}

export function returnBadge(s: TodayStatus | null): string {
  if (!s) return '—'
  if (s.product_returns.has_safety_returns)
    return `${s.product_returns.count_today} logged · safety`
  if (s.product_returns.count_today > 0) return `${s.product_returns.count_today} logged`
  return 'None'
}

// ─── overdue list (delta #4: operational surfaced, visual only) ──────────────

export function buildOverdueList(s: TodayStatus | null): string[] {
  const overdue: string[] = []
  if (!s) return overdue
  if (s.cold_storage.am_overdue) overdue.push('Cold Storage AM')
  if (s.cold_storage.pm_overdue) overdue.push('Cold Storage PM')
  if (s.processing_room.am_overdue) overdue.push('Process Room Temp AM')
  if (s.processing_room.pm_overdue) overdue.push('Process Room Temp PM')
  if (s.daily_diary.opening_overdue) overdue.push('Process Room Opening checks')
  if (s.daily_diary.operational_overdue) overdue.push('Process Room Operational checks')
  if (s.daily_diary.closing_overdue) overdue.push('Process Room Closing checks')
  if (s.cleaning.overdue) overdue.push('Cleaning log')
  if (s.calibration_due) overdue.push('Calibration (not done this month)')
  if (s.weekly_review_overdue) overdue.push('Weekly review overdue')
  if (s.monthly_review_overdue) overdue.push('Monthly review overdue')
  return overdue
}

// ─── mandatory daily set (F4 + delta #3/#4 — the honest 8) ───────────────────

export type MandatoryState = 'complete' | 'overdue' | 'pending'

export interface MandatoryItem {
  label: string
  state: MandatoryState
}

function mState(done: boolean, overdue: boolean): MandatoryState {
  if (done) return 'complete'
  if (overdue) return 'overdue'
  return 'pending'
}

/**
 * The eight fixed daily mandatory checks — the same set `total_checks === 8`
 * counts (delta #3). Operational (mid-day) diary is item 6 (delta #4).
 */
export function buildMandatorySet(s: TodayStatus | null): MandatoryItem[] {
  const d = s
  return [
    { label: 'Cold store — AM', state: mState(!!d?.cold_storage.am_done, !!d?.cold_storage.am_overdue) },
    { label: 'Cold store — PM', state: mState(!!d?.cold_storage.pm_done, !!d?.cold_storage.pm_overdue) },
    { label: 'Process room — AM', state: mState(!!d?.processing_room.am_done, !!d?.processing_room.am_overdue) },
    { label: 'Process room — PM', state: mState(!!d?.processing_room.pm_done, !!d?.processing_room.pm_overdue) },
    { label: 'Diary — Opening', state: mState(!!d?.daily_diary.opening, !!d?.daily_diary.opening_overdue) },
    { label: 'Diary — Operational', state: mState(!!d?.daily_diary.operational, !!d?.daily_diary.operational_overdue) },
    { label: 'Diary — Closing', state: mState(!!d?.daily_diary.closing, !!d?.daily_diary.closing_overdue) },
    {
      label: 'Cleaning sign-off',
      state: mState((d?.cleaning.count_today ?? 0) > 0, !!d?.cleaning.overdue),
    },
  ]
}

// ─── per-tile SOP help routing (delta #1) ────────────────────────────────────

export interface HelpContent {
  title: string
  ref: string
  text: string
}

/**
 * Real SOP text — VERBATIM from the live hub. Keys map 1:1 to the tiles that
 * have authored guidance. Compliance tiles without an entry are NOT given
 * invented policy text (see `helpForTile`).
 */
export const SOP_CONTENT: Record<string, HelpContent> = {
  cold_storage: {
    title: 'Cold Storage Temperature — CCP 2',
    ref: 'SOP 3 | HB-001 V4.1',
    text: 'Critical limits: Chillers ≤5°C target (≤8°C legal max). Freezer ≤-18°C.\n\nMonitor AM and PM daily. If chiller 5–8°C: check door seals, reduce loading, recheck within 30 minutes, transfer product if rising.\n\nIf chiller >8°C: CRITICAL — minimise door openings, transfer all product to backup immediately, contact refrigeration engineer, assess all product before release.\n\nFreezer >-15°C: assess product for thawing. Do not refreeze thawed product.',
  },
  processing_room: {
    title: 'Processing Room Temperature — CCP 3',
    ref: 'SOP 3 | HB-001 V4.1',
    text: 'Critical limits: Product ≤4°C. Room ambient ≤12°C.\n\nIf room temperature exceeds 12°C: DO NOT stop cutting.\nBring product to production area progressively in small quantities to ensure core temperature does not exceed ≤4°C.\nMonitor product core temperature more frequently.\nInvestigate cause of room temperature rise.\n\nIf product >4°C: return to chilled storage immediately. If <2 hours at <8°C: complete processing within 30 minutes then chill.',
  },
  cleaning: {
    title: 'Cleaning Diary — SOP 2',
    ref: 'SOP 2, 2B | HB-001 V4.1',
    text: '4-step cleaning process:\n1. Pre-cleaning — remove all visible soil, rinse with cold water\n2. Cleaning — apply alkaline detergent at correct concentration, scrub all surfaces\n3. Sanitisation — hot water ≥82°C for 30 seconds OR approved chemical sanitiser\n4. Verification — visual inspection, check temperature/concentration\n\nFrequencies:\nKnives & small tools: start and end of shift (82°C)\nCutting boards: between products and EOD\nWork surfaces: every 2 hours and EOD\n\nMeat and mince require TIME SEPARATION — full 4-step clean between categories.',
  },
  delivery: {
    title: 'Delivery Intake — CCP 1',
    ref: 'SOP 5B | HB-001 V4.1 | CA-001 V1.1',
    text: 'Critical limits: Red meat ≤7°C. Poultry ≤4°C. Offal ≤3°C. Frozen ≤-12°C.\n\nCA-001 three-band system:\n≤5°C = pass\n5–8°C = conditional accept — urgent placement into coldest chiller, halve remaining shelf life\n>8°C = REJECT immediately\n\nIf product contaminated (faecal, wool, hide): trim using clean knife, dispose trimmings as Cat 3 ABP, sterilise knife ≥82°C.\n\nBoxed/packaged meat only — NO exposed meat in receiving area.',
  },
  mince: {
    title: 'Mince & Meat Prep — CCP-M1, M2, MP2',
    ref: 'MMP-001 V1.0 | MMP-HA-001 V1.0',
    text: 'Kill date limits (from kill date):\nPoultry: ≤3 days\nBeef / Lamb: ≤6 days\nVac-pac beef: ≤15 days\n\nIf kill date cannot be verified — DO NOT USE for mincing.\nIf limit exceeded — DO NOT MINCE. Segregate, return to supplier or dispose as Cat 3 ABP.\n\nTemperatures:\nInput: meat ≤7°C, poultry ≤4°C\nOutput (mince): must be ≤2°C immediately after\nOutput (meat prep): must be ≤4°C\n\nNO re-freezing after thawing — legal requirement.\n\nTime separation: plain products BEFORE allergen products. Full 4-step clean between categories.',
  },
  product_return: {
    title: 'Product Return — SOP 12',
    ref: 'SOP 12 | HB-001 V4.1',
    text: 'Return codes: RC01 Temperature complaint · RC02 Quality issue · RC03 Incorrect product · RC04 Short shelf life · RC05 Packaging damage · RC06 Quantity discrepancy · RC07 Customer cancelled · RC08 Other\n\nNEVER resell:\n— Product previously frozen then thawed\n— Broken packaging/seals\n— Unknown temperature history\n— Exceeded temperature limits at any point\n— Past use-by date\n— Returned from consumers (non-trade)\n\nAcceptance temps on return: Red meat ≤7°C (else dispose). Frozen ≤-18°C no thawing signs (else dispose).',
  },
  calibration: {
    title: 'Thermometer Calibration — SOP 3',
    ref: 'SOP 3 | HB-001 V4.1',
    text: 'Calibrate monthly, before shift.\n\nIce water test: fill with crushed ice + small amount water, stir, wait 2 minutes. Reading must be 0°C ±1°C.\n\nBoiling water test: insert probe 2 inches into rolling boil. Reading must be 100°C ±1°C.\n\nIf out of calibration: remove from service immediately, use backup thermometer, send for professional calibration or replace.\nReview all readings taken with faulty thermometer.\n\nAnnually: buy new calibrated probe — do not rely on a probe more than 12 months old.',
  },
  reviews: {
    title: 'Weekly & Monthly Reviews',
    ref: 'SOP 5, 5B, 9, 11 | MF-001 V4.1',
    text: 'Weekly review: Check all CCP monitoring records are complete and signed. Verify corrective actions documented. Check supplier certificates, staff training current, pest control, water supply, maintenance, waste management. One-way traffic compliance check. Structural walkthrough (floors, walls, equipment, doors, emergency items).\n\nMonthly review (legal requirement — FSA): Thermometer calibration completed. Chiller/freezer temps verified at multiple locations, door seals checked. Steriliser ≥82°C verified. Staff entrance PPE stocks checked. Facilities: handwash, soap, boot wash, hand sanitiser all stocked. Full HACCP system review — confirm CCPs still valid, limits adequate, monitoring effective.',
  },
  people: {
    title: 'Health Monitoring — SOP 8',
    ref: 'SOP 8 | HB-001 V4.1 | HM-001 V1.0',
    text: 'New staff — before first shift: health declaration mandatory. Send home immediately if: diarrhoea/vomiting, jaundice, skin infections, open wounds. Must be symptom-free for 48 hours before returning after gastrointestinal illness.\n\nReturn to work: GI illness — 48 hours symptom-free minimum. If >5 days: medical certificate required. Serious illness/hospitalisation: GP clearance required.\n\nVisitors: complete questionnaire before entering production. Reject entry if: sickness/vomiting in past 24h, skin conditions, boils, discharge from eyes/ears, heavy cold, contact with enteric fever. Visitor must confirm: no infection, jewellery removed, equipment clean, lubricants food-grade.',
  },
  corrective_action: {
    title: 'Corrective Action Reference — CA-001',
    ref: 'CA-001 V1.1',
    text: 'FSA requirement: every CCP deviation must be documented with: date/time of deviation, description of issue, cause (root cause analysis), action taken, product disposition, measures to prevent recurrence, operator signature, management verification for significant deviations.\n\nRecord retention: 2 years minimum. Available for FSA officers and EHOs on demand.\n\nCommon actions: Urgent chill (5–8°C receipt) · Reject >8°C · Transfer to backup (CCP 2 failure) · Progressive batches (CCP 3 room >12°C) · Remove thermometer from service · Trim contaminated product · Halt and deep clean (time separation breach).',
  },
}

/**
 * Neutral placeholder shown for tiles that do not yet have authored SOP text.
 * Carries NO policy claims — real policy-doc mapping is a separate workstream.
 */
export const SOP_PLACEHOLDER: HelpContent = {
  title: 'Guidance coming soon',
  ref: 'SOP reference to be added',
  text: 'The standard operating procedure for this section is being added.',
}

/**
 * Delta #1: each tile resolves to ITS OWN SOP entry (never the People default).
 * Tiles without authored guidance get the neutral placeholder.
 */
export function helpForTile(key: string): HelpContent {
  return SOP_CONTENT[key] ?? SOP_PLACEHOLDER
}
