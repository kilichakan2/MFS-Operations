/**
 * lib/adapters/supabase/CashRepository.ts
 *
 * Supabase implementation of `CashRepository` (lib/ports/CashRepository.ts).
 * One of the adapter files allowed to import `@supabase/supabase-js`
 * (allow-listed for the `lib/adapters/supabase` tree at `.eslintrc.json`).
 * The ONLY file that imports the vendor SDK for the Cash DB.
 *
 * Boundary discipline (ADR-0002 line 27): PostgREST row shapes are touched
 * only inside the method bodies. Vendor column names (opening_balance,
 * is_locked, cheque_number, banked_at, customer_id, …) are mapped to
 * camelCase domain fields, so the rest of the app never sees the database's
 * spelling. The `.select(…)` strings are copied VERBATIM from the eight
 * Cash routes the PR2 re-point will replace, so the wire output stays
 * byte-identical.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseCashRepository(client)` factory — tests pass a
 *     test-scoped client; wiring passes the service-role singleton.
 *   - `supabaseCashRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return null/empty on miss;
 * every DB failure throws ServiceError; a duplicate (year,month) on
 * createMonth throws ConflictError (PG 23505 → 409).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError, ConflictError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  CashMonth,
  CashEntry,
  ChequeRecord,
  CashMonthSummary,
  CashEntryType,
  CreateMonthInput,
  CreateEntryInput,
  UpdateEntryInput,
  CreateChequeInput,
  UpdateChequeInput,
  ChequeListFilter,
  MonthExistsProbe,
  NamedRef,
} from "@/lib/domain";
import type { CashRepository } from "@/lib/ports";

// Select field lists copied VERBATIM from the eight Cash routes the PR2
// re-point will replace, so the wire output stays byte-identical. The route
// files remain the source of truth for which keys each endpoint returns.

// GET /api/cash/month entries block — includes month_id + edited_at.
const ENTRY_COLS_FULL = `
        id, month_id, entry_date, type, category, amount,
        description, reference, attachment_path, attachment_name,
        created_at, edited_at, customer_id,
        created_by_user:users!cash_entries_created_by_fkey(name),
        edited_by_user:users!cash_entries_edited_by_fkey(name),
        customer:customers(id, name)
      `;

// POST /api/cash/entry insert echo — no edited_at (fresh row).
const ENTRY_COLS_CREATE = `
        id, month_id, entry_date, type, category, amount,
        description, reference, attachment_path, attachment_name, created_at, customer_id,
        created_by_user:users!cash_entries_created_by_fkey(name),
        customer:customers(id, name)
      `;

// GET /api/cash/export type=cash entries — no id/month_id/edited_at.
const ENTRY_COLS_EXPORT = `
          entry_date, type, category, amount, description, reference,
          created_by_user:users!cash_entries_created_by_fkey(name),
          customer:customers(id, name)
        `;

// GET /api/cash/cheques list — id + full driver(id,name) + customer(id,name).
const CHEQUE_COLS_LIST = `
        id, date, amount, cheque_number, notes, created_at,
        banked, banked_at, customer_name,
        customer:customers(id, name),
        driver:users!cheque_records_driver_id_fkey(id, name),
        logged_by_user:users!cheque_records_logged_by_fkey(name),
        banked_by_user:users!cheque_records_banked_by_fkey(name)
      `;

// POST /api/cash/cheques insert echo — no banked_by_user (fresh, not banked).
const CHEQUE_COLS_CREATE = `
        id, date, amount, cheque_number, notes, created_at, banked, banked_at, customer_name,
        customer:customers(id, name),
        driver:users!cheque_records_driver_id_fkey(id, name),
        logged_by_user:users!cheque_records_logged_by_fkey(name)
      `;

// GET /api/cash/export type=cheques register — customer(name) only, driver(name) only.
const CHEQUE_COLS_EXPORT = `
          date, amount, cheque_number, notes, created_at, banked, banked_at, customer_name,
          customer:customers(name),
          driver:users!cheque_records_driver_id_fkey(name),
          logged_by_user:users!cheque_records_logged_by_fkey(name),
          banked_by_user:users!cheque_records_banked_by_fkey(name)
        `;

// ─── coercion helpers ────────────────────────────────────────────────

/** Supabase embeds a to-one join as either an object or a 1-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── row shapes (PostgREST) ──────────────────────────────────────────

interface NameJoinRow {
  name: string;
}

interface IdNameJoinRow {
  id: string;
  name: string;
}

interface MonthRow {
  id: string;
  year: number;
  month: number;
  opening_balance: unknown;
  is_locked: unknown;
  created_by: string | null;
  created_at: string;
}

interface EntryRow {
  id?: string;
  month_id?: string;
  entry_date: string;
  type: string;
  category: string | null;
  amount: unknown;
  description: string;
  reference: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
  created_at?: string;
  edited_at?: string | null;
  customer_id?: string | null;
  created_by_user?: NameJoinRow | NameJoinRow[] | null;
  edited_by_user?: NameJoinRow | NameJoinRow[] | null;
  customer?: IdNameJoinRow | IdNameJoinRow[] | null;
}

interface ChequeRow {
  id: string;
  date: string;
  amount: unknown;
  cheque_number: string | null;
  notes: string | null;
  created_at: string;
  banked: unknown;
  banked_at: string | null;
  customer_id?: string | null;
  customer_name: string | null;
  customer?: IdNameJoinRow | IdNameJoinRow[] | null;
  driver?: IdNameJoinRow | IdNameJoinRow[] | null;
  logged_by_user?: NameJoinRow | NameJoinRow[] | null;
  banked_by_user?: NameJoinRow | NameJoinRow[] | null;
}

// ─── row → domain mappers ────────────────────────────────────────────

function toMonth(row: MonthRow): CashMonth {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    openingBalance: Number(row.opening_balance),
    isLocked: Boolean(row.is_locked),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Map an entry row to the domain CashEntry. `signedUrl` is supplied by the
 *  caller (minted only on the list read); create + export pass null. */
