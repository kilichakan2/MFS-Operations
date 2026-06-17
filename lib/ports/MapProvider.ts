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
