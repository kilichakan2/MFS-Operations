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
import type { HaccpDailyChecksRepository } from "@/lib/ports";

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

const VALID_COLD_STORAGE_CAUSES = new Set([
  "Door left open",
  "Unit overloaded",
  "Seal damaged",
  "Equipment failure",
  "Power interruption",
  "Other",
]);

const VALID_PROC_ROOM_CAUSES = new Set([
  "A/C or cooling failure",
  "Doors left open",
  "Product held in room too long",
  "Batch too large",
  "Equipment failure",
  "Power interruption",
  "Other",
]);

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

function deliveryTempStatus(
  temp: number | null,
  category: string,
): "pass" | "urgent" | "fail" {
  if (category === "dry_goods") return "pass";
  if (temp === null || isNaN(temp as number)) return "fail";
  const t = temp as number;
  switch (category) {
    case "lamb":
    case "beef":
    case "red_meat":
      return t <= 5.0 ? "pass" : t <= 8.0 ? "urgent" : "fail";
    case "offal":
      return t <= 3.0 ? "pass" : "fail";
    case "mince_prep":
      return t <= 4.0 ? "pass" : "fail";
    case "frozen":
    case "frozen_beef_lamb":
      return t <= -18.0 ? "pass" : t <= -15.0 ? "urgent" : "fail";
    case "poultry":
    case "dairy":
    case "chilled_other":
      return t <= 8.0 ? "pass" : "fail";
    default:
      return "fail";
  }
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
  roomTemp: number,
): string {
  if (cause === "Equipment failure")
    return PR_PROTOCOLS.equipment_failure.join(" | ");
  if (productBreached) return PR_PROTOCOLS.product_breach.join(" | ");
  if (roomBreached) {
    return roomTemp > 15
      ? PR_PROTOCOLS.room_breach_high.join(" | ")
      : PR_PROTOCOLS.room_breach_amber.join(" | ");
  }
  return PR_PROTOCOLS.product_breach.join(" | ");
}

// ─── mince-prep logic (verbatim) ─────────────────────────────────────────────

function deriveMinceTempAction(
  channel: "input" | "output",
  outputMode: string,
): string {
  if (channel === "input") {
    return [
      "Quarantine batch immediately.",
      "Assess product condition and odour.",
      "Attempt rapid chilling to ≤7°C within 2 hours.",
      "If ≤7°C not achieved within 2 hours: reject product and return to supplier.",
      "Investigate supplier temperature control and delivery conditions.",
      "Record deviation on Mincing Production Log (MMP-MF-001 Form 1).",
    ].join(" ");
  }
  if (outputMode === "frozen") {
    return [
      "Extend freezing time and recheck temperature after 30 minutes.",
      "If still above -18°C: assess product and review blast freezer capacity.",
      "Reduce batch sizes to ensure temperature compliance.",
      "Do not dispatch until ≤-18°C is confirmed.",
    ].join(" ");
  }
  return [
    "Extend chilling period and recheck temperature after 30 minutes.",
    "If still above 2°C: assess product safety.",
    "Reduce batch size — product may be too warm from mincing friction.",
    "Do not dispatch until ≤2°C is confirmed.",
  ].join(" ");
}

function derivePrepTempAction(
  channel: "input" | "output",
  outputMode: string,
): string {
  if (channel === "input") {
    return [
      "Quarantine batch immediately.",
      "Assess product condition.",
      "Attempt rapid chilling to ≤7°C within 2 hours.",
      "If ≤7°C not achieved: reject product.",
      "Record deviation on Meat Prep Production Log (MMP-MF-001 Form 2).",
    ].join(" ");
  }
  if (outputMode === "frozen") {
    return [
      "Extend freezing time and recheck after 30 minutes.",
      "If still above -18°C: assess product and review freezer capacity.",
      "Do not dispatch until ≤-18°C is confirmed.",
    ].join(" ");
  }
  return [
    "Extend chilling period and recheck after 30 minutes.",
    "If still above 4°C: assess product safety before dispatch.",
    "Consider reducing batch size.",
  ].join(" ");
}

function killDatePass(species: string, daysFromKill: number): boolean {
  if (species === "imported_vac") return true;
  return daysFromKill <= 6;
}

