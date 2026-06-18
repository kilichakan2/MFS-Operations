'use client'

/**
 * RouteMap.tsx
 *
 * Route planner preview map. As of F-24 this component holds ZERO vendor
 * (leaflet / react-leaflet) imports: it builds a vendor-neutral MapScene via
 * buildMapScene (lib/services) and renders the owned <MapCanvas> adapter
 * (lib/adapters/leaflet). All Leaflet drawing now lives behind that adapter.
 *
 * The flat RouteStop view-model type moved to lib/services/mapScene.ts (so the
 * logic layer doesn't import upward from presentation); it is RE-EXPORTED here
 * so app/routes/page.tsx's `import type { RouteStop } from '@/components/RouteMap'`
 * keeps resolving unchanged.
 */

import { MapCanvas } from '@/lib/adapters/leaflet'
import { buildMapScene, type RouteStop } from '@/lib/services/mapScene'
import { MFS_COORDS, OZMEN_COORDS } from '@/lib/hubs'

export type { RouteStop } from '@/lib/services/mapScene'

interface RouteMapProps {
  stops:    RouteStop[]
  endPoint?: 'mfs' | 'ozmen_john_street'
}

export default function RouteMap({ stops, endPoint = 'mfs' }: RouteMapProps) {
  const scene = buildMapScene(stops, endPoint, { mfs: MFS_COORDS, ozmen: OZMEN_COORDS })
  return <MapCanvas scene={scene} style={{ height: '100%', width: '100%' }} className="z-0" />
}
