/**
 * lib/adapters/fake/CashRepository.ts
 *
 * In-memory implementation of `CashRepository`
 * (lib/ports/CashRepository.ts). No Supabase SDK import — pure JavaScript
 * Map storage of DOMAIN types. The faithful twin of the Supabase adapter:
 * it reproduces the same observable behaviour so the service unit tests
 * (and PR2 later) can rely on parity.
 *
 * It deliberately mirrors the database's hard rules so both adapters
 * answer identically:
 *   - CHECK amount > 0 → createEntry / createCheque reject amount <= 0.
 *   - CHECK type ∈ {income, expense} → createEntry rejects bad type.
 *   - UNIQUE (year, month) → createMonth throws ConflictError on a dup.
 *   - month delete cascades its entries (parity; not used in PR1).
 *   - bankCheque idempotency → only banks when currently not banked.
 *
 * Persistence shaping copied from the routes:
 *   - createEntry: income → customer_id kept, category nulled; expense →
 *     category kept, customer_id nulled. Description/reference trimmed.
 *   - createCheque: cheque_number/notes trimmed → null when blank;
 *     customer_id/customer_name → null when blank.
 *
 * Construction:
 *   - `createFakeCashRepository(seed?)` factory — tests inject the
 *     people/customers the joins resolve against (so reads return a
 *     populated createdByName/customerName/driver), mirroring
 *     `createFakePricingRepository`.
 *   - `fakeCashRepository` singleton — empty; exists for barrel symmetry.
 */

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
import { ServiceError, ConflictError } from "@/lib/errors";

/** A trimmed person reference the user joins resolve against. */
export interface FakeCashPersonRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed customer reference the customer join resolves against. */
export interface FakeCashCustomerRef {
  readonly id: string;
  readonly name: string;
}

/** Optional join directories so reads return populated joins. */
export interface FakeCashSeed {
  /** user id → person (created_by / edited_by / driver / logged_by / banked_by). */
  readonly people?: Readonly<Record<string, FakeCashPersonRef>>;
  /** customer id → customer (entry + cheque customer join). */
  readonly customers?: Readonly<Record<string, FakeCashCustomerRef>>;
}

interface StoredMonth {
  id: string;
  year: number;
  month: number;
  openingBalance: number;
  isLocked: boolean;
  createdBy: string | null;
  createdAt: string;
}

interface StoredEntry {
  id: string;
  monthId: string;
  entryDate: string;
  type: CashEntryType;
  category: string | null;
  amount: number;
  description: string;
  reference: string | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  createdAt: string;
  editedAt: string | null;
  createdBy: string;
  editedBy: string | null;
  customerId: string | null;
}

