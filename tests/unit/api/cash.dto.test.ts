/**
 * tests/unit/api/cash.dto.test.ts
 *
 * Key-for-key AND key-ORDER unit tests for the Cash DTO translators
 * (lib/api/cash/dto.ts). Key order is load-bearing: NextResponse.json
 * serialises object keys in insertion order, so a re-ordered key changes the
 * wire bytes. Every shape is asserted with a POPULATED domain object (not just
 * an empty/defensive shape — the F-15 PR2 T1/T2 lesson) so a dropped or
 * misnamed key surfaces.
 */
import { describe, it, expect } from "vitest";
import type {
  CashMonth,
  CashEntry,
  ChequeRecord,
  CashMonthSummary,
} from "@/lib/domain";
import {
  toMonthWireDto,
  toMonthLockWireDto,
  toSummaryWireDto,
  toEntryListWireDto,
  toEntryCreateWireDto,
  toEntryEditWireDto,
  toChequeWireDto,
  toChequeEditWireDto,
} from "@/lib/api/cash/dto";

const month: CashMonth = {
  id: "m-1",
  year: 2026,
  month: 4,
  openingBalance: 100.5,
  isLocked: true,
  createdBy: "user-1",
  createdAt: "2026-04-01T00:00:00.000Z",
};

const entry: CashEntry = {
  id: "e-1",
  monthId: "m-1",
  entryDate: "2026-04-15",
  type: "income",
  category: null,
  amount: 50.25,
  description: "Sale",
  reference: "INV-1",
  attachmentPath: "user-1/123.pdf",
  attachmentName: "receipt.pdf",
  createdAt: "2026-04-15T09:00:00.000Z",
  editedAt: "2026-04-16T10:00:00.000Z",
  customerId: "cust-1",
  createdByName: "Alice",
  editedByName: "Bob",
  customerName: "Acme Ltd",
  signedUrl: "https://signed.example/url",
};

const cheque: ChequeRecord = {
  id: "c-1",
  date: "2026-04-10",
  amount: 250.75,
  chequeNumber: "CHQ-9",
  notes: "monthly",
  createdAt: "2026-04-10T08:00:00.000Z",
  banked: true,
  bankedAt: "2026-04-12T08:00:00.000Z",
  customerId: "cust-1",
  customer: { id: "cust-1", name: "Acme Ltd" },
  customerName: "Acme Free Text",
  driver: { id: "drv-1", name: "Dave" },
  loggedByName: "Alice",
  bankedByName: "Bob",
};

const summary: CashMonthSummary = {
  opening: 100.5,
  totalIncome: 50.25,
  totalExpense: 20,
  closing: 130.75,
};

describe("toMonthWireDto", () => {
  it("maps fields + DB column order (id,year,month,opening_balance,is_locked,created_by,created_at)", () => {
    const dto = toMonthWireDto(month);
    expect(dto).toEqual({
      id: "m-1",
      year: 2026,
      month: 4,
      opening_balance: 100.5,
      is_locked: true,
      created_by: "user-1",
      created_at: "2026-04-01T00:00:00.000Z",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "year",
      "month",
      "opening_balance",
      "is_locked",
      "created_by",
      "created_at",
    ]);
  });
});

describe("toMonthLockWireDto", () => {
  it("wraps the month DTO under `month`", () => {
    const dto = toMonthLockWireDto(month);
    expect(Object.keys(dto)).toEqual(["month"]);
    expect(dto.month).toEqual(toMonthWireDto(month));
    expect(Object.keys(dto.month)).toEqual([
      "id",
      "year",
      "month",
      "opening_balance",
      "is_locked",
      "created_by",
      "created_at",
    ]);
  });
});

describe("toSummaryWireDto", () => {
  it("maps camelCase totals → snake_case in order", () => {
    const dto = toSummaryWireDto(summary);
    expect(dto).toEqual({
      opening: 100.5,
      total_income: 50.25,
      total_expense: 20,
      closing: 130.75,
    });
    expect(Object.keys(dto)).toEqual([
      "opening",
      "total_income",
      "total_expense",
      "closing",
    ]);
  });
});

