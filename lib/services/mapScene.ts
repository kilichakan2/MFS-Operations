/**
 * lib/services/mapScene.ts
 *
 * buildMapScene (F-24) — the PURE, vendor-neutral mapping that turns a route's
 * flat stops + endpoint + hub coords into a `MapScene` (pins + line + viewport).
 *
 * This is the one piece of real, testable map logic. It is deliberately NOT in
 * lib/adapters/leaflet/: it is portable across map vendors (a future native-app
 * map adapter must reuse this recipe WITHOUT dragging in the web Leaflet folder).
 * So it lives in the app's own logic layer — it depends only on the MapProvider
 * PORT types and on plain hub data, never on leaflet / react-leaflet / JSX.
 *
 * Every rendering decision below reproduces what components/RouteMap.tsx drew
 * before F-24, BYTE-IDENTICAL, via explicit per-field construction (never spread).
 * See ADR-0002 / F-24 (Gate 2 amendment: this stays out of the adapter folder).
 */

import type {
  LatLng,
  MapLine,
  MapPin,
  MapPopup,
  MapScene,
  MapViewport,
} from "@/lib/ports/MapProvider";

/**
 * The flat route-stop view-model the Route Planner builds and feeds the map.
 *
 * Declared HERE (moved out of components/RouteMap.tsx in F-24) so the logic layer
 * does not import UPWARD from presentation. components/RouteMap.tsx RE-EXPORTS this
 * type, so app/routes/page.tsx's `import type { RouteStop } from '@/components/RouteMap'`
 * keeps resolving unchanged. NOT the domain Route's RouteStop (that one nests a
 * `customer` object); this is a flat presentation shape.
 */
export interface RouteStop {
  position: number;
  customerId: string;
  customerName: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  priority: "none" | "urgent" | "priority";
  estimatedArrival?: string | null;
}

/** The hub coordinate shape buildMapScene needs (a subset of lib/hubs HubCoords). */
interface HubPoint {
  lat: number;
  lng: number;
  label: string;
}

/**
 * Priority → ring/accent colour. Moved verbatim from components/RouteMap.tsx.
 * Used for the stop pin's ring (numberedPin) and the popup's priority tag.
 */
const PRIORITY_COLOUR: Record<string, string> = {
  priority: "#DC2626",
  urgent: "#D97706",
  none: "#16205B",
};

/** Depot pin accent — the orange used by depotPin() for origin/destination. */
const DEPOT_ACCENT = "#EB6619";

/**
 * Build the vendor-neutral scene for the route planner map.
 *
 * @param stops    flat route stops (some may have null lat/lng — filtered out)
 * @param endPoint 'mfs' (round-trip) or 'ozmen_john_street' (ends at Ozmen)
 * @param hubs     the two hub coordinates the app owns (MFS + Ozmen)
 */
export function buildMapScene(
  stops: RouteStop[],
  endPoint: "mfs" | "ozmen_john_street",
  hubs: { mfs: HubPoint; ozmen: HubPoint },
): MapScene {
  const origin = hubs.mfs;
  const dest = endPoint === "ozmen_john_street" ? hubs.ozmen : hubs.mfs;
  const sameHub = endPoint === "mfs";

  // Only stops with real coords plot (the `plottable` filter from RouteMap).
  const plottable = stops.filter((s) => s.lat != null && s.lng != null);

  // Polyline: origin → plottable stops → destination (always includes dest).
  // Built only when there is at least one plottable stop; otherwise no line.
  const line: MapLine | null =
    plottable.length > 0
      ? {
          points: [
            { lat: origin.lat, lng: origin.lng },
            ...plottable.map(
              (s): LatLng => ({ lat: s.lat as number, lng: s.lng as number }),
            ),
            { lat: dest.lat, lng: dest.lng },
          ],
          colour: "#16205B",
          weight: 3,
          opacity: 0.7,
          dash: "6 4",
        }
      : null;

  // fitBounds (the `allPositions` rule): origin → plottable stops → dest,
  // but dest is EXCLUDED when sameHub (round-trip ends where it started).
  // Distinct from the polyline, which ALWAYS includes dest.
  const fitBounds: LatLng[] = [
    { lat: origin.lat, lng: origin.lng },
    ...plottable.map(
      (s): LatLng => ({ lat: s.lat as number, lng: s.lng as number }),
    ),
    ...(sameHub ? [] : [{ lat: dest.lat, lng: dest.lng }]),
  ];

  const viewport: MapViewport = {
    center: { lat: origin.lat, lng: origin.lng },
    zoom: 9,
    fitBounds,
    fitPadding: 40,
    fitMaxZoom: 13,
  };

  const pins: MapPin[] = [];

  // Origin pin — always MFS (🏭, "Start").
  pins.push({
    id: "origin",
    at: { lat: origin.lat, lng: origin.lng },
    kind: "origin",
    label: "🏭",
    accent: DEPOT_ACCENT,
    popup: { title: origin.label, subtitle: "Start" },
  });

  // Destination pin — ONLY when not a round-trip (🏪, "End").
  if (!sameHub) {
    pins.push({
      id: "destination",
      at: { lat: dest.lat, lng: dest.lng },
      kind: "destination",
      label: "🏪",
      accent: DEPOT_ACCENT,
      popup: { title: dest.label, subtitle: "End" },
    });
  }

  // One pin per plottable stop — numbered, priority-coloured ring.
  for (const stop of plottable) {
    const popup: MapPopup = {
      title: `${stop.position}. ${stop.customerName}`,
      // Source rendered postcode only when truthy (`stop.postcode &&`), so
      // null AND empty string are both suppressed: use `|| undefined`.
      subtitle: stop.postcode || undefined,
      // Source rendered the eta line only when estimatedArrival truthy.
      eta: stop.estimatedArrival ? `Est. ${stop.estimatedArrival}` : undefined,
      // Source rendered the priority tag only when priority !== 'none'.
      priorityTag:
        stop.priority !== "none"
          ? {
              label: stop.priority === "priority" ? "🔴 Priority" : "⚠️ Urgent",
              colour: PRIORITY_COLOUR[stop.priority],
            }
          : undefined,
    };

    pins.push({
      id: stop.customerId,
      at: { lat: stop.lat as number, lng: stop.lng as number },
      kind: "stop",
      label: String(stop.position),
      accent: PRIORITY_COLOUR[stop.priority] ?? "#16205B",
      popup,
    });
  }

  return { viewport, pins, line };
}
