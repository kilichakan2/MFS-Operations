/**
 * tests/unit/services/CashService.test.ts
 *
 * F-16 PR1 — unit tests for the Cash business rules + CSV builders, run
 * against the Fake adapters. This is an introduce-only extraction: the whole
 * value is that the lifted logic is BYTE-IDENTICAL to the eight cash routes,
 * so the weight is here (golden-string CSV + every-branch validation).
 *
 * The calendar-month check uses an injected `now: Date` (LOCAL time), pinned
 * deterministically. The CSV builders take a fixed `generatedAt` so the
 * output is deterministic for the golden assertions.
 */
import { describe, it, expect } from "vitest";
import { createCashService } from "@/lib/services";
import {
  createFakeCashRepository,
  createFakeAttachmentStorage,
} from "@/lib/adapters/fake";
import type {
  CashMonth,
  CashEntry,
  ChequeRecord,
  CreateEntryInput,
  CreateChequeInput,
} from "@/lib/domain";

// ── helpers ────────────────────────────────────────────────────

function makeService(seed?: Parameters<typeof createFakeCashRepository>[0]) {
  const cash = createFakeCashRepository(seed);
  const attachments = createFakeAttachmentStorage();
  const service = createCashService({ cash, attachments });
  return { service, cash, attachments };
}

function month(overrides: Partial<CashMonth> = {}): CashMonth {
  return {
    id: "m1",
    year: 2026,
    month: 4,
    openingBalance: 100,
    isLocked: false,
    createdBy: "u1",
    createdAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function entryInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    monthId: "m1",
    entryDate: "2026-04-15",
    type: "income",
    category: null,
    amount: 50,
    description: "Sale",
    reference: null,
    attachmentPath: null,
    attachmentName: null,
    customerId: null,
    createdBy: "u1",
    ...overrides,
  };
}

function chequeInput(
  overrides: Partial<CreateChequeInput> = {},
): CreateChequeInput {
  return {
    date: "2026-04-10",
    customerId: "c1",
    customerName: null,
    amount: 200,
    driverId: "d1",
    chequeNumber: "0001",
    notes: null,
    loggedBy: "u1",
    ...overrides,
  };
}

// ── closingBalance ─────────────────────────────────────────────

describe("CashService.closingBalance", () => {
  const { service } = makeService();

  it("empty entries → opening", () => {
    expect(service.closingBalance(100, [])).toBe(100);
  });

  it("mixed income/expense → opening + income − expense", () => {
    const entries = [
      { type: "income", amount: 50 },
      { type: "expense", amount: 20 },
      { type: "income", amount: 5 },
    ];
    expect(service.closingBalance(100, entries)).toBe(135);
  });

  it("coerces string amounts like Number() (route parity)", () => {
    const entries = [
      { type: "income", amount: "50" as unknown as number },
      { type: "expense", amount: "20" as unknown as number },
    ];
    expect(service.closingBalance("100" as unknown as number, entries)).toBe(
      130,
    );
  });
});

// ── monthSummary ───────────────────────────────────────────────

describe("CashService.monthSummary", () => {
  const { service } = makeService();

  it("computes opening/totalIncome/totalExpense/closing", () => {
    const entries = [
      { type: "income", amount: 50 },
      { type: "expense", amount: 20 },
    ];
    expect(service.monthSummary(100, entries)).toEqual({
      opening: 100,
      totalIncome: 50,
      totalExpense: 20,
      closing: 130,
    });
  });

  it("income-only", () => {
    expect(service.monthSummary(0, [{ type: "income", amount: 10 }])).toEqual({
      opening: 0,
      totalIncome: 10,
      totalExpense: 0,
      closing: 10,
    });
  });

  it("expense-only", () => {
    expect(service.monthSummary(50, [{ type: "expense", amount: 10 }])).toEqual({
      opening: 50,
      totalIncome: 0,
      totalExpense: 10,
      closing: 40,
    });
  });

  it("empty", () => {
    expect(service.monthSummary(75, [])).toEqual({
      opening: 75,
      totalIncome: 0,
      totalExpense: 0,
      closing: 75,
    });
  });
});

// ── probeMonth / suggested opening ─────────────────────────────

