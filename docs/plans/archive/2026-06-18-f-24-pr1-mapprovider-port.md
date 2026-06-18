# F-24 PR1 — MapProvider port + Leaflet adapter (re-point the Route Planner map)

- **Date:** 2026-06-18
- **Unit:** F-24 PR1 of 2
- **Type:** Brownfield hexagonal extraction. BYTE-IDENTICAL / zero visual change. NO new dependency.
- **Spec status:** Gate 1 locked (design decisions 1–4 below are not re-opened).
- **Same proven play as:** F-14 PR2 and the F-13 re-points (explicit per-field mapping, never spread).

🗗 In plain English: Leaflet (the map library) is already in the app, but the screen pokes
the library directly. This PR slips an owned "socket" between them so the screen asks for
"pin 2, red ring, at this lat/lng" and the socket decides how Leaflet draws it. The map
looks pixel-for-pixel the same; only the wiring behind it changes.

---

## Mini-map

```
DOMAIN (lib/domain/Route.ts — RouteStop, StopCustomer · lib/hubs.ts)
  └─ MapProvider (port, NEW) → [Leaflet] (adapter, NEW — relocate existing imports)
🗗 Leaflet is already in the app but plugged straight into the screen; PR1 adds the socket so the screen stops touching the vendor.
```

---

## Goal

Insert an owned `MapProvider` port (a React-component-boundary contract) between the
Route Planner UI and Leaflet, and move EVERY `leaflet` / `react-leaflet` import out of
`components/RouteMap.tsx` into a new Leaflet adapter. After this PR, `components/RouteMap.tsx`
contains ZERO vendor imports — it constructs vendor-neutral props and renders the owned
`<MapCanvas>`. The rendered map (pins, numbers, ring colours, depot emojis, polyline,
popups, tile layer, zoom/center/fit-to-bounds) is visually unchanged.

🗗 In plain English: stop the Route Planner screen from importing the map vendor. The screen
should describe WHAT to draw in plain terms; the new adapter decides HOW Leaflet draws it.
Nothing the user sees moves a pixel.

---

## Domain terms (plain-English glossary for this unit)