describe("toEntryListWireDto", () => {
  it("flatten-only shape + key order (raw cols, then signed_url + *_name)", () => {
    const dto = toEntryListWireDto(entry);
    expect(dto).toEqual({
      id: "e-1",
      month_id: "m-1",
      entry_date: "2026-04-15",
      type: "income",
      category: null,
      amount: 50.25,
      description: "Sale",
      reference: "INV-1",
      attachment_path: "user-1/123.pdf",
      attachment_name: "receipt.pdf",
      created_at: "2026-04-15T09:00:00.000Z",
      edited_at: "2026-04-16T10:00:00.000Z",
      customer_id: "cust-1",
      signed_url: "https://signed.example/url",
      created_by_name: "Alice",
      edited_by_name: "Bob",
      customer_name: "Acme Ltd",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "month_id",
      "entry_date",
      "type",
      "category",
      "amount",
      "description",
      "reference",
      "attachment_path",
      "attachment_name",
      "created_at",
      "edited_at",
      "customer_id",
      "signed_url",
      "created_by_name",
      "edited_by_name",
      "customer_name",
    ]);
  });

  it("drops the vestigial raw join objects (created_by_user/edited_by_user/customer)", () => {
    const dto = toEntryListWireDto(entry) as unknown as Record<string, unknown>;
    expect("created_by_user" in dto).toBe(false);
    expect("edited_by_user" in dto).toBe(false);
    expect("customer" in dto).toBe(false);
  });
});

describe("toEntryCreateWireDto", () => {
  it("omits edited_at/edited_by_name; key order = create cols then names + signed_url", () => {
    const dto = toEntryCreateWireDto(entry);
    expect(dto).toEqual({
      id: "e-1",
      month_id: "m-1",
      entry_date: "2026-04-15",
      type: "income",
      category: null,
      amount: 50.25,
      description: "Sale",
      reference: "INV-1",
      attachment_path: "user-1/123.pdf",
      attachment_name: "receipt.pdf",
      created_at: "2026-04-15T09:00:00.000Z",
      customer_id: "cust-1",
      created_by_name: "Alice",
      customer_name: "Acme Ltd",
      signed_url: "https://signed.example/url",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "month_id",
      "entry_date",
      "type",
      "category",
      "amount",
      "description",
      "reference",
      "attachment_path",
      "attachment_name",
      "created_at",
      "customer_id",
      "created_by_name",
      "customer_name",
      "signed_url",
    ]);
    const rec = dto as unknown as Record<string, unknown>;
    expect("edited_at" in rec).toBe(false);
    expect("edited_by_name" in rec).toBe(false);
  });
});

describe("toEntryEditWireDto", () => {
  it("bare cash_entries row key set + column order; FK ids dropped", () => {
    const dto = toEntryEditWireDto(entry);
    expect(Object.keys(dto)).toEqual([
      "id",
      "month_id",
      "entry_date",
      "type",
      "category",
      "amount",
      "description",
      "reference",
      "attachment_path",
      "attachment_name",
      "created_at",
      "edited_at",
      "customer_id",
    ]);
    const rec = dto as unknown as Record<string, unknown>;
    expect("created_by" in rec).toBe(false);
    expect("edited_by" in rec).toBe(false);
    expect("signed_url" in rec).toBe(false);
    expect("created_by_name" in rec).toBe(false);
  });
});

describe("toChequeWireDto", () => {
  it("explicit shaped object key order (matches GET/POST literal)", () => {
    const dto = toChequeWireDto(cheque);
    expect(dto).toEqual({
      id: "c-1",
      date: "2026-04-10",
      amount: 250.75,
      cheque_number: "CHQ-9",
      notes: "monthly",
      created_at: "2026-04-10T08:00:00.000Z",
      banked: true,
      banked_at: "2026-04-12T08:00:00.000Z",
      customer: { id: "cust-1", name: "Acme Ltd" },
      customer_name: "Acme Free Text",
      driver: { id: "drv-1", name: "Dave" },
      logged_by_name: "Alice",
      banked_by_name: "Bob",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "date",
      "amount",
      "cheque_number",
      "notes",
      "created_at",
      "banked",
      "banked_at",
      "customer",
      "customer_name",
      "driver",
      "logged_by_name",
      "banked_by_name",
    ]);
  });
});

describe("toChequeEditWireDto", () => {
  it("bare cheque_records row key set + column order; FK ids dropped", () => {
    const dto = toChequeEditWireDto(cheque);
    expect(Object.keys(dto)).toEqual([
      "id",
      "date",
      "customer_id",
      "amount",
      "cheque_number",
      "notes",
      "created_at",
      "banked",
      "banked_at",
      "customer_name",
    ]);
    const rec = dto as unknown as Record<string, unknown>;
    expect("driver_id" in rec).toBe(false);
    expect("logged_by" in rec).toBe(false);
    expect("banked_by" in rec).toBe(false);
    expect("customer" in rec).toBe(false);
    expect("driver" in rec).toBe(false);
  });
});
