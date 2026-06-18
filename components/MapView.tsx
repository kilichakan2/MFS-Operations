'use client'

/**
 * MapView.tsx
 *
 * Pure client component — imported via dynamic() with ssr:false in screen6.
 * Leaflet reads window at import time, so the Leaflet-touching code now lives
 * behind the MapProvider port in lib/adapters/leaflet/MarkerMapCanvas.tsx;
 * this shell holds ZERO vendor imports.
 *
 * Layers (drawn by the adapter from the owned MarkerMapScene):
 *   Customers — navy teardrop pin, popup with name/postcode/code/status
 *   Visits    — rep shape (circle=Omer, square=Mehmet) × type colour
 *               click opens the existing DetailModal
 */

import { buildMarkerScene } from '@/lib/services/mapScene'
import type { MapCustomer, MapVisit } from '@/lib/services/mapScene'
import { MarkerMapCanvas } from '@/lib/adapters/leaflet'

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  customers:     MapCustomer[]
  visits:        MapVisit[]
  layer:         'all' | 'customers' | 'visits'
  onVisitClick:  (id: string) => void
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MapView({ customers, visits, layer, onVisitClick }: Props) {
  const scene = buildMarkerScene(customers, visits, layer)

  return (
    <MarkerMapCanvas
      scene={scene}
      onPinClick={onVisitClick}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
