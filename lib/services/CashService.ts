/**
 * lib/services/CashService.ts
 *
 * The Cash service (F-16) — business orchestration for the Cash domain.
 * Factory here, wiring in `lib/wiring/cash.ts`; depends on TWO ports
 * (`cash`, `attachments`), never on another service and never on the
 * adapters folder (lint-enforced, ADR-0002 / F-TD-11).
 *
 * Unlike PricingService (a pure passthrough), the Cash routes actually
 * THINK — so the thinking moves here:
 *   - pure calculators: closingBalance, monthSummary;
 *   - validation cascades: validateEntry, validateCheque (returning typed
 *     {status, message} rejections with the routes' EXACT message strings);
 *   - upload policy: validateAndBuildUploadPath (mime + 10MB gate + path);
 *   - two byte-identical CSV builders: buildCashBookCsv, buildChequeRegisterCsv;
 *   - thin passthroughs to the repository so PR2's routes call ONE object.
 *
 * deleteEntry is the one place PR1 needs both ports: it removes the
 * attachment first (if any) then deletes the row (today's behaviour).
 *
 * Caller identity (matches F-13/F-15): already-resolved {userId, role}
 * arrive as plain inputs. Header parsing + the 401/403 role gate stay in
 * the routes (PR2). The calendar-month check uses an injected `now: Date`
 * (LOCAL time via getFullYear/getMonth — NOT londonToday(); switching would
 * be a behaviour change), so tests pin it deterministically.
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
import type { CashRepository, AttachmentStorage } from "@/lib/ports";

// ─── Repository bundle ──────────────────────────────────────

export interface CashServiceDeps {
  readonly cash: CashRepository;
  readonly attachments: AttachmentStorage;
}

// ─── Validation result ──────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

// ─── Upload policy constants (copied verbatim from the upload route) ──

const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const MAX_MB = 10;

// ─── CSV helpers (copied VERBATIM from app/api/cash/export/route.ts) ──

// CSV cell — quote if needed
function cell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

// Build a CSV row from cells
function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(",");
}

// Blank row
const BLANK = "";

// Section separator (8 cols wide for cash, 9 for cheques)
function sep(cols: number): string {
  return Array(cols).fill("--------").join(",");
}

// Format currency
function gbp(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`;
}

// Format date dd/mm/yy
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

// Format datetime dd/mm/yy HH:MM
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── The CashService interface ──────────────────────────────

export interface CashService {
  // ── pure business calculators ──
  /** opening + Σ(income) − Σ(expense). Number() coercion preserved. */
  closingBalance(
    opening: number,
    entries: readonly { type: string; amount: number }[],
  ): number;

  /** Build the summary block {opening,totalIncome,totalExpense,closing}. */
  monthSummary(
    opening: number,
    entries: readonly { type: string; amount: number }[],
  ): CashMonthSummary;

  /** Validate a create-entry request against a month. Returns ok | a typed
   *  rejection {status, message} mirroring the route's exact codes. Takes
   *  `now: Date` so the calendar-month check is testable and byte-identical
   *  to today's `new Date()` (LOCAL time). */
  validateEntry(args: {
    input: CreateEntryInput;
    month: CashMonth | null;
    role: string | null;
    now: Date;
  }): ValidationResult;

  /** Validate a create-cheque request. Returns ok | rejection. */
  validateCheque(input: CreateChequeInput): ValidationResult;

  // ── upload policy (pure) ──
  /** ALLOWED mime list + MAX 10MB gate; builds `${userId}/${ts}.${ext}`. */
  validateAndBuildUploadPath(args: {
    userId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    now: Date;
  }):
    | { ok: true; path: string; name: string }
    | { ok: false; status: number; message: string };

  // ── CSV builders (PURE) ──
  /** Build the cash-book CSV string (8 cols, CRLF) byte-identical to today. */
  buildCashBookCsv(args: {
    year: number;
    month: number;
    monthRecord: CashMonth;
    entries: readonly CashEntry[];
    generatedAt: Date;
  }): { filename: string; csv: string };

  /** Build the cheque-register CSV string (9 cols, CRLF) byte-identical to today. */
  buildChequeRegisterCsv(args: {
    from: string;
    to: string;
    cheques: readonly ChequeRecord[];
    generatedAt: Date;
  }): { filename: string; csv: string };

  // ── thin passthroughs to the repository ──
  findMonth(year: number, month: number): Promise<CashMonth | null>;
  findMonthById(id: string): Promise<CashMonth | null>;
  probeMonth(): Promise<MonthExistsProbe>;
  createMonth(
    input: CreateMonthInput,
  ): Promise<{ month: CashMonth; summary: CashMonthSummary }>;
  setMonthLocked(id: string, isLocked: boolean): Promise<CashMonth | null>;
  listEntriesForMonth(monthId: string): Promise<readonly CashEntry[]>;
  createEntry(input: CreateEntryInput): Promise<CashEntry>;
  updateEntry(id: string, patch: UpdateEntryInput): Promise<CashEntry | null>;
  /** Delete an entry: remove its attachment first (if any), then delete the
   *  row. Composes attachments.remove + cash.deleteEntry. */
  deleteEntry(id: string): Promise<void>;
  listCheques(filter: ChequeListFilter): Promise<readonly ChequeRecord[]>;
  createCheque(input: CreateChequeInput): Promise<ChequeRecord>;
  bankCheque(
    id: string,
    bankedBy: string,
  ): Promise<{ bankedAt: string } | null>;
  updateCheque(
    id: string,
    patch: UpdateChequeInput,
  ): Promise<ChequeRecord | null>;
  deleteCheque(id: string): Promise<void>;
  uploadAttachment(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  readCashBookData(
    year: number,
    month: number,
  ): Promise<{ month: CashMonth; entries: readonly CashEntry[] } | null>;
  readChequeRegisterData(
    from: string,
    to: string,
  ): Promise<readonly ChequeRecord[]>;
}

