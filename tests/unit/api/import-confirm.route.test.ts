/**
 * tests/unit/api/import-confirm.route.test.ts
 *
 * F-20 PR3 — proves the re-pointed POST /api/admin/import/confirm route is a thin
 * doorman over the customers/products services + the geocoder + auditLog ports.
 * Pins: the 401/400 guards; the bulk-insert success path counts; the deviation
 * (insertMany throw → 500 'Server error', NO raw vendor message); W1 — the
 * fire-and-forget geocode write-back swallows a GeocoderError AND a setCoords
 * rejection so neither can turn the already-returned 201 into an error;
 * geocodeMany is called with TRIMMED postcodes and setCoords is keyed by
 * trim().toUpperCase(); the audit summary string is unchanged; the 5s
 * setTimeout road-time trigger is scheduled. Response shape ['inserted','skipped']
 * at 201.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GeocoderError } from "@/lib/ports";

const customersInsertMany = vi.fn();
const customersSetCoords = vi.fn();
const productsInsertMany = vi.fn();
const geocodeMany = vi.fn();
const auditRecord = vi.fn();

vi.mock("@/lib/wiring/customers", () => ({
  customersService: {
    insertMany: (...a: unknown[]) => customersInsertMany(...a),
    setCoords: (...a: unknown[]) => customersSetCoords(...a),
  },
}));
vi.mock("@/lib/wiring/products", () => ({
  productsService: {
    insertMany: (...a: unknown[]) => productsInsertMany(...a),
  },
}));
vi.mock("@/lib/wiring/geocoder", () => ({
  geocoder: { geocodeMany: (...a: unknown[]) => geocodeMany(...a) },
}));
vi.mock("@/lib/wiring/auditLog", () => ({
  auditLog: { record: (...a: unknown[]) => auditRecord(...a) },
}));

import { POST } from "@/app/api/admin/import/confirm/route";

function makeReq(
  body: unknown,
  headers: Record<string, string> = { "x-mfs-user-id": "u-1" },
  rawBody?: string,
): NextRequest {
  return new NextRequest("http://localhost/api/admin/import/confirm", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody ?? JSON.stringify(body),
  });
}

/** Let the fire-and-forget geocode promise chain settle. */
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  auditRecord.mockResolvedValue(undefined);
  geocodeMany.mockResolvedValue(new Map());
  customersSetCoords.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("POST /api/admin/import/confirm — guards (byte-identical)", () => {
  it("returns 401 when x-mfs-user-id is absent", async () => {
    const res = await POST(makeReq({ type: "customers", rows: [{ name: "A" }] }, {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(makeReq(undefined, undefined, "{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when type is invalid", async () => {
    const res = await POST(makeReq({ type: "widgets", rows: [{ name: "A" }] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'type must be "customers" or "products"',
    });
  });

  it("returns 400 when no valid rows after validation", async () => {
    const res = await POST(makeReq({ type: "customers", rows: [{ name: "  " }] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No valid rows to insert after validation",
    });
  });
});

describe("POST /api/admin/import/confirm — customers success path", () => {
  it("returns inserted/skipped and writes the EXACT audit summary", async () => {
    customersInsertMany.mockResolvedValue([
      { id: "c1", postcode: "S1 2AB" },
      { id: "c2", postcode: null },
    ]);
    const res = await POST(
      makeReq(
        {
          type: "customers",
          rows: [
            { name: "Acme", postcode: "S1 2AB" },
            { name: "Beta", postcode: "" },
            { name: "  " }, // filtered out before insert → skipped
          ],
        },
        { "x-mfs-user-id": "u-1", "x-mfs-user-name": "Bob" },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["inserted", "skipped"]);
    expect(body).toEqual({ inserted: 2, skipped: 0 });

    expect(customersInsertMany).toHaveBeenCalledWith([
      { name: "Acme", postcode: "S1 2AB", created_by: "u-1" },
      { name: "Beta", postcode: null, created_by: "u-1" },
    ]);
    expect(auditRecord).toHaveBeenCalledWith({
      user_id: "u-1",
      screen: "screen5",
      action: "imported",
      record_id: null,
      summary: "2 customers imported via AI import by Bob",
    });
    await flushMicrotasks();
  });

  it("insertMany throw → 500 'Server error' (deviation: no raw vendor message)", async () => {
    customersInsertMany.mockRejectedValue(new Error("duplicate key value 23505"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      makeReq({ type: "customers", rows: [{ name: "Acme" }] }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
    errSpy.mockRestore();
  });
});

describe("POST /api/admin/import/confirm — products success path", () => {
  it("cleans sentinel 'none' → null BEFORE the repo, returns counts", async () => {
    productsInsertMany.mockResolvedValue([{ id: "p1" }]);
    const res = await POST(
      makeReq({
        type: "products",
        rows: [{ name: "Lamb", category: "none", code: "", box_size: "10 kg" }],
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ inserted: 1, skipped: 0 });
    expect(productsInsertMany).toHaveBeenCalledWith([
      { name: "Lamb", category: null, code: null, box_size: "10 kg", created_by: "u-1" },
    ]);
  });
});

describe("POST /api/admin/import/confirm — W1 fire-and-forget geocoding", () => {
  it("calls geocodeMany with TRIMMED postcodes and setCoords keyed by trim().toUpperCase()", async () => {
    customersInsertMany.mockResolvedValue([{ id: "c1", postcode: " s1 2ab " }]);
    geocodeMany.mockResolvedValue(
      new Map([["S1 2AB", { lat: 53.38, lng: -1.47, approximate: true }]]),
    );
    const res = await POST(
      makeReq({ type: "customers", rows: [{ name: "Acme", postcode: " s1 2ab " }] }),
    );
    expect(res.status).toBe(201);
    await flushMicrotasks();
    expect(geocodeMany).toHaveBeenCalledWith(["s1 2ab"]);
    expect(customersSetCoords).toHaveBeenCalledWith("c1", {
      lat: 53.38,
      lng: -1.47,
      geocoded_at: expect.any(String),
      is_approximate_location: true,
    });
  });

  it("a GeocoderError from geocodeMany does NOT change the 201 (W1)", async () => {
    customersInsertMany.mockResolvedValue([{ id: "c1", postcode: "S1 2AB" }]);
    geocodeMany.mockRejectedValue(new GeocoderError());
    const res = await POST(
      makeReq({ type: "customers", rows: [{ name: "Acme", postcode: "S1 2AB" }] }),
    );
    expect(res.status).toBe(201);
    await flushMicrotasks();
    expect(customersSetCoords).not.toHaveBeenCalled();
  });

  it("a setCoords rejection inside the geocode loop does NOT change the 201 (W1)", async () => {
    customersInsertMany.mockResolvedValue([{ id: "c1", postcode: "S1 2AB" }]);
    geocodeMany.mockResolvedValue(
      new Map([["S1 2AB", { lat: 1, lng: 2, approximate: false }]]),
    );
    customersSetCoords.mockRejectedValue(new Error("db down"));
    const res = await POST(
      makeReq({ type: "customers", rows: [{ name: "Acme", postcode: "S1 2AB" }] }),
    );
    expect(res.status).toBe(201);
    await flushMicrotasks();
  });

  it("schedules the 5s road-time trigger fetch after a successful customers insert", async () => {
    vi.useFakeTimers();
    customersInsertMany.mockResolvedValue([{ id: "c1", postcode: "S1 2AB" }]);
    const res = await POST(
      makeReq({ type: "customers", rows: [{ name: "Acme", postcode: "S1 2AB" }] }),
    );
    expect(res.status).toBe(201);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    // The road-time fetch is fired only after the 5s delay elapses.
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/routes/compute-road-times"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
