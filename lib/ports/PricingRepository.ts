/**
 * lib/ports/PricingRepository.ts
 *
 * The Pricing port (F-15) — the price-agreement persistence interface the
 * app owns, described in BUSINESS operations, not vendor calls. Pure
 * TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * Every method maps 1:1 to a PR2 endpoint operation — none is
 * speculative. If a method ever ends up with no consumer, delete it
 * (same discipline as RoutesRepository):
 *
 *   listAgreements      → GET    /api/pricing
 *   getAgreementById    → GET    /api/pricing/[id]
 *   createAgreement     → POST   /api/pricing
 *   updateAgreement     → PATCH  /api/pricing/[id]
 *   deleteAgreement     → DELETE /api/pricing/[id]
 *   getAgreementForEmail→ the PATCH email re-fetch (active-status side-effect)
 *   addLine             → POST   /api/pricing/[id]/lines
 *   replaceLines        → POST   /api/pricing/[id]/lines/replace (RPC)
 *   updateLine          → PATCH  /api/pricing/lines/[lineId]
 *   deleteLine          → DELETE /api/pricing/lines/[lineId]
 *   getAgreementOwner   → the RBAC ownership pre-check (select agreed_by[, status])
 *   getLineOwner        → the line-level RBAC walk (line → agreement.agreed_by)
 *
 * The depth rule (ADR-0002): the reads hide a multi-table embedded join +
 * per-agreement position sort + computed `is_expired` + vendor→domain
 * mapping; `replaceLines` hides the atomic `replace_agreement_lines` RPC
 * (one Postgres transaction). `getAgreementOwner` / `getLineOwner` exist
 * purely so PR2 can reproduce the current "is this your deal?" permission
 * check byte-identically without moving enforcement into the port.
 *
 * The email side-effect is NOT modelled here (it is composed in the PR2
 * route: update → if active, getAgreementForEmail → sendPricingEmail). The
 * port stays a pure persistence boundary.
 *
 * Boundary discipline (ADR-0002 line 27): the adapter maps snake_case
 * columns to camelCase domain fields and Postgres error codes to
 * app-owned errors INSIDE the adapter; callers see only `@/lib/domain`
 * types and `@/lib/errors`. Reads define errors out of existence
 * (null/empty on miss); every DB failure throws ServiceError.
 */

