/**
 * lib/ports/MapProvider.ts
 *
 * MapProvider port (F-24) — the owned, vendor-neutral contract for a map canvas.
 *
 * Pure TypeScript: NO react, NO leaflet, NO JSX. These types describe WHAT to
 * draw (a numbered pin here, a polyline through these points, where the camera
 * sits) in the app's own words — never HOW Leaflet draws it. The Leaflet adapter
 * (lib/adapters/leaflet/MapCanvas.tsx) turns this shopping list into pixels;
 * lib/services/mapScene.ts builds the list from the route's stops.
 *
 * Vendor-specific concepts (divIcon, tile URLs, the icon-fix hack) never appear
 * here — they live behind the adapter boundary. See ADR-0002 / F-24.
 */

/** A geographic point — the app's own word for a lat/lng pair. */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** What a pin MEANS, not how it's drawn. The adapter turns kind+label+accent into pixels. */
export type MapPinKind = "stop" | "origin" | "destination";

export interface MapPin {
  /** React key (today: customerId for stops; 'origin'/'destination' for depots). */
  readonly id: string;
  readonly at: LatLng;
  readonly kind: MapPinKind;
  /** Numbered label for stop pins (today: String(position)); the depot emoji for origin/destination. */
  readonly label: string; // stop: "1","2"… ; origin: "🏭" ; destination: "🏪"
  /** Ring/fill accent colour. stop: priority colour; origin/destination: depot orange (#EB6619). */
  readonly accent: string;
  /** Popup content as owned, structured data (NO HTML/JSX in the port). */
  readonly popup: MapPopup;
}

/** Structured popup content — the adapter renders it to JSX. Mirrors today's popup markup fields. */
export interface MapPopup {
  readonly title: string; // stop: "2. Acme Ltd" ; depot: hub label
  readonly subtitle?: string; // stop: postcode (if present) ; depot: "Start" / "End"
  readonly eta?: string; // stop only: "Est. 14:05" line (estimatedArrival)
  readonly priorityTag?: {
    // stop only, when priority !== 'none'
    readonly label: string; // "🔴 Priority" / "⚠️ Urgent"
    readonly colour: string; // PRIORITY_COLOUR[priority]
  };
}

/** A connecting line — owned shape; the adapter renders the Leaflet polyline. */
export interface MapLine {
  readonly points: readonly LatLng[]; // origin → plottable stops → destination
  readonly colour: string; // "#16205B"
  readonly weight: number; // 3
  readonly opacity: number; // 0.7
  readonly dash?: string; // "6 4"
}

/** Where the camera sits and how it re-frames. */
export interface MapViewport {
  readonly center: LatLng; // initial center (today: MFS)
  readonly zoom: number; // initial zoom (today: 9)
  /** Points to fit when the SET changes (today: BoundsFitter, re-fits on count change only). */
  readonly fitBounds?: readonly LatLng[];
  readonly fitPadding?: number; // 40
  readonly fitMaxZoom?: number; // 13
}

/** The complete vendor-neutral description of the map to draw. */
export interface MapScene {
  readonly viewport: MapViewport;
  readonly pins: readonly MapPin[];
  readonly line: MapLine | null; // null when there are <1 plottable stops
}

/**
 * The owned component contract. The adapter supplies a component of this type.
 *
 * `style` is a plain string|number record (not React.CSSProperties) so the port
 * carries ZERO framework reference; the adapter passes it straight to the map
 * container's style prop.
 */
export interface MapCanvasProps {
  readonly scene: MapScene;
  /** Inline style passed to the map container (today: height/width 100%). */
  readonly style?: Record<string, string | number>;
  readonly className?: string; // today: "z-0"
}

// ─── F-24 PR2: the clustered-marker sibling scene ────────────────────────────
// Mirrors MapScene's discipline: this describes WHAT the Map View draws (two
// clustered layers of styled pins), never HOW Leaflet draws it. The
// MarkerMapCanvas adapter turns shape/colour/opacity/popup into divIcons + JSX.

