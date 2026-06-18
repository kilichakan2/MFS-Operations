# Code-critic review — F-24 PR1 (MapProvider port + Leaflet adapter)

- **Date:** 2026-06-18
- **PR:** #52 — `feat(routes): MapProvider port + Leaflet adapter — re-point Route Planner map (F-24 PR1)`
- **Branch:** feat/f-24-pr1-mapprovider-port
- **Reviewer:** code-critic subagent (FORGE Guard phase — sole review authority)
- **Verdict:** **NO CODE BLOCKERS — clear to ANVIL.** Render-only-adapter import ruled ACCEPTABLE (reasoned, not waved).

---

## Test / lint / typecheck results

The code-critic's own sandbox was permission-denied from running the suite, so it (correctly) refused to
fabricate a green result and flagged the gate as "unrun, not unpassed." **The conductor had already run the
full suite on the exact ship-state branch (with the MapView fence exception applied) and captured real results:**

| Check | Result |
|---|---|
| `npm run lint` | ✅ GREEN — "No ESLint warnings or errors" (leaflet/react-leaflet flagged nowhere except the 2 fenced MapView lines carrying `eslint-disable`) |
| `npx tsc --noEmit` | ✅ exit 0, clean (incl. `app/routes/page.tsx` resolving `RouteStop` via the re-export, untouched) |
| `npm test` (vitest run) | ✅ **1830 passed / 103 files** — incl. 12 new `buildMapScene` cases + the new F-24 lint pins |

The required-test gate is therefore satisfied with real output; the critic's environment block does not apply.

---

## Decision ruled on: `components/RouteMap.tsx` importing `MapCanvas` from `lib/adapters/leaflet`

**Ruling: ACCEPTABLE, not a blocker.** CLAUDE.md's "components must not import adapters" blocker exists to stop
UI→DB / UI→vendor-SDK coupling (UI reaching past the service layer to where data lives). `MapCanvas` is a
different category on three grounds:
1. **No data and no vendor type cross the boundary** — sole input is `MapCanvasProps`, all owned pure-TS port
   types (`MapScene`/`MapPin`/`MapLine`/`MapViewport`/`LatLng`); no Leaflet type leaks back to the component.
2. **There is no service layer for "render pixels"** — a `MapService` returning `<MapCanvas/>` would be a hollow
   pass-through that fails the deletion test; forcing literal compliance would manufacture the exact defect the
   depth rubric blocks.
3. **The actual business logic WAS extracted** — `buildMapScene` (the portable, testable part) sits in
   `lib/services/mapScene.ts`, vendor-free. RouteMap calls the service for logic, the adapter only for the render
   surface — the rule's intent honoured.

Rip-out test still passes: new vendor = one new `lib/adapters/<vendor>/MapCanvas.tsx` + one import line in
RouteMap + reuse `buildMapScene` unchanged. The plan's Gate-2 amendment surfaced this in the open.

**🟡 Caveat (should-fix, non-blocking):** the lint fence forbids the leaflet/react-leaflet *packages*, but does
NOT forbid `components/**` importing `@/lib/adapters/**` (the F-TD-11 adapter-path ban is scoped to
services/usecases only). This render-only exception is enforced by human judgement + the plan, not a rule — a
future component could import a *data* adapter directly and lint would stay green. Pre-existing gap, not
introduced here.

---

## Byte-identical fidelity audit (the core risk) — line-by-line vs `origin/main:components/RouteMap.tsx`

Every rendering decision preserved:
- **Priority ring colours** — `PRIORITY_COLOUR` verbatim; stop accent `PRIORITY_COLOUR[priority] ?? '#16205B'`. `mapScene.ts:55-59,168` ✅
- **`sameHub` destination-pin suppression** — dest pin pushed only `if (!sameHub)`; 🏪/"End" preserved. `mapScene.ts:139-149` ✅
- **`plottable` null-coord filter** — `s.lat != null && s.lng != null` (catches null+undefined). `mapScene.ts:84` ✅
- **THE DISTINCT-RULES TRAP — handled.** Polyline ALWAYS ends with dest (`mapScene.ts:96-99`); fitBounds EXCLUDES dest when sameHub (`...(sameHub ? [] : [{dest}])`, `mapScene.ts:113`). Two genuinely separate rules — reproduces old `polylinePoints` vs `allPositions`. Pinned by `mapScene.test.ts:73-94`. ✅ (highest-risk item, correct)
- **Popup conditionals** — `eta` only when `estimatedArrival` truthy; `priorityTag` only when `priority !== 'none'`; correct emoji/colour. `mapScene.ts:155-172` ✅
  - **Correctness WIN:** old `{stop.postcode && ...}` (hides null AND "") → new `stop.postcode || undefined` (same). Author flagged it (`mapScene.ts:157-158`); pinned by `mapScene.test.ts:139-152`. ✅