- **Port** = `lib/ports/MapProvider.ts` — pure-TS prop/type contract for a map canvas.
  🗗 The socket shape: the list of plain facts the screen hands the map ("a numbered pin here,
  a polyline through these points"). No Leaflet, no JSX.
- **Adapter** = `lib/adapters/leaflet/MapCanvas.tsx` — the React component that turns those
  plain facts into actual Leaflet elements.
  🗗 The plug for one specific vendor (Leaflet). The only file allowed to know what a `divIcon`
  or a `<Polyline>` is.
- **Pure mapping function** = `lib/services/mapScene.ts` → `buildMapScene` that turns
  `RouteStop[] + endPoint + hubs` into `MapScene` (pins + line + viewport). Vendor-neutral,
  NO `leaflet`/`react`/JSX. **Gate 2 amendment (Hakan + Ousterhout):** this MUST NOT live in
  `lib/adapters/leaflet/` — it is portable logic and burying it in the web vendor's folder would
  trap it there (a future native adapter could not reuse it without importing the web adapter).
  It lives in the app's own logic layer (`lib/services/`) so any platform's adapter reads the
  same recipe.
  🗗 The one piece of real logic that is testable without a browser. It's the portable recipe —
  it belongs in the shared pantry, not inside the web kitchen's cupboard, so a phone app can take
  it off the shelf without dragging the web map library along.
- **`MapScene` / `MapPin` / `MapLine` / `MapViewport` / `LatLng`** = the owned vendor-neutral
  types in the port.
  🗗 The app's own words for "a point", "a pin", "a line", "where the camera sits" — so the rest
  of the app never speaks Leaflet.

---

## Compliance / architecture flags

- **No PII, no auth, no DB, no migration.** This unit touches only client-side rendering
  wiring. Routes RLS (F-RLS-04c) and the optimise/geocode endpoints are untouched.
  🗗 In plain English: nothing here reads the database or handles logins, so the usual
  data-safety checks don't apply — but the architecture (Lego) rules do, hard.
- **ADR-0002 is directly in play (see ADR conflicts below).** Leaflet is a NAMED vendor in
  ADR-0002's dependency rule.

---

## ADR conflicts / interactions

**ADR-0002 line 21 (Hexagonal shape — the dependency rule):** explicitly names `leaflet` and
`react-leaflet` as "permitted inside `lib/adapters/**` and nowhere else." Today
`components/RouteMap.tsx` imports both directly — a **pre-existing, ADR-named breach**. This
PR is the remediation, not a conflict. **No ADR is violated by this plan; this plan CLOSES a
standing ADR-0002 breach** for the Route Planner map (MapView remains a known breach until PR2).

🗗 In plain English: the rulebook already said "Leaflet may only live in the adapter folder."
The screen broke that rule from day one. This PR fixes it for the planner map; the admin map
(MapView) gets fixed in PR2.

**Lint-enforcement gap (decision point, resolved in this plan — Step 5):** ADR-0002 says the
rule is enforced "first by code review, then by ESLint in F-04 (Phase 0), then tightened to
cover every vendor on the list in F-27 (Phase 5)." The current `.eslintrc.json` fences
`@supabase/supabase-js`, `bcryptjs`, `@anthropic-ai/sdk`, and `resend` — but **NOT `leaflet`
or `react-leaflet`**. So after this extraction the seam would be real but UNGUARDED against a
future re-import. This plan **adds the `leaflet` + `react-leaflet` fence now** (mirroring F-11's
`resend` pattern exactly), bringing forward the relevant slice of F-27 for these two vendors.
This is consistent with ADR-0002, not a deviation from it — F-27 is the *completion* of the
fence, and fencing a vendor the moment its adapter exists is the established pattern (F-10
bcrypt, F-11 resend, F-12 anthropic each shipped their own fence).

🗗 In plain English: building the socket isn't enough — without a guard, someone could plug
Leaflet straight into a screen again next month and no test would complain. We add that guard
now, copying the exact pattern used for the email vendor.

---

## Ground-truth verification (scout facts checked against real files)

Verified against the live files on 2026-06-18. Deltas from the scout brief:

1. **CONFIRMED** — `components/RouteMap.tsx` imports `'leaflet/dist/leaflet.css'`, `L from 'leaflet'`,
   and `{ MapContainer, TileLayer, Marker, Popup, Polyline, useMap }` from `react-leaflet`
   (line 11–13). The icon-fix hack (lines 17–23) points at cdnjs leaflet 1.9.4 images.
2. **DELTA — no markercluster import in RouteMap.** RouteMap does NOT import
   `leaflet.markercluster/dist/MarkerCluster.css` or any cluster code. That import lives ONLY in
   `components/MapView.tsx` (PR2). **There is no dead markercluster CSS to remove in PR1** — the
   scout's "confirm whether needed or dead" question resolves to "absent." Do not add it.
3. **CONFIRMED** — RouteMap defines its OWN local `RouteStop` interface (lines 25–34) with fields
   `position, customerId, customerName, postcode, lat, lng, priority, estimatedArrival`. This is
   **NOT** the domain `lib/domain/Route.ts` `RouteStop` (which uses a nested `customer` object and
   more fields). It is a flat view-model.
4. **DELTA — load-bearing coupling.** `app/routes/page.tsx` line 25 does
   `import type { RouteStop } from '@/components/RouteMap'` and uses it throughout
   (`OptimiseResult.orderedStops`, `buildDebugReport`, the optimise handler at lines 760–778).
   The page builds `mapStops: RouteStop[]` at lines 858–867 in exactly this flat shape. **This
   type re-export must be preserved** or the page breaks. See Step 4 for how.
5. **CONFIRMED** — `lib/hubs.ts` exports `MFS_COORDS` / `OZMEN_COORDS` as `{lat, lng, label, postcode}`.
   Pure owned data — keep as-is, do NOT wrap.
6. **CONFIRMED** — rendering today: `depotPin(emoji)` (origin 🏭 always MFS; destination 🏪 only
   when `endPoint==='ozmen_john_street'`), `numberedPin(n, priority)` (white pin, priority-colour
   ring + number), a dashed navy polyline origin→stops→destination, popups on every marker, a
   `BoundsFitter` that re-fits ONLY when the point COUNT changes (lines 72–82), tile layer
   `openstreetmap.org`, `center=[MFS]`, `zoom=9`.
7. **CONFIRMED** — `.eslintrc.json` does NOT currently fence `leaflet`/`react-leaflet` (verified
   line-by-line). The vendor `paths` block lists only supabase/bcrypt/anthropic/resend.
8. **CONFIRMED** — only `components/MapView.tsx` and `components/RouteMap.tsx` import Leaflet
   anywhere in the tree (`grep` across `components/`, `app/`, `lib/`).

🗗 In plain English: the scout was right on the big picture. Two corrections: there is no
leftover clustering CSS to delete here, and the page leans on a type that lives inside RouteMap —
so we must keep that type exported or the page won't compile.

---

## Locked design decisions (from Gate 1 — plan TO these, do not re-open)

1. **Port shape = React component boundary.** The seam is a `<MapCanvas>` component taking
   vendor-neutral props. The port file holds pure-TS types only — NO JSX, NO react/leaflet import.
2. **Leaflet's rendering choices must NOT leak.** Numbered/priority pins are SEMANTIC in the port
   (`{kind, label, ringColour, …}`); the adapter alone turns them into `L.divIcon` HTML. The tile
   URL, icon-fix hack, CSS imports, cdnjs URLs all live behind the adapter.
3. **SSR:** `<MapCanvas>` stays client-only (`'use client'`); `app/routes/page.tsx` keeps
   `dynamic(..., { ssr:false })` with the existing loading placeholder.
4. **Byte-identical output** via explicit per-field mapping, NEVER spread.

---

## The `MapProvider` port — full type surface

New file `lib/ports/MapProvider.ts` (pure TS, no framework/vendor import). Every type and field
below is derived from what `RouteMap.tsx` renders TODAY. For each current Leaflet detail, the
table after the types says whether it became (a) a SEMANTIC port field or (b) an ADAPTER-internal
decision.

```ts
/** A geographic point — the app's own word for a lat/lng pair. */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** What a pin MEANS, not how it's drawn. The adapter turns kind+label+ring into pixels. */
export type MapPinKind = "stop" | "origin" | "destination";

export interface MapPin {
  readonly id: string;             // React key (today: customerId for stops; 'origin'/'destination' for depots)
  readonly at: LatLng;
  readonly kind: MapPinKind;
  /** Numbered label for stop pins (today: String(position)); the depot emoji for origin/destination. */
  readonly label: string;          // stop: "1","2"… ; origin: "🏭" ; destination: "🏪"
  /** Ring/fill accent colour. stop: priority colour; origin/destination: depot orange (#EB6619). */
  readonly accent: string;
  /** Popup content as owned, structured data (NO HTML/JSX in the port). */
  readonly popup: MapPopup;
}

/** Structured popup content — the adapter renders it to JSX. Mirrors today's popup markup fields. */
export interface MapPopup {
  readonly title: string;          // stop: "2. Acme Ltd" ; depot: hub label
  readonly subtitle?: string;      // stop: postcode (if present) ; depot: "Start" / "End"
  readonly eta?: string;           // stop only: "Est. 14:05" line (estimatedArrival)
  readonly priorityTag?: {         // stop only, when priority !== 'none'
    readonly label: string;        // "🔴 Priority" / "⚠️ Urgent"
    readonly colour: string;       // PRIORITY_COLOUR[priority]
  };
}

/** A connecting line — owned shape; the adapter renders the Leaflet polyline. */
export interface MapLine {
  readonly points: readonly LatLng[];   // origin → plottable stops → destination
  readonly colour: string;               // "#16205B"
  readonly weight: number;               // 3
  readonly opacity: number;              // 0.7
  readonly dash?: string;                // "6 4"
}

/** Where the camera sits and how it re-frames. */
export interface MapViewport {
  readonly center: LatLng;               // initial center (today: MFS)
  readonly zoom: number;                 // initial zoom (today: 9)
  /** Points to fit when the SET changes (today: BoundsFitter, re-fits on count change only). */
  readonly fitBounds?: readonly LatLng[];
  readonly fitPadding?: number;          // 40
  readonly fitMaxZoom?: number;          // 13
}

/** The complete vendor-neutral description of the map to draw. */
export interface MapScene {
  readonly viewport: MapViewport;
  readonly pins: readonly MapPin[];
  readonly line: MapLine | null;         // null when there are <1 plottable stops
}

/** The owned component contract. The adapter supplies a component of this type. */
export interface MapCanvasProps {
  readonly scene: MapScene;
  /** Inline style passed to the map container (today: height/width 100%). */
  readonly style?: React.CSSProperties;
  readonly className?: string;           // today: "z-0"
}
```

> Note on `React.CSSProperties`: importing the React *type* (`import type * as React` or
> `import type { CSSProperties } from 'react'`) is a TYPE-only import and does NOT make the port
> a framework runtime dependency. If the implementer prefers zero React reference in the port,
> use `Record<string, string | number>` for `style` instead. Either is acceptable; the contract
> stays vendor-neutral. The component TYPE itself (`type MapCanvasComponent = (props: MapCanvasProps) => JSX.Element`)
> lives in the ADAPTER, not the port — the port exposes only the props interface.

🗗 In plain English: the port is a plain shopping list — "pins, a line, where the camera looks."
It never says the word Leaflet. The adapter reads the list and builds the actual map.

### Mapping table — each current Leaflet detail → semantic field OR adapter decision

| Today in RouteMap.tsx | Becomes | Where |
| --- | --- | --- |
| `numberedPin(n, priority)` SVG `L.divIcon` | `MapPin{kind:'stop', label:String(n), accent:PRIORITY_COLOUR[priority]}` | **(a) port field** — adapter builds the SVG/divIcon |
| `depotPin('🏭')` origin | `MapPin{kind:'origin', label:'🏭', accent:'#EB6619'}` | **(a) port field** — adapter builds the SVG/divIcon |
| `depotPin('🏪')` destination (only if not sameHub) | `MapPin{kind:'destination', …}` present only when `endPoint==='ozmen_john_street'` | **(a) port field** (presence) — adapter draws it |
| `<Polyline positions pathOptions={color,weight,opacity,dashArray}>` | `MapLine{points, colour:'#16205B', weight:3, opacity:0.7, dash:'6 4'}` | **(a) port field** — adapter renders `<Polyline>` |
| `<TileLayer url=… attribution=…>` | (none) | **(b) adapter decision** — OSM tile URL + attribution hard-coded in adapter |
| icon-fix hack + cdnjs 1.9.4 URLs | (none) | **(b) adapter decision** |
| `'leaflet/dist/leaflet.css'` import | (none) | **(b) adapter decision** |
| `L.divIcon` html/iconSize/iconAnchor/popupAnchor | (none) | **(b) adapter decision** — exact SVG strings move verbatim into adapter |
| `<Popup>` JSX markup | `MapPopup{title, subtitle?, eta?, priorityTag?}` | **(a) port field** — adapter renders the JSX |
| `BoundsFitter` (fit on count change) | `MapViewport.fitBounds` + `fitPadding`/`fitMaxZoom` | **(a) port field** — adapter keeps the count-change useRef logic |
| `center={[MFS]}`, `zoom={9}` | `MapViewport.center`, `MapViewport.zoom` | **(a) port field** |
| `style={{height,width}}`, `className="z-0"` | `MapCanvasProps.style`, `MapCanvasProps.className` | **(a) port prop** |
| `PRIORITY_COLOUR` map | used by the mapping fn to compute `accent` | mapping function (Step 2) |
| `plottable = stops.filter(lat/lng != null)` | mapping function | Step 2 |
| `allPositions` (excludes dest when sameHub) | `MapViewport.fitBounds` | Step 2 |

🗗 In plain English: everything ABOUT meaning (which pin, what number, what colour, the line, the
popup text) goes in the list. Everything ABOUT Leaflet's drawing (SVG shapes, tile server, the
icon bug workaround) stays hidden in the adapter. That split is the whole point — get it wrong
and the socket is fake.

