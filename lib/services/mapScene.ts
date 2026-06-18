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
  ClusterBadge,
  LatLng,
  MapLine,
  MapPin,
  MapPopup,
  MapScene,
  MapViewport,
  MarkerLayer,
  MarkerMapScene,
  MarkerMapViewport,
  MarkerPin,
  MarkerPinShape,
  MarkerPopup,
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

// ─── F-24 PR2: buildMarkerScene (the admin Map View, Screen 6) ────────────────
//
// The flat view-models below were DECLARED in app/api/map/data/route.ts. They
// are moved HERE (field-for-field identical) so this logic layer never imports
// UPWARD from app/**; app/api/map/data/route.ts RE-EXPORTS both names, so the 3
// existing import sites (app/map/page.tsx, components/MapTabContent.tsx, and the
// route itself) keep resolving unchanged. Mirrors PR1's RouteStop relocation.

/** Geocoded customer row the Map View plots. Flat presentation shape. */
export interface MapCustomer {
  id: string;
  name: string;
  postcode: string;
  code: string | null;
  active: boolean;
  lat: number;
  lng: number;
  is_approximate: boolean;
}

/** Geocoded visit row the Map View plots. Flat presentation shape. */
export interface MapVisit {
  id: string;
  lat: number;
  lng: number;
  visit_type: string;
  outcome: string;
  rep: string;
  customer_name: string;
  created_at: string;
  is_prospect: boolean;
  is_approximate: boolean;
}

// Visit type → colour. Moved verbatim from components/MapView.tsx.
const VISIT_COLOURS: Record<string, string> = {
  routine: "#16205B", // navy
  new_pitch: "#EB6619", // orange
  complaint_followup: "#DC2626", // red
  delivery_issue: "#D97706", // amber
};

// Rep name → shape. Moved verbatim from components/MapView.tsx.
function repShape(repName: string): "circle" | "square" {
  const lower = repName.toLowerCase();
  if (lower.includes("mehmet")) return "square";
  return "circle";
}

// Sheffield HQ as default centre — DISTINCT from buildMapScene's MFS hub coords.
const MARKER_DEFAULT_CENTRE: LatLng = { lat: 53.383331, lng: -1.46686 };

const CUSTOMER_CLUSTER: ClusterBadge = {
  shape: "circle",
  size: 36,
  background: "#16205B",
  colour: "white",
};

const VISIT_CLUSTER: ClusterBadge = {
  shape: "square",
  size: 32,
  background: "#EB6619",
  colour: "white",
};

/**
 * Build the vendor-neutral scene for the admin Map View.
 *
 * Reproduces, BYTE-IDENTICALLY, what components/MapView.tsx decided inline —
 * the layer filter, the customer teardrop active/inactive colour, the visit
 * rep-shape + visit-type colour fallback, the SPLIT approximate conditions, the
 * cluster badges, and the one-shot bounds-fit over the shown pins. Pure: depends
 * only on the MapProvider PORT types, never on leaflet / react-leaflet / JSX.
 *
 * @param customers geocoded customer rows
 * @param visits    geocoded visit rows
 * @param layer     which layers to emit ("all" | "customers" | "visits")
 */
export function buildMarkerScene(
  customers: MapCustomer[],
  visits: MapVisit[],
  layer: "all" | "customers" | "visits",
): MarkerMapScene {
  const showCustomers = layer === "all" || layer === "customers";
  const showVisits = layer === "all" || layer === "visits";

  const layers: MarkerLayer[] = [];

  if (showCustomers) {
    const pins: MarkerPin[] = customers.map((c): MarkerPin => {
      const approximate = c.is_approximate ?? false;
      const popup: MarkerPopup = {
        title: c.name,
        subtitle: `${c.postcode}${c.code ? ` · ${c.code}` : ""}`,
        statusPill: c.active
          ? { label: "Active", background: "#DCFCE7", colour: "#15803D" }
          : { label: "Inactive", background: "#F3F4F6", colour: "#6B7280" },
        approxPill: c.is_approximate
          ? { label: "⚠ Approx. location" }
          : undefined,
      };
      return {
        id: c.id,
        at: { lat: c.lat, lng: c.lng },
        shape: "teardrop",
        colour: c.active ? "#16205B" : "#6B7280",
        approximate,
        popup,
        clickable: false,
      };
    });
    layers.push({
      id: "customers",
      pins,
      cluster: CUSTOMER_CLUSTER,
      maxClusterRadius: 40,
    });
  }

  if (showVisits) {
    const pins: MarkerPin[] = visits.map((v): MarkerPin => {
      const shape: MarkerPinShape = repShape(v.rep);
      const popup: MarkerPopup = {
        title: v.customer_name,
        subtitle: `${v.visit_type.replace(/_/g, " ")} · ${v.rep}`,
        prospectTag: v.is_prospect ? { label: "Prospect" } : undefined,
        approxPill:
          v.is_prospect && v.is_approximate
            ? { label: "⚠ Approx. location" }
            : undefined,
        footnote: "Tap to see full details",
      };
      return {
        id: v.id,
        at: { lat: v.lat, lng: v.lng },
        shape,
        colour: VISIT_COLOURS[v.visit_type] ?? "#6B7280",
        approximate: v.is_approximate,
        popup,
        clickable: true,
      };
    });
    layers.push({
      id: "visits",
      pins,
      cluster: VISIT_CLUSTER,
      maxClusterRadius: 30,
    });
  }

  // fitBounds: every SHOWN pin's coords, mirroring MapView's BoundsFitter which
  // received (showCustomers ? customers : []) and (showVisits ? visits : []).
  const fitBounds: LatLng[] = [
    ...(showCustomers
      ? customers.map((c): LatLng => ({ lat: c.lat, lng: c.lng }))
      : []),
    ...(showVisits
      ? visits.map((v): LatLng => ({ lat: v.lat, lng: v.lng }))
      : []),
  ];

  const viewport: MarkerMapViewport = {
    center: MARKER_DEFAULT_CENTRE,
    zoom: 9,
    zoomControl: true,
    fitBounds,
    fitPadding: 40,
    fitMaxZoom: 13,
  };

  return { viewport, layers };
}
