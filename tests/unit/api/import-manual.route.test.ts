/**
 * tests/unit/api/import-manual.route.test.ts
 *
 * F-20 PR3 — proves the re-pointed POST /api/admin/import/manual route is a thin
 * doorman over the customers/products services + the auditLog port: the
 * 401/400 guards are byte-identical, it dispatches per row to the right
 * service.insertOne, reproduces today's inserted/skipped counts +
 * console.error-on-error + silent-duplicate-skip + blank-name-skip, writes the
 * audit summary string unchanged, and — critically (R-AUDIT) — an audit `record`
 * rejection does NOT change the 201.
 *
 * The wiring singletons are mocked so the route never touches a DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const customersInsertOne = vi.fn();
const productsInsertOne = vi.fn();
const auditRecord = vi.fn();

vi.mock("@/lib/wiring/customers", () => ({
  customersService: {
    insertOne: (...a: unknown[]) => customersInsertOne(...a),
  },
}));
vi.mock("@/lib/wiring/products", () => ({
  productsService: {
    insertOne: (...a: unknown[]) => productsInsertOne(...a),
  },
}));
vi.mock("@/lib/wiring/auditLog", () => ({
  auditLog: { record: (...a: unknown[]) => auditRecord(...a) },
}));

import { POST } from "@/app/api/admin/import/manual/route";

function makeReq(
  body: unknown,
  headers: Record<string, string> = { "x-mfs-user-id": "u-1" },
  rawBody?: string,
): NextRequest {
  return new NextRequest("http://localhost/api/admin/import/manual", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auditRecord.mockResolvedValue(undefined);
});

describe("POST /api/admin/import/manual — guards (byte-identical)", () => {
  it("returns 401 when x-mfs-user-id is absent", async () => {
    const res = await POST(
      makeReq({ type: "customers", rows: [["A"]], mapping: { name: 0 } }, {}),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(makeReq(undefined, undefined, "{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when type is invalid", async () => {
    const res = await POST(makeReq({ type: "widgets", rows: [["A"]], mapping: { name: 0 } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'type must be "customers" or "products"',
    });
  });

  it("returns 400 when rows is empty", async () => {
    const res = await POST(makeReq({ type: "customers", rows: [], mapping: { name: 0 } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "rows array is required and must not be empty",
    });
  });

  it("returns 400 when mapping.name is not a number", async () => {
    const res = await POST(makeReq({ type: "customers", rows: [["A"]], mapping: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "mapping.name column index is required",
    });
  });
});

describe("POST /api/admin/import/manual — counts + dispatch", () => {
  it("customers: counts inserted/duplicate(skipped silently)/error(skipped+log)/blank(skipped)", async () => {
    customersInsertOne
      .mockResolvedValueOnce({ outcome: "inserted" })
      .mockResolvedValueOnce({ outcome: "duplicate" })
      .mockResolvedValueOnce({ outcome: "error", message: "boom" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      makeReq({
        type: "customers",
        rows: [["Good"], ["Dup"], ["Err"], ["   "]], // last row blank → skipped, no repo call
        mapping: { name: 0 },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["inserted", "skipped"]);
    expect(body).toEqual({ inserted: 1, skipped: 3 });

    // Blank row never reached the repo: only 3 insertOne calls.
    expect(customersInsertOne).toHaveBeenCalledTimes(3);
    expect(customersInsertOne).toHaveBeenNthCalledWith(1, {
      name: "Good",
      created_by: "u-1",
    });
    // error outcome logged with result.message + the row name; duplicate did NOT.
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0]).toContain("boom");
    expect(errSpy.mock.calls[0]).toContain("Err");
    errSpy.mockRestore();
  });

  it("products: builds code/category/box_size via cell() and dispatches to productsService", async () => {
    productsInsertOne.mockResolvedValue({ outcome: "inserted" });
    const res = await POST(
      makeReq({
        type: "products",
        rows: [["Lamb", "LMB", "Meat", "10 kg"]],
        mapping: { name: 0, code: 1, category: 2, box_size: 3 },
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ inserted: 1, skipped: 0 });
    expect(productsInsertOne).toHaveBeenCalledWith({
      name: "Lamb",
      code: "LMB",
      category: "Meat",
      box_size: "10 kg",
      created_by: "u-1",
    });
  });
});

describe("POST /api/admin/import/manual — audit", () => {
  it("writes the EXACT audit summary string once", async () => {
    customersInsertOne
      .mockResolvedValueOnce({ outcome: "inserted" })
      .mockResolvedValueOnce({ outcome: "duplicate" });
    await POST(
      makeReq(
        { type: "customers", rows: [["A"], ["B"]], mapping: { name: 0 } },
        { "x-mfs-user-id": "u-1", "x-mfs-user-name": "Bob" },
      ),
    );
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(auditRecord).toHaveBeenCalledWith({
      user_id: "u-1",
      screen: "screen5",
      action: "imported",
      record_id: null,
      summary:
        "1 customer imported via manual column mapper by Bob (1 skipped — blank or duplicate)",
    });
  });

  it("an audit record() rejection does NOT change the 201 (R-AUDIT)", async () => {
    customersInsertOne.mockResolvedValue({ outcome: "inserted" });
    auditRecord.mockRejectedValueOnce(new Error("audit down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      makeReq({ type: "customers", rows: [["A"]], mapping: { name: 0 } }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ inserted: 1, skipped: 0 });
    errSpy.mockRestore();
  });
});