function killDateHardFail(species: string, daysFromKill: number): boolean {
  if (species === "imported_vac") return false;
  return daysFromKill > 6;
}

function inputTempPass(temp: number): boolean {
  return temp <= 7;
}

function outputTempPass(
  temp: number,
  form: "mince" | "meatprep",
  mode: string,
): boolean {
  if (mode === "frozen") return temp <= -18;
  return form === "mince" ? temp <= 2 : temp <= 4;
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
  killDatePass(species: string, daysFromKill: number): boolean;
  killDateHardFail(species: string, daysFromKill: number): boolean;
  inputTempPass(temp: number): boolean;
  outputTempPass(
    temp: number,
    form: "mince" | "meatprep",
    mode: string,
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
  }): DeliveryBuildResult;
  buildDeliveryCorrectiveActions(args: {
    input: CreateDeliveryInput;
    userId: string;
    sourceId: string;
    tempStatus: "pass" | "urgent" | "fail";
  }): readonly CorrectiveActionInsert[];

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
  }): ValidationResult;
  buildProcessingTemp(args: {
    input: CreateProcessingTempInput;
    userId: string;
  }): ProcessingTempPersist;
  buildProcessingTempCorrectiveActions(args: {
    input: CreateProcessingTempInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

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
  }): ValidationResult;
  buildMince(args: {
    input: CreateMinceInput;
    userId: string;
    today: string;
    nowTime: string;
    daysFromKill: number;
    runNum: number;
  }): MincePersist;
  buildMinceCorrectiveActions(args: {
    input: CreateMinceInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

  // ── meatprep ──
  validateMeatPrep(input: CreateMeatPrepInput): ValidationResult;
  buildMeatPrep(args: {
    input: CreateMeatPrepInput;
    userId: string;
    today: string;
    nowTime: string;
    daysFromKill: number | null;
    runNum: number;
  }): MeatPrepPersist;
  buildMeatPrepCorrectiveActions(args: {
    input: CreateMeatPrepInput;
    userId: string;
    sourceId: string;
  }): readonly CorrectiveActionInsert[];

  // ── timesep ──
  validateTimeSeparation(input: CreateTimeSeparationInput): ValidationResult;
  buildTimeSeparation(args: {
    input: CreateTimeSeparationInput;
    userId: string;
    today: string;
    nowTime: string;
  }): TimeSeparationPersist;

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
  insertTimeSeparation(payload: TimeSeparationPersist): Promise<void>;
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
    killDatePass,
    killDateHardFail,
    inputTempPass,
    outputTempPass,

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
    }): DeliveryBuildResult {
      const isMeat = isMeatCategory(input.product_category);
      const status = deliveryTempStatus(
        input.temperature_c,
        input.product_category,
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
    validateProcessingTemp({ input, today }): ValidationResult {
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
      const productPass = input.product_temp_c <= 4.0;
      const roomPass = input.room_temp_c <= 12.0;
      const hasDeviation = !(productPass && roomPass);
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

    buildProcessingTemp({ input, userId }): ProcessingTempPersist {
      const productPass = input.product_temp_c <= 4.0;
      const roomPass = input.room_temp_c <= 12.0;
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
    }): readonly CorrectiveActionInsert[] {
      const productPass = input.product_temp_c <= 4.0;
      const roomPass = input.room_temp_c <= 12.0;
      const hasDeviation = !(productPass && roomPass);
      if (!hasDeviation || !input.corrective_action) return [];

      const ca = input.corrective_action;
      const dispositionEnum = DISPOSITION_MAP[ca.disposition];
      const recurrence = ca.notes
        ? `${ca.recurrence} | Notes: ${ca.notes}`
        : ca.recurrence;
      const productActionText = deriveProcRoomAction(
        ca.cause,
        true,
        false,
        input.room_temp_c,
      );
      const roomActionText = deriveProcRoomAction(
        ca.cause,
        false,
        true,
        input.room_temp_c,
      );

      const caRows: CorrectiveActionInsert[] = [];
      if (!productPass) {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_processing_temps",
          source_id: sourceId,
          ccp_ref: "CCP3",
          deviation_description: `Product: ${input.product_temp_c}°C (limit ≤4°C). Cause: ${ca.cause}`,
          action_taken: productActionText,
          product_disposition: dispositionEnum,
          recurrence_prevention: recurrence,
          management_verification_required: true,
        });
      }
      if (!roomPass) {
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_processing_temps",
          source_id: sourceId,
          ccp_ref: "CCP3",
          deviation_description: `Room: ${input.room_temp_c}°C (limit ≤12°C). Cause: ${ca.cause}`,
          action_taken: roomActionText,
          product_disposition: dispositionEnum,
          recurrence_prevention: recurrence,
          management_verification_required: input.room_temp_c > 15,
        });
      }
      return caRows;
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
    validateMince({ input, daysFromKill }): ValidationResult {
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

      if (killDateHardFail(input.product_species, daysFromKill)) {
        return reject(
          400,
          `Kill date exceeded (${daysFromKill} days) — DO NOT MINCE. Segregate and return to supplier or dispose as Category 3 ABP.`,
        );
      }

      const inPass = inputTempPass(input.input_temp_c);
      const outPass = outputTempPass(
        input.output_temp_c,
        "mince",
        input.output_mode ?? "chilled",
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
    }): MincePersist {
      const killPass = killDatePass(input.product_species, daysFromKill);
      const inPass = inputTempPass(input.input_temp_c);
      const outPass = outputTempPass(
        input.output_temp_c,
        "mince",
        input.output_mode ?? "chilled",
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
    }): readonly CorrectiveActionInsert[] {
      const inPass = inputTempPass(input.input_temp_c);
      const outPass = outputTempPass(
        input.output_temp_c,
        "mince",
        input.output_mode ?? "chilled",
      );
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
          deviation_description: `Mince input temp: ${input.input_temp_c}°C (limit ≤7°C, ${input.product_species}). Cause: ${ca.cause}`,
          action_taken: deriveMinceTempAction(
            "input",
            input.output_mode ?? "chilled",
          ),
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: true,
        });
      }
      if (!outPass) {
        const limit =
          (input.output_mode ?? "chilled") === "frozen" ? "≤-18°C" : "≤2°C";
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_mince_log",
          source_id: sourceId,
          ccp_ref: "CCP-M1",
          deviation_description: `Mince output temp: ${input.output_temp_c}°C (limit ${limit}, ${input.output_mode ?? "chilled"}). Cause: ${ca.cause}`,
          action_taken: deriveMinceTempAction(
            "output",
            input.output_mode ?? "chilled",
          ),
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: true,
        });
      }
      return caRows;
    },

    // ── meatprep ──
    validateMeatPrep(input): ValidationResult {
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

      const inPass = inputTempPass(input.input_temp_c);
      const outPass = outputTempPass(
        input.output_temp_c,
        "meatprep",
        input.output_mode ?? "chilled",
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
    }): MeatPrepPersist {
      const speciesForTemp = input.product_species ?? "beef";
      const inPass = inputTempPass(input.input_temp_c);
      const outPass = outputTempPass(
        input.output_temp_c,
        "meatprep",
        input.output_mode ?? "chilled",
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
    }): readonly CorrectiveActionInsert[] {
      const inPass = inputTempPass(input.input_temp_c);
      const outPass = outputTempPass(
        input.output_temp_c,
        "meatprep",
        input.output_mode ?? "chilled",
      );
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
          deviation_description: `Prep input temp: ${input.input_temp_c}°C (limit ≤7°C, ${input.product_name.trim()}). Cause: ${ca.cause}`,
          action_taken: derivePrepTempAction(
            "input",
            input.output_mode ?? "chilled",
          ),
          product_disposition: disp,
          recurrence_prevention: recNotes,
          management_verification_required: true,
        });
      }
      if (!outPass) {
        const limit =
          (input.output_mode ?? "chilled") === "frozen" ? "≤-18°C" : "≤4°C";
        caRows.push({
          actioned_by: userId,
          source_table: "haccp_meatprep_log",
          source_id: sourceId,
          ccp_ref: "CCP-MP1",
          deviation_description: `Prep output temp: ${input.output_temp_c}°C (limit ${limit}, ${input.product_name.trim()}). Cause: ${ca.cause}`,
          action_taken: derivePrepTempAction(
            "output",
            input.output_mode ?? "chilled",
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
