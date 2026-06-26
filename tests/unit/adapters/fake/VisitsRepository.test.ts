/**
 * tests/unit/adapters/fake/VisitsRepository.test.ts
 *
 * F-20 PR2 — fake-adapter PARITY coverage (risk R3) for the three admin-insight
 * reads added to VisitsRepository. The fake is the faithful twin of the Supabase
 * adapter: it must reproduce the SAME window / filter / order semantics so the
 * service unit + route tests can rely on it without a DB. These tests plant rows
 * via the new `visits` seed and assert each read's filter + order + the R1
 * null-pipeline_status preservation.
 */
import { describe, it, expect } from "vitest";
import { createFakeVisitsRepository } from "@/lib/adapters/fake";
import type { FakeVisitsSeed } from "@/lib/adapters/fake/VisitsRepository";

const SEED: FakeVisitsSeed = {
  people: {
    u1: { id: "u1", name: "Hakan" },
    u2: { id: "u2", name: "Mert" },
  },
  customers: {
    c1: { id: "c1", name: "Acme Ltd" },
  },
  visits: [
    // A prospect with a stage (newest).
    {
      id: "v-prospect-staged",
      createdAt: "2026-06-20T10:00:00.000Z",
      userId: "u1",
      prospectName: "Staged Cafe",
      prospectPostcode: "SW1A 1AA",
      outcome: "positive",
      visitType: "new_pitch",
      pipelineStatus: "In Talks",
    },
    // A prospect with a NULL stage (R1 anchor).
    {
      id: "v-prospect-nullstage",
      createdAt: "2026-06-19T10:00:00.000Z",
      userId: "u2",
      prospectName: "Blank Cafe",
      outcome: "neutral",
      visitType: "routine",
      pipelineStatus: null,
    },
    // A customer visit (no prospect_name) — excluded from prospects.
    {
      id: "v-customer-atrisk",
      createdAt: "2026-06-18T10:00:00.000Z",
      userId: "u1",
      customerId: "c1",
      prospectName: null,
      outcome: "at_risk",
      visitType: "routine",
      pipelineStatus: "Not Progressing",
    },
    // A lost outcome with a commitment (used by at-risk AND commitments).
    {
      id: "v-lost-commit",
      createdAt: "2026-06-17T10:00:00.000Z",
      userId: "u2",
      customerId: "c1",
      prospectName: null,
      outcome: "lost",
      visitType: "complaint_followup",
      pipelineStatus: "Not Won",
      commitmentMade: true,
      commitmentDetail: "send a credit note",
    },
    // A positive outcome with a commitment (used by commitments only).
    {
      id: "v-positive-commit",
      createdAt: "2026-06-16T10:00:00.000Z",
      userId: "u1",
      prospectName: "Future Deli",
      outcome: "positive",
      visitType: "routine",
      pipelineStatus: "Won",
      commitmentMade: true,
      commitmentDetail: "deliver a sample box",
    },
  ],
};