interface StoredCheque {
  id: string;
  date: string;
  amount: number;
  chequeNumber: string | null;
  notes: string | null;
  createdAt: string;
  banked: boolean;
  bankedAt: string | null;
  customerId: string | null;
  customerName: string | null;
  driverId: string;
  loggedBy: string;
  bankedBy: string | null;
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

export function createFakeCashRepository(
  seed?: FakeCashSeed,
): CashRepository {
  const months = new Map<string, StoredMonth>();
  const entries = new Map<string, StoredEntry>();
  const cheques = new Map<string, StoredCheque>();
  const people = seed?.people ?? {};
  const customers = seed?.customers ?? {};

  function nameOf(userId: string | null): string | undefined {
    return userId ? people[userId]?.name : undefined;
  }

  function customerOf(customerId: string | null): NamedRef | null {
    if (!customerId) return null;
    const c = customers[customerId];
    return c ? { id: c.id, name: c.name } : null;
  }

  function sumsFor(monthId: string): {
    totalIncome: number;
    totalExpense: number;
  } {
    let totalIncome = 0;
    let totalExpense = 0;
    for (const e of entries.values()) {
      if (e.monthId !== monthId) continue;
      if (e.type === "income") totalIncome += Number(e.amount);
      else totalExpense += Number(e.amount);
    }
    return { totalIncome, totalExpense };
  }

  function latestMonth(): StoredMonth | null {
    const all = [...months.values()].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
    return all.length === 0 ? null : all[0];
  }

  function toMonth(m: StoredMonth): CashMonth {
    return {
      id: m.id,
      year: m.year,
      month: m.month,
      openingBalance: Number(m.openingBalance),
      isLocked: m.isLocked,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
    };
  }

  function toEntry(e: StoredEntry, signedUrl: string | null): CashEntry {
    return {
      id: e.id,
      monthId: e.monthId,
      entryDate: e.entryDate,
      type: e.type,
      category: e.category,
      amount: Number(e.amount),
      description: e.description,
      reference: e.reference,
      attachmentPath: e.attachmentPath,
      attachmentName: e.attachmentName,
      createdAt: e.createdAt,
      editedAt: e.editedAt,
      customerId: e.customerId,
      createdByName: nameOf(e.createdBy) ?? "Unknown",
      editedByName: e.editedBy ? (nameOf(e.editedBy) ?? null) : null,
      customerName: customerOf(e.customerId)?.name ?? null,
      signedUrl,
    };
  }

  function toCheque(c: StoredCheque): ChequeRecord {
    const driver = people[c.driverId];
    return {
      id: c.id,
      date: c.date,
      amount: Number(c.amount),
      chequeNumber: c.chequeNumber,
      notes: c.notes,
      createdAt: c.createdAt,
      banked: c.banked,
      bankedAt: c.bankedAt,
      customerId: c.customerId,
      customer: customerOf(c.customerId),
      customerName: c.customerName,
      driver: driver ? { id: driver.id, name: driver.name } : null,
      loggedByName: nameOf(c.loggedBy) ?? "Unknown",
      bankedByName: c.bankedBy ? (nameOf(c.bankedBy) ?? null) : null,
    };
  }

  return {
    async findMonth(year: number, month: number): Promise<CashMonth | null> {
      for (const m of months.values()) {
        if (m.year === year && m.month === month) return toMonth(m);
      }
      return null;
    },

    async findMonthById(id: string): Promise<CashMonth | null> {
      const m = months.get(id);
      return m ? toMonth(m) : null;
    },

    async probeMonth(): Promise<MonthExistsProbe> {
      const prev = latestMonth();
      if (prev === null) return { isFirst: true, suggestedOpening: null };
      const { totalIncome, totalExpense } = sumsFor(prev.id);
      const suggestedOpening =
        Number(prev.openingBalance) + totalIncome - totalExpense;
      return { isFirst: false, suggestedOpening };
    },

    async createMonth(
      input: CreateMonthInput,
    ): Promise<{ month: CashMonth; summary: CashMonthSummary }> {
      // UNIQUE (year, month) — both adapters reject a dup the same way.
      for (const m of months.values()) {
        if (m.year === input.year && m.month === input.month) {
          throw new ConflictError("Month already exists");
        }
      }
      const prev = latestMonth();
      let openingBalance: number;
      if (prev === null) {
        openingBalance = Number(input.openingBalance);
      } else {
        const { totalIncome, totalExpense } = sumsFor(prev.id);
        openingBalance =
          Number(prev.openingBalance) + totalIncome - totalExpense;
      }
      const id = nextId();
      const row: StoredMonth = {
        id,
        year: input.year,
        month: input.month,
        openingBalance,
        isLocked: false,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
      };
      months.set(id, row);
      const summary: CashMonthSummary = {
        opening: openingBalance,
        totalIncome: 0,
        totalExpense: 0,
        closing: openingBalance,
      };
      return { month: toMonth(row), summary };
    },

    async setMonthLocked(
      id: string,
      isLocked: boolean,
    ): Promise<CashMonth | null> {
      const m = months.get(id);
      if (!m) return null;
      const updated: StoredMonth = { ...m, isLocked };
      months.set(id, updated);
      return toMonth(updated);
    },

    async listEntriesForMonth(
      monthId: string,
    ): Promise<readonly CashEntry[]> {
      return [...entries.values()]
        .filter((e) => e.monthId === monthId)
        .sort((a, b) => {
          if (a.entryDate !== b.entryDate) {
            return a.entryDate.localeCompare(b.entryDate);
          }
          return a.createdAt.localeCompare(b.createdAt);
        })
        .map((e) =>
          toEntry(e, e.attachmentPath ? `fake-signed://${e.attachmentPath}` : null),
        );
    },

    async sumEntriesForMonth(
      monthId: string,
    ): Promise<{ totalIncome: number; totalExpense: number }> {
      return sumsFor(monthId);
    },

    async createEntry(input: CreateEntryInput): Promise<CashEntry> {
      // CHECK type ∈ {income, expense} and amount > 0 — both adapters reject.
      if (!["income", "expense"].includes(input.type)) {
        throw new ServiceError(
          'new row for relation "cash_entries" violates check ' +
            'constraint "cash_entries_type_check"',
        );
      }
      if (!input.amount || Number(input.amount) <= 0) {
        throw new ServiceError(
          'new row for relation "cash_entries" violates check ' +
            'constraint "cash_entries_amount_check"',
        );
      }
      const id = nextId();
      const row: StoredEntry = {
        id,
        monthId: input.monthId,
        entryDate: input.entryDate,
        type: input.type,
        // income → category nulled; expense → category kept.
        category: input.type === "expense" ? (input.category ?? null) : null,
        amount: Number(input.amount),
        description: String(input.description).trim(),
        reference: input.reference ? String(input.reference).trim() : null,
        attachmentPath: input.attachmentPath ?? null,
        attachmentName: input.attachmentName ?? null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        createdBy: input.createdBy,
        editedBy: null,
        // income → customer_id kept; expense → customer_id nulled.
        customerId:
          input.type === "income" && input.customerId
            ? input.customerId
            : null,
      };
      entries.set(id, row);
      // signedUrl null on create (matches today).
      return toEntry(row, null);
    },

    async updateEntry(
      id: string,
      patch: UpdateEntryInput,
    ): Promise<CashEntry | null> {
      const e = entries.get(id);
      if (!e) return null;
      const updated: StoredEntry = {
        ...e,
        editedBy: patch.editedBy,
        editedAt: new Date().toISOString(),
        ...(patch.amount != null ? { amount: Number(patch.amount) } : {}),
        ...(patch.description != null
          ? { description: String(patch.description).trim() }
          : {}),
        ...(patch.category != null ? { category: patch.category } : {}),
        ...(patch.reference != null ? { reference: patch.reference } : {}),
        ...(patch.attachmentPath != null
          ? { attachmentPath: patch.attachmentPath }
          : {}),
        ...(patch.attachmentName != null
          ? { attachmentName: patch.attachmentName }
          : {}),
      };
      entries.set(id, updated);
      return toEntry(updated, null);
    },

    async findEntryAttachmentPath(id: string): Promise<string | null> {
      const e = entries.get(id);
      return e?.attachmentPath ?? null;
    },

    async deleteEntry(id: string): Promise<void> {
      entries.delete(id);
    },

    async listCheques(
      filter: ChequeListFilter,
    ): Promise<readonly ChequeRecord[]> {
      return [...cheques.values()]
        .filter((c) => {
          if (filter.status === "not_banked" && c.banked) return false;
          if (filter.status === "banked" && !c.banked) return false;
          if (filter.from && c.date < filter.from) return false;
          if (filter.to && c.date > filter.to) return false;
          return true;
        })
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.createdAt.localeCompare(a.createdAt);
        })
        .map(toCheque);
    },

