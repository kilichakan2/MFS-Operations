# Code-critic review — F-24 PR2 (MapView → MarkerMapScene)

**Date:** 2026-06-18
**Branch:** f-24-pr2-mapview-markerscene
**PR:** #53
**Base:** main @ c77d2ca
**Phase:** FORGE Guard
**Verdict:** **SHIP** — 0 blockers · 0 warnings · 1 arch-note (ARCH-FU-07, pre-approved) · 2 test-notes

## Summary
Byte-identical / zero visual + behavioural-change WRAP migrating `components/MapView.tsx`
(admin Map View, Screen 6) onto the `MapProvider` port via a sibling `MarkerMapScene`
contract. Mirror of PR1 (#52). Independently re-ran the suite — no regression.

## Verdict table
| Dimension | Result |
| --- | --- |
| Security | ✓ no new surface |
| Correctness | ✓ byte-identical preserved (incl. the approximate SPLIT) |
| Hexagonal | ✓ port pure · service no upward import · adapter sole vendor importer |
| Depth | ✓ buildMarkerScene DEEP · adapter DEEP · no pass-through introduced |
| Tests / tsc / lint | ✓ 1860/1860 · tsc 0 · lint 0 |

## 🔴 Blockers
None.

## 🟡 Warnings (should-fix)
None. The one near-candidate — the customer cluster-badge template-literal source
indentation differs from the visit one — lands inside an inline `style="..."` attribute
the browser whitespace-collapses; the only rendered content is `>${count}</div>`. Zero
visual impact. Not a finding.

## 🔵 Architecture notes (non-blocking)
- `components/MapView.tsx:19` — render-only import `from '@/lib/adapters/leaflet'` is a
  `components → adapters` edge. Exact carve-out code-critic APPROVED in PR1: no vendor type
  crosses the boundary (`MarkerMapCanvasProps` is pure owned data); Leaflet's
  `dynamic(ssr:false)` constraint forces the canvas to live in the adapter. Tracked as
  **ARCH-FU-07** (lint-enforce the render-only carve-out). Not re-litigated.

## 🟢 Test-quality notes
- `tests/unit/services/markerScene.test.ts` — strong. 16 behaviour tests through the public
  `buildMarkerScene`; each mirrors an old-MapView rendering decision. Test 10 (`:207`) pins
  the subtlest parity risk — the **approximate SPLIT** (marker fades on `is_approximate`;
  popup pill only on `is_prospect && is_approximate`) across all three cases. Tests 13–14 pin
  cluster descriptors + fitBounds-over-shown-pins. No internals tested. Right shape.
- `tests/e2e/06-map-view-markers.spec.ts:124` — the visit-click → DetailModal proof is
  best-effort, conditional on the seed containing ≥1 individual (non-clustered) visit pin. If
  the seed clusters all visits or has none, the spec passes without exercising click→modal.
  Guaranteed clickability proof lives in the unit layer (`clickable: true`). **Matrix-gate
  watch:** during the ANVIL E2E run, glance at the `[f24-pr2-map-smoke] ... modal=` log line —
  `modal=opened` = behaviour exercised; `modal=no-visit-pin` = only unit covered it that run.

## ✅ Passed (byte-identical + hexagonal evidence)
- **Byte-identical:** teardrop SVG path; both popup JSX blocks (fonts/colours/maxWidths 200 &
  180, prospect tag, status pill, approx pill); both cluster badges (navy 36px circle
  `[18,18]` / orange 32px square `[16,16]`); tile URL + attribution incl. trailing
  `" contributors"`; default centre `[53.383331, -1.46686]`; zoom 9; BoundsFitter padding
  `[40,40]`/maxZoom 13 one-shot. Approximate split survived (`mapScene.ts:285` customer
  `is_approximate`; `mapScene.ts:314` visit `is_prospect && is_approximate`).
- **Behaviour:** `onVisitClick → onPinClick` fires only on `clickable` pins; customers
  `clickable:false` stay non-clickable (`MarkerMapCanvas.tsx:247`). Layer filter
  all/customers/visits emits same layers. One-shot BoundsFitter via `fitted` ref preserved
  (`MarkerMapCanvas.tsx:118`).
- **Hexagonal:** port pure TS (no react/leaflet/JSX); service no `app/`/`components/` import;
  adapter is the ONLY leaflet-family importer tree-wide (grep confirmed). Rip-out PASS.
- **Fence:** all four packages (`leaflet`, `react-leaflet`, `leaflet.markercluster`,
  `react-leaflet-cluster`) restricted in `.eslintrc.json` (root + services override); adapter
  exempted via `lib/adapters/leaflet/**/*.{ts,tsx}`; pinned by both lint tests. No orphaned
  eslint-disable / `F-24 PR2` marker in `MapView.tsx` (grep clean).
- **Import sites:** `app/map/page.tsx:22` + `components/MapTabContent.tsx:16` still import
  `MapCustomer`/`MapVisit` from the route (re-export chain intact). All resolve.
- **PR1 untouched:** `MapScene`/`MapPin`/`MapLine`/`MapCanvasProps`, `buildMapScene`,
  `RouteStop` strictly add-only (zero deletions).
- **Route GET handler:** byte-identical — only the two interfaces became a re-export.
- **Dependencies:** `package.json` unchanged — no new dep.

## Suite (re-run by code-critic, not trusted from build)
- Unit: 1860/1860 (104 files), incl. 16 new markerScene + lint pins
- tsc `--noEmit`: 0 errors
- `next lint`: 0 warnings/errors

## Loop-back
None — hand to ANVIL.