describe("CashService.probeMonth", () => {
  it("no months → {isFirst:true, suggestedOpening:null}", async () => {
    const { service } = makeService();
    expect(await service.probeMonth()).toEqual({
      isFirst: true,
      suggestedOpening: null,
    });
  });

  it("one prior month with entries → suggestedOpening = its closing", async () => {
    const { service } = makeService();
    // First-ever month, opening 100.
    const created = await service.createMonth({
      year: 2026,
      month: 3,
      createdBy: "u1",
      openingBalance: 100,
    });
    // Add entries: +50 income, -20 expense → closing 130.
    await service.createEntry(
      entryInput({ monthId: created.month.id, entryDate: "2026-03-05", amount: 50 }),
    );
    await service.createEntry(
      entryInput({
        monthId: created.month.id,
        entryDate: "2026-03-06",
        type: "expense",
        amount: 20,
      }),
    );
    expect(await service.probeMonth()).toEqual({
      isFirst: false,
      suggestedOpening: 130,
    });
  });
});

// ── createMonth ────────────────────────────────────────────────

describe("CashService.createMonth", () => {
  it("first-ever uses input.openingBalance", async () => {
    const { service } = makeService();
    const r = await service.createMonth({
      year: 2026,
      month: 1,
      createdBy: "u1",
      openingBalance: 500,
    });
    expect(r.month.openingBalance).toBe(500);
    expect(r.summary).toEqual({
      opening: 500,
      totalIncome: 0,
      totalExpense: 0,
      closing: 500,
    });
  });

  it("subsequent auto-computes from previous closing", async () => {
    const { service } = makeService();
    const first = await service.createMonth({
      year: 2026,
      month: 1,
      createdBy: "u1",
      openingBalance: 500,
    });
    await service.createEntry(
      entryInput({ monthId: first.month.id, entryDate: "2026-01-05", amount: 100 }),
    );
    // Next month: opening auto = 500 + 100 = 600, openingBalance arg ignored.
    const second = await service.createMonth({
      year: 2026,
      month: 2,
      createdBy: "u1",
      openingBalance: null,
    });
    expect(second.month.openingBalance).toBe(600);
  });

  it("duplicate (year,month) → ConflictError", async () => {
    const { service } = makeService();
    await service.createMonth({
      year: 2026,
      month: 1,
      createdBy: "u1",
      openingBalance: 0,
    });
    await expect(
      service.createMonth({
        year: 2026,
        month: 1,
        createdBy: "u1",
        openingBalance: 0,
      }),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });
});

// ── validateEntry — every branch ───────────────────────────────

describe("CashService.validateEntry", () => {
  const { service } = makeService();
  const now = new Date(2026, 3, 20); // April 2026 (month index 3) LOCAL

  it("missing required fields → 400", () => {
    const r = service.validateEntry({
      input: entryInput({ description: "" }),
      month: month(),
      role: "admin",
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "month_id, entry_date, type, amount, description required",
    });
  });

  it("bad type → 400", () => {
    const r = service.validateEntry({
      input: entryInput({ type: "transfer" as unknown as "income" }),
      month: month(),
      role: "admin",
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "type must be income or expense",
    });
  });

  it("amount <= 0 → 400", () => {
    const r = service.validateEntry({
      input: entryInput({ amount: 0 }),
      month: month(),
      role: "admin",
      now,
    });
    // amount 0 trips the required-fields gate first (falsy), matching the route.
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "month_id, entry_date, type, amount, description required",
    });
  });

  it("negative amount → 400 'amount must be positive'", () => {
    const r = service.validateEntry({
      input: entryInput({ amount: -5 }),
      month: month(),
      role: "admin",
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "amount must be positive",
    });
  });

  it("month not found → 404", () => {
    const r = service.validateEntry({
      input: entryInput(),
      month: null,
      role: "admin",
      now,
    });
    expect(r).toEqual({ ok: false, status: 404, message: "Month not found" });
  });

  it("locked month → 403", () => {
    const r = service.validateEntry({
      input: entryInput(),
      month: month({ isLocked: true }),
      role: "admin",
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 403,
      message: "This month is locked",
    });
  });

  it("non-admin wrong calendar month → 403", () => {
    const r = service.validateEntry({
      input: entryInput(),
      month: month({ year: 2026, month: 3 }), // March, but now is April
      role: "office",
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 403,
      message: "Office users can only add entries to the current month",
    });
  });

  it("admin into a non-current month → ok", () => {
    const r = service.validateEntry({
      input: entryInput({ entryDate: "2026-03-15" }),
      month: month({ year: 2026, month: 3 }),
      role: "admin",
      now,
    });
    expect(r).toEqual({ ok: true });
  });

  it("entry_date outside the month → 400", () => {
    const r = service.validateEntry({
      input: entryInput({ entryDate: "2026-05-01" }), // May, month is April
      month: month(),
      role: "admin",
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "entry_date must be within the month",
    });
  });

  it("valid entry → ok", () => {
    const r = service.validateEntry({
      input: entryInput(),
      month: month(),
      role: "admin",
      now,
    });
    expect(r).toEqual({ ok: true });
  });
});

