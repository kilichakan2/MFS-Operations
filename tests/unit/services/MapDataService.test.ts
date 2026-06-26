/**
 * tests/unit/services/MapDataService.test.ts
 *
 * F-20 PR3 — exercises MapDataService over the Fake Customers + Visits
 * repositories. The service is a thin composition with one presentation-shaped
 * `layer` switch, so these tests prove: each layer populates the right sections
 * and leaves un-selected ones as empty arrays, and the date window is threaded
 * through to visits.listForMap. No DB, no network.
 */
import { describe, it, expect } from "vitest";
import { createMapDataService } from "@/lib/services";
import {
  createFakeCustomersRepository,
  createFakeVisitsRepository,
} from "@/lib/adapters/fake";
import type { FakeVisitsSeed } from "@/lib/adapters/fake/VisitsRepository";

const VISITS_SEED: FakeVisitsSeed = {
  people: { u1: { id: "u1", name: "Hakan" } },
  visits: [
    {
      id: "v-prospect",
      createdAt: "2026-06-20T10:00:00.000Z",
      userId: "u1",
      prospectName: "Prospect Cafe",
      outcome: "positive",
      visitType: "new_pitch",
      prospectLat: 51.5,
      prospectLng: -0.12,
    },
  ],
};

function makeService() {
  return createMapDataService({
    customers: createFakeCustomersRepository([
      {
        id: "00000000-0000-0000-0000-0000000000a1",
        name: "Geo Co",
        postcode: "S1 2AB",
        active: true,
        lat: 53.38,
        lng: -1.47,
        is_approximate_location: false,
      },
    ]),
    visits: createFakeVisitsRepository(VISITS_SEED),
  });
}

const WINDOW = { from: null, to: null };

describe("MapDataService.load — layer switch", () => {
  it("layer 'all' populates both customers and visits", async () => {
    const out = await makeService().load({ layer: "all", window: WINDOW });
    expect(out.customers.length).toBe(1);
    expect(out.visits.length).toBe(1);
  });

  it("layer 'customers' populates customers, visits empty", async () => {
    const out = await makeService().load({ layer: "customers", window: WINDOW });
    expect(out.customers.length).toBe(1);
    expect(out.visits).toEqual([]);
  });

  it("layer 'visits' populates visits, customers empty", async () => {
    const out = await makeService().load({ layer: "visits", window: WINDOW });
    expect(out.customers).toEqual([]);
    expect(out.visits.length).toBe(1);
  });

  it("an unknown layer populates neither (both empty)", async () => {
    const out = await makeService().load({ layer: "nope", window: WINDOW });
    expect(out.customers).toEqual([]);
    expect(out.visits).toEqual([]);
  });

  it("threads the date window to visits.listForMap", async () => {
    // A window that excludes the only seeded visit (06-20) → visits empty.
    const out = await makeService().load({
      layer: "all",
      window: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" },
    });
    expect(out.visits).toEqual([]);
    // Customers are not date-windowed, so they still come through.
    expect(out.customers.length).toBe(1);
  });
});