---

## Exact files

### New files

1. **`lib/ports/MapProvider.ts`** — the port (types above). Pure TS.
2. **`lib/ports/index.ts`** — EDIT: add `export type { LatLng, MapPin, MapPinKind, MapPopup, MapLine, MapViewport, MapScene, MapCanvasProps } from "./MapProvider";`
3. **`lib/adapters/leaflet/MapCanvas.tsx`** — the Leaflet adapter component. `'use client'`.
   The ONLY new home for `leaflet` / `react-leaflet` imports + the icon-fix hack + CSS import +
   tile layer + divIcon SVG builders (`numberedPin`/`depotPin` move here verbatim) + `BoundsFitter`
   (moves here verbatim) + popup JSX. Exports `export function MapCanvas(props: MapCanvasProps)`.
4. **`lib/services/mapScene.ts`** — PURE function (no React, no Leaflet, no adapter import):
   `buildMapScene(stops, endPoint, hubs) → MapScene`. Holds `PRIORITY_COLOUR`, the `plottable`
   filter, polyline points, fitBounds points (sameHub exclusion), and per-pin/per-popup
   construction. **This is the unit-test seam AND the cross-platform-portable logic.** It ALSO
   owns the flat input view-model type `RouteStop` (moved here from `components/RouteMap.tsx` —
   see the "input type" note below). Imports ONLY: `lib/ports/MapProvider` types + the hub data
   shape from `lib/hubs.ts`. Imports NO adapter, NO leaflet, NO react.
