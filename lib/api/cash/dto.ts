/**
 * lib/api/cash/dto.ts
 *
 * DTO translators: the Cash domain shapes (camelCase) → the EXACT legacy
 * snake_case wire shapes the cash screens read today (F-16 PR2). Pure
 * functions, no I/O, unit-tested key-for-key AND key-order — these are the
 * wire-compat tripwire for the route re-point.
 *
 * Key ORDER is load-bearing: NextResponse.json serialises object keys in
 * insertion order, so the order below must match each route's current
 * response literal (or the DB column order for the `select('*')` raw-row
 * endpoints) verbatim.
 *
 * Two shapes intentionally diverge from a strict raw-row echo (Gate-2
 * conductor rulings, plan §15) — both confirmed invisible to the sole cash
 * UI (app/cash/page.tsx):
 *   - Entry list/create (toEntryListWireDto/toEntryCreateWireDto): emit the
 *     flattened `*_name` shape only; the vestigial raw join sub-objects
 *     (created_by_user/edited_by_user/customer) the routes used to spread are
 *     dropped (R-WIRE-2, §15.2 — the UI reads only the flattened names).
 *   - Edit responses (toEntryEditWireDto/toChequeEditWireDto): the PATCH
 *     endpoints used to echo the BARE table row, which carries FK id columns
 *     (created_by/edited_by; driver_id/logged_by/banked_by) the lossy domain
 *     objects drop. D-EDIT-A (§15.3/§15.4): map the available domain fields to
 *     the bare-row key names; the dropped FK ids are an accepted, invisible
 *     divergence (the UI re-fetches / reads only edited_at).
 */
import type {
  CashMonth,
  CashEntry,
  ChequeRecord,
  CashMonthSummary,
  NamedRef,
} from "@/lib/domain";

// ─── Wire shapes (what the cash screens were built to read) ──

/** The `month` object — the full cash_months row, DB column order (R-WIRE-1). */
export interface CashMonthDto {
  id: string;
  year: number;
  month: number;
  opening_balance: number;
  is_locked: boolean;
  created_by: string | null;
  created_at: string;
}

/** The GET/POST `summary` block. */
export interface CashSummaryDto {
  opening: number;
  total_income: number;
  total_expense: number;
  closing: number;
}

/** An entry in the month GET `entries` array (flatten-only, §15.2). */
export interface CashEntryListDto {
  id: string;
  month_id: string;
  entry_date: string;
  type: string;
  category: string | null;
  amount: number;
  description: string;
  reference: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
  edited_at: string | null;
  customer_id: string | null;
  signed_url: string | null;
  created_by_name: string;
  edited_by_name: string | null;
  customer_name: string | null;
}

/** The entry POST `entry` echo (no edited_at/edited_by_name — fresh row). */
export interface CashEntryCreateDto {
  id: string;
  month_id: string;
  entry_date: string;
  type: string;
  category: string | null;
  amount: number;
  description: string;
  reference: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
  customer_id: string | null;
  created_by_name: string;
  customer_name: string | null;
  signed_url: string | null;
}

/** The entry PATCH `entry` echo — bare cash_entries row keys (D-EDIT-A). */
export interface CashEntryEditDto {
  id: string;
  month_id: string;
  entry_date: string;
  type: string;
  category: string | null;
  amount: number;
  description: string;
  reference: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
  edited_at: string | null;
  customer_id: string | null;
}

/** A cheque GET list row + cheque POST echo (explicit shaped object). */
export interface ChequeDto {
  id: string;
  date: string;
  amount: number;
  cheque_number: string | null;
  notes: string | null;
  created_at: string;
  banked: boolean;
  banked_at: string | null;
  customer: NamedRef | null;
  customer_name: string | null;
  driver: NamedRef | null;
  logged_by_name: string;
  banked_by_name: string | null;
}

/** The cheque PATCH edit `record` echo — bare cheque_records row keys (D-EDIT-A). */
export interface ChequeEditDto {
  id: string;
  date: string;
  customer_id: string | null;
  amount: number;
  cheque_number: string | null;
  notes: string | null;
  created_at: string;
  banked: boolean;
  banked_at: string | null;
  customer_name: string | null;
}

// ─── Translators ─────────────────────────────────────────────

/**
 * A cash_months row → the `month` wire object. Key ORDER follows the
 * cash_months CREATE TABLE column order (the routes use `select('*')`):
 * id, year, month, opening_balance, is_locked, created_by, created_at
 * (baseline migration 20260101000000_baseline.sql).
 */
export function toMonthWireDto(m: CashMonth): CashMonthDto {
  return {
    id: m.id,
    year: m.year,
    month: m.month,
    opening_balance: m.openingBalance,
    is_locked: m.isLocked,
    created_by: m.createdBy,
    created_at: m.createdAt,
  };
}