    async createCheque(input: CreateChequeInput): Promise<ChequeRecord> {
      if (!input.amount || Number(input.amount) <= 0) {
        throw new ServiceError(
          'new row for relation "cheque_records" violates check ' +
            'constraint "cheque_records_amount_check"',
        );
      }
      const id = nextId();
      const row: StoredCheque = {
        id,
        date: input.date,
        amount: Number(input.amount),
        chequeNumber: input.chequeNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        createdAt: new Date().toISOString(),
        banked: false,
        bankedAt: null,
        customerId: input.customerId || null,
        customerName: input.customerName || null,
        driverId: input.driverId,
        loggedBy: input.loggedBy,
        bankedBy: null,
      };
      cheques.set(id, row);
      return toCheque(row);
    },

    async bankCheque(
      id: string,
      bankedBy: string,
    ): Promise<{ bankedAt: string } | null> {
      const c = cheques.get(id);
      // idempotency — only bank when currently not banked / found.
      if (!c || c.banked) return null;
      const bankedAt = new Date().toISOString();
      const updated: StoredCheque = {
        ...c,
        banked: true,
        bankedBy,
        bankedAt,
      };
      cheques.set(id, updated);
      return { bankedAt };
    },

    async updateCheque(
      id: string,
      patch: UpdateChequeInput,
    ): Promise<ChequeRecord | null> {
      const c = cheques.get(id);
      if (!c) return null;
      const updated: StoredCheque = {
        ...c,
        ...(patch.date != null ? { date: patch.date } : {}),
        ...(patch.customerId != null ? { customerId: patch.customerId } : {}),
        ...(patch.amount != null ? { amount: Number(patch.amount) } : {}),
        ...(patch.driverId != null ? { driverId: patch.driverId } : {}),
        ...(patch.chequeNumber != null
          ? { chequeNumber: patch.chequeNumber || null }
          : {}),
        ...(patch.notes != null ? { notes: patch.notes || null } : {}),
      };
      cheques.set(id, updated);
      return toCheque(updated);
    },

    async deleteCheque(id: string): Promise<void> {
      cheques.delete(id);
    },

    async readCashBookData(
      year: number,
      month: number,
    ): Promise<{ month: CashMonth; entries: readonly CashEntry[] } | null> {
      let target: StoredMonth | null = null;
      for (const m of months.values()) {
        if (m.year === year && m.month === month) {
          target = m;
          break;
        }
      }
      if (target === null) return null;
      const list = [...entries.values()]
        .filter((e) => e.monthId === target!.id)
        .sort((a, b) => {
          if (a.entryDate !== b.entryDate) {
            return a.entryDate.localeCompare(b.entryDate);
          }
          return a.createdAt.localeCompare(b.createdAt);
        })
        .map((e) => toEntry(e, null));
      return { month: toMonth(target), entries: list };
    },

    async readChequeRegisterData(
      from: string,
      to: string,
    ): Promise<readonly ChequeRecord[]> {
      return [...cheques.values()]
        .filter((c) => c.date >= from && c.date <= to)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.createdAt.localeCompare(b.createdAt);
        })
        .map(toCheque);
    },
  };
}

export const fakeCashRepository: CashRepository = createFakeCashRepository();
