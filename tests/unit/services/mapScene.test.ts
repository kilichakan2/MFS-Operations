/**
 * tests/unit/services/mapScene.test.ts
 *
 * F-24 — pins buildMapScene, the PURE vendor-neutral mapping that feeds the
 * Route Planner map. This is the real unit-test seam: the Leaflet rendering
 * itself is E2E/visual (needs a browser); these tests prove the DATA handed to
 * the adapter is byte-identical to what components/RouteMap.tsx computed before.
 *
 * Every assertion mirrors a rendering decision the old RouteMap made:
 * the plottable null-coord filter, the sameHub destination-pin suppression,
 * the polyline-vs-fitBounds distinction, popup field conditionals, line styling,
 * and the viewport constants.
 */
import { describe, it, expect } from "vitest";
import { buildMapScene, type RouteStop } from "@/lib/services/mapScene";

// Mirror lib/hubs.ts coords so the fixtures match production exactly.
const MFS = { lat: 53.392371, lng: -1.479496, label: "MFS Sheffield" };
const OZMEN = { lat: 53.370449, lng: -1.475525, label: "Ozmen John Street" };
const HUBS = { mfs: MFS, ozmen: OZMEN };

function stop(overrides: Partial<RouteStop> = {}): RouteStop {
  return {
    position: 1,
    customerId: "c1",
    customerName: "Acme Ltd",
    postcode: "S1 2AB",
    lat: 53.4,
    lng: -1.47,
    priority: "none",
    estimatedArrival: null,
    ...overrides,
  };
}