- **Polyline styling** — #16205B / weight 3 / opacity 0.7 / dash '6 4' (`mapScene.ts:100-103`); adapter maps `dash→dashArray` (`MapCanvas.tsx:106`). ✅
- **Tile layer / attribution** — identical (`MapCanvas.tsx:90-93`). ✅
- **center=MFS, zoom=9** — `mapScene.ts:117-118`. ✅
- **BoundsFitter count-change-only re-fit** — `useRef` + count-equality guard verbatim; padding [40,40] / maxZoom 13. `MapCanvas.tsx:58-69` ✅
- **Icon-fix hack + cdnjs URLs** — verbatim into adapter. `MapCanvas.tsx:23-28` ✅
- **`numberedPin`/`depotPin` SVG** — byte-identical SVG; `numberedPin` now takes `accent` (lookup moved to service), output identical. `MapCanvas.tsx:30-55` ✅
- **Marker ordering / keys / container style+className** — preserved. ✅
- **No object spread** — every field explicit; only array spreads of coord lists. ✅

**Residual risk (cannot close statically):** true pixel-identity needs the `/routes` visual/E2E smoke. The DATA
to Leaflet is provably identical (12 unit tests); the render is a verbatim adapter move → ANVIL runs the `/routes`
planner visual smoke as the pixel proof.

---

## Hexagonal correctness — ✅ clean

- `lib/ports/MapProvider.ts` — pure TS, no react/leaflet/JSX; `style` typed `Record<string,string|number>` to avoid a React reference (`MapProvider.ts:73-77`).
- `lib/services/mapScene.ts` — imports only `@/lib/ports/MapProvider` (type-only); no adapter/leaflet/react.
- Leaflet/react-leaflet imported ONLY in `lib/adapters/leaflet/MapCanvas.tsx` + fenced `components/MapView.tsx` (repo-wide grep confirms no other importers).
- No vendor type crosses the port; CSS side-effect import moved into the adapter; RouteMap now Leaflet-CSS-free.
- **Rip-out test passes.**

## Lint fence — ✅ byte-identical across all three locations

Message verbatim in `.eslintrc.json` (top-level `paths` + services/usecases override) and both lint test files:
`"Use the MapProvider port via @/lib/adapters/leaflet. leaflet may only be imported inside lib/adapters/leaflet/. See ADR-0002 / F-24."` (+ react-leaflet variant). `no-adapter-imports.test.ts` loads the REAL config from
disk (drift-catcher); `no-supabase-sdk.test.ts` hermetic mirror. Allow-list `lib/adapters/leaflet/**/*.{ts,tsx}`
(`.tsx` glob correct for MapCanvas). Top-level rule fences app/components; override restates paths (legacy
overrides replace, not merge).

## Page-untouched — ✅
`app/routes/page.tsx:25` `import type { RouteStop } from '@/components/RouteMap'` resolves via
`RouteMap.tsx:20 export type { RouteStop } from '@/lib/services/mapScene'`. Page not in diff.

## Test quality — 🟢 strong
12 `buildMapScene` tests are spec-shaped (pin the conditionals, not smoke), assert through the public interface
on owned output shapes, test meaning not implementation. Vendor-import regression guard real (`no-adapter-imports`
case 23 + 28/29 reject a leaflet import in `components/RouteMap.tsx` via the shipped config).

## Depth verdicts (new/touched only)
- `lib/services/mapScene.ts` (`buildMapScene`) → **DEEP** — small interface (stops, endPoint, hubs), hides all filter/sameHub/polyline-vs-fitBounds/popup logic; deletion test: pull it out, logic smears back into component + every future adapter.
- `lib/ports/MapProvider.ts` → **REAL SEAM** — one adapter today but genuinely substitutable; it's what makes the scene logic browser-free testable. Not speculative.
- `lib/adapters/leaflet/MapCanvas.tsx` → **DEEP** — hides Leaflet entirely behind `MapCanvasProps`; translates owned shapes → vendor calls (an adapter's job, not a pass-through).
- `components/RouteMap.tsx` → thin composition root (buildMapScene + `<MapCanvas>`), correctly thin, not a pass-through.

No PASS-THROUGH, no SPECULATIVE SEAM introduced.

## 🔵 Follow-up notes (not blocking)
1. `components/** → lib/adapters/**` is not lint-enforced (F-TD-11 ban scoped to services/usecases). Possible follow-up: a narrow rule banning `components/**` from importing `@/lib/adapters/**` except a render-only allow-list. → candidate BACKLOG item.
2. `components/MapView.tsx` remains a live ADR-0002 breach with a documented 2-line `eslint-disable` (comment-only, byte-identical runtime). **Track that F-24 PR2 removes the exception** — orphaned `eslint-disable` lines would silently re-open the hole.

## 🟢 Good
- Genuinely portable extraction (`buildMapScene` in services, not the adapter) — Gate-2 reasoning sound, code honours it.
- `|| undefined` postcode handling + comment shows the author hunted byte-identical traps.
- Drift-catcher lint pins that load the real config from disk.

---

## Loop-back / advance decision
**NO CODE BLOCKERS.** Suite verified green by the conductor (lint clean, tsc 0, 1830 pass). **Clear to ANVIL**,
with the `/routes` planner visual smoke as the byte-identical pixel proof. The two 🔵 notes tracked to F-24 PR2 /
BACKLOG.