/** Pin silhouette — owned vocabulary; the adapter maps each to an SVG builder. */
export type MarkerPinShape = "teardrop" | "circle" | "square";

/** Structured popup for a marker pin — adapter renders it to JSX. NO HTML here. */
export interface MarkerPopup {
  /** customer: name ; visit: customer_name. Bold navy title line. */
  readonly title: string;
  /** customer: "POSTCODE · CODE" (code optional) ; visit: "type · rep". */
  readonly subtitle: string;
  /** customer-only status pill: "Active" / "Inactive" + its colours. */
  readonly statusPill?: {
    readonly label: string; // "Active" | "Inactive"
    readonly background: string; // active "#DCFCE7" | inactive "#F3F4F6"
    readonly colour: string; // active "#15803D" | inactive "#6B7280"
  };
  /** "⚠ Approx. location" pill — present when the approximate pill should show.
      (customer: when is_approximate ; visit: when is_prospect && is_approximate). */
  readonly approxPill?: { readonly label: string }; // "⚠ Approx. location"
  /** visit-only "Prospect" inline tag next to the title. */
  readonly prospectTag?: { readonly label: string }; // "Prospect"
  /** visit-only footer line. */
  readonly footnote?: string; // "Tap to see full details"
}

/** A single marker pin as owned data. shape+colour+opacity+approximate fully
    describe the divIcon the adapter must build — NO Leaflet concept here. */
export interface MarkerPin {
  readonly id: string; // React key + the id handed to onPinClick
  readonly at: LatLng;
  readonly shape: MarkerPinShape; // customer→teardrop ; visit→circle|square
  readonly colour: string; // fill colour
  /** true → 0.55 opacity + dashed stroke (the "approximate" treatment). */
  readonly approximate: boolean;
  /** customer teardrop only: active=false dims the fill to grey. Encoded in
      `colour` already, so the adapter needs no extra flag — see §6 mapping. */
  readonly popup: MarkerPopup;
  /** true when clicking the pin should fire onPinClick (visits only today). */
  readonly clickable: boolean;
}

/** Owned description of a cluster bubble's badge — adapter turns it into a
    divIcon whose innerText is the child count. NO Leaflet here. */
export interface ClusterBadge {
  readonly shape: "circle" | "square"; // customers→circle ; visits→square
  readonly size: number; // px (customers 36 ; visits 32)
  readonly background: string; // customers "#16205B" ; visits "#EB6619"
  readonly colour: string; // "white"
}

/** One toggleable layer of pins + how its clusters are drawn. */
export interface MarkerLayer {
  readonly id: string; // "customers" | "visits"
  readonly pins: readonly MarkerPin[];
  readonly cluster: ClusterBadge;
  readonly maxClusterRadius: number; // customers 40 ; visits 30
}

/** Camera + first-load bounds-fit. Mirrors MapViewport but kept separate so the
    two scenes stay independent. */
export interface MarkerMapViewport {
  readonly center: LatLng; // today: [53.383331, -1.466860]
  readonly zoom: number; // today: 9
  readonly zoomControl: boolean; // today: true (MapView passed zoomControl)
  /** Points to fit on FIRST load only (BoundsFitter fits once). */
  readonly fitBounds: readonly LatLng[];
  readonly fitPadding: number; // 40
  readonly fitMaxZoom: number; // 13
}

/** The complete vendor-neutral description of the Map View. */
export interface MarkerMapScene {
  readonly viewport: MarkerMapViewport;
  readonly layers: readonly MarkerLayer[]; // already layer-filtered by the service
}

/** The owned component contract for the marker canvas. onPinClick is a
    render-time INTERACTION prop, deliberately NOT scene data — see design note. */
export interface MarkerMapCanvasProps {
  readonly scene: MarkerMapScene;
  /** Fired when a clickable pin is clicked. Carries the owned pin id. */
  readonly onPinClick?: (pinId: string) => void;
  readonly style?: Record<string, string | number>;
  readonly className?: string;
}
