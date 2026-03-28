'use client'

/**
 * RouteMap.tsx
 *
 * Leaflet map for the route planner preview.
 * Shows numbered pins connected by a polyline: origin → stops → destination.
 * When endPoint is 'ozmen_john_street', the polyline ends at Ozmen coords.
 */

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import { MFS_COORDS, OZMEN_COORDS } from '@/lib/hubs'

// Leaflet icon fix
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export interface RouteStop {
  position:         number
  customerId:       string
  customerName:     string
  postcode:         string | null
  lat:              number | null
  lng:              number | null
  priority:         'none' | 'urgent' | 'priority'
  estimatedArrival?: string | null
}

interface RouteMapProps {
  stops:    RouteStop[]
  endPoint?: 'mfs' | 'ozmen_john_street'
}

const PRIORITY_COLOUR: Record<string, string> = {
  priority: '#DC2626',
  urgent:   '#D97706',
  none:     '#16205B',
}

function numberedPin(n: number, priority: string): L.DivIcon {
  const ring = PRIORITY_COLOUR[priority] ?? '#16205B'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.3 21.7 0 14 0z"
            fill="${ring}" stroke="white" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="9" fill="white"/>
      <text x="14" y="18.5" text-anchor="middle"
            font-family="system-ui,sans-serif" font-size="11" font-weight="700"
            fill="${ring}">${n}</text>
    </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38] })
}

function depotPin(emoji: string): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.3 21.7 0 14 0z"
            fill="#EB6619" stroke="white" stroke-width="1.5"/>
      <text x="14" y="20" text-anchor="middle"
            font-family="system-ui,sans-serif" font-size="14" fill="white">${emoji}</text>
    </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38] })
}

function BoundsFitter({ positions }: { positions: [number, number][] }) {
  const map     = useMap()
  const prevLen = useRef(0)
  useEffect(() => {
    if (positions.length === 0) return
    if (positions.length === prevLen.current) return
    prevLen.current = positions.length
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 13 })
  }, [map, positions])
  return null
}

export default function RouteMap({ stops, endPoint = 'mfs' }: RouteMapProps) {
  const origin = MFS_COORDS
  const dest   = endPoint === 'ozmen_john_street' ? OZMEN_COORDS : MFS_COORDS
  const sameHub = endPoint === 'mfs'

  const plottable = stops.filter(s => s.lat != null && s.lng != null)

  // Polyline: origin → stops → destination
  const polylinePoints: [number, number][] = [
    [origin.lat, origin.lng],
    ...plottable.map(s => [s.lat!, s.lng!] as [number, number]),
    [dest.lat, dest.lng],
  ]

  const allPositions: [number, number][] = [
    [origin.lat, origin.lng],
    ...plottable.map(s => [s.lat!, s.lng!] as [number, number]),
    ...(sameHub ? [] : [[dest.lat, dest.lng] as [number, number]]),
  ]

  return (
    <MapContainer
      center={[origin.lat, origin.lng]}
      zoom={9}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <BoundsFitter positions={allPositions} />

      {/* Route polyline */}
      {plottable.length > 0 && (
        <Polyline
          positions={polylinePoints}
          pathOptions={{ color: '#16205B', weight: 3, opacity: 0.7, dashArray: '6 4' }}
        />
      )}

      {/* Origin — always MFS */}
      <Marker position={[origin.lat, origin.lng]} icon={depotPin('🏭')}>
        <Popup><strong>{origin.label}</strong><br />Start</Popup>
      </Marker>

      {/* Destination — Ozmen if endPoint is ozmen_john_street */}
      {!sameHub && (
        <Marker position={[dest.lat, dest.lng]} icon={depotPin('🏪')}>
          <Popup><strong>{dest.label}</strong><br />End</Popup>
        </Marker>
      )}

      {/* Stop markers */}
      {plottable.map(stop => (
        <Marker
          key={stop.customerId}
          position={[stop.lat!, stop.lng!]}
          icon={numberedPin(stop.position, stop.priority)}
        >
          <Popup>
            <div style={{ minWidth: 140 }}>
              <strong style={{ fontSize: 13 }}>{stop.position}. {stop.customerName}</strong>
              {stop.postcode && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{stop.postcode}</div>}
              {stop.estimatedArrival && (
                <div style={{ fontSize: 11, color: '#16205B', marginTop: 4, fontWeight: 600 }}>
                  Est. {stop.estimatedArrival}
                </div>
              )}
              {stop.priority !== 'none' && (
                <div style={{ fontSize: 11, color: PRIORITY_COLOUR[stop.priority], marginTop: 2, fontWeight: 600 }}>
                  {stop.priority === 'priority' ? '🔴 Priority' : '⚠️ Urgent'}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