// ─── The factory ────────────────────────────────────────────

export function createCashService(deps: CashServiceDeps): CashService {
  const { cash, attachments } = deps;

  function closingBalance(
    opening: number,
    entries: readonly { type: string; amount: number }[],
  ): number {
    return entries.reduce(
      (bal, e) =>
        bal + (e.type === "income" ? Number(e.amount) : -Number(e.amount)),
      Number(opening),
    );
  }

  return {
    closingBalance,

    monthSummary(
      opening: number,
      entries: readonly { type: string; amount: number }[],
    ): CashMonthSummary {
      const totalIncome = entries
        .filter((e) => e.type === "income")
        .reduce((s, e) => s + Number(e.amount), 0);
      const totalExpense = entries
        .filter((e) => e.type === "expense")
        .reduce((s, e) => s + Number(e.amount), 0);
      const closing = Number(opening) + totalIncome - totalExpense;
      return {
        opening: Number(opening),
        totalIncome,
        totalExpense,
        closing,
      };
    },

    validateEntry({ input, month, role, now }): ValidationResult {
      // Mirror the route cascade order exactly.
      if (
        !input.monthId ||
        !input.entryDate ||
        !input.type ||
        !input.amount ||
        !input.description
      ) {
        return {
          ok: false,
          status: 400,
          message:
            "month_id, entry_date, type, amount, description required",
        };
      }
      if (!["income", "expense"].includes(input.type)) {
        return {
          ok: false,
          status: 400,
          message: "type must be income or expense",
        };
      }
      if (Number(input.amount) <= 0) {
        return { ok: false, status: 400, message: "amount must be positive" };
      }
      if (month === null) {
        return { ok: false, status: 404, message: "Month not found" };
      }
      if (month.isLocked) {
        return { ok: false, status: 403, message: "This month is locked" };
      }
      // Office users can only add to the current calendar month (LOCAL time).
      if (role !== "admin") {
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        if (month.year !== currentYear || month.month !== currentMonth) {
          return {
            ok: false,
            status: 403,
            message: "Office users can only add entries to the current month",
          };
        }
      }
      // entry_date must be within the month.
      const entryDate = new Date(input.entryDate);
      if (
        entryDate.getFullYear() !== month.year ||
        entryDate.getMonth() + 1 !== month.month
      ) {
        return {
          ok: false,
          status: 400,
          message: "entry_date must be within the month",
        };
      }
      return { ok: true };
    },

    validateCheque(input: CreateChequeInput): ValidationResult {
      if (
        !input.date ||
        (!input.customerId && !input.customerName) ||
        !input.amount ||
        !input.driverId
      ) {
        return {
          ok: false,
          status: 400,
          message: "date, customer (id or name), amount, driver_id required",
        };
      }
      if (Number(input.amount) <= 0) {
        return { ok: false, status: 400, message: "amount must be positive" };
      }
      return { ok: true };
    },

    validateAndBuildUploadPath({ userId, fileName, contentType, sizeBytes, now }) {
      if (!ALLOWED.includes(contentType)) {
        return {
          ok: false,
          status: 400,
          message: `File type not allowed: ${contentType}`,
        };
      }
      if (sizeBytes > MAX_MB * 1024 * 1024) {
        return {
          ok: false,
          status: 400,
          message: `File too large (max ${MAX_MB}MB)`,
        };
      }
      const ext = fileName.split(".").pop() ?? "bin";
      const path = `${userId}/${now.getTime()}.${ext}`;
      return { ok: true, path, name: fileName };
    },

    buildCashBookCsv({ year, month, monthRecord, entries, generatedAt }) {
      const generatedAtStr = fmtDateTime(generatedAt.toISOString());
      const opening = Number(monthRecord.openingBalance);
      const totalIn = entries
        .filter((r) => r.type === "income")
        .reduce((s, r) => s + Number(r.amount), 0);
      const totalOut = entries
        .filter((r) => r.type === "expense")
        .reduce((s, r) => s + Number(r.amount), 0);
      const closing = opening + totalIn - totalOut;

      const periodName = new Date(year, month - 1, 1).toLocaleString("en-GB", {
        month: "long",
        year: "numeric",
      });

      // 8 columns: Date | Description | Customer | Category | Reference | Debit | Credit | Balance
      const COLS = 8;

      const lines: string[] = [
        // ── Header ──
        row("MFS GLOBAL LTD"),
        row("Cash Book — " + periodName),
        row("Generated:", generatedAtStr),
        BLANK,

        // ── Summary ──
        row("SUMMARY"),
        sep(COLS),
        row("Opening Balance", "", "", "", "", "", "", gbp(opening)),
        row("Total Receipts (Credit)", "", "", "", "", "", gbp(totalIn), ""),
        row("Total Payments (Debit)", "", "", "", "", gbp(totalOut), "", ""),
        row("Closing Balance", "", "", "", "", "", "", gbp(closing)),
        sep(COLS),
        BLANK,

        // ── Statement header ──
        row("CASH BOOK STATEMENT"),
        row(
          "Date",
          "Description",
          "Customer",
          "Category",
          "Reference",
          "Debit (Out)",
          "Credit (In)",
          "Balance",
        ),
        sep(COLS),

        // Opening balance row
        row("", "Opening Balance", "", "", "", "", "", gbp(opening)),
      ];

      // Statement rows with running balance
      let balance = opening;
      for (const r of entries) {
        const isIncome = r.type === "income";
        const amount = Number(r.amount);
        balance += isIncome ? amount : -amount;

        lines.push(
          row(
            fmtDate(String(r.entryDate)),
            String(r.description),
            r.customerName ?? "",
            r.category ? String(r.category) : "",
            r.reference ? String(r.reference) : "",
            isIncome ? "" : gbp(amount), // Debit = money out
            isIncome ? gbp(amount) : "", // Credit = money in
            gbp(balance),
          ),
        );
      }

      // Totals + closing
      lines.push(
        sep(COLS),
        row("", "TOTALS", "", "", "", gbp(totalOut), gbp(totalIn), ""),
        sep(COLS),
        row("", "Closing Balance", "", "", "", "", "", gbp(closing)),
        BLANK,

        // ── Footer ──
        row(monthRecord.isLocked ? "Status: LOCKED" : "Status: Open"),
        row(`Total transactions: ${entries.length}`),
        row("MFS Global Ltd · mfsops.com"),
      );

      const filename = `MFS-CashBook-${year}-${String(month).padStart(2, "0")}.csv`;
      return { filename, csv: lines.join("\r\n") };
    },

    buildChequeRegisterCsv({ from, to, cheques, generatedAt }) {
      const generatedAtStr = fmtDateTime(generatedAt.toISOString());
      const total = cheques.reduce((s, r) => s + Number(r.amount), 0);
      const banked = cheques
        .filter((r) => r.banked)
        .reduce((s, r) => s + Number(r.amount), 0);
      const outstanding = total - banked;

      const periodLabel = `${fmtDate(from)} to ${fmtDate(to)}`;

      // 9 columns
      const COLS = 9;

      const lines: string[] = [
        // ── Header ──
        row("MFS GLOBAL LTD"),
        row("Cheque Register — " + periodLabel),
        row("Generated:", generatedAtStr),
        BLANK,

        // ── Summary ──
        row("SUMMARY"),
        sep(COLS),
        row("Total Cheques Received", cheques.length),
        row("Total Value", gbp(total)),
        row("Total Banked", gbp(banked)),
        row("Outstanding (Not Banked)", gbp(outstanding)),
        sep(COLS),
        BLANK,

        // ── Register header ──
        row("CHEQUE REGISTER"),
        row(
          "Date",
          "Customer",
          "Cheque No.",
          "Amount",
          "Driver",
          "Logged By",
          "Status",
          "Banked By",
          "Banked At",
        ),
        sep(COLS),
      ];

      for (const r of cheques) {
        const custName = r.customer?.name ?? r.customerName ?? "—";
        lines.push(
          row(
            fmtDate(String(r.date)),
            custName,
            r.chequeNumber ? String(r.chequeNumber) : "—",
            gbp(Number(r.amount)),
            r.driver?.name ?? "—",
            r.loggedByName ?? "—",
            r.banked ? "Banked" : "Not Banked",
            r.bankedByName ?? "",
            r.bankedAt ? fmtDateTime(String(r.bankedAt)) : "",
          ),
        );
      }

      lines.push(
        sep(COLS),
        row("", "", "TOTAL", gbp(total), "", "", "", "", ""),
        row("", "", "BANKED", gbp(banked), "", "", "", "", ""),
        row("", "", "OUTSTANDING", gbp(outstanding), "", "", "", "", ""),
        BLANK,
        row("MFS Global Ltd · mfsops.com"),
      );

      const filename = `MFS-ChequeRegister-${from}-to-${to}.csv`;
      return { filename, csv: lines.join("\r\n") };
    },

    // ── thin passthroughs ──
    findMonth: (year, month) => cash.findMonth(year, month),
    findMonthById: (id) => cash.findMonthById(id),
    probeMonth: () => cash.probeMonth(),
    createMonth: (input) => cash.createMonth(input),
    setMonthLocked: (id, isLocked) => cash.setMonthLocked(id, isLocked),
    listEntriesForMonth: (monthId) => cash.listEntriesForMonth(monthId),
    createEntry: (input) => cash.createEntry(input),
    updateEntry: (id, patch) => cash.updateEntry(id, patch),

    async deleteEntry(id: string): Promise<void> {
      // Remove the attachment first (if any), then delete the row — today's
      // DELETE /api/cash/entry/[id] order. The one place PR1 needs both ports.
      const path = await cash.findEntryAttachmentPath(id);
      if (path) await attachments.remove([path]);
      await cash.deleteEntry(id);
    },

    listCheques: (filter) => cash.listCheques(filter),
    createCheque: (input) => cash.createCheque(input),
    bankCheque: (id, bankedBy) => cash.bankCheque(id, bankedBy),
    updateCheque: (id, patch) => cash.updateCheque(id, patch),
    deleteCheque: (id) => cash.deleteCheque(id),
    uploadAttachment: (path, bytes, contentType) =>
      attachments.upload(path, bytes, contentType),
    readCashBookData: (year, month) => cash.readCashBookData(year, month),
    readChequeRegisterData: (from, to) =>
      cash.readChequeRegisterData(from, to),
  };
}