const WIDE = { from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" };

function makeRepo() {
  return createFakeVisitsRepository(SEED);
}

describe("Fake VisitsRepository.listProspects (parity)", () => {
  it("returns only rows with a non-null prospect_name, newest first", async () => {
    const out = await makeRepo().listProspects(WIDE);
    const ids = out.map((v) => v.id);
    expect(ids).toEqual([
      "v-prospect-staged",
      "v-prospect-nullstage",
      "v-positive-commit",
    ]);
    // The customer + lost rows (no prospect_name) are excluded.
    expect(ids).not.toContain("v-customer-atrisk");
    expect(ids).not.toContain("v-lost-commit");
  });

  it("R1: preserves a RAW null pipeline_status (does NOT flip it to 'Logged')", async () => {
    const out = await makeRepo().listProspects(WIDE);
    const nullStage = out.find((v) => v.id === "v-prospect-nullstage")!;
    expect(nullStage.pipelineStatus).toBeNull();
    const staged = out.find((v) => v.id === "v-prospect-staged")!;
    expect(staged.pipelineStatus).toBe("In Talks");
  });

  it("respects the [from,to] window (inclusive)", async () => {
    const out = await makeRepo().listProspects({
      from: "2026-06-20T00:00:00.000Z",
      to: "2026-06-20T23:59:59.000Z",
    });
    expect(out.map((v) => v.id)).toEqual(["v-prospect-staged"]);
  });
});

describe("Fake VisitsRepository.listAtRisk (parity)", () => {
  it("returns only outcome IN (at_risk, lost), newest first", async () => {
    const out = await makeRepo().listAtRisk(WIDE);
    expect(out.map((v) => v.id)).toEqual(["v-customer-atrisk", "v-lost-commit"]);
    expect(out.every((v) => v.outcome === "at_risk" || v.outcome === "lost")).toBe(true);
  });

  it("resolves the customer + rep joins", async () => {
    const out = await makeRepo().listAtRisk(WIDE);
    const lost = out.find((v) => v.id === "v-lost-commit")!;
    expect(lost.customerName).toBe("Acme Ltd");
    expect(lost.loggedByName).toBe("Mert");
    expect(lost.outcome).toBe("lost"); // RAW enum
  });
});

describe("Fake VisitsRepository.listCommitments (parity)", () => {
  it("returns only commitment_made=true with created_at < to, OLDEST first", async () => {
    const out = await makeRepo().listCommitments({ from: null, to: WIDE.to });
    // ASC by created_at: positive-commit (06-16) before lost-commit (06-17).
    expect(out.map((v) => v.id)).toEqual(["v-positive-commit", "v-lost-commit"]);
  });

  it("R2: uses a STRICT < on `to` (a row exactly at `to` is excluded)", async () => {
    // Set `to` to exactly the lost-commit timestamp — it must be excluded.
    const out = await makeRepo().listCommitments({
      from: null,
      to: "2026-06-17T10:00:00.000Z",
    });
    expect(out.map((v) => v.id)).toEqual(["v-positive-commit"]);
  });

  it("R2: applies the `from` lower bound only when present", async () => {
    const withFrom = await makeRepo().listCommitments({
      from: "2026-06-17T00:00:00.000Z",
      to: WIDE.to,
    });
    expect(withFrom.map((v) => v.id)).toEqual(["v-lost-commit"]);

    const noFrom = await makeRepo().listCommitments({ from: null, to: WIDE.to });
    expect(noFrom.map((v) => v.id)).toEqual(["v-positive-commit", "v-lost-commit"]);
  });
});

// ── F-20 PR3 — listForMap parity ──────────────────────────────────────────────
const MAP_SEED: FakeVisitsSeed = {
  people: { u1: { id: "u1", name: "Hakan" } },
  customers: {
    cGeo: { id: "cGeo", name: "Geo Customer", lat: 53.38, lng: -1.47 },
    cNoCoords: { id: "cNoCoords", name: "No Coords Customer" }, // lat/lng absent
  },
  visits: [
    // Customer visit with resolvable coords → included (customer-side).
    {
      id: "v-cust-geo",
      createdAt: "2026-06-20T10:00:00.000Z",
      userId: "u1",
      customerId: "cGeo",
      outcome: "positive",
      visitType: "routine",
    },
    // Customer visit whose customer has NO coords → skipped.
    {
      id: "v-cust-nocoords",
      createdAt: "2026-06-19T10:00:00.000Z",
      userId: "u1",
      customerId: "cNoCoords",
      outcome: "neutral",
      visitType: "routine",
    },
    // Prospect visit with prospect coords → included (prospect-side).
    {
      id: "v-prospect-geo",
      createdAt: "2026-06-18T10:00:00.000Z",
      userId: "u1",
      prospectName: "Prospect Cafe",
      outcome: "positive",
      visitType: "new_pitch",
      prospectLat: 51.5,
      prospectLng: -0.12,
      isApproximateLocation: true,
    },
    // Prospect visit WITHOUT coords → skipped (prospect-side).
    {
      id: "v-prospect-nocoords",
      createdAt: "2026-06-17T10:00:00.000Z",
      userId: "u1",
      prospectName: "Blank Prospect",
      outcome: "neutral",
      visitType: "routine",
    },
    // Out-of-window customer visit → filtered out by the date window.
    {
      id: "v-out-of-window",
      createdAt: "2026-05-01T10:00:00.000Z",
      userId: "u1",
      customerId: "cGeo",
      outcome: "positive",
      visitType: "routine",
    },
  ],
};

describe("Fake VisitsRepository.listForMap (parity)", () => {
  function mapRepo() {
    return createFakeVisitsRepository(MAP_SEED);
  }

  it("returns customer-side visits first (newest-first), then prospect-side; skips null-coord rows", async () => {
    const out = await mapRepo().listForMap({ from: null, to: null });
    // Customer-side newest-first: v-cust-geo (06-20) then v-out-of-window
    // (05-01); v-cust-nocoords skipped. Then prospect-side: v-prospect-geo;
    // v-prospect-nocoords skipped.
    expect(out.map((v) => v.id)).toEqual([
      "v-cust-geo",
      "v-out-of-window",
      "v-prospect-geo",
    ]);
  });

  it("maps the customer visit shape (coords from customer, is_prospect false)", async () => {
    const out = await mapRepo().listForMap({ from: null, to: null });
    const cust = out.find((v) => v.id === "v-cust-geo")!;
    expect(cust.lat).toBe(53.38);
    expect(cust.lng).toBe(-1.47);
    expect(cust.customer_name).toBe("Geo Customer");
    expect(cust.rep).toBe("Hakan");
    expect(cust.is_prospect).toBe(false);
    expect(cust.is_approximate).toBe(false);
  });

  it("maps the prospect visit shape (prospect coords, approximate flag preserved)", async () => {
    const out = await mapRepo().listForMap({ from: null, to: null });
    const pros = out.find((v) => v.id === "v-prospect-geo")!;
    expect(pros.lat).toBe(51.5);
    expect(pros.lng).toBe(-0.12);
    expect(pros.customer_name).toBe("Prospect Cafe");
    expect(pros.is_prospect).toBe(true);
    expect(pros.is_approximate).toBe(true);
  });

  it("applies the date window to both sides", async () => {
    const out = await mapRepo().listForMap({
      from: "2026-06-19T00:00:00.000Z",
      to: "2026-06-21T00:00:00.000Z",
    });
    // v-cust-geo (06-20) in; v-prospect-geo (06-18) out; v-out-of-window out.
    expect(out.map((v) => v.id)).toEqual(["v-cust-geo"]);
  });
});
