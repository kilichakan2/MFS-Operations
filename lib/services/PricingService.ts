/**
 * lib/services/PricingService.ts
 *
 * The Pricing service (F-15) — business orchestration for price agreements.
 * It copies RoutesService / OrdersService posture exactly: factory here,
 * wiring in `lib/wiring/pricing.ts`; ONE port (`pricing`), never another
 * service.
 *
 * Unlike Routes (which owns the 7pm rollover + week bounds), Pricing has
 * NO date-rollover business rule to own: `is_expired` is computed in the
 * ADAPTER's read mapping against `londonToday()`, matching the routes today.
 * So this service is a thin passthrough layer — the depth (joins, mapping,
 * the atomic replace RPC, max-position computation) all lives in the
 * adapter where the vendor SDK is allowed.
 *
 * Construction (factory + composition root — ADR-0002, F-TD-11):
 *   - `createPricingService({ pricing })` factory — tests pass a Fake repo.
 *   - Production wiring lives in `lib/wiring/pricing.ts` (service-role
 *     singleton) — NEVER a pre-wired singleton here. Service files import
 *     ports only, never the adapters folder (lint-enforced).
 */

import type {
  PriceAgreementWithLines,
  PriceLine,
  CreateAgreementInput,
  CreateLineInput,
  UpdateAgreementInput,
  UpdateLineInput,
  CreatedAgreement,
  PatchedAgreement,
  AgreementStatus,
} from "@/lib/domain";
import type { PricingRepository, ListAgreementsFilter } from "@/lib/ports";

// ─── Repository bundle ──────────────────────────────────────

/**
 * Ports accepted by `createPricingService`, passed as a named object so the
 * call site is unambiguous: createPricingService({ pricing }).
 */
export interface PricingServiceDeps {
  readonly pricing: PricingRepository;
}

// ─── The PricingService interface ───────────────────────────

export interface PricingService {
  /** List all agreements with their lines (passthrough; adapter computes is_expired + sorts lines). */
  listAgreements(
    filter: ListAgreementsFilter,
  ): Promise<readonly PriceAgreementWithLines[]>;

  /** Fetch one full agreement by id; null on miss (passthrough). */
  getAgreementById(id: string): Promise<PriceAgreementWithLines | null>;

  /** Full re-fetch for the activation email body; null on miss (passthrough). */
  getAgreementForEmail(id: string): Promise<PriceAgreementWithLines | null>;

  /** Create an agreement header + its lines (passthrough; adapter does work). */
  createAgreement(input: CreateAgreementInput): Promise<CreatedAgreement>;

  /** Patch header fields; null on missing id (passthrough). */
  updateAgreement(
    id: string,
    patch: UpdateAgreementInput,
  ): Promise<PatchedAgreement | null>;

  /** Permanently delete an agreement; idempotent (passthrough). */
  deleteAgreement(id: string): Promise<void>;

  /** Add one line, computing next position (passthrough). */
  addLine(agreementId: string, input: CreateLineInput): Promise<PriceLine>;

  /** Atomically replace all lines via the RPC; returns count (passthrough). */
  replaceLines(
    agreementId: string,
    lines: readonly CreateLineInput[],
  ): Promise<number>;

  /** Patch one line; null on missing id (passthrough). */
  updateLine(
    lineId: string,
    patch: UpdateLineInput,
  ): Promise<PriceLine | null>;

  /** Permanently delete one line; idempotent (passthrough). */
  deleteLine(lineId: string): Promise<void>;

  /** Owner + status pre-check read for RBAC; null on miss (passthrough). */
  getAgreementOwner(
    id: string,
  ): Promise<{ agreedBy: string; status: AgreementStatus } | null>;

  /** Line-level owner pre-check read for RBAC; null on miss (passthrough). */
  getLineOwner(lineId: string): Promise<{ agreedBy: string } | null>;
}

// ─── The factory ────────────────────────────────────────────

export function createPricingService(
  deps: PricingServiceDeps,
): PricingService {
  const { pricing } = deps;

  return {
    listAgreements: (filter) => pricing.listAgreements(filter),
    getAgreementById: (id) => pricing.getAgreementById(id),
    getAgreementForEmail: (id) => pricing.getAgreementForEmail(id),
    createAgreement: (input) => pricing.createAgreement(input),
    updateAgreement: (id, patch) => pricing.updateAgreement(id, patch),
    deleteAgreement: (id) => pricing.deleteAgreement(id),
    addLine: (agreementId, input) => pricing.addLine(agreementId, input),
    replaceLines: (agreementId, lines) =>
      pricing.replaceLines(agreementId, lines),
    updateLine: (lineId, patch) => pricing.updateLine(lineId, patch),
    deleteLine: (lineId) => pricing.deleteLine(lineId),
    getAgreementOwner: (id) => pricing.getAgreementOwner(id),
    getLineOwner: (lineId) => pricing.getLineOwner(lineId),
  };
}