describe("buildMapScene", () => {
  // ── empty stops ────────────────────────────────────────────────
  it("with no stops and endPoint=mfs: only the origin pin, no line, fitBounds has just MFS", () => {
    const scene = buildMapScene([], "mfs", HUBS);

    expect(scene.line).toBeNull();
    expect(scene.pins).toHaveLength(1);
    expect(scene.pins[0].kind).toBe("origin");
    expect(scene.pins[0].at).toEqual({ lat: MFS.lat, lng: MFS.lng });
    // sameHub → dest excluded from fitBounds
    expect(scene.viewport.fitBounds).toEqual([{ lat: MFS.lat, lng: MFS.lng }]);
  });

  it("with no stops and endPoint=ozmen_john_street: origin + destination pins, no line, fitBounds includes Ozmen", () => {
    const scene = buildMapScene([], "ozmen_john_street", HUBS);

    expect(scene.line).toBeNull();
    expect(scene.pins).toHaveLength(2);
    expect(scene.pins.map((p) => p.kind)).toEqual(["origin", "destination"]);
    expect(scene.pins[1].at).toEqual({ lat: OZMEN.lat, lng: OZMEN.lng });
    expect(scene.viewport.fitBounds).toEqual([
      { lat: MFS.lat, lng: MFS.lng },
      { lat: OZMEN.lat, lng: OZMEN.lng },
    ]);
  });

  // ── plottable filter ───────────────────────────────────────────
  it("excludes stops with null lat/lng from pins, line and fitBounds", () => {
    const good = stop({ position: 1, customerId: "g1", lat: 53.41, lng: -1.46 });
    const noLat = stop({ position: 2, customerId: "b1", lat: null, lng: -1.46 });
    const noLng = stop({ position: 3, customerId: "b2", lat: 53.42, lng: null });

    const scene = buildMapScene([good, noLat, noLng], "mfs", HUBS);

    const stopPins = scene.pins.filter((p) => p.kind === "stop");
    expect(stopPins).toHaveLength(1);
    expect(stopPins[0].id).toBe("g1");

    // line: origin → the one plottable stop → dest (MFS, sameHub)
    expect(scene.line).not.toBeNull();
    expect(scene.line!.points).toEqual([
      { lat: MFS.lat, lng: MFS.lng },
      { lat: 53.41, lng: -1.46 },
      { lat: MFS.lat, lng: MFS.lng },
    ]);

    // fitBounds: origin + the one plottable stop (no dest, sameHub)
    expect(scene.viewport.fitBounds).toEqual([
      { lat: MFS.lat, lng: MFS.lng },
      { lat: 53.41, lng: -1.46 },
    ]);
  });

  // ── stop pin fields + popup conditionals ───────────────────────
  it("a stop pin carries label=String(position), accent=priority colour, and full popup", () => {
    const s = stop({
      position: 2,
      customerName: "Beta Co",
      postcode: "S2 5CD",
      priority: "priority",
      estimatedArrival: "14:05",
      lat: 53.43,
      lng: -1.45,
    });

    const scene = buildMapScene([s], "mfs", HUBS);
    const pin = scene.pins.find((p) => p.kind === "stop")!;

    expect(pin.label).toBe("2");
    expect(pin.accent).toBe("#DC2626"); // priority colour
    expect(pin.popup.title).toBe("2. Beta Co");
    expect(pin.popup.subtitle).toBe("S2 5CD");
    expect(pin.popup.eta).toBe("Est. 14:05");
    expect(pin.popup.priorityTag).toEqual({
      label: "🔴 Priority",
      colour: "#DC2626",
    });
  });

  it("urgent priority → amber accent + ⚠️ Urgent tag", () => {
    const s = stop({ priority: "urgent", lat: 53.43, lng: -1.45 });
    const scene = buildMapScene([s], "mfs", HUBS);
    const pin = scene.pins.find((p) => p.kind === "stop")!;

    expect(pin.accent).toBe("#D97706");
    expect(pin.popup.priorityTag).toEqual({
      label: "⚠️ Urgent",
      colour: "#D97706",
    });
  });

  it("priority=none → navy accent and NO priorityTag", () => {
    const s = stop({ priority: "none", lat: 53.43, lng: -1.45 });
    const scene = buildMapScene([s], "mfs", HUBS);
    const pin = scene.pins.find((p) => p.kind === "stop")!;

    expect(pin.accent).toBe("#16205B");
    expect(pin.popup.priorityTag).toBeUndefined();
  });

  it("omits subtitle when postcode is null or empty, and eta when no estimatedArrival", () => {
    const noPostcode = stop({
      customerId: "np",
      postcode: null,
      estimatedArrival: null,
      lat: 53.43,
      lng: -1.45,
    });
    const emptyPostcode = stop({
      position: 2,
      customerId: "ep",
      postcode: "",
      lat: 53.44,
      lng: -1.44,
    });

    const scene = buildMapScene([noPostcode, emptyPostcode], "mfs", HUBS);
    const pins = scene.pins.filter((p) => p.kind === "stop");

    expect(pins[0].popup.subtitle).toBeUndefined();
    expect(pins[0].popup.eta).toBeUndefined();
    expect(pins[1].popup.subtitle).toBeUndefined(); // empty string suppressed too
  });

  // ── endPoint variants ──────────────────────────────────────────
  it("endPoint=mfs: no destination pin, dest===origin, line ends at MFS, fitBounds has no dest", () => {
    const s = stop({ lat: 53.43, lng: -1.45 });
    const scene = buildMapScene([s], "mfs", HUBS);

    expect(scene.pins.some((p) => p.kind === "destination")).toBe(false);
    const last = scene.line!.points[scene.line!.points.length - 1];
    expect(last).toEqual({ lat: MFS.lat, lng: MFS.lng });
    // fitBounds: origin + stop only
    expect(scene.viewport.fitBounds).toEqual([
      { lat: MFS.lat, lng: MFS.lng },
      { lat: 53.43, lng: -1.45 },
    ]);
  });

  it("endPoint=ozmen_john_street: destination pin at Ozmen, line ends at Ozmen, fitBounds includes Ozmen", () => {
    const s = stop({ lat: 53.43, lng: -1.45 });
    const scene = buildMapScene([s], "ozmen_john_street", HUBS);

    const destPin = scene.pins.find((p) => p.kind === "destination")!;
    expect(destPin.at).toEqual({ lat: OZMEN.lat, lng: OZMEN.lng });
    expect(destPin.label).toBe("🏪");
    expect(destPin.popup).toEqual({ title: OZMEN.label, subtitle: "End" });

    const last = scene.line!.points[scene.line!.points.length - 1];
    expect(last).toEqual({ lat: OZMEN.lat, lng: OZMEN.lng });

    expect(scene.viewport.fitBounds).toEqual([
      { lat: MFS.lat, lng: MFS.lng },
      { lat: 53.43, lng: -1.45 },
      { lat: OZMEN.lat, lng: OZMEN.lng },
    ]);
  });

  // ── origin pin ─────────────────────────────────────────────────
  it("origin pin is always MFS with 🏭 / Start / depot accent", () => {
    const scene = buildMapScene([], "mfs", HUBS);
    const origin = scene.pins.find((p) => p.kind === "origin")!;
    expect(origin.label).toBe("🏭");
    expect(origin.accent).toBe("#EB6619");
    expect(origin.popup).toEqual({ title: MFS.label, subtitle: "Start" });
  });

  // ── line styling ───────────────────────────────────────────────
  it("line styling fields are exact: #16205B / weight 3 / opacity 0.7 / dash 6 4", () => {
    const s = stop({ lat: 53.43, lng: -1.45 });
    const scene = buildMapScene([s], "mfs", HUBS);

    expect(scene.line!.colour).toBe("#16205B");
    expect(scene.line!.weight).toBe(3);
    expect(scene.line!.opacity).toBe(0.7);
    expect(scene.line!.dash).toBe("6 4");
  });

  // ── viewport constants ─────────────────────────────────────────
  it("viewport: center=MFS, zoom 9, fitPadding 40, fitMaxZoom 13", () => {
    const scene = buildMapScene([], "mfs", HUBS);
    expect(scene.viewport.center).toEqual({ lat: MFS.lat, lng: MFS.lng });
    expect(scene.viewport.zoom).toBe(9);
    expect(scene.viewport.fitPadding).toBe(40);
    expect(scene.viewport.fitMaxZoom).toBe(13);
  });
});
