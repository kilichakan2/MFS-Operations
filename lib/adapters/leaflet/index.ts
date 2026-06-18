/**
 * lib/adapters/leaflet/index.ts
 *
 * Barrel for the Leaflet adapter (F-24). Exports the owned map canvas component
 * ONLY — the consumer (components/RouteMap.tsx) imports MapCanvas from here.
 *
 * buildMapScene is deliberately NOT re-exported: it is vendor-neutral portable
 * logic and lives in lib/services/mapScene.ts, not behind this web-only adapter,
 * so a future native map adapter can reuse it without importing this folder.
 */
export { MapCanvas } from "./MapCanvas";
