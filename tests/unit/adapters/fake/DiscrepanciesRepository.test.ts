/**
 * tests/unit/adapters/fake/DiscrepanciesRepository.test.ts
 *
 * F-21 — runs the shared DiscrepanciesRepository contract against the Fake
 * in-memory adapter. No DB. No network. No Supabase stack required.
 */
import { describe, it, expect } from "vitest";
import { discrepanciesRepositoryContract } from "@/lib/ports/__contracts__/DiscrepanciesRepository.contract";
import { createFakeDiscrepanciesRepository } from "@/lib/adapters/fake";

const USER_ID = "00000000-0000-0000-0000-0000000000d1";
const CUST_ID = "00000000-0000-0000-0000-0000000000d2";
const PROD_ID = "00000000-0000-0000-0000-0000000000d3";
const TODAY_ID = "00000000-0000-0000-0000-0000000000d4";
const OLDER_ID = "00000000-0000-0000-0000-0000000000d5";
const MISSING_ID = "00000000-0000-0000-0000-0000000000ff";

const FROM = "2026-04-01T00:00:00.000Z";
const TO = "2026-04-30T23:59:59.999Z";

discrepanciesRepositoryContract(async () => {
  const repo = createFakeDiscrepanciesRepository({
    people: { [USER_ID]: { id: USER_ID, name: "Hakan" } },
    customers: { [CUST_ID]: { id: CUST_ID, name: "Acme Ltd" } },
    products: {
      [PROD_ID]: { id: PROD_ID, name: "Lamb Mince", category: "meat" },
    },
    discrepancies: [
      {
        id: TODAY_ID,
        createdAt: "2026-04-08T12:00:00.000Z",
        userId: USER_ID,
        customerId: CUST_ID,
        productId: PROD_ID,
        status: "short",
        reason: "out_of_stock",
        orderedQty: 10,
        sentQty: 7,
        unit: "kg",
        note: "ran low",
      },
      {
        id: OLDER_ID,
        createdAt: "2026-04-02T09:00:00.000Z",
        userId: USER_ID,
        customerId: CUST_ID,
        productId: PROD_ID,
        status: "not_sent",
        reason: "supplier_short",
        orderedQty: 5,
        sentQty: null,
        unit: "units",
        note: null,
      },
    ],
  });
  return {
    repo,
    todayWindow: { from: FROM, to: TO },
    weekWindow: { from: FROM, to: TO },
    knownTodayId: TODAY_ID,
    knownDetailId: TODAY_ID,
    missingId: MISSING_ID,
    knownRawReason: "out_of_stock",
    cleanup: async () => {},
  };
});

// ── Focused fake-level behaviour (window edges, limit, null joins) ───────────
describe("Fake DiscrepanciesRepository — window + limit + null joins", () => {
  it("excludes rows outside [from,to]", async () => {
    const repo = createFakeDiscrepanciesRepository({
      discrepancies: [
        { id: "in", createdAt: "2026-04-10T00:00:00.000Z", status: "short", reason: "other" },
        { id: "before", createdAt: "2026-03-31T00:00:00.000Z", status: "short", reason: "other" },
        { id: "after", createdAt: "2026-05-01T00:00:00.000Z", status: "short", reason: "other" },
      ],
    });
    const rows = await repo.listToday({ from: FROM, to: TO });
    expect(rows.map((r) => r.id)).toEqual(["in"]);
  });

  it("caps listToday at 50, newest first", async () => {
    const discrepancies = Array.from({ length: 60 }, (_, i) => ({
      id: `d${String(i).padStart(3, "0")}`,
      createdAt: new Date(Date.parse(FROM) + i * 1000).toISOString(),
      status: "short" as const,
      reason: "other",
    }));
    const repo = createFakeDiscrepanciesRepository({ discrepancies });
    const rows = await repo.listToday({ from: FROM, to: TO });
    expect(rows.length).toBe(50);
    // newest first → the latest createdAt is first.
    expect(rows[0].id).toBe("d059");
  });

  it("resolves null joins to null (no 'Unknown' at the adapter layer)", async () => {
    const repo = createFakeDiscrepanciesRepository({
      discrepancies: [
        { id: "x", createdAt: "2026-04-10T00:00:00.000Z", status: "short", reason: "other" },
      ],
    });
    const [row] = await repo.listToday({ from: FROM, to: TO });
    expect(row.customerName).toBeNull();
    expect(row.productName).toBeNull();
    expect(row.loggedByName).toBeNull();
  });
});