import type {
  PriceAgreement,
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

/**
 * Filter for the agreement list (GET /api/pricing). Today's GET applies NO
 * server-side `agreed_by` filter — sales "see all, edit own" — so PR1 lists
 * all agreements. The optional `agreedBy` is future-proofing so PR2 *could*
 * push the own-only filter into the port later without a signature change;
 * PR1's adapters ignore it (list all) to stay byte-identical with today.
 */
export interface ListAgreementsFilter {
  /** Reserved for a future own-only filter; ignored in PR1 (lists all). */
  readonly agreedBy?: string;
}

export interface PricingRepository {
  // ─── Reads ──────────────────────────────────────────────────

  /**
   * List all agreement headers (with computed `isExpired`, customer/rep
   * joins) ordered created_at desc — today's GET order. No agreed_by
   * filter is applied (sales see all). Hides the embedded joins + the
   * per-row is_expired computation + vendor mapping.
   * → app/api/pricing GET. @throws ServiceError on DB failure.
   */
  listAgreements(
    filter: ListAgreementsFilter,
  ): Promise<readonly PriceAgreement[]>;

  /**
   * Fetch one full agreement (header + position-sorted lines + joins) by
   * id. Null on miss (define errors out of existence — the route maps
   * null→404). Hides the multi-table join + line sort + is_expired.
   * → app/api/pricing/[id] GET. @throws ServiceError on DB failure.
   */
  getAgreementById(id: string): Promise<PriceAgreementWithLines | null>;

  /**
   * The full agreement re-fetch the PATCH route does AFTER activating, to
   * build the email body. Same shape as getAgreementById (header + lines +
   * joins). Null on miss. PR2 composes: update → if active, this →
   * sendPricingEmail. The email send itself is NOT in this port.
   * → the PATCH active-status email re-fetch. @throws ServiceError on DB failure.
   */
  getAgreementForEmail(id: string): Promise<PriceAgreementWithLines | null>;

  // ─── Writes ─────────────────────────────────────────────────

  /**
   * Create an agreement header + its lines in one call. Status is set to
   * 'draft' on create (today's literal). Invalid lines (price <= 0, or
   * neither productId nor a trimmed override) are filtered out exactly as
   * the route does; a line-insert failure does NOT undo the header (the
   * route returns the agreement even if lines fail). Returns the
   * `{ id, referenceNumber }` echo.
   * → app/api/pricing POST. @throws ServiceError on header-insert failure.
   */
  createAgreement(input: CreateAgreementInput): Promise<CreatedAgreement>;

  /**
   * Patch the header fields supplied (the 6 PATCH-able fields). Returns the
   * trimmed `{ id, referenceNumber, status, updatedAt }` echo, or null if
   * no row matched id.
   * → app/api/pricing/[id] PATCH. @throws ServiceError on DB failure.
   */
  updateAgreement(
    id: string,
    patch: UpdateAgreementInput,
  ): Promise<PatchedAgreement | null>;

  /**
   * Permanently delete an agreement by id (lines cascade). Idempotent —
   * deleting a missing id is not an error.
   * → app/api/pricing/[id] DELETE. @throws ServiceError on DB failure.
   */
  deleteAgreement(id: string): Promise<void>;

  /**
   * Add ONE line to an agreement, computing the next position (max
   * existing position + 1) when the caller does not pin one. Returns the
   * created line with its product display fields resolved.
   * → app/api/pricing/[id]/lines POST. @throws ServiceError on DB failure.
   */
  addLine(agreementId: string, input: CreateLineInput): Promise<PriceLine>;

  /**
   * Atomically replace ALL lines for an agreement via the
   * `replace_agreement_lines` RPC (ONE Postgres transaction: delete all,
   * then bulk-insert). An empty array is valid (agreement with no lines).
   * Returns the number of lines written. The Fake reproduces the same
   * all-or-nothing semantics in memory.
   * → app/api/pricing/[id]/lines/replace POST. @throws ServiceError on DB failure.
   */
  replaceLines(
    agreementId: string,
    lines: readonly CreateLineInput[],
  ): Promise<number>;

  /**
   * Patch the supplied fields of one line. Returns the updated line with
   * product display fields resolved, or null if no row matched lineId.
   * → app/api/pricing/lines/[lineId] PATCH. @throws ServiceError on DB failure.
   */
  updateLine(
    lineId: string,
    patch: UpdateLineInput,
  ): Promise<PriceLine | null>;

  /**
   * Permanently delete one line by id. Idempotent — deleting a missing id
   * is not an error.
   * → app/api/pricing/lines/[lineId] DELETE. @throws ServiceError on DB failure.
   */
  deleteLine(lineId: string): Promise<void>;

  // ─── RBAC pre-check reads ───────────────────────────────────

  /**
   * The owner + status of an agreement, for the route's RBAC pre-check
   * (`select('agreed_by, status')`). Null on miss. No enforcement here —
   * PR2's route compares against the caller.
   * → the PATCH/DELETE/addLine ownership pre-check. @throws ServiceError on DB failure.
   */
  getAgreementOwner(
    id: string,
  ): Promise<{ agreedBy: string; status: AgreementStatus } | null>;

  /**
   * The owner of the agreement a line belongs to (the line-level RBAC walk
   * `price_agreement_lines → price_agreements.agreed_by`). Null on miss.
   * → the line PATCH/DELETE ownership pre-check. @throws ServiceError on DB failure.
   */
  getLineOwner(lineId: string): Promise<{ agreedBy: string } | null>;
}
