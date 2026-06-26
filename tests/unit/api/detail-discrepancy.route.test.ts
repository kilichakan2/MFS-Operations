/**
 * tests/unit/api/detail-discrepancy.route.test.ts
 *
 * F-21 — route-level tests for the re-pointed GET /api/detail/discrepancy.
 * Calls the handler DIRECTLY (bypassing middleware), mocking the wiring
 * singleton (discrepanciesRepository) so no DB / network is touched. Pins the
 * things the re-point must NOT change:
 *   - x-mfs-user-id guard preserved byte-identical (401 'Unauthenticated')
 *   - id-required → 400 'id required'
 *   - null on miss → 404 'Not found' (findDetailById null → 404)
 *   - happy-path field mapping: RAW reason → underscore→space, `?? 'Unknown'` /
 *     `?? ''` defaults APPLIED IN THE ROUTE; the exact 11-key response set
 *   - repo throw → 500 'Server error' (R4: the accepted body-string change from
 *     the old raw-fetch 'DB error'; status stays 500)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ServiceError } from "@/lib/errors";
import type { DiscrepancyDetail } from "@/lib/domain";

const findDetailById = vi.fn();

vi.mock("@/lib/wiring/discrepancies", () => ({
  discrepanciesRepository: {
    findDetailById: (...a: unknown[]) => findDetailById(...a),
  },
}));

import { GET } from "@/app/api/detail/discrepancy/route";

beforeEach(() => {
  vi.clearAllMocks();
});

const AUTHED = { "x-mfs-user-id": "admin-1" };

function req(path: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "GET", headers });
}

function detail(overrides: Partial<DiscrepancyDetail> = {}): DiscrepancyDetail {
  return {
    id: "d1",
    createdAt: "2026-04-08T12:00:00.000Z",
    status: "short",
    reason: "out_of_stock",
    orderedQty: 10,
    sentQty: 7,
    unit: "kg",
    note: "ran low",
    customerId: "c1",
    customerName: "Acme Ltd",
    productId: "p1",
    productName: "Lamb Mince",
    productCategory: "meat",
    loggedByName: "Hakan",
    ...overrides,
  };
}

describe("GET /api/detail/discrepancy — guard + 400 + 404 + mapping + 500", () => {
  it("returns 401 'Unauthenticated' when x-mfs-user-id is absent", async () => {
    const res = await GET(req("/api/detail/discrepancy?id=d1", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(findDetailById).not.toHaveBeenCalled();
  });

  it("returns 400 'id required' when id is missing", async () => {
    const res = await GET(req("/api/detail/discrepancy", AUTHED));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "id required" });
    expect(findDetailById).not.toHaveBeenCalled();
  });

  it("returns 404 'Not found' when the repo returns null", async () => {
    findDetailById.mockResolvedValueOnce(null);
    const res = await GET(req("/api/detail/discrepancy?id=missing", AUTHED));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("maps the detail to the exact 11-key response with route-level transforms", async () => {
    findDetailById.mockResolvedValueOnce(detail());
    const res = await GET(req("/api/detail/discrepancy?id=d1", AUTHED));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "id",
        "createdAt",
        "status",
        "reason",
        "orderedQty",
        "sentQty",
        "unit",
        "note",
        "customer",
        "product",
        "category",
        "loggedBy",
      ].sort(),
    );
    expect(body).toEqual({
      id: "d1",
      createdAt: "2026-04-08T12:00:00.000Z",
      status: "short",
      reason: "out of stock", // underscore→space in the ROUTE
      orderedQty: 10,
      sentQty: 7,
      unit: "kg",
      note: "ran low",
      customer: "Acme Ltd",
      product: "Lamb Mince",
      category: "meat",
      loggedBy: "Hakan",
    });
  });

  it("applies the 'Unknown' / '' / null fallbacks in the route", async () => {
    findDetailById.mockResolvedValueOnce(
      detail({
        customerName: null,
        productName: null,
        productCategory: null,
        loggedByName: null,
        unit: null,
        note: null,
      }),
    );
    const res = await GET(req("/api/detail/discrepancy?id=d1", AUTHED));
    const body = await res.json();
    expect(body.customer).toBe("Unknown");
    expect(body.product).toBe("Unknown");
    expect(body.category).toBeNull();
    expect(body.loggedBy).toBe("Unknown");
    expect(body.unit).toBe(""); // r.unit ?? ''
    expect(body.note).toBeNull(); // r.note ?? null
  });

  it("R4: a repo ServiceError yields 500 'Server error' (accepted body-string drift)", async () => {
    findDetailById.mockRejectedValueOnce(new ServiceError("DB exploded"));
    const res = await GET(req("/api/detail/discrepancy?id=d1", AUTHED));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
  });
});
