/**
 * lib/services/HaccpDailyChecksService.ts
 *
 * The daily-checks service (F-19) — business orchestration + the pure food-safety
 * logic for the 7 daily-check sub-domains. Factory here, wiring in
 * `lib/wiring/haccp.ts`; depends on the `dailyChecks` port alone, never on
 * another service and never on the adapters folder (lint-enforced, ADR-0002 /
 * F-TD-11).
 *
 * DESIGN DECISION 3 (resolved at Render as Ousterhout would): the pure helpers
 * that live inline in the routes today — `tempStatus`, `buildBatchNumber`, the
 * `derive*Action` CA-text builders, `DISPOSITION_MAP`, the kill-date /
 * batch-code / temp-pass logic — are LIFTED here in PR1 (copied
 * BYTE-IDENTICALLY) so they get unit-tested now and PR2's routes shrink to
 * "read input → call service → reply". Lifting genuinely DEEPENS the service
 * (real behaviour behind the interface), concentrates the food-safety logic in
 * one tested place (locality), and passes the deletion test — leave them in the
 * routes and every PR2 handler re-implements them.
 *
 * The service exposes, per sub-domain: a `validate…` cascade (typed
 * {status,message} rejections with the routes' EXACT strings), the derived
 * `…Persist` row builder, and a `build…CorrectiveActions` fan-out the submit
 * use-case files via the CA service. The `ca_write_failed` soft-fail itself
 * lives in the use-case, NOT here.
 *
 * `now`/`today` are passed in (London-day strings the route computes via
 * `todayUK()`) so the service is deterministic and byte-identical — the service
 * never reaches for `new Date()` to decide a London day.
 */

import type {
  CAPayload,
  CreateDeliveryInput,
  DeliveryPersist,
  CreateColdStorageReadingsInput,
  ColdStorageUnit,
  ColdStoragePersist,
  ColdStorageInsertedRow,
  CreateCalibrationCertifiedInput,
  CreateCalibrationManualInput,
  CalibrationCertifiedPersist,
  CalibrationManualPersist,
  CreateCleaningInput,
  CleaningPersist,
  CreateProcessingTempInput,
  CreateDailyDiaryInput,
  ProcessingTempPersist,
  DailyDiaryPersist,
  CreateMinceInput,
  CreateMeatPrepInput,
  CreateTimeSeparationInput,
  MincePersist,
  MeatPrepPersist,
  TimeSeparationPersist,
  CreateReturnInput,
  ReturnPersist,
  CorrectiveActionInsert,
  DeliveryListResult,
  DeliveryRange,
  DeliverySupplier,
  ColdStorageListResult,
  CalibrationRecord,
  CleaningEntry,
  ProcessRoomListResult,
  MincePrepListResult,
  ReturnRow,
} from "@/lib/domain";
import { COLD_STORAGE_CAUSES, isColdStorageTempInRange } from "@/lib/domain";
import {
  PROCESS_ROOM_CAUSES,
  isProcessRoomTempInRange,
  processRoomBand,
} from "@/lib/domain";
import type {
  ProcessRoomThreshold,
  UpdateProcessRoomThresholdInput,
} from "@/lib/domain";
import { resolveGoodsInThreshold, goodsInStatus } from "@/lib/domain";
import type { GoodsInThreshold, UpdateGoodsInThresholdInput } from "@/lib/domain";
import {
  minceTempKey,
  resolveMinceThreshold,
  minceTempPass,
  minceKillDaysPass,
  minceKillDaysHardFail,
} from "@/lib/domain";
import type { MinceThreshold, UpdateMinceThresholdInput } from "@/lib/domain";
import type { HaccpDailyChecksRepository } from "@/lib/ports";
import { ServiceError } from "@/lib/errors";

// ─── shared constants (verbatim from the routes) ─────────────────────────────

/** UI-label -> DB enum value. delivery / cold-storage / process-room / mince. */
export const DISPOSITION_MAP: Record<string, string> = {
  Accept: "accept",
  "Conditional accept": "conditional_accept",
  Assess: "assess",
  Reject: "reject",
  Dispose: "dispose",
};

/** cleaning uses its own label set. */
const CLEANING_DISPOSITION_MAP: Record<string, string> = {
  "Re-cleaned and verified": "accept",
  "Equipment isolated": "conditional_accept",
  "Supervisor notified": "assess",
  "Maintenance requested": "assess",
};

const VALID_TEMP_CAUSES = new Set([
  "Cold chain break in transport",
  "Inadequate pre-chilling at supplier",
  "Vehicle refrigeration failure",
  "Delivery delayed — product held too long",
  "Other",
]);

const VALID_CONTAM_CAUSES = new Set([
  "Contamination during handling",
  "Packaging damaged in transit",
  "Supplier loading error",
  "Missing documentation",
  "Other",
]);

const VALID_CONTAM_TYPES = new Set([
  "uncovered",
  "contaminated_faecal",
  "packaging_damaged",
  "missing_docs",
]);

// Single source of truth — derived from the shared domain constant the client
// also consumes, so the two lists can never drift apart again (the drift was
// the root cause of the two-cause 400 bug).
const VALID_COLD_STORAGE_CAUSES = new Set<string>(COLD_STORAGE_CAUSES);

// Single source of truth — the SAME list the screen renders (lib/domain), so the
// server can never reject a cause the client offers.
const VALID_PROC_ROOM_CAUSES = new Set<string>(PROCESS_ROOM_CAUSES);

// ─── delivery protocol lookups (CA-001 verbatim) ─────────────────────────────

const PROTOCOL_CONDITIONAL_ACCEPT = [
  "Accept conditionally — do NOT reject the delivery",
  "Place immediately into coldest chiller area",
  "Use within reduced shelf life — halve remaining use-by",
  "Document assessment and accelerated use decision",
  "Review supplier performance",
];

const PROTOCOL_REJECT = [
  "REJECT delivery immediately — do NOT accept product",
  "Photograph product and temperature reading",
  "Complete Non-Conformance Report",
  "Notify supplier in writing within 24 hours",
  "Segregate and arrange return or disposal",
];

const PROTOCOL_EQUIPMENT_FAILURE = [
  "Verify product core temperature with calibrated probe",
  "If within conditional limits: accept with reduced shelf life; if exceeds legal limit: REJECT",
  "Document refrigeration failure and photograph vehicle thermometer",
  "Report equipment failure to supplier in writing",
  "Do not use this vehicle until fault is rectified",
];

const PROTOCOL_CONTAM: Record<string, string[]> = {
  uncovered: [
    "If minor exposure only: re-cover immediately, use for immediate processing only",
    "If visible contamination or cross-contamination risk: REJECT",
    "Document incident and notify supplier",
  ],
  contaminated_faecal: [
    "Trim contaminated area using clean knife",
    "Dispose of trimmings as Category 2/3 ABP",
    "Sterilise knife immediately after trimming (≥82°C)",
    "Document trimming action and disposal",
    "If contamination excessive: REJECT entire carcase",
  ],
  packaging_damaged: [
    "If seal broken on vacuum pack or visible ingress: REJECT and dispose",
    "Minor outer damage with intact inner seal: re-pack and use immediately",
    "Document and notify supplier",
  ],
  missing_docs: [
    "Hold product in segregated area",
    "Request traceability documents from supplier within 2 hours",
    "If not received within 2 hours: REJECT delivery",
  ],
};

function deriveTempAction(status: string, cause: string): string {
  if (cause === "Vehicle refrigeration failure") {
    return PROTOCOL_EQUIPMENT_FAILURE.join(" | ");
  }
  return status === "urgent"
    ? PROTOCOL_CONDITIONAL_ACCEPT.join(" | ")
    : PROTOCOL_REJECT.join(" | ");
}

function deriveContamAction(contamType: string): string {
  const steps = PROTOCOL_CONTAM[contamType];
  return steps
    ? steps.join(" | ")
    : "Assess and take appropriate action per CA-001";
}

const CATEGORY_BATCH_PREFIX: Record<string, string> = {
  poultry: "POL",
  dairy: "DAI",
  chilled_other: "CHI",
  dry_goods: "DRY",
  frozen: "FRZ",
};