function toEntry(row: EntryRow, signedUrl: string | null): CashEntry {
  const customer = one(row.customer ?? null);
  return {
    id: row.id ?? "",
    monthId: row.month_id ?? "",
    entryDate: row.entry_date,
    type: row.type as CashEntryType,
    category: row.category,
    amount: Number(row.amount),
    description: row.description,
    reference: row.reference,
    attachmentPath: row.attachment_path ?? null,
    attachmentName: row.attachment_name ?? null,
    createdAt: row.created_at ?? "",
    editedAt: row.edited_at ?? null,
    customerId: row.customer_id ?? null,
    createdByName: one(row.created_by_user ?? null)?.name ?? "Unknown",
    editedByName: one(row.edited_by_user ?? null)?.name ?? null,
    customerName: customer?.name ?? null,
    signedUrl,
  };
}

function toCheque(row: ChequeRow): ChequeRecord {
  const customer = one(row.customer ?? null);
  const driver = one(row.driver ?? null);
  const customerRef: NamedRef | null = customer
    ? { id: customer.id, name: customer.name }
    : null;
  const driverRef: NamedRef | null = driver
    ? { id: driver.id, name: driver.name }
    : null;
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount),
    chequeNumber: row.cheque_number,
    notes: row.notes,
    createdAt: row.created_at,
    banked: Boolean(row.banked),
    bankedAt: row.banked_at ?? null,
    customerId: row.customer_id ?? null,
    customer: customerRef,
    customerName: row.customer_name ?? null,
    driver: driverRef,
    loggedByName: one(row.logged_by_user ?? null)?.name ?? "Unknown",
    bankedByName: one(row.banked_by_user ?? null)?.name ?? null,
  };
}

/** opening + Σ(income) − Σ(expense), Number()-coerced exactly as the routes. */
function closingFromSums(
  opening: number,
  totalIncome: number,
  totalExpense: number,
): number {
  return Number(opening) + totalIncome - totalExpense;
}

