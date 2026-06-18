'use client'

/**
 * lib/adapters/leaflet/MapCanvas.tsx
 *
 * The Leaflet adapter (F-24) — the ONE place in the app allowed to import
 * leaflet / react-leaflet. It implements the owned MapProvider contract
 * (MapCanvasProps): it takes a vendor-neutral MapScene and turns it into actual
 * Leaflet elements (markers, divIcons, polyline, tile layer, fit-to-bounds).
 *
 * The tile URL, the icon-fix hack + cdnjs URLs, the divIcon SVG builders, and the
 * count-change BoundsFitter all live here, behind the adapter boundary — they are
 * Leaflet's drawing choices, not the app's meaning. The recipe that BUILDS the
 * scene (buildMapScene) lives in lib/services/, vendor-free. See ADR-0002 / F-24.
 */

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import type { LatLng, MapCanvasProps, MapPin } from '@/lib/ports/MapProvider'

// Leaflet icon fix (moved verbatim from components/RouteMap.tsx)
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function numberedPin(n: number, accent: string): L.DivIcon {
  const ring = accent
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

/** Pick the right Leaflet divIcon for a scene pin. */
function iconFor(pin: MapPin): L.DivIcon {
  return pin.kind === 'stop' ? numberedPin(Number(pin.label), pin.accent) : depotPin(pin.label)
}

const toTuple = (p: LatLng): [number, number] => [p.lat, p.lng]

export function MapCanvas({ scene, style, className }: MapCanvasProps) {
  const { viewport, pins, line } = scene
  const fitPositions: [number, number][] = (viewport.fitBounds ?? []).map(toTuple)

  return (
    <MapContainer
      center={[viewport.center.lat, viewport.center.lng]}
      zoom={viewport.zoom}
      style={style}
      className={className}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <BoundsFitter positions={fitPositions} />

      {/* Route polyline */}
      {line && (
        <Polyline
          positions={line.points.map(toTuple)}
          pathOptions={{ color: line.colour, weight: line.weight, opacity: line.opacity, dashArray: line.dash }}
        />
      )}

      {/* Markers — origin, optional destination, then numbered stops */}
      {pins.map(pin => (
        <Marker key={pin.id} position={[pin.at.lat, pin.at.lng]} icon={iconFor(pin)}>
          <Popup>
            {pin.kind === 'stop' ? (
              <div style={{ minWidth: 140 }}>
                <strong style={{ fontSize: 13 }}>{pin.popup.title}</strong>
                {pin.popup.subtitle && (
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{pin.popup.subtitle}</div>
                )}
                {pin.popup.eta && (
                  <div style={{ fontSize: 11, color: '#16205B', marginTop: 4, fontWeight: 600 }}>
                    {pin.popup.eta}
                  </div>
                )}
                {pin.popup.priorityTag && (
                  <div style={{ fontSize: 11, color: pin.popup.priorityTag.colour, marginTop: 2, fontWeight: 600 }}>
                    {pin.popup.priorityTag.label}
                  </div>
                )}
              </div>
            ) : (
              <><strong>{pin.popup.title}</strong><br />{pin.popup.subtitle}</>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