function buildBatchNumber(
  date: string,
  categoryOrCountry: string,
  deliveryNumber: number,
  isMeat: boolean,
): string {
  const d = new Date(date + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = isMeat
    ? categoryOrCountry.toUpperCase()
    : (CATEGORY_BATCH_PREFIX[categoryOrCountry] ??
      categoryOrCountry.toUpperCase().slice(0, 3));
  return `${dd}${mm}-${prefix}-${deliveryNumber}`;
}

/**
 * Resolve the CCP-1 band row for a category from the FETCHED threshold set,
 * strictly BY KEY. A missing row is a food-safety fault, not something to paper
 * over: we FAIL CLOSED and throw (→ route 500) rather than substitute another
 * row or a hardcoded table as the limits. A positional/hardcoded fallback here
 * could grade a 6°C poultry delivery against the old ≤8°C ruler — a false
 * `pass` on a CCP. Mirrors `resolveProcRoomThresholds` below and the route's
 * "empty set = 500, never a hardcoded fallback" stance.
 */
function resolveGoodsInRow(
  thresholds: readonly GoodsInThreshold[],
  category: string,
): GoodsInThreshold {
  try {
    return resolveGoodsInThreshold(thresholds, category);
  } catch (e) {
    throw new ServiceError(e instanceof Error ? e.message : String(e), {
      cause: e,
    });
  }
}

/**
 * DB-driven CCP-1 grading — delegates to the shared domain rule
 * (`lib/domain/goodsIn.ts`), the SAME function the screen's live verdict tile
 * uses, so client and server can never drift apart again. No band literals
 * remain here: the values live in `haccp_goods_in_thresholds`.
 */
function deliveryTempStatus(
  temp: number | null,
  category: string,
  thresholds: readonly GoodsInThreshold[],
): "pass" | "urgent" | "fail" {
  return goodsInStatus(temp, resolveGoodsInRow(thresholds, category));
}

// ─── cold-storage protocol lookups (CA-001 verbatim) ─────────────────────────

const CS_PROTOCOLS: Record<string, string[]> = {
  chiller_critical: [
    "Minimise door openings immediately",
    "Transfer all product to backup unit immediately",
    "Probe individual products to assess core temperature",
    "Segregate any product above the legal limit for assessment",
    "Contact refrigeration engineer urgently",
    "Assess all product for safety before release",
  ],
  chiller_amber: [
    "Check door seals and closure",
    "Verify unit not overloaded / reduce loading",
    "Recheck temperature within 30 minutes",
    "Transfer product to backup chiller if temperature does not recover",
    "Call refrigeration engineer if fault persists",
  ],
  freezer_critical: [
    "Assess product for thawing (ice crystal formation, texture)",
    "Transfer to functioning freezer immediately",
    "Do NOT refreeze if product has fully thawed",
    "Contact refrigeration engineer urgently",
  ],
  freezer_amber: [
    "Keep door closed — minimise openings",
    "Check for ice build-up on coils",
    "Monitor temperature — acceptable short-term if product re-frozen immediately",
    "Call refrigeration engineer if temperature does not recover",
  ],
  equipment_failure: [
    "Document time of failure discovery",
    "Transfer products to backup refrigeration immediately",
    "Estimate time product was at elevated temperature",
    "Contact refrigeration engineer urgently",
    "Assess each product individually (if >2h above limit)",
    "Complete equipment failure log",
  ],
};

function deriveColdStorageAction(
  cause: string,
  worstStatus: "amber" | "critical",
  worstUnitType: string,
): string {
  if (cause === "Equipment failure")
    return CS_PROTOCOLS.equipment_failure.join(" | ");
  if (worstUnitType === "freezer") {
    return worstStatus === "critical"
      ? CS_PROTOCOLS.freezer_critical.join(" | ")
      : CS_PROTOCOLS.freezer_amber.join(" | ");
  }
  return worstStatus === "critical"
    ? CS_PROTOCOLS.chiller_critical.join(" | ")
    : CS_PROTOCOLS.chiller_amber.join(" | ");
}

function coldStorageTempStatus(
  temp: number,
  targetC: number,
  maxC: number,
): "pass" | "amber" | "critical" {
  if (temp <= targetC) return "pass";
  if (temp <= maxC) return "amber";
  return "critical";
}

// ─── process-room protocol lookups (CA-001 CCP 3 verbatim) ───────────────────

const PR_PROTOCOLS: Record<string, string[]> = {
  product_breach: [
    "Return product to chilled storage immediately",
    "Record time product was above temperature limit",
    "If <2 hours at <8°C: complete processing within 30 minutes then chill",
    "If >2 hours or >8°C: segregate product for safety assessment",
    "Reduce batch sizes for future processing",
  ],
  room_breach_high: [
    "Stop loading product into room",
    "Return all product to chilled storage immediately",
    "Investigate cooling failure urgently",
    "Do not resume until temperature below 12°C",
  ],
  room_breach_amber: [
    "Do NOT stop cutting",
    "Bring product to production progressively in small quantities",
    "Monitor product core temperature — must remain ≤4°C",
    "If core temp rises above 4°C, return to chilled storage",
    "Investigate cause — check A/C and cooling unit",
  ],
  equipment_failure: [
    "Document time of failure discovery",
    "Transfer products to chilled storage immediately",
    "Estimate time product was at elevated temperature",
    "Contact refrigeration/maintenance engineer urgently",
    "Assess each product individually (if >2h above limit)",
    "Complete equipment failure log",
  ],
};

function deriveProcRoomAction(
  cause: string,
  productBreached: boolean,
  roomBreached: boolean,
  roomCritical: boolean,
): string {
  if (cause === "Equipment failure")
    return PR_PROTOCOLS.equipment_failure.join(" | ");
  if (productBreached) return PR_PROTOCOLS.product_breach.join(" | ");
  if (roomBreached) {
    return roomCritical
      ? PR_PROTOCOLS.room_breach_high.join(" | ")
      : PR_PROTOCOLS.room_breach_amber.join(" | ");
  }
  return PR_PROTOCOLS.product_breach.join(" | ");
}

/**
 * Resolve the Product core + Room ambient threshold rows from the active set,
 * strictly BY NAME. Both are mandatory CCP-3 measurement points, so a missing
 * one is a food-safety fault, not something to paper over: we FAIL CLOSED and
 * throw (→ route 500) rather than substitute another row as the limits. A
 * positional fallback here could grade a 10°C product against the Room ambient
 * limits (12/15) — a false `pass` on a CCP. Mirrors the route's "empty set =
 * 500, never a hardcoded fallback" stance.
 */
function resolveProcRoomThresholds(
  thresholds: readonly ProcessRoomThreshold[],
): { product: ProcessRoomThreshold; room: ProcessRoomThreshold } {
  const byName = (n: string) => thresholds.find((t) => t.name === n);
  const product = byName("Product core");
  const room = byName("Room ambient");
  if (!product || !room) {
    const missing = [!product && "Product core", !room && "Room ambient"]
      .filter(Boolean)
      .join(", ");
    throw new ServiceError(
      `Required process-room threshold(s) missing from active set: ${missing}`,
    );
  }
  return { product, room };
}

// ─── mince-prep logic (DB-driven since the mince unit) ──────────────────────
// The band VALUES live in `haccp_mince_thresholds`; the grading RULE lives in
// `lib/domain/mincePrep.ts` (the SAME functions the screen's live tiles use).
// No band/kill-day literal remains in this file — the CA texts interpolate the
// resolved rows.
//
// ⚠️ AMBER IS DISPLAY ONLY (plan risk R1): the pass helpers below delegate to
// `minceTempPass`, which is deliberately blind to the amber band — an amber
// reading is pass:false ⇒ CA required + filed, exactly as before.

/**
 * Resolve a CCP-M threshold row strictly BY KEY from the FETCHED set — FAIL
 * CLOSED. A missing row is a food-safety fault: we throw (→ route 500) rather
 * than substitute another row or a hardcoded table as the limits (mirrors
 * `resolveGoodsInRow` / `resolveProcRoomThresholds`).
 */
function resolveMinceRow(
  thresholds: readonly MinceThreshold[],
  key: string,
): MinceThreshold {
  try {
    return resolveMinceThreshold(thresholds, key);
  } catch (e) {
    throw new ServiceError(e instanceof Error ? e.message : String(e), {
      cause: e,
    });
  }
}

function minceInputRow(
  form: "mince" | "meatprep",
  thresholds: readonly MinceThreshold[],
): MinceThreshold {
  return resolveMinceRow(thresholds, minceTempKey(form, "input", "chilled"));
}

function minceOutputRow(
  form: "mince" | "meatprep",
  mode: string,
  thresholds: readonly MinceThreshold[],
): MinceThreshold {
  return resolveMinceRow(thresholds, minceTempKey(form, "output", mode));
}

function minceKillRow(
  species: string,
  thresholds: readonly MinceThreshold[],
): MinceThreshold {
  return resolveMinceRow(thresholds, `kill_days_${species}`);
}

function deriveMinceTempAction(
  channel: "input" | "output",
  outputMode: string,
  t: MinceThreshold,
): string {
  const p = Number(t.pass_max);
  if (channel === "input") {
    return [
      "Quarantine batch immediately.",
      "Assess product condition and odour.",
      `Attempt rapid chilling to ≤${p}°C within 2 hours.`,
      `If ≤${p}°C not achieved within 2 hours: reject product and return to supplier.`,
      "Investigate supplier temperature control and delivery conditions.",
      "Record deviation on Mincing Production Log (MMP-MF-001 Form 1).",
    ].join(" ");
  }
  if (outputMode === "frozen") {
    return [
      "Extend freezing time and recheck temperature after 30 minutes.",
      `If still above ${p}°C: assess product and review blast freezer capacity.`,
      "Reduce batch sizes to ensure temperature compliance.",
      `Do not dispatch until ≤${p}°C is confirmed.`,
    ].join(" ");
  }
  return [
    "Extend chilling period and recheck temperature after 30 minutes.",
    `If still above ${p}°C: assess product safety.`,
    "Reduce batch size — product may be too warm from mincing friction.",
    `Do not dispatch until ≤${p}°C is confirmed.`,
  ].join(" ");
}

function derivePrepTempAction(
  channel: "input" | "output",
  outputMode: string,
  t: MinceThreshold,
): string {
  const p = Number(t.pass_max);
  if (channel === "input") {
    return [
      "Quarantine batch immediately.",
      "Assess product condition.",
      `Attempt rapid chilling to ≤${p}°C within 2 hours.`,
      `If ≤${p}°C not achieved: reject product.`,
      "Record deviation on Meat Prep Production Log (MMP-MF-001 Form 2).",
    ].join(" ");
  }
  if (outputMode === "frozen") {
    return [
      "Extend freezing time and recheck after 30 minutes.",
      `If still above ${p}°C: assess product and review freezer capacity.`,
      `Do not dispatch until ≤${p}°C is confirmed.`,
    ].join(" ");
  }
  return [
    "Extend chilling period and recheck after 30 minutes.",
    `If still above ${p}°C: assess product safety before dispatch.`,
    "Consider reducing batch size.",
  ].join(" ");
}

function buildBatchCode(
  form: "mince" | "meatprep",
  date: string,
  species: string,
  runNum: number,
): string {
  const d = new Date(date + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = form === "mince" ? "MINCE" : "PREP";
  const sp = species.toUpperCase().replace("IMPORTED_VAC", "IMPVAC");
  return `${prefix}-${dd}${mm}-${sp}-${runNum}`;
}

const ALLERGEN_CA_CATEGORIES = new Set([
  "lamb",
  "beef",
  "red_meat",
  "offal",
  "frozen_beef_lamb",
  "poultry",
]);

const MINCE_VALID_SPECIES = ["lamb", "beef", "imported_vac"];

// ─── result helpers ──────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function reject(status: number, message: string): ValidationResult {
  return { ok: false, status, message };
}

// ─── deps + interface ────────────────────────────────────────────────────────

export interface HaccpDailyChecksServiceDeps {
  readonly dailyChecks: HaccpDailyChecksRepository;
}

/** A built delivery row + the deviation flags + the resolved supplier name. */
export interface DeliveryBuildResult {
  readonly persist: DeliveryPersist;
  readonly tempStatus: "pass" | "urgent" | "fail";
  readonly hasDeviationTemp: boolean;
  readonly hasDeviationContam: boolean;
  readonly hasDeviationAllergen: boolean;
}

/** A built cold-storage batch + the per-reading status for CA fan-out. */
export interface ColdStorageBuildResult {
  readonly rows: readonly ColdStoragePersist[];
  readonly hasDeviation: boolean;
}

export interface HaccpDailyChecksService {
  // raw helpers (lifted; exposed for unit tests + PR2 reuse)
  readonly dispositionMap: Record<string, string>;
  deliveryTempStatus(
    temp: number | null,
    category: string,
    thresholds: readonly GoodsInThreshold[],
  ): "pass" | "urgent" | "fail";
  coldStorageTempStatus(
    temp: number,
    targetC: number,
    maxC: number,
  ): "pass" | "amber" | "critical";
  buildBatchNumber(
    date: string,
    categoryOrCountry: string,
    deliveryNumber: number,
    isMeat: boolean,
  ): string;
  buildBatchCode(
    form: "mince" | "meatprep",
    date: string,
    species: string,
    runNum: number,
  ): string;
  killDatePass(
    species: string,
    daysFromKill: number,
    thresholds: readonly MinceThreshold[],
  ): boolean;
  killDateHardFail(
    species: string,
    daysFromKill: number,
    thresholds: readonly MinceThreshold[],
  ): boolean;
  inputTempPass(
    temp: number,
    form: "mince" | "meatprep",
    thresholds: readonly MinceThreshold[],
  ): boolean;
  outputTempPass(
    temp: number,
    form: "mince" | "meatprep",
    mode: string,
    thresholds: readonly MinceThreshold[],
  ): boolean;

  // ── reads (thin passthroughs) ──
  listDeliveries(range: DeliveryRange): Promise<DeliveryListResult>;
  findSupplierForDelivery(id: string): Promise<DeliverySupplier | null>;
  countDeliveriesOn(date: string): Promise<number>;
  listColdStorage(date: string): Promise<ColdStorageListResult>;
  listActiveColdStorageUnits(): Promise<readonly ColdStorageUnit[]>;
  listCalibration(): Promise<readonly CalibrationRecord[]>;
  listCleaning(): Promise<readonly CleaningEntry[]>;
  listProcessRoom(date: string): Promise<ProcessRoomListResult>;
  listMincePrep(range: DeliveryRange): Promise<MincePrepListResult>;
  countMinceRuns(
    table: "haccp_mince_log" | "haccp_meatprep_log",
    date: string,
  ): Promise<number>;
  listReturns(): Promise<readonly ReturnRow[]>;

  // ── delivery ──
  validateDelivery(args: {
    input: CreateDeliveryInput;
    supplier: DeliverySupplier | null;
    tempStatus: "pass" | "urgent" | "fail";
  }): ValidationResult;
  buildDelivery(args: {
    input: CreateDeliveryInput;
    userId: string;
    today: string;
    nowTime: string;
    resolvedSupplierId: string | null;
    resolvedSupplierName: string;
    deliveryNumber: number;
    thresholds: readonly GoodsInThreshold[];
  }): DeliveryBuildResult;
  buildDeliveryCorrectiveActions(args: {
    input: CreateDeliveryInput;
    userId: string;
    sourceId: string;
    tempStatus: "pass" | "urgent" | "fail";
  }): readonly CorrectiveActionInsert[];

  // ── goods-in thresholds (admin + POST band derivation) ──
  listGoodsInThresholds(): Promise<readonly GoodsInThreshold[]>;
  validateGoodsInThreshold(
    input: UpdateGoodsInThresholdInput,
    current: GoodsInThreshold,
  ): ValidationResult;
  updateGoodsInThreshold(args: {
    input: UpdateGoodsInThresholdInput;
    changedBy: string;
  }): Promise<GoodsInThreshold>;

  // ── cold-storage ──
  validateColdStorage(args: {
    input: CreateColdStorageReadingsInput;
    today: string;
    units: readonly ColdStorageUnit[];
    hasDeviation: boolean;
  }): ValidationResult;
  buildColdStorage(args: {
    input: CreateColdStorageReadingsInput;
    userId: string;
    units: readonly ColdStorageUnit[];
  }): ColdStorageBuildResult;
  buildColdStorageCorrectiveActions(args: {
    input: CreateColdStorageReadingsInput;
    userId: string;
    inserted: readonly ColdStorageInsertedRow[];
    units: readonly ColdStorageUnit[];
  }): readonly CorrectiveActionInsert[];

  // ── calibration ──
  validateCalibrationCertified(
    input: CreateCalibrationCertifiedInput,
  ): ValidationResult;
  validateCalibrationManual(
    input: CreateCalibrationManualInput,
  ): ValidationResult;
  buildCalibrationCertified(args: {
    input: CreateCalibrationCertifiedInput;
    userId: string;
    today: string;
    nowTime: string;
  }): CalibrationCertifiedPersist;
  buildCalibrationManual(args: {
    input: CreateCalibrationManualInput;
    userId: string;
    today: string;
    nowTime: string;
  }): CalibrationManualPersist;
  buildCalibrationCorrectiveActions(args: {
    input: CreateCalibrationManualInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

  // ── cleaning ──
  validateCleaning(input: CreateCleaningInput): ValidationResult;
  buildCleaning(args: {
    input: CreateCleaningInput;
    userId: string;
    today: string;
    nowTime: string;
  }): CleaningPersist;
  buildCleaningCorrectiveActions(args: {
    input: CreateCleaningInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

  // ── process-room temps ──
  validateProcessingTemp(args: {
    input: CreateProcessingTempInput;
    today: string;
    thresholds: readonly ProcessRoomThreshold[];
  }): ValidationResult;
  buildProcessingTemp(args: {
    input: CreateProcessingTempInput;
    userId: string;
    thresholds: readonly ProcessRoomThreshold[];
  }): ProcessingTempPersist;
  buildProcessingTempCorrectiveActions(args: {
    input: CreateProcessingTempInput;
    userId: string;
    sourceId: string;
    thresholds: readonly ProcessRoomThreshold[];
  }): readonly CorrectiveActionInsert[];

  // ── process-room thresholds (admin) ──
  listActiveProcessRoomThresholds(): Promise<readonly ProcessRoomThreshold[]>;
  listProcessRoomThresholds(): Promise<readonly ProcessRoomThreshold[]>;
  validateProcessRoomThreshold(
    input: UpdateProcessRoomThresholdInput,
  ): ValidationResult;
  updateProcessRoomThreshold(args: {
    input: UpdateProcessRoomThresholdInput;
    changedBy: string;
  }): Promise<ProcessRoomThreshold>;

  // ── process-room diary ──
  validateDailyDiary(args: {
    input: CreateDailyDiaryInput;
    today: string;
  }): ValidationResult;
  buildDailyDiary(args: {
    input: CreateDailyDiaryInput;
    userId: string;
  }): DailyDiaryPersist;
  buildDailyDiaryCorrectiveActions(args: {
    input: CreateDailyDiaryInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

  // ── mince ──
  validateMince(args: {
    input: CreateMinceInput;
    daysFromKill: number;
    thresholds: readonly MinceThreshold[];
  }): ValidationResult;
  buildMince(args: {
    input: CreateMinceInput;
    userId: string;
    today: string;
    nowTime: string;
    daysFromKill: number;
    runNum: number;
    thresholds: readonly MinceThreshold[];
  }): MincePersist;
  buildMinceCorrectiveActions(args: {
    input: CreateMinceInput;
    userId: string;
    sourceId: string;
    thresholds: readonly MinceThreshold[];
  }): readonly CorrectiveActionInsert[];

  // ── mince thresholds (admin + POST band derivation) ──
  listMinceThresholds(): Promise<readonly MinceThreshold[]>;
  validateMinceThreshold(
    input: UpdateMinceThresholdInput,
    current: MinceThreshold,
  ): ValidationResult;
  updateMinceThreshold(args: {
    input: UpdateMinceThresholdInput;
    changedBy: string;
  }): Promise<MinceThreshold>;

  // ── meatprep ──
  validateMeatPrep(
    input: CreateMeatPrepInput,
    thresholds: readonly MinceThreshold[],
  ): ValidationResult;
  buildMeatPrep(args: {
    input: CreateMeatPrepInput;
    userId: string;
    today: string;
    nowTime: string;
    daysFromKill: number | null;
    runNum: number;
    thresholds: readonly MinceThreshold[];
  }): MeatPrepPersist;
  buildMeatPrepCorrectiveActions(args: {
    input: CreateMeatPrepInput;
    userId: string;
    sourceId: string;
    thresholds: readonly MinceThreshold[];
  }): readonly CorrectiveActionInsert[];

  // ── timesep ──
  validateTimeSeparation(input: CreateTimeSeparationInput): ValidationResult;
  buildTimeSeparation(args: {
    input: CreateTimeSeparationInput;
    userId: string;
    today: string;
    nowTime: string;
  }): TimeSeparationPersist;
  /** Bug fix 1 (server half): a non-empty free-text corrective action files
   *  exactly one MMP-TS row into the CA register; empty/whitespace → none. */
  buildTimeSeparationCorrectiveActions(args: {
    input: CreateTimeSeparationInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

  // ── product-return ──
  validateReturn(input: CreateReturnInput): ValidationResult;
  buildReturn(args: {
    input: CreateReturnInput;
    userId: string;
    today: string;
    nowTime: string;
  }): ReturnPersist;
  buildReturnCorrectiveActions(args: {
    input: CreateReturnInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

  // ── inserts (thin passthroughs to the port) ──
  insertDelivery(payload: DeliveryPersist): Promise<{ id: string }>;
  insertColdStorageReadings(
    rows: readonly ColdStoragePersist[],
  ): Promise<readonly ColdStorageInsertedRow[]>;
  insertCalibrationCertified(
    payload: CalibrationCertifiedPersist,
  ): Promise<void>;
  insertCalibrationManual(
    payload: CalibrationManualPersist,
  ): Promise<{ id: string }>;
  insertCleaning(payload: CleaningPersist): Promise<{ id: string }>;
  insertProcessingTemp(payload: ProcessingTempPersist): Promise<{ id: string }>;
  insertDailyDiary(payload: DailyDiaryPersist): Promise<{ id: string }>;
  insertMince(payload: MincePersist): Promise<{ id: string }>;
  insertMeatPrep(payload: MeatPrepPersist): Promise<{ id: string }>;
  insertTimeSeparation(
    payload: TimeSeparationPersist,
  ): Promise<{ id: string }>;
  insertReturn(payload: ReturnPersist): Promise<{ id: string }>;
}

function isMeatCategory(category: string): boolean {
  return (
    category === "lamb" ||
    category === "beef" ||
    category === "red_meat" ||
    category === "offal" ||
    category === "frozen_beef_lamb"
  );
}

export function createHaccpDailyChecksService(
  deps: HaccpDailyChecksServiceDeps,
): HaccpDailyChecksService {
  const { dailyChecks } = deps;

  return {
    dispositionMap: DISPOSITION_MAP,
    deliveryTempStatus,
    coldStorageTempStatus,
    buildBatchNumber,
    buildBatchCode,
    // DB-driven CCP-M helpers — delegate to the shared domain rule against the
    // FETCHED thresholds (fail-closed on a missing key).
    killDatePass: (species, daysFromKill, thresholds) =>
      minceKillDaysPass(daysFromKill, minceKillRow(species, thresholds)),
    killDateHardFail: (species, daysFromKill, thresholds) =>
      minceKillDaysHardFail(daysFromKill, minceKillRow(species, thresholds)),
    inputTempPass: (temp, form, thresholds) =>
      minceTempPass(temp, minceInputRow(form, thresholds)),
    outputTempPass: (temp, form, mode, thresholds) =>
      minceTempPass(temp, minceOutputRow(form, mode, thresholds)),

    // ── reads ──
    listDeliveries: (range) => dailyChecks.listDeliveries(range),
    findSupplierForDelivery: (id) => dailyChecks.findSupplierForDelivery(id),
    countDeliveriesOn: (date) => dailyChecks.countDeliveriesOn(date),
    listColdStorage: (date) => dailyChecks.listColdStorage(date),
    listActiveColdStorageUnits: () =>
      dailyChecks.listActiveColdStorageUnits(),
    listCalibration: () => dailyChecks.listCalibration(),
    listCleaning: () => dailyChecks.listCleaning(),
    listProcessRoom: (date) => dailyChecks.listProcessRoom(date),
    listActiveProcessRoomThresholds: () =>
      dailyChecks.listActiveProcessRoomThresholds(),
    listMincePrep: (range) => dailyChecks.listMincePrep(range),
    countMinceRuns: (table, date) => dailyChecks.countMinceRuns(table, date),
    listReturns: () => dailyChecks.listReturns(),

    // ── delivery ──
    validateDelivery({ input, supplier, tempStatus }): ValidationResult {
      // Supplier resolution (C2).
      if (!input.supplier_id && !input.supplier_name?.trim()) {
        return reject(400, "Supplier is required");
      }
      if (input.supplier_id) {
        if (supplier === null) return reject(400, "Unknown supplier");
        if (!supplier.active)
          return reject(400, "Supplier is no longer approved");
      }
      if (!input.product?.trim())
        return reject(400, "Product description is required");
      if (!input.product_category)
        return reject(400, "Select a product category");
      const isDryGoods = input.product_category === "dry_goods";
      if (
        !isDryGoods &&
        (input.temperature_c == null ||
          isNaN(input.temperature_c as number))
      )
        return reject(400, "Temperature is required");
      if (!input.covered_contaminated)
        return reject(400, "Covered / contaminated field is required");

      // C8: traceability mandatory for meat categories.
      if (isMeatCategory(input.product_category)) {
        const missing: string[] = [];
        if (!input.born_in?.trim()) missing.push("Born in");
        if (!input.reared_in?.trim()) missing.push("Reared in");
        if (!input.slaughter_site?.trim()) missing.push("Slaughter site");
        if (!input.cut_site?.trim()) missing.push("Cut site");
        if (missing.length > 0) {
          return reject(400, `Traceability required: ${missing.join(", ")}`);
        }
      }

      // C1: pre-validate CA payloads.
      const hasDeviationTemp = tempStatus === "urgent" || tempStatus === "fail";
      const hasDeviationContam =
        input.covered_contaminated === "yes" ||
        input.covered_contaminated === "yes_actioned";

      if (hasDeviationTemp) {
        if (!input.corrective_action_temp) {
          return reject(
            400,
            "Corrective action required for temperature deviation",
          );
        }
        const { cause, disposition, recurrence } = input.corrective_action_temp;
        if (!cause?.trim() || !disposition?.trim() || !recurrence?.trim()) {
          return reject(400, "Corrective action incomplete (temp track)");
        }
        if (!VALID_TEMP_CAUSES.has(cause)) {
          return reject(400, `Invalid temperature cause: ${cause}`);
        }
        if (!DISPOSITION_MAP[disposition]) {
          return reject(400, `Invalid disposition: ${disposition}`);
        }
      }

      if (hasDeviationContam) {
        if (
          !input.contamination_type?.trim() ||
          !VALID_CONTAM_TYPES.has(input.contamination_type)
        ) {
          return reject(
            400,
            "Contamination type required (uncovered / contaminated_faecal / packaging_damaged / missing_docs)",
          );
        }
        if (!input.corrective_action_contam) {
          return reject(
            400,
            "Corrective action required for contamination deviation",
          );
        }
        const { cause, disposition, recurrence } =
          input.corrective_action_contam;
        if (!cause?.trim() || !disposition?.trim() || !recurrence?.trim()) {
          return reject(
            400,
            "Corrective action incomplete (contamination track)",
          );
        }
        if (!VALID_CONTAM_CAUSES.has(cause)) {
          return reject(400, `Invalid contamination cause: ${cause}`);
        }
        if (!DISPOSITION_MAP[disposition]) {
          return reject(400, `Invalid disposition: ${disposition}`);
        }
      }

      return { ok: true };
    },

    buildDelivery({
      input,
      userId,
      today,
      nowTime,
      resolvedSupplierId,
      resolvedSupplierName,
      deliveryNumber,
      thresholds,
    }): DeliveryBuildResult {
      const isMeat = isMeatCategory(input.product_category);
      const status = deliveryTempStatus(
        input.temperature_c,
        input.product_category,
        thresholds,
      );
      const hasDeviationAllergen =
        input.allergens_identified === true &&
        ALLERGEN_CA_CATEGORIES.has(input.product_category);
      const corrective_action_required =
        status !== "pass" ||
        input.covered_contaminated !== "no" ||
        hasDeviationAllergen;
      const hasDeviationTemp = status === "urgent" || status === "fail";
      const hasDeviationContam =
        input.covered_contaminated === "yes" ||
        input.covered_contaminated === "yes_actioned";

      const batchNumber = isMeat
        ? buildBatchNumber(today, input.born_in!.trim(), deliveryNumber, true)
        : buildBatchNumber(today, input.product_category, deliveryNumber, false);

      const persist: DeliveryPersist = {
        submitted_by: userId,
        date: today,
        time_of_delivery: nowTime,
        supplier: resolvedSupplierName,
        supplier_id: resolvedSupplierId,
        product: input.product.trim(),
        product_category: input.product_category,
        temperature_c: input.temperature_c,
        temp_status: status,
        covered_contaminated: input.covered_contaminated,
        contamination_type: hasDeviationContam
          ? input.contamination_type!.trim()
          : null,
        contamination_notes: input.contamination_notes?.trim() || null,
        corrective_action_required,
        notes: input.notes?.trim() || null,
        born_in: isMeat ? input.born_in!.trim() : null,
        reared_in: isMeat ? input.reared_in!.trim() : null,
        slaughter_site: isMeat ? input.slaughter_site!.trim() : null,
        cut_site: isMeat ? input.cut_site!.trim() : null,
        delivery_number: deliveryNumber,
        batch_number: batchNumber,
        allergens_identified: hasDeviationAllergen,
        allergen_notes: hasDeviationAllergen
          ? input.allergen_notes?.trim() || null
          : null,
      };

      return {
        persist,
        tempStatus: status,
        hasDeviationTemp,
        hasDeviationContam,
        hasDeviationAllergen,
      };
    },

    buildDeliveryCorrectiveActions({
      input,
      userId,
      sourceId,
      tempStatus,
    }): readonly CorrectiveActionInsert[] {
      const status = tempStatus;
      const hasDeviationTemp = status === "urgent" || status === "fail";
      const hasDeviationContam =
        input.covered_contaminated === "yes" ||
        input.covered_contaminated === "yes_actioned";
      const hasDeviationAllergen =
        input.allergens_identified === true &&
        ALLERGEN_CA_CATEGORIES.has(input.product_category);

      const caRows: CorrectiveActionInsert[] = [];

      // Route-gate parity (delivery/route.ts:498): the ENTIRE CA-insert block —
      // including the allergen push, which lives INSIDE this gate — only runs
      // when a temperature OR contamination deviation is present. An
      // allergen-only delivery (temp pass, covered_contaminated:'no') writes the
      // delivery row with corrective_action_required:true but ZERO CA rows
      // today. Returning [] here keeps the builder byte-identical to the route.
      if (!hasDeviationTemp && !hasDeviationContam) {
        return caRows;
      }

      if (hasDeviationTemp && input.corrective_action_temp) {
        const ca = input.corrective_action_temp;
        const actionText = deriveTempAction(status, ca.cause);
        const rec = ca.notes?.trim()
          ? `${ca.recurrence} | Notes: ${ca.notes.trim()}`
          : ca.recurrence;
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_deliveries",
          source_id: sourceId,
          ccp_ref: "CCP1",
          deviation_description: `Temperature: ${input.temperature_c}°C (${status}) on ${input.product_category}. Cause: ${ca.cause}`,
          action_taken: actionText,
          product_disposition: DISPOSITION_MAP[ca.disposition],
          recurrence_prevention: rec,
          management_verification_required: status === "fail",
          resolved: false,
        });
      }

      if (hasDeviationContam && input.corrective_action_contam) {
        const ca = input.corrective_action_contam;
        const actionText = deriveContamAction(input.contamination_type!);
        const rec = ca.notes?.trim()
          ? `${ca.recurrence} | Notes: ${ca.notes.trim()}`
          : ca.recurrence;
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_deliveries",
          source_id: sourceId,
          ccp_ref: "CCP1",
          deviation_description: `Contamination: ${input.covered_contaminated} (${input.contamination_type}). Cause: ${ca.cause}`,
          action_taken: actionText,
          product_disposition: DISPOSITION_MAP[ca.disposition],
          recurrence_prevention: rec,
          management_verification_required:
            input.covered_contaminated === "yes",
          resolved: false,
        });
      }

      if (hasDeviationAllergen) {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_deliveries",
          source_id: sourceId,
          ccp_ref: "CCP1",
          deviation_description: `Allergen identified in delivery — MFS is an allergen-free site. ${input.allergen_notes?.trim() ? `Details: ${input.allergen_notes.trim()}` : "No further detail provided."}`,
          action_taken:
            "Delivery quarantined pending management review. Do not process until CA resolved.",
          product_disposition: "Quarantine — pending management review",
          recurrence_prevention:
            "Review supplier specification. Ensure allergen-free status confirmed on all future deliveries.",
          management_verification_required: true,
          resolved: false,
        });
      }

      return caRows;
    },

    // ── goods-in thresholds (admin + POST band derivation) ──
    listGoodsInThresholds: () => dailyChecks.listGoodsInThresholds(),

    validateGoodsInThreshold(input, current): ValidationResult {
      if (!input.id) return reject(400, "Threshold id is required");
      // Band STRUCTURE is code-locked: which categories have an amber band /
      // a temperature CCP at all cannot change via the app — only the numbers
      // move. (An admin nulling poultry's amber band would silently turn the
      // documented grace band into a hard reject line — or worse, nulling
      // pass_max would remove the CCP entirely.)
      if ((input.pass_max_c === null) !== (current.pass_max_c === null)) {
        return reject(400, "Band structure is fixed — pass limit cannot be added or removed");
      }
      if ((input.amber_max_c === null) !== (current.amber_max_c === null)) {
        return reject(400, "Band structure is fixed — amber band cannot be added or removed");
      }
      if (input.pass_max_c !== null && !Number.isFinite(input.pass_max_c)) {
        return reject(400, "Pass limit must be a number");
      }
      if (input.amber_max_c !== null && !Number.isFinite(input.amber_max_c)) {
        return reject(400, "Amber limit must be a number");
      }
      // amber == pass is allowed and means "amber band empty".
      if (
        input.pass_max_c !== null &&
        input.amber_max_c !== null &&
        input.amber_max_c < input.pass_max_c
      ) {
        return reject(400, "Amber limit must be at or above the pass limit");
      }
      return { ok: true };
    },

    updateGoodsInThreshold({ input, changedBy }) {
      return dailyChecks.updateGoodsInThreshold(input, changedBy);
    },

    // ── cold-storage ──
    validateColdStorage({
      input,
      today,
      units,
      hasDeviation,
    }): ValidationResult {
      if (
        !input.session ||
        !input.date ||
        !Array.isArray(input.readings) ||
        input.readings.length === 0
      ) {
        return reject(400, "Missing required fields");
      }
      if (input.date !== today) {
        return reject(400, "Readings may only be submitted for today's date.");
      }
      const unitIds = new Set(units.map((u) => u.id));
      for (const r of input.readings) {
        if (!unitIds.has(r.unit_id)) {
          return reject(400, `Unknown or inactive unit: ${r.unit_id}`);
        }
      }
      // Defence-in-depth echo of the client number-pad bound — uses the SAME
      // shared helper so the rule can never desync. Sits AFTER missing-fields /
      // today / unit-known (precedence preserved) and BEFORE the CA-payload
      // checks. Classification thresholds are untouched: a real deviation is
      // in-range; only physically impossible values are blocked.
      for (const r of input.readings) {
        if (!isColdStorageTempInRange(r.temperature_c)) {
          return reject(400, "Temperature out of range");
        }
      }
      if (hasDeviation) {
        if (!input.corrective_action) {
          return reject(400, "Corrective action required for deviation");
        }
        const { cause, disposition, recurrence } = input.corrective_action;
        if (!cause || !disposition || !recurrence) {
          return reject(400, "Incomplete corrective action");
        }
        if (!VALID_COLD_STORAGE_CAUSES.has(cause)) {
          return reject(400, `Invalid cause: ${cause}`);
        }
        if (!DISPOSITION_MAP[disposition]) {
          return reject(400, `Invalid disposition: ${disposition}`);
        }
      }
      return { ok: true };
    },

    buildColdStorage({ input, userId, units }): ColdStorageBuildResult {
      const unitById = new Map(units.map((u) => [u.id, u]));
      const rows: ColdStoragePersist[] = input.readings.map((r) => {
        const u = unitById.get(r.unit_id)!;
        const status = coldStorageTempStatus(
          r.temperature_c,
          Number(u.target_temp_c),
          Number(u.max_temp_c),
        );
        return {
          submitted_by: userId,
          date: input.date,
          session: input.session,
          unit_id: r.unit_id,
          temperature_c: r.temperature_c,
          temp_status: status,
          comments: input.comments || null,
          corrective_action_required: status !== "pass",
        };
      });
      const hasDeviation = rows.some((r) => r.temp_status !== "pass");
      return { rows, hasDeviation };
    },

    buildColdStorageCorrectiveActions({
      input,
      userId,
      inserted,
      units,
    }): readonly CorrectiveActionInsert[] {
      const deviations = inserted.filter((r) => r.temp_status !== "pass");
      if (deviations.length === 0 || !input.corrective_action) return [];

      const unitById = new Map(units.map((u) => [u.id, u]));
      const unitNameById = new Map(units.map((u) => [u.id, u.name]));
      const ca = input.corrective_action;
      const dispositionEnum = DISPOSITION_MAP[ca.disposition] ?? null;
      const recurrence = ca.notes
        ? `${ca.recurrence} | Notes: ${ca.notes}`
        : ca.recurrence;

      const worstDev =
        deviations.find((r) => r.temp_status === "critical") ?? deviations[0];
      const worstUnit = unitById.get(worstDev.unit_id);
      const worstType = worstUnit?.unit_type ?? "chiller";
      const worstStatus = (
        worstDev.temp_status === "critical" ? "critical" : "amber"
      ) as "amber" | "critical";
      const actionText = deriveColdStorageAction(ca.cause, worstStatus, worstType);

      return deviations.map((r) => ({
        actioned_by: userId,
        source_table: "haccp_cold_storage_temps" as const,
        source_id: r.id,
        ccp_ref: "CCP2",
        deviation_description: `${unitNameById.get(r.unit_id) ?? "Unknown unit"}: ${r.temperature_c}°C (${r.temp_status}). Cause: ${ca.cause}`,
        action_taken: actionText,
        product_disposition: dispositionEnum,
        recurrence_prevention: recurrence,
        management_verification_required: r.temp_status === "critical",
      }));
    },

    // ── calibration ──
    validateCalibrationCertified(input): ValidationResult {
      if (!input.thermometer_id?.trim())
        return reject(400, "Probe ID / name is required");
      if (!input.cert_reference?.trim())
        return reject(400, "Certificate reference is required");
      if (!input.purchase_date) return reject(400, "Purchase date is required");
      if (!input.verified_by?.trim())
        return reject(400, "Verified by is required");
      return { ok: true };
    },

    validateCalibrationManual(input): ValidationResult {
      if (!input.thermometer_id?.trim())
        return reject(400, "Probe ID / name is required");
      if (input.ice_water_result_c == null)
        return reject(400, "Ice water reading is required");
      if (input.boiling_water_result_c == null)
        return reject(400, "Boiling water reading is required");
      if (!input.verified_by?.trim())
        return reject(400, "Verified by is required");

      const icePass =
        input.ice_water_result_c >= -1 && input.ice_water_result_c <= 1;
      const boilPass =
        input.boiling_water_result_c >= 99 &&
        input.boiling_water_result_c <= 101;
      const anyFail = !icePass || !boilPass;
      if (anyFail && !input.corrective_action) {
        return reject(400, "Corrective action is required when a test fails");
      }
      return { ok: true };
    },

    buildCalibrationCertified({
      input,
      userId,
      today,
      nowTime,
    }): CalibrationCertifiedPersist {
      return {
        submitted_by: userId,
        date: today,
        time_of_check: nowTime,
        thermometer_id: input.thermometer_id.trim(),
        calibration_mode: "certified_probe",
        cert_reference: input.cert_reference.trim(),
        purchase_date: input.purchase_date,
        verified_by: input.verified_by.trim(),
        action_taken: input.notes?.trim() || null,
      };
    },

    buildCalibrationManual({
      input,
      userId,
      today,
      nowTime,
    }): CalibrationManualPersist {
      const icePass =
        input.ice_water_result_c >= -1 && input.ice_water_result_c <= 1;
      const boilPass =
        input.boiling_water_result_c >= 99 &&
        input.boiling_water_result_c <= 101;
      return {
        submitted_by: userId,
        date: today,
        time_of_check: nowTime,
        thermometer_id: input.thermometer_id.trim(),
        calibration_mode: "manual",
        ice_water_result_c: input.ice_water_result_c,
        ice_water_pass: icePass,
        boiling_water_result_c: input.boiling_water_result_c,
        boiling_water_pass: boilPass,
        verified_by: input.verified_by.trim(),
        action_taken: input.action_taken?.trim() || null,
      };
    },

    buildCalibrationCorrectiveActions({
      input,
      userId,
      sourceId,
    }): readonly CorrectiveActionInsert[] {
      const icePass =
        input.ice_water_result_c >= -1 && input.ice_water_result_c <= 1;
      const boilPass =
        input.boiling_water_result_c >= 99 &&
        input.boiling_water_result_c <= 101;
      const anyFail = !icePass || !boilPass;
      if (!anyFail || !input.corrective_action) return [];

      const ca = input.corrective_action;
      const recNotes = ca.notes
        ? `${ca.recurrence} | Notes: ${ca.notes}`
        : ca.recurrence;
      const failedTests = [
        ...(!icePass
          ? [`Ice water: ${input.ice_water_result_c}°C (pass -1 to +1°C)`]
          : []),
        ...(!boilPass
          ? [
              `Boiling water: ${input.boiling_water_result_c}°C (pass 99–101°C)`,
            ]
          : []),
      ];
      return [
        {
          actioned_by: userId,
          source_table: "haccp_calibration_log",
          source_id: sourceId,
          ccp_ref: "SOP3",
          deviation_description: `Probe calibration failure (${input.thermometer_id.trim()}): ${failedTests.join("; ")}. Cause: ${ca.cause}`,
          action_taken: `${ca.disposition}. Protocol: Remove from service, switch to backup probe, send for professional calibration or dispose.`,
          product_disposition: "assess",
          recurrence_prevention: recNotes,
          management_verification_required: true,
        },
      ];
    },

    // ── cleaning ──
    validateCleaning(input): ValidationResult {
      if (!input.what_was_cleaned?.trim())
        return reject(400, "Select at least one item that was cleaned");
      if (!input.verified_by?.trim())
        return reject(400, "Verified by is required");
      if (input.issues && !input.corrective_action)
        return reject(
          400,
          "Corrective action is required when issues are reported",
        );
      return { ok: true };
    },

    buildCleaning({ input, userId, today, nowTime }): CleaningPersist {
      return {
        submitted_by: userId,
        date: today,
        time_of_clean: nowTime,
        what_was_cleaned: input.what_was_cleaned,
        issues: input.issues,
        verified_by: input.verified_by.trim(),
        sanitiser_temp_c: input.sanitiser_temp_c ?? null,
        what_did_you_do: input.what_did_you_do?.trim() || null,
      };
    },

    buildCleaningCorrectiveActions({
      input,
      userId,
      sourceId,
    }): readonly CorrectiveActionInsert[] {
      if (!input.issues || !input.corrective_action) return [];
      const ca = input.corrective_action;
      const disp = CLEANING_DISPOSITION_MAP[ca.disposition] ?? "assess";
      const recNotes = ca.notes
        ? `${ca.recurrence} | Notes: ${ca.notes}`
        : ca.recurrence;
      return [
        {
          actioned_by: userId,
          source_table: "haccp_cleaning_log",
          source_id: sourceId,
          ccp_ref: "SOP2",
          deviation_description: `Cleaning issue: ${input.what_was_cleaned}. Cause: ${ca.cause}`,
          action_taken: `${ca.disposition}. Protocol: Stop use, re-clean full 4-step, verify before returning to service.`,
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: false,
        },
      ];
    },

    // ── process-room temps ──
    validateProcessingTemp({ input, today, thresholds }): ValidationResult {
      if (
        !input.session ||
        !input.date ||
        input.product_temp_c == null ||
        input.room_temp_c == null
      ) {
        return reject(400, "Missing required fields");
      }
      if (input.date !== today) {
        return reject(400, "Readings may only be submitted for today's date.");
      }
      // Defence-in-depth echo of the client number-pad bound (shared helper so
      // the rule can never desync). AFTER today, BEFORE the CA-payload checks.
      if (
        !isProcessRoomTempInRange(input.product_temp_c) ||
        !isProcessRoomTempInRange(input.room_temp_c)
      ) {
        return reject(400, "Temperature out of range");
      }
      const { product, room } = resolveProcRoomThresholds(thresholds);
      const productBand = processRoomBand(
        input.product_temp_c,
        Number(product.target_temp_c),
        Number(product.max_temp_c),
      );
      const roomBand = processRoomBand(
        input.room_temp_c,
        Number(room.target_temp_c),
        Number(room.max_temp_c),
      );
      const hasDeviation = productBand !== "pass" || roomBand !== "pass";
      if (hasDeviation) {
        if (!input.corrective_action) {
          return reject(400, "Corrective action required for deviation");
        }
        const { cause, disposition, recurrence } = input.corrective_action;
        if (!cause || !disposition || !recurrence) {
          return reject(400, "Incomplete corrective action");
        }
        if (!VALID_PROC_ROOM_CAUSES.has(cause)) {
          return reject(400, `Invalid cause: ${cause}`);
        }
        if (!DISPOSITION_MAP[disposition]) {
          return reject(400, `Invalid disposition: ${disposition}`);
        }
      }
      return { ok: true };
    },

    buildProcessingTemp({ input, userId, thresholds }): ProcessingTempPersist {
      const { product, room } = resolveProcRoomThresholds(thresholds);
      const productBand = processRoomBand(
        input.product_temp_c,
        Number(product.target_temp_c),
        Number(product.max_temp_c),
      );
      const roomBand = processRoomBand(
        input.room_temp_c,
        Number(room.target_temp_c),
        Number(room.max_temp_c),
      );
      const productPass = productBand === "pass";
      const roomPass = roomBand === "pass";
      const bothPass = productPass && roomPass;
      return {
        submitted_by: userId,
        date: input.date,
        session: input.session,
        product_temp_c: input.product_temp_c,
        room_temp_c: input.room_temp_c,
        product_within_limit: productPass,
        room_within_limit: roomPass,
        within_limits: bothPass,
        corrective_action_required: !bothPass,
      };
    },

    buildProcessingTempCorrectiveActions({
      input,
      userId,
      sourceId,
      thresholds,
    }): readonly CorrectiveActionInsert[] {
      const { product, room } = resolveProcRoomThresholds(thresholds);
      const productBand = processRoomBand(
        input.product_temp_c,
        Number(product.target_temp_c),
        Number(product.max_temp_c),
      );
      const roomBand = processRoomBand(
        input.room_temp_c,
        Number(room.target_temp_c),
        Number(room.max_temp_c),
      );
      const hasDeviation = productBand !== "pass" || roomBand !== "pass";
      if (!hasDeviation || !input.corrective_action) return [];

      const ca = input.corrective_action;
      const dispositionEnum = DISPOSITION_MAP[ca.disposition];
      const recurrence = ca.notes
        ? `${ca.recurrence} | Notes: ${ca.notes}`
        : ca.recurrence;
      const productActionText = deriveProcRoomAction(ca.cause, true, false, false);
      const roomActionText = deriveProcRoomAction(
        ca.cause,
        false,
        true,
        roomBand === "critical",
      );

      const caRows: CorrectiveActionInsert[] = [];
      if (productBand !== "pass") {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_processing_temps",
          source_id: sourceId,
          ccp_ref: "CCP3",
          deviation_description: `Product: ${input.product_temp_c}°C (limit ≤${Number(product.target_temp_c)}°C). Cause: ${ca.cause}`,
          action_taken: productActionText,
          product_disposition: dispositionEnum,
          recurrence_prevention: recurrence,
          // Amber (target < t ≤ max): CA raised, no mgmt sign-off. Critical
          // (> max): mgmt sign-off required.
          management_verification_required: productBand === "critical",
        });
      }
      if (roomBand !== "pass") {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_processing_temps",
          source_id: sourceId,
          ccp_ref: "CCP3",
          deviation_description: `Room: ${input.room_temp_c}°C (limit ≤${Number(room.target_temp_c)}°C). Cause: ${ca.cause}`,
          action_taken: roomActionText,
          product_disposition: dispositionEnum,
          recurrence_prevention: recurrence,
          management_verification_required: roomBand === "critical",
        });
      }
      return caRows;
    },

    // ── process-room thresholds (admin) ──
    listProcessRoomThresholds: () =>
      dailyChecks.listAllProcessRoomThresholds(),

    validateProcessRoomThreshold(input): ValidationResult {
      if (!input.id) return reject(400, "Threshold id is required");
      const hasTarget = input.target_temp_c !== undefined;
      const hasMax = input.max_temp_c !== undefined;
      if (!hasTarget && !hasMax) {
        return reject(400, "No valid fields to update");
      }
      if (hasTarget && !isProcessRoomTempInRange(input.target_temp_c!)) {
        return reject(400, "Target temperature out of range");
      }
      if (hasMax && !isProcessRoomTempInRange(input.max_temp_c!)) {
        return reject(400, "Max temperature out of range");
      }
      if (hasTarget && hasMax && input.target_temp_c! > input.max_temp_c!) {
        return reject(400, "Target must be less than or equal to max");
      }
      return { ok: true };
    },

    updateProcessRoomThreshold({ input, changedBy }) {
      return dailyChecks.updateProcessRoomThreshold(input, changedBy);
    },

    // ── process-room diary ──
    validateDailyDiary({ input, today }): ValidationResult {
      if (!input.phase || !input.date || !input.check_results) {
        return reject(400, "Missing required fields");
      }
      if (input.date !== today) {
        return reject(
          400,
          "Diary entries may only be submitted for today's date.",
        );
      }
      if (input.issues && !input.what_did_you_do?.trim()) {
        return reject(400, "Please describe what was done about the issue");
      }
      return { ok: true };
    },

    buildDailyDiary({ input, userId }): DailyDiaryPersist {
      return {
        submitted_by: userId,
        date: input.date,
        phase: input.phase,
        check_results: input.check_results,
        issues: input.issues,
        what_did_you_do: input.what_did_you_do?.trim() || null,
      };
    },

    buildDailyDiaryCorrectiveActions({
      input,
      userId,
      sourceId,
    }): readonly CorrectiveActionInsert[] {
      if (!input.issues) return [];
      const failedKeys = Object.entries(input.check_results)
        .filter(([, ok]) => ok === false)
        .map(([key]) => key);
      if (failedKeys.length === 0) return [];
      return failedKeys.map((key) => ({
        actioned_by: userId,
        source_table: "haccp_daily_diary" as const,
        source_id: sourceId,
        ccp_ref: `SOP1-${input.phase}`,
        deviation_description: `Diary (${input.phase}) — failed check: ${key}`,
        action_taken: (input.what_did_you_do ?? "").trim() || "See diary entry",
        product_disposition: null,
        recurrence_prevention: null,
        management_verification_required: false,
      }));
    },

    // ── mince ──
    validateMince({ input, daysFromKill, thresholds }): ValidationResult {
      if (
        !input.product_species ||
        !MINCE_VALID_SPECIES.includes(input.product_species)
      )
        return reject(400, "Species must be lamb, beef, or imported_vac");
      if (!input.kill_date) return reject(400, "Kill date is required");
      if (input.input_temp_c == null)
        return reject(400, "Input temperature is required");
      if (input.output_temp_c == null)
        return reject(400, "Output temperature is required");

      if (
        minceKillDaysHardFail(
          daysFromKill,
          minceKillRow(input.product_species, thresholds),
        )
      ) {
        return reject(
          400,
          `Kill date exceeded (${daysFromKill} days) — DO NOT MINCE. Segregate and return to supplier or dispose as Category 3 ABP.`,
        );
      }

      // AMBER IS DISPLAY ONLY: minceTempPass is false for amber AND fail, so
      // an amber reading still 400s without a corrective action.
      const inPass = minceTempPass(
        input.input_temp_c,
        minceInputRow("mince", thresholds),
      );
      const outPass = minceTempPass(
        input.output_temp_c,
        minceOutputRow("mince", input.output_mode ?? "chilled", thresholds),
      );
      const anyDeviation = !inPass || !outPass;
      if (anyDeviation && !input.corrective_action) {
        return reject(
          400,
          "Corrective action is required for temperature deviation",
        );
      }
      return { ok: true };
    },

    buildMince({
      input,
      userId,
      today,
      nowTime,
      daysFromKill,
      runNum,
      thresholds,
    }): MincePersist {
      const killPass = minceKillDaysPass(
        daysFromKill,
        minceKillRow(input.product_species, thresholds),
      );
      const inPass = minceTempPass(
        input.input_temp_c,
        minceInputRow("mince", thresholds),
      );
      const outPass = minceTempPass(
        input.output_temp_c,
        minceOutputRow("mince", input.output_mode ?? "chilled", thresholds),
      );
      const batchCode = buildBatchCode(
        "mince",
        today,
        input.product_species,
        runNum,
      );
      return {
        submitted_by: userId,
        date: today,
        time_of_production: nowTime,
        batch_code: batchCode,
        product_species: input.product_species,
        kill_date: input.kill_date,
        days_from_kill: daysFromKill,
        kill_date_within_limit: killPass,
        input_temp_c: input.input_temp_c,
        output_temp_c: input.output_temp_c,
        input_temp_pass: inPass,
        output_temp_pass: outPass,
        output_mode: input.output_mode ?? "chilled",
        source_batch_numbers: input.source_batch_numbers ?? [],
        source_delivery_ids: input.source_delivery_ids ?? [],
        corrective_action: input.corrective_action
          ? `${input.corrective_action.cause} | ${input.corrective_action.disposition} | ${input.corrective_action.recurrence}`
          : null,
      };
    },

    buildMinceCorrectiveActions({
      input,
      userId,
      sourceId,
      thresholds,
    }): readonly CorrectiveActionInsert[] {
      const inputRow = minceInputRow("mince", thresholds);
      const outputRow = minceOutputRow(
        "mince",
        input.output_mode ?? "chilled",
        thresholds,
      );
      const inPass = minceTempPass(input.input_temp_c, inputRow);
      const outPass = minceTempPass(input.output_temp_c, outputRow);
      const anyDeviation = !inPass || !outPass;
      if (!anyDeviation || !input.corrective_action) return [];

      const ca = input.corrective_action;
      const disp = DISPOSITION_MAP[ca.disposition] ?? "assess";
      const recNotes = ca.notes
        ? `${ca.recurrence} | Notes: ${ca.notes}`
        : ca.recurrence;
      const caRows: CorrectiveActionInsert[] = [];

      if (!inPass) {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_mince_log",
          source_id: sourceId,
          ccp_ref: "CCP-M1",
          deviation_description: `Mince input temp: ${input.input_temp_c}°C (limit ≤${Number(inputRow.pass_max)}°C, ${input.product_species}). Cause: ${ca.cause}`,
          action_taken: deriveMinceTempAction(
            "input",
            input.output_mode ?? "chilled",
            inputRow,
          ),
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: true,
        });
      }
      if (!outPass) {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_mince_log",
          source_id: sourceId,
          ccp_ref: "CCP-M1",
          deviation_description: `Mince output temp: ${input.output_temp_c}°C (limit ≤${Number(outputRow.pass_max)}°C, ${input.output_mode ?? "chilled"}). Cause: ${ca.cause}`,
          action_taken: deriveMinceTempAction(
            "output",
            input.output_mode ?? "chilled",
            outputRow,
          ),
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: true,
        });
      }
      return caRows;
    },

    // ── mince thresholds (admin) ──
    listMinceThresholds: () => dailyChecks.listMinceThresholds(),

    validateMinceThreshold(input, current): ValidationResult {
      if (!input.id) return reject(400, "Threshold id is required");
      // Band STRUCTURE is code-locked: which rows have an amber band / a limit
      // at all cannot change via the app — only the numbers move. (An admin
      // giving `kill_days_imported_vac` a limit — or removing lamb's — would
      // silently rewrite the documented CCP-M2 policy.)
      if ((input.pass_max === null) !== (current.pass_max === null)) {
        return reject(
          400,
          "Band structure is fixed — pass limit cannot be added or removed",
        );
      }
      if ((input.amber_max === null) !== (current.amber_max === null)) {
        return reject(
          400,
          "Band structure is fixed — amber band cannot be added or removed",
        );
      }
      if (input.pass_max !== null && !Number.isFinite(input.pass_max)) {
        return reject(400, "Pass limit must be a number");
      }
      if (input.amber_max !== null && !Number.isFinite(input.amber_max)) {
        return reject(400, "Amber limit must be a number");
      }
      if (current.kind === "kill_days") {
        // Kill-day grading is BINARY (DB CHECK) and in whole days.
        if (input.amber_max !== null) {
          return reject(400, "Kill-day rows are binary — no amber band");
        }
        if (
          input.pass_max !== null &&
          (!Number.isInteger(input.pass_max) || input.pass_max < 1)
        ) {
          return reject(
            400,
            "Kill-day limit must be a whole number of days (at least 1)",
          );
        }
      }
      // amber == pass is allowed and means "amber band empty".
      if (
        input.pass_max !== null &&
        input.amber_max !== null &&
        input.amber_max < input.pass_max
      ) {
        return reject(400, "Amber limit must be at or above the pass limit");
      }
      return { ok: true };
    },

    updateMinceThreshold({ input, changedBy }) {
      return dailyChecks.updateMinceThreshold(input, changedBy);
    },

    // ── meatprep ──
    validateMeatPrep(input, thresholds): ValidationResult {
      if (!input.product_name?.trim())
        return reject(400, "Product name is required");
      if (input.input_temp_c == null)
        return reject(400, "Input temperature is required");
      if (input.output_temp_c == null)
        return reject(400, "Output temperature is required");
      if (
        input.product_species &&
        !MINCE_VALID_SPECIES.includes(input.product_species)
      )
        return reject(400, "Invalid species");

      // AMBER IS DISPLAY ONLY — see validateMince.
      const inPass = minceTempPass(
        input.input_temp_c,
        minceInputRow("meatprep", thresholds),
      );
      const outPass = minceTempPass(
        input.output_temp_c,
        minceOutputRow("meatprep", input.output_mode ?? "chilled", thresholds),
      );
      const allergenLabelIssue =
        (input.allergens_present?.length ?? 0) > 0 &&
        !input.label_check_completed;
      const anyDeviation = !inPass || !outPass || allergenLabelIssue;
      if (anyDeviation && !input.corrective_action)
        return reject(400, "Corrective action is required for deviation");
      return { ok: true };
    },

    buildMeatPrep({
      input,
      userId,
      today,
      nowTime,
      daysFromKill,
      runNum,
      thresholds,
    }): MeatPrepPersist {
      const speciesForTemp = input.product_species ?? "beef";
      const inPass = minceTempPass(
        input.input_temp_c,
        minceInputRow("meatprep", thresholds),
      );
      const outPass = minceTempPass(
        input.output_temp_c,
        minceOutputRow("meatprep", input.output_mode ?? "chilled", thresholds),
      );
      const allSourceBatches = [
        ...(input.source_batch_numbers ?? []),
        ...(input.source_mince_batch_ids ?? []),
      ];
      const batchCode = buildBatchCode(
        "meatprep",
        today,
        speciesForTemp,
        runNum,
      );
      return {
        submitted_by: userId,
        date: today,
        time_of_production: nowTime,
        batch_code: batchCode,
        product_name: input.product_name.trim(),
        product_species: input.product_species ?? null,
        kill_date: input.kill_date ?? null,
        days_from_kill: daysFromKill,
        input_temp_c: input.input_temp_c,
        output_temp_c: input.output_temp_c,
        input_temp_pass: inPass,
        output_temp_pass: outPass,
        output_mode: input.output_mode ?? "chilled",
        allergens_present: input.allergens_present ?? [],
        label_check_completed: !!input.label_check_completed,
        source_batch_numbers: allSourceBatches,
        source_delivery_ids: input.source_delivery_ids ?? [],
        corrective_action: input.corrective_action
          ? `${input.corrective_action.cause} | ${input.corrective_action.disposition} | ${input.corrective_action.recurrence}`
          : null,
      };
    },

    buildMeatPrepCorrectiveActions({
      input,
      userId,
      sourceId,
      thresholds,
    }): readonly CorrectiveActionInsert[] {
      const inputRow = minceInputRow("meatprep", thresholds);
      const outputRow = minceOutputRow(
        "meatprep",
        input.output_mode ?? "chilled",
        thresholds,
      );
      const inPass = minceTempPass(input.input_temp_c, inputRow);
      const outPass = minceTempPass(input.output_temp_c, outputRow);
      // Route gates the CA write on temperature only (NOT allergenLabelIssue).
      if ((inPass && outPass) || !input.corrective_action) return [];

      const ca = input.corrective_action;
      const disp = DISPOSITION_MAP[ca.disposition] ?? "assess";
      const recNotes = ca.notes
        ? `${ca.recurrence} | Notes: ${ca.notes}`
        : ca.recurrence;
      const caRows: CorrectiveActionInsert[] = [];

      if (!inPass) {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_meatprep_log",
          source_id: sourceId,
          ccp_ref: "CCP-MP1",
          deviation_description: `Prep input temp: ${input.input_temp_c}°C (limit ≤${Number(inputRow.pass_max)}°C, ${input.product_name.trim()}). Cause: ${ca.cause}`,
          action_taken: derivePrepTempAction(
            "input",
            input.output_mode ?? "chilled",
            inputRow,
          ),
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: true,
        });
      }
      if (!outPass) {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_meatprep_log",
          source_id: sourceId,
          ccp_ref: "CCP-MP1",
          deviation_description: `Prep output temp: ${input.output_temp_c}°C (limit ≤${Number(outputRow.pass_max)}°C, ${input.product_name.trim()}). Cause: ${ca.cause}`,
          action_taken: derivePrepTempAction(
            "output",
            input.output_mode ?? "chilled",
            outputRow,
          ),
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: true,
        });
      }
      return caRows;
    },

    // ── timesep ──
    validateTimeSeparation(input): ValidationResult {
      if (!input.clean_completed_time)
        return reject(400, "Clean completed time is required");
      if (!input.clean_verified_by?.trim())
        return reject(400, "Verified by name is required");
      if (!input.allergens_in_production?.trim())
        return reject(400, "Allergens in production field is required");
      return { ok: true };
    },

    buildTimeSeparation({
      input,
      userId,
      today,
      nowTime,
    }): TimeSeparationPersist {
      return {
        submitted_by: userId,
        date: today,
        time_of_entry: nowTime,
        plain_products_end_time: input.plain_products_end_time ?? null,
        clean_completed_time: input.clean_completed_time,
        allergen_products_start_time: input.allergen_products_start_time ?? null,
        clean_verified_by: input.clean_verified_by.trim(),
        allergens_in_production: input.allergens_in_production.trim(),
        corrective_action: input.corrective_action?.trim() || null,
      };
    },

    buildTimeSeparationCorrectiveActions({
      input,
      userId,
      sourceId,
    }): readonly CorrectiveActionInsert[] {
      // Bug fix 1 (server half): the free-text corrective action — previously
      // dropped by the client and never registered — now files exactly one
      // MMP-TS row when non-empty. Empty/whitespace → no CA row (a clean
      // changeover writes nothing, as before).
      const text = input.corrective_action?.trim();
      if (!text) return [];
      return [
        {
          actioned_by: userId,
          source_table: "haccp_time_separation_log",
          source_id: sourceId,
          ccp_ref: "MMP-TS",
          deviation_description: `Time separation (MMP-MF-001 Form 3) — issue recorded during allergen changeover. Allergens in production: ${input.allergens_in_production.trim()}`,
          action_taken: text,
          product_disposition: null,
          recurrence_prevention: null,
          management_verification_required: true,
        },
      ];
    },

    // ── product-return ──
    validateReturn(input): ValidationResult {
      if (!input.customer?.trim()) return reject(400, "Customer is required");
      if (!input.product?.trim())
        return reject(400, "Product description is required");
      if (!input.return_code) return reject(400, "Select a return reason code");
      if (!input.disposition) return reject(400, "Select a disposition");
      if (!input.verified_by?.trim())
        return reject(400, "Verified by is required");
      if (input.return_code === "RC08" && !input.return_code_notes?.trim())
        return reject(400, "Please specify the reason for RC08 Other");
      if (
        input.return_code === "RC01" &&
        (input.temperature_c == null || isNaN(input.temperature_c))
      )
        return reject(
          400,
          "Temperature is required for temperature complaints",
        );
      return { ok: true };
    },

    buildReturn({ input, userId, today, nowTime }): ReturnPersist {
      return {
        submitted_by: userId,
        date: today,
        time_of_return: nowTime,
        customer: input.customer.trim(),
        customer_id: input.customer_id ?? null,
        product: input.product.trim(),
        return_code: input.return_code,
        return_code_notes: input.return_code_notes?.trim() || null,
        temperature_c: input.temperature_c ?? null,
        disposition: input.disposition,
        verified_by: input.verified_by.trim(),
        source_batch_number: input.source_batch_number?.trim() || null,
        corrective_action: input.corrective_action?.trim() || null,
      };
    },

    buildReturnCorrectiveActions({
      input,
      userId,
      sourceId,
    }): readonly CorrectiveActionInsert[] {
      // SOP-12: a CA row on EVERY return (audit trail), not just deviations.
      const isFoodSafety = ["RC01", "RC02", "RC04", "RC05"].includes(
        input.return_code,
      );
      return [
        {
          actioned_by: userId,
          source_table: "haccp_returns",
          source_id: sourceId,
          ccp_ref: "SOP12",
          deviation_description: `Product return — ${input.return_code}: ${
            input.return_code === "RC01" && input.temperature_c != null
              ? `Temperature ${input.temperature_c}°C on return. `
              : ""
          }Customer: ${input.customer.trim()}. Product: ${input.product.trim()}.`,
          action_taken:
            input.corrective_action?.trim() ||
            `Disposition: ${input.disposition}. Authorised by: ${input.verified_by.trim()}.`,
          product_disposition: input.disposition,
          recurrence_prevention: input.corrective_action?.trim()
            ? "See corrective action notes"
            : "Review procedures",
          management_verification_required: isFoodSafety,
        },
      ];
    },

    // ── inserts (thin passthroughs) ──
    insertDelivery: (payload) => dailyChecks.insertDelivery(payload),
    insertColdStorageReadings: (rows) =>
      dailyChecks.insertColdStorageReadings(rows),
    insertCalibrationCertified: (payload) =>
      dailyChecks.insertCalibrationCertified(payload),
    insertCalibrationManual: (payload) =>
      dailyChecks.insertCalibrationManual(payload),
    insertCleaning: (payload) => dailyChecks.insertCleaning(payload),
    insertProcessingTemp: (payload) =>
      dailyChecks.insertProcessingTemp(payload),
    insertDailyDiary: (payload) => dailyChecks.insertDailyDiary(payload),
    insertMince: (payload) => dailyChecks.insertMince(payload),
    insertMeatPrep: (payload) => dailyChecks.insertMeatPrep(payload),
    insertTimeSeparation: (payload) =>
      dailyChecks.insertTimeSeparation(payload),
    insertReturn: (payload) => dailyChecks.insertReturn(payload),
  };
}