5. **`lib/adapters/leaflet/index.ts`** — barrel. Exports the component ONLY:
   `export { MapCanvas } from "./MapCanvas";`
   (No pre-wired singleton — `<MapCanvas>` is a component, consumed directly by RouteMap; there is
   no per-request state to wire, so no `lib/wiring/map.ts` is required. `buildMapScene` is NOT
   exported from this barrel — it lives in `lib/services/`, not the adapter.)

> **Gate 2 amendment — why `buildMapScene` lives in `lib/services/`, NOT `lib/adapters/leaflet/`
> and NOT `lib/domain/`:** Hakan raised the native-app question (APoSD/Ousterhout). The Leaflet
> *component* is web-only and never ships to native — fine. But `buildMapScene` is vendor-free
> portable logic: a future native map adapter must be able to reuse it WITHOUT importing the web
> Leaflet folder. If it sat in `lib/adapters/leaflet/`, native reuse would drag in the web vendor's
> drawer — the exact coupling we're removing. So it goes in the app's own logic layer (`lib/services/`):
> it depends on the `MapProvider` PORT (it returns `MapScene`) and on domain/hub data, never on a
> vendor — which is precisely what `lib/services/` is for. It is NOT placed in `lib/domain/`
> (presentation colours/emojis aren't domain rules) and NOT in the adapter (would trap it).
> **Hard requirements:** (1) pure, (2) free of `leaflet`/`react-leaflet`/JSX, (3) imports no adapter,
> (4) imported by a unit test, (5) reusable by a hypothetical native adapter.
>
> **Input-type note (consequence of the move):** today the flat `RouteStop` view-model type is
> declared in (and exported from) `components/RouteMap.tsx`. If `buildMapScene` moves to
> `lib/services/` and still consumed that type from `components/`, the logic layer would import
> UPWARD from presentation — a layering inversion. So MOVE the `RouteStop` view-model type
> declaration into `lib/services/mapScene.ts`, and have `components/RouteMap.tsx` **RE-EXPORT** it
> (`export type { RouteStop } from '@/lib/services/mapScene'`). This keeps `app/routes/page.tsx`'s
> `import type { RouteStop } from '@/components/RouteMap'` resolving unchanged (page still untouched),
> while the type's true home is now the vendor-neutral layer. Verify with a typecheck.

### Edited files

6. **`components/RouteMap.tsx`** — REWRITE the body to:
   - keep `'use client'` and `RouteMapProps { stops, endPoint }`;
   - the `RouteStop` view-model type is now declared in `lib/services/mapScene.ts`; RouteMap
     **RE-EXPORTS** it so the page's import keeps resolving: `export type { RouteStop } from '@/lib/services/mapScene';`
   - REMOVE all four Leaflet/CSS imports, the icon-fix hack, `PRIORITY_COLOUR`, `numberedPin`,
     `depotPin`, `BoundsFitter`, and the entire `<MapContainer>` JSX tree;
   - ADD `import { MapCanvas } from '@/lib/adapters/leaflet'`, `import { buildMapScene } from '@/lib/services/mapScene'`,
     and `import { MFS_COORDS, OZMEN_COORDS } from '@/lib/hubs'`;
   - body becomes: `const scene = buildMapScene(stops, endPoint, { mfs: MFS_COORDS, ozmen: OZMEN_COORDS }); return <MapCanvas scene={scene} style={{ height:'100%', width:'100%' }} className="z-0" />;`
   - **End state: ZERO `leaflet` / `react-leaflet` imports in this file**, and it imports
     `buildMapScene` from `lib/services/`, NOT from the adapter barrel.

   > **NOTE — components importing an adapter:** `components/**` importing `lib/adapters/**` is
   > flagged by CLAUDE.md's "Blockers" list ("app/** or components/** importing from lib/adapters/**
   > directly … must go via lib/services/ or lib/usecases/"). That rule targets DATA/vendor-SDK
   > adapters (Supabase etc.) so the UI never reaches the DB directly. A **UI-rendering adapter
   > (a React component)** is a different category: there is no service/use-case layer for "draw a
   > map" and inventing one adds a hollow pass-through (fails the deletion test). **Decision for the
   > implementer:** import `MapCanvas` from the adapter barrel in `components/RouteMap.tsx`. This is
   > the same shape every UI uses for a presentational component. **Flag this explicitly in the PR
   > description** so code-critic rules on it deliberately rather than auto-rejecting; cite that the
   > data-adapter ban exists to stop UI→DB coupling, which does not apply to a render-only component.
   > The no-adapter-imports LINT rule only fences `lib/services/**` + `lib/usecases/**`, so this
   > import does not trip lint — but the human/critic rule should be addressed in words.

7. **`.eslintrc.json`** — EDIT (Step 5): add `leaflet` and `react-leaflet` to BOTH the top-level
   `paths` block AND the `lib/services/**` + `lib/usecases/**` override `paths` block (legacy
   overrides REPLACE, they don't merge — both must carry the entry), mirroring the `resend`
   entries exactly. Add `lib/adapters/leaflet/**/*.{ts,tsx}` to the adapter-allow override `files`
   list (the block that turns `no-restricted-imports` `"off"`), so the adapter itself may import
   Leaflet.
8. **`tests/unit/lint/no-adapter-imports.test.ts`** AND **`tests/unit/lint/no-supabase-sdk.test.ts`** —
   EDIT: add cases pinning the new `leaflet` / `react-leaflet` fence (banned in `app/**` /
   `components/**` / services; allowed in `lib/adapters/leaflet/`), with the verbatim message
   constant. Mirror the F-11 `resend` cases (19–22) exactly.

### NOT touched (assert in PR)

- `components/MapView.tsx` — **PR2.** Do not edit.
- `lib/hubs.ts`, `lib/domain/Route.ts` — read only, no change.
- `app/routes/page.tsx` — **only if structurally required.** The plan keeps `RouteMap`'s local
  `RouteStop` export intact (Step 4), so the page's `import type { RouteStop } from '@/components/RouteMap'`
  keeps working and **the page does not need editing.** Confirm with a typecheck; do not touch
  the page otherwise.
- All routes/optimise/RLS code — out of scope.

🗗 In plain English: we add a port file, an adapter folder with two files plus a barrel, gut the
guts of RouteMap (keeping its outward shape), and add a guard so Leaflet can't sneak back into a
screen. The page that uses RouteMap should not need touching at all — we keep the type it relies on.

---

## Numbered implementation steps

1. **Create the port** `lib/ports/MapProvider.ts` with the full type surface above. Pure TS.
   Decide `style` typing (`React.CSSProperties` type-only OR `Record<string,string|number>`).
   Add the barrel export in `lib/ports/index.ts`.
2. **Create the pure mapping** `lib/services/mapScene.ts` (declare the flat `RouteStop` view-model
   type HERE too — moved out of RouteMap):
   `buildMapScene(stops: RouteStop[], endPoint: 'mfs'|'ozmen_john_street', hubs: {mfs,ozmen}): MapScene`.
   Imports ONLY `lib/ports/MapProvider` types + the hub shape — NO leaflet, NO react, NO adapter.
   Port the exact logic from `RouteMap.tsx` lines 84–102 + the pin/popup construction:
   - `origin = hubs.mfs`; `dest = endPoint==='ozmen_john_street' ? hubs.ozmen : hubs.mfs`; `sameHub = endPoint==='mfs'`.
   - `plottable = stops.filter(s => s.lat != null && s.lng != null)`.
   - `line.points = [origin, ...plottable, dest]` (only when `plottable.length > 0`, else `line = null`).
   - `viewport.fitBounds = [origin, ...plottable, ...(sameHub ? [] : [dest])]` (the `allPositions` rule).
   - `viewport.center = origin; zoom = 9; fitPadding = 40; fitMaxZoom = 13`.
   - origin pin (`kind:'origin', label:'🏭', accent:'#EB6619', popup:{title:origin.label, subtitle:'Start'}`).
   - destination pin ONLY when `!sameHub` (`kind:'destination', label:'🏪', popup:{title:dest.label, subtitle:'End'}`).
   - one stop pin per plottable stop (`kind:'stop', id:customerId, label:String(position), accent:PRIORITY_COLOUR[priority]`,
     popup `{title:`${position}. ${customerName}`, subtitle: postcode ?? undefined, eta: estimatedArrival ? `Est. ${estimatedArrival}` : undefined, priorityTag: priority!=='none' ? {label: priority==='priority'?'🔴 Priority':'⚠️ Urgent', colour: PRIORITY_COLOUR[priority]} : undefined}`).
   - **EXPLICIT per-field construction, NEVER spread** (F-14 PR2 rule).
3. **Create the adapter component** `lib/adapters/leaflet/MapCanvas.tsx` (`'use client'`):
   - Move VERBATIM from RouteMap: the four imports (`leaflet/dist/leaflet.css`, `L from 'leaflet'`,
     react-leaflet named imports, `useEffect/useRef`), the icon-fix hack, `numberedPin`/`depotPin`
     SVG builders, `BoundsFitter`, the `<TileLayer>` URL+attribution.
   - `MapCanvas({scene, style, className})` renders `<MapContainer center={[scene.viewport.center.lat, .lng]} zoom={scene.viewport.zoom} style={style} className={className}>`,
     the `<TileLayer>`, `<BoundsFitter positions={scene.viewport.fitBounds.map(p=>[p.lat,p.lng])} />`
     (preserve the count-change re-fit), the `<Polyline>` from `scene.line` (when non-null),
     and `scene.pins.map(...)` → `<Marker icon={kind==='stop' ? numberedPin(Number(label), …) : depotPin(label)}>` with `<Popup>` rendered from `MapPopup`.
   - **The adapter is the ONLY place `leaflet`/`react-leaflet` appears.** No domain/wire types leak.
4. **Gut `components/RouteMap.tsx`** per "Edited files #6". KEEP the exported local `RouteStop`
   interface and `RouteMapProps`. Replace the body with `buildMapScene` + `<MapCanvas>`. Verify
   ZERO Leaflet imports remain (`grep -n leaflet components/RouteMap.tsx` → empty).
5. **Add the lint fence** in `.eslintrc.json` for `leaflet` + `react-leaflet` (both blocks),
   add `lib/adapters/leaflet/**/*.{ts,tsx}` to the allow-override `files`. Add pinning cases to
   the two lint unit tests with a verbatim message constant, e.g.:
   `"Use the MapProvider port via @/lib/adapters/leaflet. leaflet may only be imported inside lib/adapters/leaflet/. See ADR-0002 / F-24."` (and the react-leaflet twin). **Keep the message
   byte-identical across `.eslintrc.json` and both test files** (the existing pins assert verbatim).
6. **Create the adapter barrel** `lib/adapters/leaflet/index.ts`.
7. **Verify**: `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`. Confirm the page compiles
   untouched. Manually (or in E2E) confirm the planner map is visually identical.

🗗 In plain English: build the list-format (port), build the translator that fills the list
(buildMapScene), build the Leaflet plug (MapCanvas), empty out RouteMap so it just uses them, then
add the guard and its tests. Last, run the checks and eyeball the map.

---

## TDD test ladder (for ANVIL)

Be honest about what is unit-testable: **a Leaflet-rendering React component is mostly E2E/visual,
not unit.** The unit-testable seam is the PURE mapping `buildMapScene`. The ladder:

- **Unit (real coverage) — `tests/unit/.../buildMapScene.test.ts` (NEW):**
  - empty stops → `pins` = just origin (+ destination iff Ozmen), `line = null`, `fitBounds` excludes dest when `sameHub`.
  - stops with null lat/lng are EXCLUDED from `pins`/`line`/`fitBounds` (the `plottable` filter).
  - a stop pin carries `label=String(position)`, `accent=PRIORITY_COLOUR[priority]`, popup title `"2. Name"`, subtitle=postcode, eta only when `estimatedArrival` set, priorityTag only when `priority!=='none'` with the right emoji/colour.
  - `endPoint==='mfs'` → NO destination pin, `dest===origin`, `fitBounds` has no dest entry.
  - `endPoint==='ozmen_john_street'` → destination pin present at Ozmen coords, line ends at Ozmen, fitBounds includes dest.
  - line styling fields exact: colour `#16205B`, weight 3, opacity 0.7, dash `6 4`.
  - viewport center=MFS, zoom 9, fitPadding 40, fitMaxZoom 13.
- **Unit (contract/lint) — extend `tests/unit/lint/no-adapter-imports.test.ts` + `no-supabase-sdk.test.ts`:**
  - `leaflet` / `react-leaflet` BANNED in `components/RouteMap.tsx`-style paths, services, app routes; ALLOWED in `lib/adapters/leaflet/`. Verbatim message asserted.
  - the EXISTING no-adapter-imports cases must STILL pass (regression guard).
- **Unit (guard) — a focused test (or grep-style assertion) that `components/RouteMap.tsx` imports
  no `leaflet`/`react-leaflet`.** (The lint fence already enforces this once shipped; a direct
  assertion documents intent.)
- **Integration:** none required — no server/DB surface changes.
- **E2E / visual (the real proof of byte-identical):** the existing `/routes` planner smoke. Add
  stops, confirm pins render with numbers + ring colours, the polyline draws, depot pins show,
  popups open, and the map fits bounds — visually unchanged vs. pre-PR. This is where "byte-identical"
  is actually proven; the unit tests prove the DATA is identical, E2E proves the PIXELS are.

🗗 In plain English: we can unit-test the "shopping list builder" hard (that's where bugs would
hide) and lint-test that Leaflet stays in its box. We CAN'T meaningfully unit-test the map drawing
itself — that needs a browser, so the visual check is the eyeball/E2E pass.

---

## Acceptance criteria

1. `components/RouteMap.tsx` contains ZERO `leaflet` / `react-leaflet` / `leaflet/dist` imports.
2. `leaflet` and `react-leaflet` are imported in EXACTLY one new place: `lib/adapters/leaflet/MapCanvas.tsx`
   (plus pre-existing `components/MapView.tsx`, untouched — PR2).
3. `.eslintrc.json` fences both vendors; the two lint unit tests pin it with verbatim messages and pass.
4. `buildMapScene` is a pure function (no leaflet/react import) with the unit tests above passing.
5. `app/routes/page.tsx` is UNCHANGED and still compiles (its `RouteStop` import resolves).
6. `npm run lint`, `npx tsc --noEmit`, full unit suite GREEN.
7. The Route Planner map is VISUALLY IDENTICAL: numbered pins, priority ring colours, 🏭/🏪 depot
   pins (🏪 only for Ozmen), dashed navy polyline, popups, OSM tiles, zoom 9 / MFS center, fit-on-count-change.
8. NO new `package.json` entry; NO migration; `components/MapView.tsx` untouched.

---

## Atomic commit sequence

1. `feat(routes): add MapProvider port (vendor-neutral map canvas contract)` — `lib/ports/MapProvider.ts` + `lib/ports/index.ts`.
2. `feat(routes): add buildMapScene — vendor-neutral RouteStop→MapScene mapping` — `lib/services/mapScene.ts` (incl. the `RouteStop` view-model type).
3. `test(routes): unit-test buildMapScene mapping` — `tests/unit/.../mapScene.test.ts`.
4. `feat(routes): add Leaflet adapter — MapCanvas + barrel` — `lib/adapters/leaflet/**` (MapCanvas + index only).
5. `refactor(routes): re-point RouteMap through MapCanvas — drop direct Leaflet imports` — `components/RouteMap.tsx` (re-exports RouteStop from lib/services).
6. `chore(lint): fence leaflet/react-leaflet to lib/adapters/leaflet (F-24)` — `.eslintrc.json` + both lint pin tests.

🗗 In plain English: build the socket, build the plug, prove the plug's logic, swap the screen onto
the socket, then lock the door so Leaflet can't escape its box again. Each commit stands on its own.

---

## Hexagonal check (populates Gate 2)

- **Port used/added:** ADDS `MapProvider` (`lib/ports/MapProvider.ts`) — a React-component-boundary
  port (`MapCanvasProps` + `MapScene`/`MapPin`/`MapLine`/`MapViewport`/`LatLng`).
  🗗 New socket: "draw this map" described in the app's own words.
- **Adapter implementing it:** `lib/adapters/leaflet/MapCanvas.tsx` (+ barrel). Leaflet/react-leaflet
  imported ONLY here. The pure mapping `buildMapScene` lives in `lib/services/mapScene.ts` (vendor-neutral,
  reusable by a future native adapter) — deliberately NOT in the adapter folder.
  🗗 The Leaflet plug — the one place that knows what a divIcon and a tile server are. The portable
  recipe sits in the shared logic layer, not inside this plug.
- **New dependencies:** **NONE.** `leaflet`, `react-leaflet` (and `@types/leaflet`) are ALREADY in
  `package.json`. Their imports are RELOCATED, not added. No `package.json` change.
  🗗 We're not buying anything new — just moving an existing tool into its proper drawer.
- **Single-use vendor wrapped?** YES — Leaflet now sits behind the owned `lib/adapters/leaflet/`
  wrapper (it was previously imported directly in components, the breach this PR closes).
- **Rip-out test:** **PASS.** "Replace Leaflet with another map vendor (e.g. MapLibre) tomorrow" =
  write one new adapter (`lib/adapters/maplibre/MapCanvas.tsx` satisfying `MapCanvasProps`) + change
  one import line in `components/RouteMap.tsx` (or, better, one wiring line if a `lib/wiring/map.ts`
  is later added). `buildMapScene`, the port, and the domain are untouched. **One adapter + one line.**
  🗗 Swap the map vendor = change one plug and one wire. That's the test passing.

---

## Risk Assessment

> Scope is a render-only re-point: no DB, no auth, no migration, no concurrency surface. Depth scaled
> accordingly; the real risk is silent VISUAL drift, not data corruption.

- **Concurrency / race conditions — LOW, not must-fix.** No shared state, no async, no server.
  The only stateful bit is `BoundsFitter`'s `useRef` count-change guard, moved VERBATIM. *Mitigation:*
  move it unchanged; unit-test that `fitBounds` content matches today; E2E confirms it re-fits on
  add/remove, not on reorder.
  🗗 No two things race here; the one timing trick is copied byte-for-byte.

- **Security — NONE in these categories, not must-fix.** No PII, no auth, no DB, no new network call
  (the OSM tile URL and cdnjs icon URLs are unchanged, moved verbatim). No secrets.
  🗗 Nothing sensitive is touched; the same public map tiles load the same way.

- **Data migration — NONE, not must-fix.** No schema, no migration, no data shape change. The page's
  `RouteStop` view-model is preserved exactly.
  🗗 No database work at all.

- **Business-logic flaws — MEDIUM, not must-fix (the one to watch).** The whole value is BYTE-IDENTICAL
  output. The mapping must reproduce EVERY rendering decision: priority ring colours, the `sameHub`
  suppression of the destination pin, the `plottable` null-coord filter, popup field presence (eta /
  priorityTag conditionals), polyline styling, and the `allPositions`-vs-`polylinePoints` distinction
  (fitBounds excludes dest when sameHub; the polyline always includes dest). *Mitigation:* explicit
  per-field mapping (never spread), the targeted `buildMapScene` unit tests above, and a side-by-side
  visual E2E check. *Specific trap:* the destination pin is suppressed when `endPoint==='mfs'` but the
  polyline STILL routes origin→stops→MFS — keep these two rules distinct.
  🗗 The danger isn't a crash, it's the map quietly looking 1% different. We pin every drawing decision
  in a test and eyeball the result.

- **Launch blockers — LOW, not must-fix.** (1) The page's `RouteStop` import must keep resolving —
  *mitigation:* keep the export, typecheck. (2) `components/**` importing a UI adapter brushes the
  CLAUDE.md "components must not import adapters" blocker — *mitigation:* call it out in the PR as a
  render-only adapter (not a data adapter); the lint rule does not fence it; code-critic rules
  deliberately. (3) SSR: `<MapCanvas>` must stay `'use client'` and the page's `dynamic({ssr:false})`
  must stay — *mitigation:* keep both; Leaflet touching `window` server-side would crash the build
  otherwise.
  🗗 Nothing here stops a launch, but three small things must be kept exactly: the shared type, the
  "render-only adapter" note for the reviewer, and the client-only/SSR-off boundary.

**Risk headline:** No must-fix risks. Highest-attention item is BYTE-IDENTICAL visual fidelity
(MEDIUM, business-logic) — fully covered by explicit per-field mapping + `buildMapScene` unit tests
+ visual E2E. **No Gate 2 blockers from risk.**

---

## Out of scope (explicit)

- `components/MapView.tsx` (admin Screen 6 map) — **F-24 PR2**, a separate later FORGE pass. DO NOT touch.
- `leaflet.markercluster` / `react-leaflet-cluster` clustering — used only by MapView (PR2). Not imported by RouteMap; do not add.
- Routes RLS (F-RLS-04c) — untouched.
- `/api/routes/optimise` and compute-road-times endpoints (BACKLOG ARCH-FU-06) — untouched.
- `lib/hubs.ts`, `lib/domain/Route.ts` — read-only; no change.
- `app/routes/page.tsx` — not edited unless a typecheck proves it structurally required.

🗗 In plain English: this PR is ONLY the Route Planner map. The admin map, clustering, security
rules, and the route-maths endpoints all stay exactly as they are for a later pass.