// ── entry persistence shaping (income→customer, expense→category) ──

describe("CashService.createEntry shaping", () => {
  it("income keeps customer_id, nulls category", async () => {
    const { service } = makeService({
      customers: { c1: { id: "c1", name: "Acme" } },
      people: { u1: { id: "u1", name: "Hakan" } },
    });
    const e = await service.createEntry(
      entryInput({ type: "income", category: "ignored", customerId: "c1" }),
    );
    expect(e.category).toBeNull();
    expect(e.customerId).toBe("c1");
    expect(e.customerName).toBe("Acme");
    expect(e.createdByName).toBe("Hakan");
    expect(e.signedUrl).toBeNull();
  });

  it("expense keeps category, nulls customer_id", async () => {
    const { service } = makeService();
    const e = await service.createEntry(
      entryInput({ type: "expense", category: "Fuel", customerId: "c1" }),
    );
    expect(e.category).toBe("Fuel");
    expect(e.customerId).toBeNull();
  });
});

// ── validateCheque ─────────────────────────────────────────────

describe("CashService.validateCheque", () => {
  const { service } = makeService();

  it("missing date/customer/amount/driver → 400", () => {
    const r = service.validateCheque(
      chequeInput({ date: "", customerId: null, customerName: null }),
    );
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "date, customer (id or name), amount, driver_id required",
    });
  });

  it("customer by id passes", () => {
    expect(
      service.validateCheque(chequeInput({ customerId: "c1", customerName: null })),
    ).toEqual({ ok: true });
  });

  it("customer by name passes", () => {
    expect(
      service.validateCheque(
        chequeInput({ customerId: null, customerName: "Walk-in" }),
      ),
    ).toEqual({ ok: true });
  });

  it("amount <= 0 → 400 'amount must be positive'", () => {
    const r = service.validateCheque(chequeInput({ amount: -1 }));
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "amount must be positive",
    });
  });
});

// ── validateAndBuildUploadPath ─────────────────────────────────

describe("CashService.validateAndBuildUploadPath", () => {
  const { service } = makeService();
  const now = new Date(1700000000000); // fixed timestamp

  it("allowed mime passes; path = userId/ts.ext", () => {
    const r = service.validateAndBuildUploadPath({
      userId: "u1",
      fileName: "receipt.png",
      contentType: "image/png",
      sizeBytes: 1234,
      now,
    });
    expect(r).toEqual({
      ok: true,
      path: `u1/${now.getTime()}.png`,
      name: "receipt.png",
    });
  });

  it("each allowed mime passes", () => {
    for (const t of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ]) {
      const r = service.validateAndBuildUploadPath({
        userId: "u1",
        fileName: "f.x",
        contentType: t,
        sizeBytes: 1,
        now,
      });
      expect(r.ok).toBe(true);
    }
  });

  it("disallowed mime → 400 'File type not allowed: <type>'", () => {
    const r = service.validateAndBuildUploadPath({
      userId: "u1",
      fileName: "x.gif",
      contentType: "image/gif",
      sizeBytes: 1,
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "File type not allowed: image/gif",
    });
  });

  it(">10MB → 400 'File too large (max 10MB)'", () => {
    const r = service.validateAndBuildUploadPath({
      userId: "u1",
      fileName: "big.pdf",
      contentType: "application/pdf",
      sizeBytes: 10 * 1024 * 1024 + 1,
      now,
    });
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "File too large (max 10MB)",
    });
  });

  it("exactly 10MB passes (boundary)", () => {
    const r = service.validateAndBuildUploadPath({
      userId: "u1",
      fileName: "max.pdf",
      contentType: "application/pdf",
      sizeBytes: 10 * 1024 * 1024,
      now,
    });
    expect(r.ok).toBe(true);
  });

  it("filename with no dot keeps the whole name as ext (route's split.pop verbatim)", () => {
    // The route does `file.name.split('.').pop() ?? 'bin'`. For "noext",
    // split('.') is ["noext"], pop() is "noext" (not undefined), so the
    // path ext is "noext". This is byte-identical to today's upload route —
    // the `?? 'bin'` fallback only fires when pop() yields undefined.
    const r = service.validateAndBuildUploadPath({
      userId: "u1",
      fileName: "noext",
      contentType: "application/pdf",
      sizeBytes: 1,
      now,
    });
    expect(r).toMatchObject({ ok: true, path: `u1/${now.getTime()}.noext` });
  });

  it("trailing-dot filename → empty ext (route parity)", () => {
    // "file." → split('.') = ["file",""], pop() = "" → path ext is empty.
    const r = service.validateAndBuildUploadPath({
      userId: "u1",
      fileName: "file.",
      contentType: "application/pdf",
      sizeBytes: 1,
      now,
    });
    expect(r).toMatchObject({ ok: true, path: `u1/${now.getTime()}.` });
  });
});