export function createSupabaseCashRepository(
  client: SupabaseClient,
): CashRepository {
  // The signed-URL mint, shared by the list read. Mirrors the route's
  // getSignedUrl: empty path → null; vendor failure → null.
  async function signedUrlFor(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await client.storage
      .from("cash-attachments")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  async function sumEntries(
    monthId: string,
  ): Promise<{ totalIncome: number; totalExpense: number }> {
    const { data, error } = await client
      .from("cash_entries")
      .select("type, amount")
      .eq("month_id", monthId);
    if (error) {
      log.error("CashRepository.sumEntriesForMonth DB error", {
        monthId,
        error: error.message,
      });
      throw new ServiceError("Entry sum failed", { cause: error });
    }
    const rows = (data ?? []) as { type: string; amount: unknown }[];
    const totalIncome = rows
      .filter((r) => r.type === "income")
      .reduce((s, r) => s + Number(r.amount), 0);
    const totalExpense = rows
      .filter((r) => r.type === "expense")
      .reduce((s, r) => s + Number(r.amount), 0);
    return { totalIncome, totalExpense };
  }

  /** The latest month (year desc, month desc), or null. */
  async function latestMonthRow(): Promise<MonthRow | null> {
    const { data, error } = await client
      .from("cash_months")
      .select("id, year, month, opening_balance")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1);
    if (error) {
      log.error("CashRepository latest-month lookup DB error", {
        error: error.message,
      });
      throw new ServiceError("Month lookup failed", { cause: error });
    }
    const rows = (data ?? []) as MonthRow[];
    return rows.length === 0 ? null : rows[0];
  }

  return {
    async findMonth(year: number, month: number): Promise<CashMonth | null> {
      const { data, error } = await client
        .from("cash_months")
        .select("*")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();
      if (error) {
        log.error("CashRepository.findMonth DB error", {
          year,
          month,
          error: error.message,
        });
        throw new ServiceError("Month lookup failed", { cause: error });
      }
      return data === null ? null : toMonth(data as unknown as MonthRow);
    },

    async findMonthById(id: string): Promise<CashMonth | null> {
      const { data, error } = await client
        .from("cash_months")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("CashRepository.findMonthById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Month lookup failed", { cause: error });
      }
      return data === null ? null : toMonth(data as unknown as MonthRow);
    },

    async probeMonth(): Promise<MonthExistsProbe> {
      const prev = await latestMonthRow();
      if (prev === null) {
        return { isFirst: true, suggestedOpening: null };
      }
      const { totalIncome, totalExpense } = await sumEntries(prev.id);
      const suggestedOpening = closingFromSums(
        Number(prev.opening_balance),
        totalIncome,
        totalExpense,
      );
      return { isFirst: false, suggestedOpening };
    },

    async createMonth(
      input: CreateMonthInput,
    ): Promise<{ month: CashMonth; summary: CashMonthSummary }> {
      // Reproduce the route branch: if a prior month exists, opening =
      // that month's closing; else opening = input.openingBalance (the
      // caller has validated it is present for the first-ever month).
      const prev = await latestMonthRow();
      let openingBalance: number;
      if (prev === null) {
        openingBalance = Number(input.openingBalance);
      } else {
        const { totalIncome, totalExpense } = await sumEntries(prev.id);
        openingBalance = closingFromSums(
          Number(prev.opening_balance),
          totalIncome,
          totalExpense,
        );
      }

      const { data, error } = await client
        .from("cash_months")
        .insert({
          year: input.year,
          month: input.month,
          opening_balance: openingBalance,
          created_by: input.createdBy,
        })
        .select()
        .single();
      if (error || !data) {
        // Duplicate (year,month) → ConflictError (PG 23505 → 409).
        if ((error as { code?: string } | null)?.code === "23505") {
          throw new ConflictError("Month already exists", { cause: error });
        }
        log.error("CashRepository.createMonth DB error", {
          year: input.year,
          month: input.month,
          error: error?.message,
        });
        throw new ServiceError("Failed to create month", {
          cause: error ?? new Error("no row returned"),
        });
      }

      const month = toMonth(data as unknown as MonthRow);
      const summary: CashMonthSummary = {
        opening: openingBalance,
        totalIncome: 0,
        totalExpense: 0,
        closing: openingBalance,
      };
      return { month, summary };
    },

    async setMonthLocked(
      id: string,
      isLocked: boolean,
    ): Promise<CashMonth | null> {
      const { data, error } = await client
        .from("cash_months")
        .update({ is_locked: isLocked })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        log.error("CashRepository.setMonthLocked DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Update failed", { cause: error });
      }
      return data === null ? null : toMonth(data as unknown as MonthRow);
    },

    async listEntriesForMonth(
      monthId: string,
    ): Promise<readonly CashEntry[]> {
      const { data, error } = await client
        .from("cash_entries")
        .select(ENTRY_COLS_FULL)
        .eq("month_id", monthId)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        log.error("CashRepository.listEntriesForMonth DB error", {
          monthId,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
      const rows = (data ?? []) as unknown as EntryRow[];
      return Promise.all(
        rows.map(async (r) =>
          toEntry(r, await signedUrlFor(r.attachment_path ?? null)),
        ),
      );
    },

    sumEntriesForMonth(monthId: string) {
      return sumEntries(monthId);
    },

    async createEntry(input: CreateEntryInput): Promise<CashEntry> {
      const { data, error } = await client
        .from("cash_entries")
        .insert({
          month_id: input.monthId,
          entry_date: input.entryDate,
          type: input.type,
          category: input.type === "expense" ? (input.category ?? null) : null,
          amount: Number(input.amount),
          description: String(input.description).trim(),
          reference: input.reference ? String(input.reference).trim() : null,
          attachment_path: input.attachmentPath ?? null,
          attachment_name: input.attachmentName ?? null,
          customer_id:
            input.type === "income" && input.customerId
              ? input.customerId
              : null,
          created_by: input.createdBy,
        })
        .select(ENTRY_COLS_CREATE)
        .single();
      if (error || !data) {
        log.error("CashRepository.createEntry DB error", {
          monthId: input.monthId,
          error: error?.message,
        });
        throw new ServiceError("Failed to create entry", {
          cause: error ?? new Error("no row returned"),
        });
      }
      // signed_url is null on create (matches today).
      return toEntry(data as unknown as EntryRow, null);
    },

    async updateEntry(
      id: string,
      patch: UpdateEntryInput,
    ): Promise<CashEntry | null> {
      // Mirror the route's updates object: edited_by/edited_at always set,
      // then only the supplied fields (the route uses `!= null` guards).
      const updates: Record<string, unknown> = {
        edited_by: patch.editedBy,
        edited_at: new Date().toISOString(),
      };
      if (patch.amount != null) updates.amount = Number(patch.amount);
      if (patch.description != null) {
        updates.description = String(patch.description).trim();
      }
      if (patch.category != null) updates.category = patch.category;
      if (patch.reference != null) updates.reference = patch.reference;
      if (patch.attachmentPath != null) {
        updates.attachment_path = patch.attachmentPath;
      }
      if (patch.attachmentName != null) {
        updates.attachment_name = patch.attachmentName;
      }

      const { data, error } = await client
        .from("cash_entries")
        .update(updates)
        .eq("id", id)
        .select(ENTRY_COLS_FULL)
        .maybeSingle();
      if (error) {
        log.error("CashRepository.updateEntry DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
      return data === null
        ? null
        : toEntry(data as unknown as EntryRow, null);
    },

    async findEntryAttachmentPath(id: string): Promise<string | null> {
      const { data, error } = await client
        .from("cash_entries")
        .select("attachment_path")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("CashRepository.findEntryAttachmentPath DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Entry lookup failed", { cause: error });
      }
      return (
        (data as { attachment_path?: string | null } | null)
          ?.attachment_path ?? null
      );
    },

    async deleteEntry(id: string): Promise<void> {
      const { error } = await client
        .from("cash_entries")
        .delete()
        .eq("id", id);
      if (error) {
        log.error("CashRepository.deleteEntry DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
    },

    async listCheques(
      filter: ChequeListFilter,
    ): Promise<readonly ChequeRecord[]> {
      let query = client
        .from("cheque_records")
        .select(CHEQUE_COLS_LIST)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (filter.status === "not_banked") query = query.eq("banked", false);
      if (filter.status === "banked") query = query.eq("banked", true);
      if (filter.from) query = query.gte("date", filter.from);
      if (filter.to) query = query.lte("date", filter.to);

      const { data, error } = await query;
      if (error) {
        log.error("CashRepository.listCheques DB error", {
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
      return (data ?? []).map((r) => toCheque(r as unknown as ChequeRow));
    },

    async createCheque(input: CreateChequeInput): Promise<ChequeRecord> {
      const { data, error } = await client
        .from("cheque_records")
        .insert({
          date: input.date,
          customer_id: input.customerId || null,
          customer_name: input.customerName || null,
          amount: Number(input.amount),
          driver_id: input.driverId,
          cheque_number: input.chequeNumber?.trim() || null,
          notes: input.notes?.trim() || null,
          logged_by: input.loggedBy,
          banked: false,
        })
        .select(CHEQUE_COLS_CREATE)
        .single();
      if (error || !data) {
        log.error("CashRepository.createCheque DB error", {
          error: error?.message,
        });
        throw new ServiceError("Failed to create cheque", {
          cause: error ?? new Error("no row returned"),
        });
      }
      // Fresh cheque: banked false, bankedByName null (no banked_by_user join).
      return toCheque(data as unknown as ChequeRow);
    },

    async bankCheque(
      id: string,
      bankedBy: string,
    ): Promise<{ bankedAt: string } | null> {
      const bankedAt = new Date().toISOString();
      const { data, error } = await client
        .from("cheque_records")
        .update({ banked: true, banked_by: bankedBy, banked_at: bankedAt })
        .eq("id", id)
        .eq("banked", false) // idempotency — only bank once
        .select()
        .maybeSingle();
      if (error) {
        log.error("CashRepository.bankCheque DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
      if (data === null) return null; // already banked or not found
      return { bankedAt: (data as { banked_at: string }).banked_at };
    },

    async updateCheque(
      id: string,
      patch: UpdateChequeInput,
    ): Promise<ChequeRecord | null> {
      // Mirror the route's `!= null` field loop (admin edit).
      const updates: Record<string, unknown> = {};
      if (patch.date != null) updates.date = patch.date;
      if (patch.customerId != null) updates.customer_id = patch.customerId;
      if (patch.amount != null) updates.amount = Number(patch.amount);
      if (patch.driverId != null) updates.driver_id = patch.driverId;
      if (patch.chequeNumber != null) {
        updates.cheque_number = patch.chequeNumber || null;
      }
      if (patch.notes != null) updates.notes = patch.notes || null;

      const { data, error } = await client
        .from("cheque_records")
        .update(updates)
        .eq("id", id)
        .select(CHEQUE_COLS_LIST)
        .maybeSingle();
      if (error) {
        log.error("CashRepository.updateCheque DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
      return data === null ? null : toCheque(data as unknown as ChequeRow);
    },

    async deleteCheque(id: string): Promise<void> {
      const { error } = await client
        .from("cheque_records")
        .delete()
        .eq("id", id);
      if (error) {
        log.error("CashRepository.deleteCheque DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
    },

    async readCashBookData(
      year: number,
      month: number,
    ): Promise<{ month: CashMonth; entries: readonly CashEntry[] } | null> {
      const { data: monthData, error: monthErr } = await client
        .from("cash_months")
        .select("id, opening_balance, is_locked")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();
      if (monthErr) {
        log.error("CashRepository.readCashBookData month DB error", {
          year,
          month,
          error: monthErr.message,
        });
        throw new ServiceError("Month lookup failed", { cause: monthErr });
      }
      if (monthData === null) return null;

      const monthRow = monthData as {
        id: string;
        opening_balance: unknown;
        is_locked: unknown;
      };

      const { data: entryData, error: entryErr } = await client
        .from("cash_entries")
        .select(ENTRY_COLS_EXPORT)
        .eq("month_id", monthRow.id)
        .order("entry_date")
        .order("created_at");
      if (entryErr) {
        log.error("CashRepository.readCashBookData entries DB error", {
          monthId: monthRow.id,
          error: entryErr.message,
        });
        throw new ServiceError(entryErr.message, { cause: entryErr });
      }

      // The export select omits id/month_id/year/month/created_by/created_at;
      // map to the same CashEntry shape, leaving omitted fields at their
      // documented defaults. The CSV builder reads only the fields present.
      const month_: CashMonth = {
        id: monthRow.id,
        year,
        month,
        openingBalance: Number(monthRow.opening_balance),
        isLocked: Boolean(monthRow.is_locked),
        createdBy: null,
        createdAt: "",
      };
      const entries = ((entryData ?? []) as unknown as EntryRow[]).map((r) =>
        toEntry(r, null),
      );
      return { month: month_, entries };
    },

    async readChequeRegisterData(
      from: string,
      to: string,
    ): Promise<readonly ChequeRecord[]> {
      const { data, error } = await client
        .from("cheque_records")
        .select(CHEQUE_COLS_EXPORT)
        .gte("date", from)
        .lte("date", to)
        .order("date")
        .order("created_at");
      if (error) {
        log.error("CashRepository.readChequeRegisterData DB error", {
          from,
          to,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
      return (data ?? []).map((r) => toCheque(r as unknown as ChequeRow));
    },
  };
}

export const supabaseCashRepository: CashRepository =
  createSupabaseCashRepository(supabaseService);