/** The month-lock PATCH response: `{ month: <full row> }` (lossless, §6.6). */
export function toMonthLockWireDto(m: CashMonth): { month: CashMonthDto } {
  return { month: toMonthWireDto(m) };
}

/** A CashMonthSummary → the snake_case `summary` block. */
export function toSummaryWireDto(s: CashMonthSummary): CashSummaryDto {
  return {
    opening: s.opening,
    total_income: s.totalIncome,
    total_expense: s.totalExpense,
    closing: s.closing,
  };
}

/**
 * A CashEntry → a month GET `entries` row. Flatten-only (§15.2): the raw
 * join sub-objects the route used to spread are dropped; the UI reads only
 * the flattened `*_name` keys. Key order = the route's spread order then the
 * appended derived keys.
 */
export function toEntryListWireDto(e: CashEntry): CashEntryListDto {
  return {
    id: e.id,
    month_id: e.monthId,
    entry_date: e.entryDate,
    type: e.type,
    category: e.category,
    amount: e.amount,
    description: e.description,
    reference: e.reference,
    attachment_path: e.attachmentPath,
    attachment_name: e.attachmentName,
    created_at: e.createdAt,
    edited_at: e.editedAt,
    customer_id: e.customerId,
    signed_url: e.signedUrl,
    created_by_name: e.createdByName,
    edited_by_name: e.editedByName,
    customer_name: e.customerName,
  };
}

/**
 * A freshly-created CashEntry → the entry POST `entry` echo. Omits
 * edited_at/edited_by_name (fresh row). Key order = ENTRY_COLS_CREATE columns
 * then created_by_name, customer_name, signed_url (the route literal).
 */
export function toEntryCreateWireDto(e: CashEntry): CashEntryCreateDto {
  return {
    id: e.id,
    month_id: e.monthId,
    entry_date: e.entryDate,
    type: e.type,
    category: e.category,
    amount: e.amount,
    description: e.description,
    reference: e.reference,
    attachment_path: e.attachmentPath,
    attachment_name: e.attachmentName,
    created_at: e.createdAt,
    customer_id: e.customerId,
    created_by_name: e.createdByName,
    customer_name: e.customerName,
    signed_url: e.signedUrl,
  };
}

/**
 * A CashEntry → the entry PATCH `entry` echo (D-EDIT-A, §15.3). Maps the
 * available domain fields onto the bare cash_entries row key set + column
 * order. The bare row's FK ids `created_by`/`edited_by` are dropped by the
 * domain and therefore absent — accepted, invisible (the UI reads only
 * data.entry.edited_at).
 */
export function toEntryEditWireDto(e: CashEntry): CashEntryEditDto {
  return {
    id: e.id,
    month_id: e.monthId,
    entry_date: e.entryDate,
    type: e.type,
    category: e.category,
    amount: e.amount,
    description: e.description,
    reference: e.reference,
    attachment_path: e.attachmentPath,
    attachment_name: e.attachmentName,
    created_at: e.createdAt,
    edited_at: e.editedAt,
    customer_id: e.customerId,
  };
}

/**
 * A ChequeRecord → a cheque GET list row / POST echo. The route builds an
 * explicit shaped object (NOT a raw spread); this matches it key-for-key.
 */
export function toChequeWireDto(c: ChequeRecord): ChequeDto {
  return {
    id: c.id,
    date: c.date,
    amount: c.amount,
    cheque_number: c.chequeNumber,
    notes: c.notes,
    created_at: c.createdAt,
    banked: c.banked,
    banked_at: c.bankedAt,
    customer: c.customer,
    customer_name: c.customerName,
    driver: c.driver,
    logged_by_name: c.loggedByName,
    banked_by_name: c.bankedByName,
  };
}

/**
 * A ChequeRecord → the cheque PATCH edit `record` echo (D-EDIT-A, §15.4).
 * Maps the available domain fields onto the bare cheque_records row key set +
 * column order. The bare row's FK ids `driver_id`/`logged_by`/`banked_by`
 * are dropped by the domain and therefore absent — accepted, invisible (the
 * UI never reads data.record; it re-fetches the list after an edit).
 */
export function toChequeEditWireDto(c: ChequeRecord): ChequeEditDto {
  return {
    id: c.id,
    date: c.date,
    customer_id: c.customerId,
    amount: c.amount,
    cheque_number: c.chequeNumber,
    notes: c.notes,
    created_at: c.createdAt,
    banked: c.banked,
    banked_at: c.bankedAt,
    customer_name: c.customerName,
  };
}
