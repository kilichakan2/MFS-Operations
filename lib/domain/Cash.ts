/**
 * lib/domain/Cash.ts
 *
 * App-owned Cash domain types (F-16). Pure TypeScript — no framework
 * imports, no vendor imports. The database's snake_case spelling
 * (opening_balance, is_locked, cheque_number, …) never appears here;
 * the Supabase adapter maps it to these camelCase fields and the rest
 * of the app only ever sees these shapes (ADR-0002).
 *
 * Every type is the clean, owned vocabulary for one Cash concept: a
 * month's cash book, an in/out entry, a customer cheque, a month
 * summary, and the request inputs each route body becomes. Header/role
 * parsing stays in the routes (PR2) — these inputs carry the already
 * resolved caller id (createdBy/editedBy/loggedBy).
 */

export type CashEntryType = "income" | "expense";
export type ChequeStatusFilter = "all" | "not_banked" | "banked";

/** A small id+name pair for the user/customer join enrichments. */
export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

/** A cash_months row, camelCase. */
export interface CashMonth {
  readonly id: string;
  readonly year: number;
  readonly month: number; // 1..12
  readonly openingBalance: number;
  readonly isLocked: boolean;
  readonly createdBy: string | null;
  readonly createdAt: string; // ISO-8601
}

/** A cash_entries row with the joins resolved (createdByName/editedByName/customerName)
 *  and a freshly-minted signed URL. signedUrl is null on create (matches today). */
export interface CashEntry {
  readonly id: string;
  readonly monthId: string;
  readonly entryDate: string; // YYYY-MM-DD
  readonly type: CashEntryType;
  readonly category: string | null;
  readonly amount: number;
  readonly description: string;
  readonly reference: string | null;
  readonly attachmentPath: string | null;
  readonly attachmentName: string | null;
  readonly createdAt: string; // ISO-8601
  readonly editedAt: string | null;
  readonly customerId: string | null;
  // join enrichments (route mapping verbatim):
  readonly createdByName: string; // users.name ?? 'Unknown'
  readonly editedByName: string | null; // users.name ?? null
  readonly customerName: string | null; // customers.name ?? null
  readonly signedUrl: string | null; // attachment signed URL (3600s) or null
}

/** A cheque_records row with joins resolved (route mapping verbatim). */
export interface ChequeRecord {
  readonly id: string;
  readonly date: string; // YYYY-MM-DD
  readonly amount: number;
  readonly chequeNumber: string | null;
  readonly notes: string | null;
  readonly createdAt: string; // ISO-8601
  readonly banked: boolean;
  readonly bankedAt: string | null;
  readonly customerId: string | null; // present on writes; reads echo customer join
  readonly customer: NamedRef | null; // customers(id,name) join
  readonly customerName: string | null; // free-text customer_name fallback column
  readonly driver: NamedRef | null; // users join (driver_id)
  readonly loggedByName: string; // users.name ?? 'Unknown'
  readonly bankedByName: string | null; // users.name ?? null
}

/** opening/income/expense/closing for a month (the GET/POST `summary` block). */
export interface CashMonthSummary {
  readonly opening: number;
  readonly totalIncome: number;
  readonly totalExpense: number;
  readonly closing: number;
}

// ── Inputs (what each route body becomes; header/role parsing stays in routes) ──

export interface CreateMonthInput {
  readonly year: number;
  readonly month: number;
  readonly createdBy: string; // x-mfs-user-id
  /** Required ONLY for the first-ever month; ignored otherwise (auto-computed). */
  readonly openingBalance: number | null;
}

export interface CreateEntryInput {
  readonly monthId: string;
  readonly entryDate: string;
  readonly type: CashEntryType;
  readonly category: string | null;
  readonly amount: number;
  readonly description: string;
  readonly reference: string | null;
  readonly attachmentPath: string | null;
  readonly attachmentName: string | null;
  readonly customerId: string | null;
  readonly createdBy: string; // x-mfs-user-id
}

export interface UpdateEntryInput {
  readonly amount?: number;
  readonly description?: string;
  readonly category?: string | null;
  readonly reference?: string | null;
  readonly attachmentPath?: string | null;
  readonly attachmentName?: string | null;
  readonly editedBy: string; // x-mfs-user-id (always set with edited_at)
}

export interface CreateChequeInput {
  readonly date: string;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly amount: number;
  readonly driverId: string;
  readonly chequeNumber: string | null;
  readonly notes: string | null;
  readonly loggedBy: string; // x-mfs-user-id
}

export interface UpdateChequeInput {
  readonly date?: string;
  readonly customerId?: string | null;
  readonly amount?: number;
  readonly driverId?: string;
  readonly chequeNumber?: string | null;
  readonly notes?: string | null;
}

export interface ChequeListFilter {
  readonly status: ChequeStatusFilter;
  readonly from: string | null;
  readonly to: string | null;
}

/** The "month doesn't exist yet" probe result (GET month miss branch). */
export interface MonthExistsProbe {
  readonly isFirst: boolean;
  readonly suggestedOpening: number | null;
}
