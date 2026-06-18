# F-24 PR2 — Migrate `components/MapView.tsx` (admin Map View, Screen 6) onto the MapProvider port

- **Date:** 2026-06-18
- **Unit:** F-24 PR2 (sibling to PR1, which shipped as PR #52 / squash `98870d2`)
- **Type:** Hexagonal wrap — pure import-relocation behind an owned port. ZERO behaviour, ZERO visual change, NO new dependency, NO migration, NO server/DB surface.
- **Conductor phase:** Order (this is the Phase-2 plan handed to Render).

> 🗣 **In plain English:** the admin Map screen currently talks to the Leaflet
> map library directly. We're moving every Leaflet call behind the same "owned
> socket" (the MapProvider port) that PR1 built for the Route Planner map, so the
> Map screen no longer touches the vendor. Nothing the user sees or clicks
> changes — same pins, same cluster bubbles, same popups, same click-opens-modal.
> It's a re-wiring job, not a feature.

```
DOMAIN (core logic)
  ├─ MapProvider · MapScene (port, PR1, UNCHANGED) → [Leaflet] MapCanvas (adapter)
  └─ MapProvider · MarkerMapScene (port, NEW sibling) → [Leaflet] MarkerMapCanvas (adapter, NEW)
🗣 one socket, two scene shapes — route map keeps its plug, the Map screen gets a second matching plug; the vendor never leaks past it
```

---

## 1 · Goal

Gut `components/MapView.tsx` so it holds **zero** vendor imports. It must:

1. Build a vendor-neutral `MarkerMapScene` from `MapCustomer[]` / `MapVisit[]` +
   the `layer` filter, via a new pure `buildMarkerScene(...)` in
   `lib/services/mapScene.ts`.
2. Render the new `<MarkerMapCanvas scene={...} onPinClick={...} />` adapter from
   `lib/adapters/leaflet/`.
3. Thread the existing `onVisitClick(id)` prop through to the adapter's
   `onPinClick(pinId)`.
4. **Delete BOTH `// F-24 PR2` `eslint-disable-next-line no-restricted-imports`
   markers together with the `leaflet` + `react-leaflet` imports they cover.**

> 🗣 **In plain English:** today MapView reaches into Leaflet and has two "ignore
> the rule, just this once" comments holding the door open. PR2 removes the
> Leaflet code AND those two comments in the same stroke — leaving an orphaned
> "ignore the rule" comment would silently re-open the door for the next person.

**Hard guarantee:** byte-identical render and behaviour. Same two cluster layers,
same cluster badges (navy 36px circle for customers, orange 32px square for
visits), same customer teardrop, same visit circle/square-by-rep shapes, same
visit-type colours, same dashed/faded "approximate" treatment, same two popup
markups, same first-load bounds-fit, same `zoomControl`, same default centre,
same click-opens-DetailModal.

---

## 2 · Domain terms (plain-English bridge)

- **Port** (`lib/ports/MapProvider.ts`) — the socket the app owns; pure
  TypeScript, no Leaflet, no React, no JSX.
  🗣 The shape of the plug the app insists on. Leaflet has to fit it.
- **Adapter** (`lib/adapters/leaflet/`) — the only place Leaflet/react-leaflet are
  imported; turns the owned scene into pixels.
  🗣 The actual plug for the Leaflet vendor. Swap vendors = new plug here, nothing else.
- **`MapScene`** — PR1's route-shaped scene (pins + polyline + viewport). **Stays
  untouched in PR2.**
  🗣 The route map's shopping list. We do not edit it.
- **`MarkerMapScene`** — the NEW sibling scene this PR adds: viewport + layers of
  marker pins with owned styling + cluster-badge descriptors.
  🗣 The Map screen's own shopping list — a different shape because it's clustered
  marker layers, not a route line.
- **`buildMarkerScene`** — the new pure function that maps customers/visits +
  layer filter → `MarkerMapScene`.
  🗣 The recipe that turns raw rows into that shopping list, with zero Leaflet in it.
- **Owned styling data** — shape/colour/opacity/popup expressed as plain data in
  the port, NOT as Leaflet calls.
  🗣 "Draw a navy teardrop, half-faded" written as data the app owns, so the
  app — not Leaflet — decides what a pin means.

---

## 3 · Compliance / architecture flags

- **Hexagonal dependency rule (CLAUDE.md + ADR-0002 line 21):** `leaflet`,
  `react-leaflet` named adapter-only. `lib/ports/**` and `lib/services/**` must
  never import Leaflet, React, JSX, or anything under `app/**` / `components/**`.
  This plan keeps the port and service pure.
- **Render-only adapter import carve-out (BACKLOG ARCH-FU-07):** `MapView` →
  `MarkerMapCanvas` is a `components/** → lib/adapters/**` import. code-critic
  ruled this **ACCEPTABLE** in PR1 for the identical `RouteMap → MapCanvas` case:
  the `components→adapters` ban targets UI→**data** coupling, and a render-only
  React component carries **no vendor TYPE** across the port boundary. **Guard
  must not re-flag this.** ARCH-FU-07 (lint-enforce the carve-out) is **out of
  scope** here — do not solve it.
  🗣 PR1 already got a ruling: a map-drawing component is allowed to import the
  map-drawing adapter, because no Leaflet type leaks through. PR2 is the same
  shape; we cite the ruling so it isn't re-litigated.

### ADR conflicts

**None.** ADR-0002 line 21 explicitly lists `leaflet` + `react-leaflet` as
adapter-only — PR2 *moves the codebase toward* that ADR (removes the last direct
imports outside the adapter folder). No ADR amendment needed (unlike PR1, which
needed the "buildMapScene stays out of the adapter folder" amendment — that
precedent already covers `buildMarkerScene`).

---

## 4 · Files to change (exact)

### NEW files

| Path | What |
|---|---|
| `lib/adapters/leaflet/MarkerMapCanvas.tsx` | The new Leaflet adapter for the clustered marker map. ONLY new place importing `leaflet` / `react-leaflet` / `leaflet.markercluster` / `react-leaflet-cluster`. |
| `tests/unit/services/markerScene.test.ts` | Unit tests for `buildMarkerScene` (mirrors `mapScene.test.ts`). |
| `tests/e2e/06-map-view-markers.spec.ts` | New `@critical` Playwright pixel/behaviour smoke for `/map`. |

### EDITED files

| Path | Change |
|---|---|
| `lib/ports/MapProvider.ts` | ADD the sibling contract: `MarkerPinShape`, `MarkerPopup`, `MarkerPin`, `ClusterBadge`, `MarkerLayer`, `MarkerMapScene`, `MarkerMapCanvasProps`. `MapScene` + everything PR1 added stays byte-identical. |
| `lib/services/mapScene.ts` | ADD `buildMarkerScene(...)` + the relocated flat view-model types `MapCustomer` / `MapVisit` (see §7) + the colour/shape constants moved verbatim from MapView. `buildMapScene` + `RouteStop` stay byte-identical. |
| `lib/adapters/leaflet/index.ts` | ADD `export { MarkerMapCanvas } from "./MarkerMapCanvas";`. Existing `MapCanvas` export unchanged. |
| `app/api/map/data/route.ts` | Change the two `interface` declarations to **re-exports** of the relocated types (see §7). Route runtime logic byte-identical. |
| `components/MapView.tsx` | Gut to a thin shell: build scene + render `<MarkerMapCanvas>`. **Delete the 2 eslint-disable markers + all Leaflet imports.** (see §8). |
| `.eslintrc.json` | ADD `leaflet.markercluster` + `react-leaflet-cluster` to BOTH the top-level `no-restricted-imports.paths` and the `lib/services`/`lib/usecases` override's `paths` (see §6 / Risk R5). |
| `tests/unit/lint/no-supabase-sdk.test.ts` | ADD F-24-PR2 cluster-lib cases + keep the leaflet/react-leaflet pins (verbatim-mirror the shipped `.eslintrc.json`). |
| `tests/unit/lint/no-adapter-imports.test.ts` | ADD F-24-PR2 cluster-lib pins + a `MarkerMapCanvas.tsx`-allowed case. |

### DELETED lines (from `components/MapView.tsx`)

- Lines 15–17: the 3 Leaflet/markercluster CSS imports → **move verbatim to
  `MarkerMapCanvas.tsx`**.
- Lines 19–24: the 2 `// F-24 PR2` comments + their `eslint-disable-next-line`
  directives + `import L from 'leaflet'` + `import { … } from 'react-leaflet'`.
- Line 25: `import MarkerClusterGroup from 'react-leaflet-cluster'`.
- Lines 30–115: icon-fix hack, `customerIcon`, `VISIT_COLOURS`, `repShape`,
  `visitIcon`, `BoundsFitter` → **move verbatim to `MarkerMapCanvas.tsx`**
  (colour/shape constants may instead move to the service — see §5/§7).
- Lines 132–271: the whole `<MapContainer>` JSX tree (both `MarkerClusterGroup`s,
  both popups) → **move verbatim to `MarkerMapCanvas.tsx`**.

> 🗣 **In plain English:** everything Leaflet-flavoured leaves MapView and lands
> in the new adapter file, moved verbatim so pixels can't drift. MapView shrinks
> to "build the list, hand it to the adapter."

---

## 5 · The port contract to add (full TS sketch)

Append to `lib/ports/MapProvider.ts`. Pure TS — NO react / leaflet / JSX
(identical discipline to PR1). `LatLng` already exists; reuse it.

```ts
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
    readonly label: string;          // "Active" | "Inactive"
    readonly background: string;     // active "#DCFCE7" | inactive "#F3F4F6"
    readonly colour: string;         // active "#15803D" | inactive "#6B7280"
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
  readonly id: string;                 // React key + the id handed to onPinClick
  readonly at: LatLng;
  readonly shape: MarkerPinShape;      // customer→teardrop ; visit→circle|square
  readonly colour: string;             // fill colour
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
  readonly size: number;               // px (customers 36 ; visits 32)
  readonly background: string;         // customers "#16205B" ; visits "#EB6619"
  readonly colour: string;             // "white"
}

/** One toggleable layer of pins + how its clusters are drawn. */
export interface MarkerLayer {
  readonly id: string;                 // "customers" | "visits"
  readonly pins: readonly MarkerPin[];
  readonly cluster: ClusterBadge;
  readonly maxClusterRadius: number;   // customers 40 ; visits 30
}

/** The complete vendor-neutral description of the Map View. */
export interface MarkerMapScene {
  readonly viewport: MarkerMapViewport;
  readonly layers: readonly MarkerLayer[]; // already layer-filtered by the service
}

/** Camera + first-load bounds-fit. Mirrors MapViewport but kept separate so the
    two scenes stay independent. */
export interface MarkerMapViewport {
  readonly center: LatLng;             // today: [53.383331, -1.466860]
  readonly zoom: number;               // today: 9
  readonly zoomControl: boolean;       // today: true (MapView passed zoomControl)
  /** Points to fit on FIRST load only (BoundsFitter fits once). */
  readonly fitBounds: readonly LatLng[];
  readonly fitPadding: number;         // 40
  readonly fitMaxZoom: number;         // 13
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
```

**Design note — where `onPinClick` lives (decided):** it rides on
`MarkerMapCanvasProps`, **not** on the scene. Rationale: PR1 deliberately kept
`MapCanvasProps` (the render contract) separate from `MapScene` (the pure data
description); a callback is a live function reference, not serialisable scene
data, so putting it on the scene would make the "scene is a plain data shopping
list" invariant false and break value-equality reasoning in unit tests. The pin
carries a `clickable: boolean` (pure data) so the scene still *describes* which
pins are interactive; the canvas props carry the actual handler. This mirrors
PR1 exactly.

> 🗣 **In plain English:** the "what to draw" stays a plain list of data we can
> test by comparing values. The "what to do when tapped" is a live wire, so it
> hangs off the component's props, not the data list — same split PR1 used.

---

## 6 · The `buildMarkerScene` mapping spec

Signature (in `lib/services/mapScene.ts`, pure, no Leaflet/React/app imports):

```ts
export function buildMarkerScene(
  customers: MapCustomer[],
  visits: MapVisit[],
  layer: "all" | "customers" | "visits",
): MarkerMapScene
```

Constants moved **verbatim** from `MapView.tsx` into the service:

- `VISIT_COLOURS` (routine `#16205B`, new_pitch `#EB6619`,
  complaint_followup `#DC2626`, delivery_issue `#D97706`).
- `repShape(repName)` → `'square'` if name lowercased includes `"mehmet"`, else
  `'circle'`.
- Customer fill: `active ? "#16205B" : "#6B7280"`.
- Default centre `[53.383331, -1.466860]`, zoom 9, zoomControl true, fitPadding
  40, fitMaxZoom 13.

### Layer filter (matches MapView lines 129–130 exactly)

```
showCustomers = layer === "all" || layer === "customers"
showVisits    = layer === "all" || layer === "visits"
```

- Emit the `customers` `MarkerLayer` **only when** `showCustomers`.
- Emit the `visits` `MarkerLayer` **only when** `showVisits`.
- `scene.layers` contains 0, 1, or 2 layers accordingly (the adapter renders one
  `MarkerClusterGroup` per layer present).

### Customer pin mapping (per `MapCustomer c`)

| Pin field | Source / rule |
|---|---|
| `id` | `c.id` |
| `at` | `{ lat: c.lat, lng: c.lng }` |
| `shape` | `"teardrop"` (always) |
| `colour` | `c.active ? "#16205B" : "#6B7280"` |
| `approximate` | `c.is_approximate ?? false` (mirror `c.is_approximate ?? false` at MapView:172) |
| `clickable` | `false` (customers have no click handler today) |
| `popup.title` | `c.name` |
| `popup.subtitle` | `` `${c.postcode}${c.code ? ` · ${c.code}` : ""}` `` |
| `popup.statusPill` | `c.active` → `{label:"Active", background:"#DCFCE7", colour:"#15803D"}` ; else `{label:"Inactive", background:"#F3F4F6", colour:"#6B7280"}` |
| `popup.approxPill` | present **iff** `c.is_approximate` → `{label:"⚠ Approx. location"}` |
| `popup.prospectTag` / `footnote` | undefined (customer popup has neither) |

### Visit pin mapping (per `MapVisit v`)

| Pin field | Source / rule |
|---|---|
| `id` | `v.id` |
| `at` | `{ lat: v.lat, lng: v.lng }` |
| `shape` | `repShape(v.rep)` → `"circle"` or `"square"` |
| `colour` | `VISIT_COLOURS[v.visit_type] ?? "#6B7280"` |
| `approximate` | `v.is_approximate` |
| `clickable` | `true` |
| `popup.title` | `v.customer_name` |
| `popup.prospectTag` | present **iff** `v.is_prospect` → `{label:"Prospect"}` |
| `popup.subtitle` | `` `${v.visit_type.replace(/_/g, " ")} · ${v.rep}` `` |
| `popup.approxPill` | present **iff** `v.is_prospect && v.is_approximate` → `{label:"⚠ Approx. location"}` (note: customer-visit popups never show it because `is_prospect=false`) |
| `popup.footnote` | `"Tap to see full details"` (always) |
| `popup.statusPill` | undefined (visit popup has no status pill) |

> ⚠️ **Subtle parity points — must replicate exactly:**
> 1. The customer pin's "approximate" pill keys off `is_approximate` (MapView:191),
>    but the **visit** pin's approximate pill keys off `is_prospect && is_approximate`
>    (MapView:253) — NOT `is_approximate` alone. The dashed/faded **marker** (opacity
>    + stroke), however, keys off `is_approximate` alone for both (MapView:77, 172).
>    So `approximate` (the marker treatment) and `approxPill` (the popup pill) have
>    **different conditions for visits**. Encode both independently.
> 2. The visit-type label uses `.replace(/_/g, " ")` (global). Customer subtitle uses
>    a literal `" · "` separator only when `code` is truthy.
> 3. The customer teardrop active/inactive distinction is folded into `colour`
>    (navy vs grey) — the adapter's teardrop SVG just paints `pin.colour`, so the
>    adapter needs no `active` flag.

### Viewport / bounds mapping

`fitBounds` = the `[lat,lng]` of every **shown** pin, mirroring MapView's
`BoundsFitter` which received `showCustomers ? customers : []` and
`showVisits ? visits : []` (MapView:146). So:

```
fitBounds = [
  ...(showCustomers ? customers.map(c => ({lat:c.lat,lng:c.lng})) : []),
  ...(showVisits    ? visits.map(v => ({lat:v.lat,lng:v.lng}))    : []),
]
```

`center`/`zoom`/`zoomControl`/`fitPadding`/`fitMaxZoom` = the constants above.

> 🗣 **In plain English:** the recipe reads each customer/visit row and writes
> down "navy teardrop here, half-faded, with this popup" as plain data — the
> exact same decisions the old component made inline, just written as data the
> app owns instead of Leaflet calls.

---

## 7 · View-model relocation decision (resolve the upward-import problem) — DECIDED

**Problem:** `MapCustomer` / `MapVisit` are declared in
`app/api/map/data/route.ts` (an `app/**` path). `buildMarkerScene` lives in
`lib/services/` and **must not import upward** from `app/**`.

**Decision — relocate the type declarations into `lib/services/mapScene.ts`; the
route re-exports them.** This mirrors PR1 exactly (PR1 moved `RouteStop` into
`mapScene.ts` and had `components/RouteMap.tsx` re-export it).

Concretely:

1. In `lib/services/mapScene.ts`, declare `export interface MapCustomer {...}`
   and `export interface MapVisit {...}` — **field-for-field identical** to the
   current declarations in `route.ts` (id/name/postcode/code/active/lat/lng/
   is_approximate for customer; id/lat/lng/visit_type/outcome/rep/customer_name/
   created_at/is_prospect/is_approximate for visit).
2. In `app/api/map/data/route.ts`, replace the two `interface` blocks with:
   ```ts
   export type { MapCustomer, MapVisit } from "@/lib/services/mapScene";
   ```
   The route's GET handler keeps building `MapCustomer[]` / `MapVisit[]`
   byte-identically (it now imports the type from the service instead of
   declaring it). **All 3 existing import sites keep resolving unchanged**
   (`@/app/api/map/data/route` still exports both names):
   `app/map/page.tsx`, `components/MapTabContent.tsx`, and the route itself.

**Why not the alternative** (declare in `lib/domain/` and have both the route and
service import down): also valid and arguably "more correct" long-term, but it
*adds* a third home and a new file, and diverges from the PR1 precedent the spec
told us to mirror. The re-export approach is the minimum-churn, precedent-matching
move. (If a future unit wants these in `lib/domain/`, that's a clean follow-up —
not this PR.)

> 🗣 **In plain English:** the type definitions move down into the logic layer (so
> the logic never has to reach "up" into the web-route folder), and the old route
> file simply forwards the names. Everything that imported from the old spot keeps
> working — no caller edits.

---

## 8 · Verbatim-move inventory for the adapter (`MarkerMapCanvas.tsx`)

`'use client'` at top. Imports: the 3 CSS imports, `import L from 'leaflet'`,
`import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'` (drop
`useMap` if BoundsFitter is rewritten to take positions like PR1's; see below),
`import MarkerClusterGroup from 'react-leaflet-cluster'`, React hooks, and
`import type { MarkerMapCanvasProps, MarkerPin, MarkerLayer, LatLng } from '@/lib/ports/MapProvider'`.

**Moved VERBATIM from `MapView.tsx` (drawing logic — must not change a byte):**

1. The icon-fix hack (MapView:30–37) → adapter top level. (Identical to the one
   already in `MapCanvas.tsx`; keep a second copy in the new file rather than
   cross-importing — see "shared plumbing" below.)
2. The customer teardrop SVG builder (`customerIcon`, MapView:42–57) → now driven
   by `pin.colour` + `pin.approximate` instead of `(active, approximate)`. The
   SVG string is byte-identical; only the inputs are renamed.
3. The visit shape SVG builder (`visitIcon`, MapView:74–95) → now driven by
   `pin.shape` + `pin.colour` + `pin.approximate`. SVG byte-identical.
4. Both `iconCreateFunction` cluster badges (MapView:154–169 navy circle 36px;
   MapView:215–230 orange square 32px) → driven by the layer's `ClusterBadge`.
   The inline HTML string is byte-identical; only the literal colour/size/shape
   come from `layer.cluster`.
5. `BoundsFitter` (MapView:98–114) → the adapter's bounds fitter. **Decision:**
   take the PR1 approach — accept a flat `positions: [number,number][]` prop
   computed from `scene.viewport.fitBounds`, and fit once. Today's MapView
   BoundsFitter fits **once** (`fitted.current` guard) — keep that "fit once"
   semantics (NOT PR1's "re-fit on count change"; the Map View never re-fits, so
   replicate the one-shot guard, not PR1's `prevLen` behaviour).
6. The `<TileLayer>` (OSM, MapView:140–143) → byte-identical url + attribution.
7. Both `<Popup>` JSX blocks (MapView:173–203 customer; MapView:240–265 visit) →
   rendered from `MarkerPopup` data. Byte-identical markup, styles, class names
   (`mfs-popup`), `maxWidth` (200 customer / 180 visit).
8. The `<MapContainer>` wrapper with `center`, `zoom`, `style`, `zoomControl`
   (MapView:133–138) → driven by `scene.viewport`. `zoomControl={viewport.zoomControl}`.

**Click handler:** the visit `<Marker eventHandlers={{ click: () => onVisitClick(v.id) }}>`
(MapView:237) becomes `eventHandlers={ pin.clickable && onPinClick ? { click: () => onPinClick(pin.id) } : undefined }`.

**Adapter render shape:** iterate `scene.layers`; for each layer render one
`<MarkerClusterGroup chunkedLoading maxClusterRadius={layer.maxClusterRadius}
showCoverageOnHover={false} iconCreateFunction={badgeFor(layer.cluster)}>` with a
`<Marker>` per `layer.pins`, choosing the icon builder by `pin.shape`.

**Shared plumbing (do NOT over-refactor PR1's shipped `MapCanvas.tsx`):** the
icon-fix hack, the OSM `<TileLayer>`, and the bounds-fit helper are duplicated
between `MapCanvas.tsx` and `MarkerMapCanvas.tsx`. **Leave PR1's file untouched.**
Optional, low-risk: extract the icon-fix + tile constants into a tiny
`lib/adapters/leaflet/_shared.ts` consumed by BOTH — but ONLY if it can be done
without editing `MapCanvas.tsx`'s behaviour. **Recommendation: skip the shared
extraction in PR2** (duplicate ~10 lines verbatim) to keep the diff additive and
the byte-identical proof trivial; log a 🔵 BACKLOG note (`ARCH-FU-0x — de-dupe
leaflet adapter plumbing`) instead. Render decides; the planner recommends skip.

> 🗣 **In plain English:** all the Leaflet drawing code is copy-pasted into the
> new adapter file with the only change being "read the colour/shape from the
> data instead of a local variable." We deliberately do NOT touch PR1's already-
> shipped adapter — a tiny bit of duplicated boilerplate is cheaper than the risk
> of disturbing a file that's already green in production.

---

## 9 · ESLint fence — the cluster-lib gap (IMPORTANT)

**Finding:** the current fence (`.eslintrc.json` + both lint tests) restricts
`leaflet` and `react-leaflet` only. `leaflet.markercluster` and
`react-leaflet-cluster` are **NOT** fenced — which is why MapView's
`import MarkerClusterGroup from 'react-leaflet-cluster'` (line 25) has **no**
eslint-disable today. If PR2 moves those imports into the adapter but does NOT
add them to the fence, a future `components/**` file could import
`react-leaflet-cluster` directly and lint would stay green — re-opening exactly
the hole F-24 closes.

**Decision:** extend the fence to all four Leaflet packages. Add
`leaflet.markercluster` and `react-leaflet-cluster` to:

- `.eslintrc.json` top-level `no-restricted-imports.paths` (with the same
  message shape, pointing at `@/lib/adapters/leaflet`, citing `ADR-0002 / F-24`).
- `.eslintrc.json` `lib/services`/`lib/usecases` override `paths` (RESTATES the
  ban — mirror how leaflet/react-leaflet appear in both blocks).
- The `lib/adapters/leaflet/**/*.{ts,tsx}` override already turns
  `no-restricted-imports` **off**, so the adapter stays allowed automatically.

**Message strings (byte-identical in `.eslintrc.json` AND both lint tests):**
```
Use the MapProvider port via @/lib/adapters/leaflet. leaflet.markercluster may only be imported inside lib/adapters/leaflet/. See ADR-0002 / F-24.
Use the MapProvider port via @/lib/adapters/leaflet. react-leaflet-cluster may only be imported inside lib/adapters/leaflet/. See ADR-0002 / F-24.
```

> 🗣 **In plain English:** the rulebook currently only guards two of the four map
> packages — the two cluster packages slip through. PR2 plugs that gap so all
> four are adapter-only. Without this, we'd "wrap" the map but leave a side door
> unlocked.

---

## 10 · Test matrix

### Unit — `tests/unit/services/markerScene.test.ts` (mirror the 12 `mapScene.test.ts` cases)

Layer filtering:
1. `layer="all"` → `scene.layers` has both `customers` and `visits` layers.
2. `layer="customers"` → only the `customers` layer; visits absent.
3. `layer="visits"` → only the `visits` layer; customers absent.

Customer pin mapping:
4. teardrop shape; `active=true` → colour `#16205B`; `active=false` → `#6B7280`.
5. `is_approximate=true` → `pin.approximate=true` AND `popup.approxPill` present;
   `false` → both absent.
6. `popup.subtitle` = `"POSTCODE · CODE"` when code present; `"POSTCODE"` when
   `code=null`.
7. `statusPill` Active vs Inactive colours exact; `clickable=false`.

Visit pin mapping:
8. `repShape`: name containing "mehmet" (any case) → square; else circle.
9. `VISIT_COLOURS` per type; unknown type → `#6B7280` fallback.
10. **approximate split:** marker `approximate` keys off `is_approximate` alone;
    `approxPill` present ONLY when `is_prospect && is_approximate`. Assert a
    customer-visit (`is_prospect=false, is_approximate=true`) → `approximate=true`
    but `approxPill` **absent**.
11. `prospectTag` present iff `is_prospect`; `footnote="Tap to see full details"`
    always; `clickable=true`.
12. `subtitle` = `"new pitch · Omer"` (underscores globally replaced).

Cluster badge + viewport:
13. customers layer `cluster={shape:"circle",size:36,background:"#16205B",colour:"white"}`,
    `maxClusterRadius=40`; visits `{shape:"square",size:32,background:"#EB6619",…}`,
    `maxClusterRadius=30`.
14. `fitBounds` = shown pins only (e.g. `layer="customers"` → only customer
    coords); `center=[53.383331,-1.466860]`, `zoom=9`, `zoomControl=true`,
    `fitPadding=40`, `fitMaxZoom=13`.
15. empty inputs → layers present (per filter) with empty `pins`, `fitBounds=[]`.

### Unit — lint fence pins (both files, verbatim-mirror `.eslintrc.json`)

`tests/unit/lint/no-supabase-sdk.test.ts` + `tests/unit/lint/no-adapter-imports.test.ts`:
- ADD: `leaflet.markercluster` banned in `components/MapView.tsx` → 1 error.
- ADD: `react-leaflet-cluster` banned in `components/MapView.tsx` → 1 error.
- ADD: both allowed inside `lib/adapters/leaflet/MarkerMapCanvas.tsx` → 0 errors.
- ADD: `leaflet` + `react-leaflet` allowed inside
  `lib/adapters/leaflet/MarkerMapCanvas.tsx` → 0 errors (the `.tsx` glob already
  covers it; pin it so the new file is provably inside the fence).
- ADD: the two new verbatim message-substring assertions for the cluster libs.
- Keep the existing leaflet/react-leaflet cases unchanged.

### E2E — `tests/e2e/06-map-view-markers.spec.ts` (`@critical`, mirror `05-routes-planner-map.spec.ts`)

UI facts (from `app/map/page.tsx`):
- `/map` is Screen 6, admin-only (middleware injects `x-mfs-user-id`). Login as
  ANVIL-TEST admin via `_auth.loginAsAdmin`.
- The map fills the panel under a filter bar with an "All / Customers / Visits"
  layer toggle (`<button>` text). Default layer = `all`.
- `<MapView>` mounts only once `!loading` (after `/api/map/data` resolves).

Assertions (Leaflet DOM landmarks, same as PR1):
- `.leaflet-container` visible → adapter mounted.
- `.leaflet-tile` visible → OSM tiles requested through the adapter.
- `.leaflet-marker-icon` count ≥ 1 → at least one marker OR cluster badge drew
  (cluster `divIcon`s also render as `.leaflet-marker-icon`). Resilient to seed
  data volume.
- Click the "Customers" layer toggle → assert the map still shows
  `.leaflet-marker-icon` (layer filter re-renders without error). Click
  "Visits", then "All" — each settles without console error.
- **Behaviour proof (the unique value):** with the visits layer shown, click a
  visit marker and assert the `DetailModal` opens (e.g. a dialog/`role=dialog`
  or the modal's known close affordance appears). Mirror PR1's resilience: if
  seed has zero geocoded visits, assert conditionally + log, so the smoke is the
  "map renders + a present visit pin opens the modal" proof, not "seed must have
  a visit."
- Screenshot `test-results/f24-map-view-markers.png` for eyeball.

### What is N/A (state explicitly)

- **Integration (vitest):** none. No route/DB surface changes — the GET handler
  is byte-identical; only its type *import source* moves. (A type-only edit
  cannot change runtime output.)
- **pgTAP / RLS:** none. No SQL, no migration, no policy.
- **Edge / concurrency:** none. Pure client render; no shared mutable server
  state.

> 🗣 **In plain English:** the unit tests prove the data we hand Leaflet is
> exactly right. The one new browser test proves the map actually draws and that
> clicking a visit still opens the detail popup. We skip database/security tests
> because this PR touches no database and no security rule.

---

## 11 · Risk Assessment

### Concurrency / race conditions
- **No material risks.** Client-only render; no shared mutable server state, no
  new async ordering. `BoundsFitter`'s one-shot `fitted.current` guard is moved
  verbatim. **Severity: none. Must-fix: no.**

### Security
- **No material risks.** No auth, no DB, no new network call, no secret. The
  `/api/map/data` auth (admin `x-mfs-user-id`) is untouched. **Severity: none.
  Must-fix: no.**

### Data migration
- **No material risks.** No migration, no schema, no data movement. **Severity:
  none. Must-fix: no.**

### Business-logic flaws (the real risk surface — byte-identical drift)
- **R1 · Approximate-pill condition divergence.** *Medium.* The visit popup's
  approx pill condition (`is_prospect && is_approximate`) differs from the visit
  marker's faded/dashed condition (`is_approximate` alone) and from the customer
  pill (`is_approximate`). Easy to collapse them by accident. **Mitigation:**
  unit case #10 asserts the split explicitly; §6 ⚠️ note documents it.
  **Must-fix: no** (mitigated by test).
- **R2 · `repShape` / `VISIT_COLOURS` fallback drift.** *Low.* The `?? "#6B7280"`
  visit colour fallback and the case-insensitive "mehmet" match must move
  verbatim. **Mitigation:** unit cases #8, #9. **Must-fix: no.**
- **R3 · Default centre constant.** *Low.* MapView uses
  `[53.383331, -1.466860]`, which is DIFFERENT from `buildMapScene`'s MFS centre.
  Must NOT accidentally reuse PR1's MFS coords. **Mitigation:** §6 names the
  literal; unit case #14 asserts it. **Must-fix: no.**

### Launch blockers
- **R4 · Orphaned eslint-disable re-opens the fence.** *High if missed.* If the
  2 `// F-24 PR2` disable markers are left behind after the imports are removed,
  the fence is silently disarmed for that file. **Mitigation:** §1 + §4 make
  deletion of the markers a hard, called-out step; commit step 5 isolates it.
  **Must-fix: YES — but fully resolved by this plan** (it is a planned, explicit
  deletion, not an open question). Not a Gate-2 blocker.
- **R5 · Cluster libs not fenced.** *Medium.* If §9's fence extension is skipped,
  the wrap is incomplete (a side door stays unlocked). **Mitigation:** §9 makes
  the `.eslintrc.json` + lint-test edits a required deliverable. **Must-fix: YES
  — resolved by this plan** (planned edit, not an open question). Not a Gate-2
  blocker.
- **R6 · SSR / `window` at import time.** *High if mishandled.* Leaflet reads
  `window` at module load; both consumers import `MapView` via `dynamic(... {
  ssr:false })`. The adapter now carries that constraint. **Mitigation:** MapView
  stays `'use client'`; the `ssr:false` dynamic import in BOTH `app/map/page.tsx`
  AND `components/MapTabContent.tsx` is **unchanged** (the plan touches neither
  consumer). The adapter file is only reached through that dynamic import.
  **Must-fix: no** (constraint preserved by not touching the import sites).

**Headline:** No must-fix risks that block Gate 2. The two "must-fix" items (R4,
R5) are *planned, explicit deliverables of this very plan*, not unresolved
questions — they are flagged so Render/Guard treat them as non-negotiable steps,
not so the conductor holds the gate. Everything else is byte-identical-drift risk
fully covered by the unit matrix.

---

## 12 · Byte-identical audit checklist (how we PROVE no drift)

Before Ship, confirm each:

- [ ] **Customer marker:** teardrop SVG string in `MarkerMapCanvas.tsx`
      character-identical to MapView:45–49 (path d, viewBox, sizes, stroke,
      dasharray); fill = navy when active / grey when inactive; opacity 0.55 +
      dasharray `3,2` when approximate.
- [ ] **Visit marker:** circle vs square inner SVG (MapView:81–82) character-
      identical; colour by `VISIT_COLOURS`; opacity/dash when approximate.
- [ ] **Customer cluster badge:** navy `#16205B`, 36px, `border-radius:50%`,
      identical inline style + `iconSize [36,36]`.
- [ ] **Visit cluster badge:** orange `#EB6619`, 32px, `border-radius:4px`,
      identical inline style + `iconSize [32,32]`.
- [ ] **Customer popup:** `mfs-popup` class, `maxWidth=200`, title/postcode·code/
      status-pill/approx-pill markup + styles identical (MapView:173–203).
- [ ] **Visit popup:** `mfs-popup` class, `maxWidth=180`, title/prospect-tag/
      type·rep/approx-pill/footnote markup + styles identical (MapView:240–265).
- [ ] **Container:** `center=[53.383331,-1.466860]`, `zoom=9`,
      `style={width/height 100%}`, `zoomControl={true}`.
- [ ] **TileLayer:** OSM url + attribution identical.
- [ ] **BoundsFitter:** fits ONCE (one-shot guard), padding `[40,40]`,
      `maxZoom 13`, over shown pins only.
- [ ] **Click:** clicking a visit marker fires `onVisitClick(v.id)` → DetailModal
      opens; customer markers are NOT clickable.
- [ ] **Layer filter:** `all`/`customers`/`visits` show exactly the same layers
      as before.
- [ ] **Eyeball:** compare `test-results/f24-map-view-markers.png` against the
      live `/map` (Hakan's manual preview check, per the preview-led ANVIL).

---

## 13 · Ordered, atomic commit steps (TDD where possible)

1. **Port types.** Add the `MarkerMapScene` family (§5) to
   `lib/ports/MapProvider.ts`. Pure TS. `tsc` green. (No behaviour yet.)
2. **Service + unit tests (TDD).** Write `tests/unit/services/markerScene.test.ts`
   (§10) FIRST; then add `buildMarkerScene` + relocated `MapCustomer`/`MapVisit`
   + constants to `lib/services/mapScene.ts` until green. `buildMapScene` +
   `RouteStop` untouched.
3. **Route re-export.** Edit `app/api/map/data/route.ts` to re-export the two
   types from the service (§7). `tsc` green; the 3 import sites resolve unchanged.
4. **Adapter.** Add `lib/adapters/leaflet/MarkerMapCanvas.tsx` (§8, verbatim
   move) + export from the barrel. (Behaviour still in MapView until next step —
   keep the diff reviewable.)
5. **Component swap + fence-marker deletion (atomic, single commit).** Gut
   `components/MapView.tsx` to build-scene + `<MarkerMapCanvas>`; **delete the 2
   `// F-24 PR2` markers + all Leaflet/markercluster imports + CSS imports in the
   SAME commit** (R4). Thread `onVisitClick → onPinClick`. Keep `'use client'`.
6. **Fence extension.** Add `leaflet.markercluster` + `react-leaflet-cluster` to
   `.eslintrc.json` (both blocks) + the verbatim pins in both lint tests (§9).
   `npm run lint` + the two lint-test files green.
7. **E2E.** Add `tests/e2e/06-map-view-markers.spec.ts` (§10). (Runs on preview.)
8. **Local gate:** `tsc` + `npm run lint` + `npm run test:unit` all green.
   ANVIL is preview-led for the pixel/behaviour proof.

> 🗣 **In plain English:** build the empty socket first, then the recipe (proven
> by tests written first), then forward the type names, then the new adapter,
> then flip the component over and remove the old wiring + the two "ignore the
> rule" comments together, then lock the rulebook, then the browser test. Small
> steps, each independently green.

---

## 14 · Rip-out test (Gate-2 verdict)

**"If I rip out Leaflet tomorrow and replace it with another map vendor, how many
files change?"**

After PR2: **one new adapter (`lib/adapters/leaflet/MarkerMapCanvas.tsx` +
`MapCanvas.tsx`) + one barrel line.** `MapView.tsx`, `RouteMap.tsx`,
`buildMarkerScene`, `buildMapScene`, the port, and both consumers stay unchanged
because they speak only the owned scene types. **Rip-out test: PASS.**

PR2 strictly *improves* the rip-out posture: it removes the last `leaflet` /
`react-leaflet` / cluster imports living outside `lib/adapters/leaflet/`.

**No new dependency:** `leaflet`, `leaflet.markercluster`, `react-leaflet`,
`react-leaflet-cluster` are ALL already in `package.json` (verified) — imports
only relocate. No `package.json` edit, so no new justification needed.

> 🗣 **In plain English:** swapping Leaflet for another map vendor still means
> writing one new plug and changing one wiring line — nothing in the screens or
> the logic moves. PR2 makes this *more* true than before by removing the last
> stray vendor imports.