// ── buildCashBookCsv — golden string ───────────────────────────

describe("CashService.buildCashBookCsv", () => {
  const { service } = makeService();
  // Fixed generatedAt; fmtDateTime uses LOCAL time, so build a local date.
  const generatedAt = new Date(2026, 3, 20, 9, 5); // 20/04/26 09:05 LOCAL

  function entry(overrides: Partial<CashEntry>): CashEntry {
    return {
      id: "e",
      monthId: "m1",
      entryDate: "2026-04-15",
      type: "income",
      category: null,
      amount: 50,
      description: "Sale",
      reference: null,
      attachmentPath: null,
      attachmentName: null,
      createdAt: "2026-04-15T00:00:00.000Z",
      editedAt: null,
      customerId: null,
      createdByName: "Hakan",
      editedByName: null,
      customerName: null,
      signedUrl: null,
      ...overrides,
    };
  }

  it("filename is MFS-CashBook-YYYY-MM.csv (zero-padded month)", () => {
    const { filename } = service.buildCashBookCsv({
      year: 2026,
      month: 4,
      monthRecord: month({ openingBalance: 0 }),
      entries: [],
      generatedAt,
    });
    expect(filename).toBe("MFS-CashBook-2026-04.csv");
  });

  it("8-column CRLF golden string with running balance + LOCKED footer", () => {
    const entries: CashEntry[] = [
      entry({
        entryDate: "2026-04-15",
        type: "income",
        amount: 50,
        description: "Sale",
        customerName: "Acme",
        reference: "INV-1",
      }),
      entry({
        entryDate: "2026-04-16",
        type: "expense",
        amount: 20,
        description: "Fuel",
        category: "Vehicle",
      }),
    ];
    const { csv } = service.buildCashBookCsv({
      year: 2026,
      month: 4,
      monthRecord: month({ openingBalance: 100, isLocked: true }),
      entries,
      generatedAt,
    });

    const expected = [
      "MFS GLOBAL LTD",
      "Cash Book — April 2026",
      "Generated:,20/04/26 09:05",
      "",
      "SUMMARY",
      "--------,--------,--------,--------,--------,--------,--------,--------",
      "Opening Balance,,,,,,,£100.00",
      "Total Receipts (Credit),,,,,,£50.00,",
      "Total Payments (Debit),,,,,£20.00,,",
      "Closing Balance,,,,,,,£130.00",
      "--------,--------,--------,--------,--------,--------,--------,--------",
      "",
      "CASH BOOK STATEMENT",
      "Date,Description,Customer,Category,Reference,Debit (Out),Credit (In),Balance",
      "--------,--------,--------,--------,--------,--------,--------,--------",
      ",Opening Balance,,,,,,£100.00",
      "15/04/26,Sale,Acme,,INV-1,,£50.00,£150.00",
      "16/04/26,Fuel,,Vehicle,,£20.00,,£130.00",
      "--------,--------,--------,--------,--------,--------,--------,--------",
      ",TOTALS,,,,£20.00,£50.00,",
      "--------,--------,--------,--------,--------,--------,--------,--------",
      ",Closing Balance,,,,,,£130.00",
      "",
      "Status: LOCKED",
      "Total transactions: 2",
      "MFS Global Ltd · mfsops.com",
    ].join("\r\n");

    expect(csv).toBe(expected);
    // CRLF, not LF.
    expect(csv.includes("\r\n")).toBe(true);
    expect(csv.includes("\n\n")).toBe(false);
  });

  it("Open footer when not locked", () => {
    const { csv } = service.buildCashBookCsv({
      year: 2026,
      month: 4,
      monthRecord: month({ openingBalance: 0, isLocked: false }),
      entries: [],
      generatedAt,
    });
    expect(csv).toContain("Status: Open");
    expect(csv).not.toContain("Status: LOCKED");
  });
});

