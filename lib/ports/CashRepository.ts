/**
 * lib/ports/CashRepository.ts
 *
 * The Cash port (F-16) — the persistence interface the app owns across
 * the three Cash tables (cash_months, cash_entries, cheque_records),
 * described in BUSINESS operations, not vendor calls. Pure TypeScript:
 * imports domain types only, never an adapter or a vendor SDK.
 *
 * Every method maps 1:1 to a PR2 route operation — none is speculative:
 *
 *   findMonth             → GET    /api/cash/month (the month record)
 *   findMonthById         → POST   /api/cash/entry permission read
 *   probeMonth            → GET    /api/cash/month miss branch (suggested opening)
 *   createMonth           → POST   /api/cash/month
 *   setMonthLocked        → PATCH  /api/cash/month/[id]
 *   listEntriesForMonth   → GET    /api/cash/month entries block
 *   sumEntriesForMonth    → the month-summary income/expense totals
 *   createEntry           → POST   /api/cash/entry
 *   updateEntry           → PATCH  /api/cash/entry/[id]
 *   findEntryAttachmentPath → DELETE /api/cash/entry/[id] cleanup read
 *   deleteEntry           → DELETE /api/cash/entry/[id]
 *   listCheques           → GET    /api/cash/cheques
 *   createCheque          → POST   /api/cash/cheques
 *   bankCheque            → PATCH  /api/cash/cheques/[id] action=bank
 *   updateCheque          → PATCH  /api/cash/cheques/[id] action=edit
 *   deleteCheque          → DELETE /api/cash/cheques/[id]
 *   readCashBookData      → GET    /api/cash/export type=cash
 *   readChequeRegisterData→ GET    /api/cash/export type=cheques
 *
 * Boundary discipline (ADR-0002 line 27): the adapter maps snake_case
 * columns to camelCase domain fields and Postgres error codes to
 * app-owned errors INSIDE the adapter; callers see only `@/lib/domain`
 * types and `@/lib/errors`. Reads define errors out of existence
 * (null/empty on miss); every DB failure throws ServiceError.
 */

import type {
  CashMonth,
  CashEntry,
  ChequeRecord,
  CashMonthSummary,
  CreateMonthInput,
  CreateEntryInput,
  UpdateEntryInput,
  CreateChequeInput,
  UpdateChequeInput,
  ChequeListFilter,
  MonthExistsProbe,
} from "@/lib/domain";

export interface CashRepository {
  // ── cash_months ───────────────────────────────────────────────
  /** Find a month by (year, month). null on miss. → GET /api/cash/month. */
  findMonth(year: number, month: number): Promise<CashMonth | null>;

  /** Find a month by id (the entry POST permission read). null on miss. */
  findMonthById(id: string): Promise<CashMonth | null>;

  /** The "does this month exist yet?" probe: returns {isFirst, suggestedOpening}.
   *  suggestedOpening = closing of the most-recent month, or null if none.
   *  Hides: latest-month lookup + its entry sum. → GET month miss branch. */
  probeMonth(): Promise<MonthExistsProbe>;

  /** Create a month. Computes opening from the previous month's closing when one
   *  exists; otherwise uses input.openingBalance (caller has validated it is
   *  present for the first-ever month). Returns the created CashMonth + summary.
   *  Throws ConflictError if (year,month) already exists. → POST /api/cash/month. */
  createMonth(
    input: CreateMonthInput,
  ): Promise<{ month: CashMonth; summary: CashMonthSummary }>;

  /** Set is_locked on a month. null on missing id. → PATCH /api/cash/month/[id]. */
  setMonthLocked(id: string, isLocked: boolean): Promise<CashMonth | null>;

  // ── cash_entries ──────────────────────────────────────────────
  /** All entries for a month, joins resolved + signed URLs minted, ordered
   *  entry_date asc then created_at asc. → GET /api/cash/month entries block. */
  listEntriesForMonth(monthId: string): Promise<readonly CashEntry[]>;

  /** Lightweight income/expense sums used to compute a month summary without
   *  re-listing full entries (used by createMonth / probe internally OR exposed
   *  for the summary computation). Returns {totalIncome, totalExpense}. */
  sumEntriesForMonth(
    monthId: string,
  ): Promise<{ totalIncome: number; totalExpense: number }>;

  /** Insert an entry; returns the created CashEntry (joins resolved, signedUrl
   *  null — matches today). → POST /api/cash/entry. Caller validates first. */
  createEntry(input: CreateEntryInput): Promise<CashEntry>;

  /** Patch the supplied entry fields + edited_by/edited_at. null on missing id.
   *  → PATCH /api/cash/entry/[id]. */
  updateEntry(id: string, patch: UpdateEntryInput): Promise<CashEntry | null>;

  /** Read just the attachment_path of an entry (for delete cleanup). null on miss. */
  findEntryAttachmentPath(id: string): Promise<string | null>;

  /** Permanently delete an entry. Idempotent. → DELETE /api/cash/entry/[id]. */
  deleteEntry(id: string): Promise<void>;

  // ── cheque_records ────────────────────────────────────────────
  /** List cheques with status + from/to filters, joins resolved, ordered
   *  date desc then created_at desc. → GET /api/cash/cheques. */
  listCheques(filter: ChequeListFilter): Promise<readonly ChequeRecord[]>;

  /** Insert a cheque (banked=false); returns the created ChequeRecord (joins
   *  resolved, bankedByName null). → POST /api/cash/cheques. */
  createCheque(input: CreateChequeInput): Promise<ChequeRecord>;

  /** Idempotently mark a cheque banked (only if currently not banked); returns
   *  the new banked_at, or null if already banked / not found.
   *  → PATCH /api/cash/cheques/[id] action=bank. */
  bankCheque(id: string, bankedBy: string): Promise<{ bankedAt: string } | null>;

  /** Patch the supplied cheque fields (admin edit). Returns the updated row.
   *  → PATCH /api/cash/cheques/[id] action=edit. */
  updateCheque(
    id: string,
    patch: UpdateChequeInput,
  ): Promise<ChequeRecord | null>;

  /** Permanently delete a cheque. Idempotent. → DELETE /api/cash/cheques/[id]. */
  deleteCheque(id: string): Promise<void>;

  // ── export reads (used by the CSV builders) ───────────────────
  /** The month + its entries for the cash-book CSV (Date|Desc|Customer|Category|
   *  Ref|Debit|Credit|Balance). null on missing month. → GET export type=cash. */
  readCashBookData(
    year: number,
    month: number,
  ): Promise<{ month: CashMonth; entries: readonly CashEntry[] } | null>;

  /** The cheques in [from,to] for the register CSV. → GET export type=cheques. */
  readChequeRegisterData(
    from: string,
    to: string,
  ): Promise<readonly ChequeRecord[]>;
}
