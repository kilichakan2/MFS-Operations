/**
 * tests/unit/services/markerScene.test.ts
 *
 * F-24 PR2 — pins buildMarkerScene, the PURE vendor-neutral mapping that feeds
 * the admin Map View (Screen 6). Sibling to mapScene.test.ts: the Leaflet
 * rendering itself is E2E/visual (needs a browser); these tests prove the DATA
 * handed to the MarkerMapCanvas adapter is byte-identical to what
 * components/MapView.tsx computed inline before.
 *
 * Every assertion mirrors a rendering decision the old MapView made:
 * the layer filter, the customer teardrop active/inactive colour, the visit
 * rep-shape + visit-type colour fallback, the SPLIT approximate conditions
 * (marker treatment keys off is_approximate; the visit popup pill keys off
 * is_prospect && is_approximate), the cluster-badge descriptors, and the
 * viewport constants (the DISTINCT Sheffield centre, not buildMapScene's MFS).
 */
import { describe, it, expect } from "vitest";
import {
  buildMarkerScene,
  type MapCustomer,
  type MapVisit,
} from "@/lib/services/mapScene";
import type { MarkerMapScene } from "@/lib/ports/MapProvider";

function customer(overrides: Partial<MapCustomer> = {}): MapCustomer {
  return {
    id: "c1",
    name: "Acme Ltd",
    postcode: "S1 2AB",
    code: "ACM",
    active: true,
    lat: 53.4,
    lng: -1.47,
    is_approximate: false,
    ...overrides,
  };
}

function visit(overrides: Partial<MapVisit> = {}): MapVisit {
  return {
    id: "v1",
    lat: 53.41,
    lng: -1.46,
    visit_type: "routine",
    outcome: "ok",
    rep: "Omer",
    customer_name: "Beta Co",
    created_at: "2026-06-18T00:00:00Z",
    is_prospect: false,
    is_approximate: false,
    ...overrides,
  };
}

const layerById = (scene: MarkerMapScene, id: string) =>
  scene.layers.find((l) => l.id === id);