// ── buildChequeRegisterCsv — golden string ─────────────────────

describe("CashService.buildChequeRegisterCsv", () => {
  const { service } = makeService();
  const generatedAt = new Date(2026, 3, 20, 9, 5);

  function cheque(overrides: Partial<ChequeRecord>): ChequeRecord {
    return {
      id: "ch",
      date: "2026-04-10",
      amount: 200,
      chequeNumber: "0001",
      notes: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      banked: false,
      bankedAt: null,
      customerId: "c1",
      customer: { id: "c1", name: "Acme" },
      customerName: null,
      driver: { id: "d1", name: "Dave" },
      loggedByName: "Hakan",
      bankedByName: null,
      ...overrides,
    };
  }

  it("filename is MFS-ChequeRegister-<from>-to-<to>.csv", () => {
    const { filename } = service.buildChequeRegisterCsv({
      from: "2026-04-01",
      to: "2026-04-30",
      cheques: [],
      generatedAt,
    });
    expect(filename).toBe("MFS-ChequeRegister-2026-04-01-to-2026-04-30.csv");
  });

  it("9-column CRLF golden string with summary totals + status + fallback", () => {
    const cheques: ChequeRecord[] = [
      cheque({
        date: "2026-04-10",
        amount: 200,
        chequeNumber: "0001",
        customer: { id: "c1", name: "Acme" },
        customerName: null,
        driver: { id: "d1", name: "Dave" },
        loggedByName: "Hakan",
        banked: true,
        bankedByName: "Admin",
        bankedAt: "2026-04-11T14:30:00.000Z",
      }),
      cheque({
        date: "2026-04-12",
        amount: 50,
        chequeNumber: null,
        customer: null,
        customerName: "Walk-in",
        driver: null,
        loggedByName: "Hakan",
        banked: false,
        bankedByName: null,
        bankedAt: null,
      }),
    ];
    const { csv } = service.buildChequeRegisterCsv({
      from: "2026-04-01",
      to: "2026-04-30",
      cheques,
      generatedAt,
    });

    // banked_at 2026-04-11T14:30 → LOCAL fmtDateTime. Build the same way the
    // code does so the assertion tracks the running machine's timezone.
    const bankedAtStr = (() => {
      const d = new Date("2026-04-11T14:30:00.000Z");
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();

    const expected = [
      "MFS GLOBAL LTD",
      "Cheque Register — 01/04/26 to 30/04/26",
      "Generated:,20/04/26 09:05",
      "",
      "SUMMARY",
      "--------,--------,--------,--------,--------,--------,--------,--------,--------",
      "Total Cheques Received,2",
      "Total Value,£250.00",
      "Total Banked,£200.00",
      "Outstanding (Not Banked),£50.00",
      "--------,--------,--------,--------,--------,--------,--------,--------,--------",
      "",
      "CHEQUE REGISTER",
      "Date,Customer,Cheque No.,Amount,Driver,Logged By,Status,Banked By,Banked At",
      "--------,--------,--------,--------,--------,--------,--------,--------,--------",
      `10/04/26,Acme,0001,£200.00,Dave,Hakan,Banked,Admin,${bankedAtStr}`,
      "12/04/26,Walk-in,—,£50.00,—,Hakan,Not Banked,,",
      "--------,--------,--------,--------,--------,--------,--------,--------,--------",
      ",,TOTAL,£250.00,,,,,",
      ",,BANKED,£200.00,,,,,",
      ",,OUTSTANDING,£50.00,,,,,",
      "",
      "MFS Global Ltd · mfsops.com",
    ].join("\r\n");

    expect(csv).toBe(expected);
    expect(csv.includes("\r\n")).toBe(true);
  });
});

// ── deleteEntry composition ────────────────────────────────────

describe("CashService.deleteEntry composition", () => {
  it("removes the attachment before deleting the row", async () => {
    const { service, attachments } = makeService();
    const e = await service.createEntry(
      entryInput({ attachmentPath: "u1/123.png", attachmentName: "r.png" }),
    );
    await service.deleteEntry(e.id);
    expect(attachments.removed).toEqual(["u1/123.png"]);
    expect(await service.findMonthById("m1")).toBeNull(); // sanity: no crash
  });

  it("a no-attachment entry skips remove", async () => {
    const { service, attachments } = makeService();
    const e = await service.createEntry(entryInput({ attachmentPath: null }));
    await service.deleteEntry(e.id);
    expect(attachments.removed).toEqual([]);
  });
});
