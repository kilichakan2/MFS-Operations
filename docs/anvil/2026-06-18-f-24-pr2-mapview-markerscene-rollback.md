# F-24 PR2 — Rollback note

Branch: f-24-pr2-mapview-markerscene
PR: #53
Date: 2026-06-18

## Migration

NONE. This PR contains no Supabase migration, no schema change, no RLS/policy change,
and no edge function change. It is a render-only wrap: `components/MapView.tsx` is
re-pointed onto the MapProvider port via the new `lib/adapters/leaflet/MarkerMapCanvas.tsx`
adapter, with `buildMarkerScene` + the relocated `MapCustomer`/`MapVisit` view-model types
moved into `lib/services/mapScene.ts` (re-exported from `app/api/map/data/route.ts` so all
import sites resolve unchanged).

## Rollback

No data rollback is possible or required — nothing in the database changed.

Code rollback path: `vercel rollback` to the previous production deployment (or revert the
squash-merge commit on `main`). Because the change is byte-identical in behaviour and touches
no persistent state, a code rollback is fully sufficient and carries no data-loss risk.

## PITR

n/a — no migration → no destructive operation → no data-loss surface → PITR not required.