describe("buildMarkerScene", () => {
  // ── (1-3) layer filtering ──────────────────────────────────────
  it('layer="all" → both customers and visits layers present', () => {
    const scene = buildMarkerScene([customer()], [visit()], "all");
    expect(scene.layers.map((l) => l.id).sort()).toEqual([
      "customers",
      "visits",
    ]);
  });

  it('layer="customers" → only the customers layer; visits absent', () => {
    const scene = buildMarkerScene([customer()], [visit()], "customers");
    expect(scene.layers.map((l) => l.id)).toEqual(["customers"]);
    expect(layerById(scene, "visits")).toBeUndefined();
  });

  it('layer="visits" → only the visits layer; customers absent', () => {
    const scene = buildMarkerScene([customer()], [visit()], "visits");
    expect(scene.layers.map((l) => l.id)).toEqual(["visits"]);
    expect(layerById(scene, "customers")).toBeUndefined();
  });

  // ── (4) customer pin shape + active/inactive colour ────────────
  it("customer pin is a teardrop; active=true → navy, active=false → grey", () => {
    const activeScene = buildMarkerScene(
      [customer({ active: true })],
      [],
      "customers",
    );
    const activePin = layerById(activeScene, "customers")!.pins[0];
    expect(activePin.shape).toBe("teardrop");
    expect(activePin.colour).toBe("#16205B");

    const inactiveScene = buildMarkerScene(
      [customer({ active: false })],
      [],
      "customers",
    );
    const inactivePin = layerById(inactiveScene, "customers")!.pins[0];
    expect(inactivePin.colour).toBe("#6B7280");
  });

  // ── (5) customer approximate → marker + pill ───────────────────
  it("customer is_approximate=true → pin.approximate AND popup.approxPill; false → both absent", () => {
    const approx = buildMarkerScene(
      [customer({ is_approximate: true })],
      [],
      "customers",
    );
    const approxPin = layerById(approx, "customers")!.pins[0];
    expect(approxPin.approximate).toBe(true);
    expect(approxPin.popup.approxPill).toEqual({ label: "⚠ Approx. location" });

    const exact = buildMarkerScene(
      [customer({ is_approximate: false })],
      [],
      "customers",
    );
    const exactPin = layerById(exact, "customers")!.pins[0];
    expect(exactPin.approximate).toBe(false);
    expect(exactPin.popup.approxPill).toBeUndefined();
  });

  // ── (6) customer subtitle: postcode · code ─────────────────────
  it("customer subtitle is POSTCODE · CODE when code present, POSTCODE alone when code null", () => {
    const withCode = buildMarkerScene(
      [customer({ postcode: "S1 2AB", code: "ACM" })],
      [],
      "customers",
    );
    expect(layerById(withCode, "customers")!.pins[0].popup.subtitle).toBe(
      "S1 2AB · ACM",
    );

    const noCode = buildMarkerScene(
      [customer({ postcode: "S1 2AB", code: null })],
      [],
      "customers",
    );
    expect(layerById(noCode, "customers")!.pins[0].popup.subtitle).toBe(
      "S1 2AB",
    );
  });

  // ── (7) customer status pill + not clickable ───────────────────
  it("customer statusPill is Active vs Inactive with exact colours; clickable=false", () => {
    const active = buildMarkerScene(
      [customer({ active: true })],
      [],
      "customers",
    );
    const activePin = layerById(active, "customers")!.pins[0];
    expect(activePin.popup.statusPill).toEqual({
      label: "Active",
      background: "#DCFCE7",
      colour: "#15803D",
    });
    expect(activePin.clickable).toBe(false);

    const inactive = buildMarkerScene(
      [customer({ active: false })],
      [],
      "customers",
    );
    expect(layerById(inactive, "customers")!.pins[0].popup.statusPill).toEqual({
      label: "Inactive",
      background: "#F3F4F6",
      colour: "#6B7280",
    });
  });

  // ── (8) visit repShape ─────────────────────────────────────────
  it("repShape: name containing 'mehmet' (any case) → square; else circle", () => {
    const mehmet = buildMarkerScene(
      [],
      [visit({ rep: "MEHMET Yilmaz" })],
      "visits",
    );
    expect(layerById(mehmet, "visits")!.pins[0].shape).toBe("square");

    const omer = buildMarkerScene([], [visit({ rep: "Omer" })], "visits");
    expect(layerById(omer, "visits")!.pins[0].shape).toBe("circle");
  });

  // ── (9) visit-type colour + fallback ───────────────────────────
  it("VISIT_COLOURS per type; unknown type → #6B7280 fallback", () => {
    const cases: [string, string][] = [
      ["routine", "#16205B"],
      ["new_pitch", "#EB6619"],
      ["complaint_followup", "#DC2626"],
      ["delivery_issue", "#D97706"],
    ];
    for (const [type, colour] of cases) {
      const scene = buildMarkerScene(
        [],
        [visit({ visit_type: type })],
        "visits",
      );
      expect(layerById(scene, "visits")!.pins[0].colour).toBe(colour);
    }
    const unknown = buildMarkerScene(
      [],
      [visit({ visit_type: "mystery" })],
      "visits",
    );
    expect(layerById(unknown, "visits")!.pins[0].colour).toBe("#6B7280");
  });

  // ── (10) the approximate SPLIT (the subtle parity point) ───────
  it("visit marker approximate keys off is_approximate; approxPill keys off is_prospect && is_approximate", () => {
    // customer-visit: is_prospect=false, is_approximate=true → faded marker but NO pill
    const custVisit = buildMarkerScene(
      [],
      [visit({ is_prospect: false, is_approximate: true })],
      "visits",
    );
    const cvPin = layerById(custVisit, "visits")!.pins[0];
    expect(cvPin.approximate).toBe(true);
    expect(cvPin.popup.approxPill).toBeUndefined();

    // prospect visit: is_prospect=true, is_approximate=true → faded marker AND pill
    const prospect = buildMarkerScene(
      [],
      [visit({ is_prospect: true, is_approximate: true })],
      "visits",
    );
    const pPin = layerById(prospect, "visits")!.pins[0];
    expect(pPin.approximate).toBe(true);
    expect(pPin.popup.approxPill).toEqual({ label: "⚠ Approx. location" });

    // prospect, exact: no faded, no pill
    const prospectExact = buildMarkerScene(
      [],
      [visit({ is_prospect: true, is_approximate: false })],
      "visits",
    );
    const pePin = layerById(prospectExact, "visits")!.pins[0];
    expect(pePin.approximate).toBe(false);
    expect(pePin.popup.approxPill).toBeUndefined();
  });

  // ── (11) visit prospectTag, footnote, clickable ────────────────
  it("visit prospectTag present iff is_prospect; footnote always; clickable=true", () => {
    const prospect = buildMarkerScene(
      [],
      [visit({ is_prospect: true })],
      "visits",
    );
    const pPin = layerById(prospect, "visits")!.pins[0];
    expect(pPin.popup.prospectTag).toEqual({ label: "Prospect" });
    expect(pPin.popup.footnote).toBe("Tap to see full details");
    expect(pPin.clickable).toBe(true);

    const cust = buildMarkerScene([], [visit({ is_prospect: false })], "visits");
    const cPin = layerById(cust, "visits")!.pins[0];
    expect(cPin.popup.prospectTag).toBeUndefined();
    expect(cPin.popup.footnote).toBe("Tap to see full details");
    expect(cPin.clickable).toBe(true);
  });

  // ── (12) visit subtitle: underscores globally replaced ─────────
  it("visit subtitle replaces ALL underscores in the type, then ' · rep'", () => {
    const scene = buildMarkerScene(
      [],
      [visit({ visit_type: "new_pitch", rep: "Omer" })],
      "visits",
    );
    expect(layerById(scene, "visits")!.pins[0].popup.subtitle).toBe(
      "new pitch · Omer",
    );
    // global replace: a type with two underscores must lose both
    const two = buildMarkerScene(
      [],
      [visit({ visit_type: "complaint_followup", rep: "Omer" })],
      "visits",
    );
    expect(layerById(two, "visits")!.pins[0].popup.subtitle).toBe(
      "complaint followup · Omer",
    );
  });

  // ── (13) cluster badges + maxClusterRadius ─────────────────────
  it("customers cluster = navy circle 36; visits cluster = orange square 32", () => {
    const scene = buildMarkerScene([customer()], [visit()], "all");
    const cust = layerById(scene, "customers")!;
    expect(cust.cluster).toEqual({
      shape: "circle",
      size: 36,
      background: "#16205B",
      colour: "white",
    });
    expect(cust.maxClusterRadius).toBe(40);

    const vis = layerById(scene, "visits")!;
    expect(vis.cluster).toEqual({
      shape: "square",
      size: 32,
      background: "#EB6619",
      colour: "white",
    });
    expect(vis.maxClusterRadius).toBe(30);
  });

  // ── (14) viewport + fitBounds over shown pins only ─────────────
  it("viewport constants + fitBounds = shown pins only", () => {
    const c = customer({ lat: 53.5, lng: -1.5 });
    const v = visit({ lat: 53.6, lng: -1.6 });

    const all = buildMarkerScene([c], [v], "all");
    expect(all.viewport.center).toEqual({ lat: 53.383331, lng: -1.46686 });
    expect(all.viewport.zoom).toBe(9);
    expect(all.viewport.zoomControl).toBe(true);
    expect(all.viewport.fitPadding).toBe(40);
    expect(all.viewport.fitMaxZoom).toBe(13);
    expect(all.viewport.fitBounds).toEqual([
      { lat: 53.5, lng: -1.5 },
      { lat: 53.6, lng: -1.6 },
    ]);

    // customers-only filter → only customer coords in fitBounds
    const custOnly = buildMarkerScene([c], [v], "customers");
    expect(custOnly.viewport.fitBounds).toEqual([{ lat: 53.5, lng: -1.5 }]);

    // visits-only filter → only visit coords in fitBounds
    const visOnly = buildMarkerScene([c], [v], "visits");
    expect(visOnly.viewport.fitBounds).toEqual([{ lat: 53.6, lng: -1.6 }]);
  });

  // ── (15) empty inputs → filtered layers present with empty pins ─
  it("empty inputs → layers present per filter with empty pins, fitBounds=[]", () => {
    const all = buildMarkerScene([], [], "all");
    expect(all.layers.map((l) => l.id).sort()).toEqual(["customers", "visits"]);
    for (const l of all.layers) expect(l.pins).toEqual([]);
    expect(all.viewport.fitBounds).toEqual([]);

    const custOnly = buildMarkerScene([], [], "customers");
    expect(custOnly.layers.map((l) => l.id)).toEqual(["customers"]);
    expect(custOnly.layers[0].pins).toEqual([]);
  });

  // ── pin id + position mapping (carried through verbatim) ───────
  it("pin id + at carry the row id and coords", () => {
    const scene = buildMarkerScene(
      [customer({ id: "cust-9", lat: 1, lng: 2 })],
      [visit({ id: "vis-9", lat: 3, lng: 4 })],
      "all",
    );
    const cPin = layerById(scene, "customers")!.pins[0];
    expect(cPin.id).toBe("cust-9");
    expect(cPin.at).toEqual({ lat: 1, lng: 2 });

    const vPin = layerById(scene, "visits")!.pins[0];
    expect(vPin.id).toBe("vis-9");
    expect(vPin.at).toEqual({ lat: 3, lng: 4 });
    expect(vPin.popup.title).toBe("Beta Co");
  });
});
