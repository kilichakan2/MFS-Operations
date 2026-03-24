'use client'

/**
 * MapView.tsx
 *
 * Pure client component — imported via dynamic() with ssr:false in screen6.
 * Leaflet reads window at import time so it must NEVER touch SSR.
 *
 * Layers:
 *   Customers — navy teardrop pin, popup with name/postcode/code/status
 *   Visits    — rep shape (circle=Omer/circle, square=Mehmet) × type colour
 *               click opens the existing DetailModal
 */

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useEffect, useRef } from 'react'

import type { MapCustomer, MapVisit } from '@/app/api/map/data/route'

// ── Leaflet default icon fix (broken in Webpack/Next.js) ──────────────────────
// Must run before any marker is created.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// ── SVG DivIcon helpers ───────────────────────────────────────────────────────

// Customer: navy teardrop
function customerIcon(active: boolean): L.DivIcon {
  const fill = active ? '#16205B' : '#6B7280'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">
    <path d="M11 0C4.9 0 0 4.9 0 11c0 8.3 11 19 11 19S22 19.3 22 11C22 4.9 17.1 0 11 0z"
          fill="${fill}" stroke="white" stroke-width="1.5"/>
    <circle cx="11" cy="11" r="4.5" fill="white"/>
  </svg>`
  return L.divIcon({
    html:      svg,
    className: '',
    iconSize:    [22, 30],
    iconAnchor:  [11, 30],
    popupAnchor: [0, -32],
  })
}

// Visit type → colour
const VISIT_COLOURS: Record<string, string> = {
  routine:            '#16205B', // navy
  new_pitch:          '#EB6619', // orange
  complaint_followup: '#DC2626', // red
  delivery_issue:     '#D97706', // amber
}

// Rep name → shape  (add more reps here as needed)
function repShape(repName: string): 'circle' | 'square' {
  const lower = repName.toLowerCase()
  if (lower.includes('mehmet')) return 'square'
  return 'circle'
}

function visitIcon(visit: MapVisit): L.DivIcon {
  const colour = VISIT_COLOURS[visit.visit_type] ?? '#6B7280'
  const shape  = repShape(visit.rep)

  const inner = shape === 'circle'
    ? `<circle cx="12" cy="12" r="8" fill="${colour}" stroke="white" stroke-width="2"/>`
    : `<rect x="4" y="4" width="16" height="16" rx="2" fill="${colour}" stroke="white" stroke-width="2"/>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    ${inner}
  </svg>`

  return L.divIcon({
    html:      svg,
    className: '',
    iconSize:    [24, 24],
    iconAnchor:  [12, 12],
    popupAnchor: [0, -16],
  })
}

// ── Map bounds fitter ─────────────────────────────────────────────────────────
function BoundsFitter({ customers, visits }: { customers: MapCustomer[]; visits: MapVisit[] }) {
  const map   = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    const points: [number, number][] = [
      ...customers.map(c => [c.lat, c.lng] as [number, number]),
      ...visits.map(v    => [v.lat, v.lng] as [number, number]),
    ]
    if (points.length === 0) return
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 })
    fitted.current = true
  }, [map, customers, visits])

  return null
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  customers:     MapCustomer[]
  visits:        MapVisit[]
  layer:         'all' | 'customers' | 'visits'
  onVisitClick:  (id: string) => void
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MapView({ customers, visits, layer, onVisitClick }: Props) {
  // Sheffield HQ as default centre
  const DEFAULT_CENTRE: [number, number] = [53.383331, -1.466860]

  const showCustomers = layer === 'all' || layer === 'customers'
  const showVisits    = layer === 'all' || layer === 'visits'

  return (
    <MapContainer
      center={DEFAULT_CENTRE}
      zoom={9}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
    >
      {/* Tile layer — OpenStreetMap, no API key required */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Auto-fit bounds on first load */}
      <BoundsFitter customers={showCustomers ? customers : []} visits={showVisits ? visits : []} />

      {/* Customer layer */}
      {showCustomers && (
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={40}
          showCoverageOnHover={false}
          iconCreateFunction={(cluster) => {
            const count = cluster.getChildCount()
            return L.divIcon({
              html: `<div style="
                background:#16205B;color:white;
                width:36px;height:36px;border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                font-size:12px;font-weight:700;
                border:2px solid white;
                box-shadow:0 2px 6px rgba(0,0,0,0.3);
              ">${count}</div>`,
              className: '',
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            })
          }}
        >
          {customers.map(c => (
            <Marker key={c.id} position={[c.lat, c.lng]} icon={customerIcon(c.active)}>
              <Popup className="mfs-popup" maxWidth={200}>
                <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px 0' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#16205B', margin: '0 0 4px' }}>
                    {c.name}
                  </p>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 2px' }}>
                    {c.postcode}{c.code ? ` · ${c.code}` : ''}
                  </p>
                  <span style={{
                    display: 'inline-block',
                    fontSize: 10, fontWeight: 600,
                    padding: '1px 6px', borderRadius: 999,
                    background: c.active ? '#DCFCE7' : '#F3F4F6',
                    color:      c.active ? '#15803D' : '#6B7280',
                  }}>
                    {c.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      )}

      {/* Visit layer */}
      {showVisits && (
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={30}
          showCoverageOnHover={false}
          iconCreateFunction={(cluster) => {
            const count = cluster.getChildCount()
            return L.divIcon({
              html: `<div style="
                background:#EB6619;color:white;
                width:32px;height:32px;border-radius:4px;
                display:flex;align-items:center;justify-content:center;
                font-size:12px;font-weight:700;
                border:2px solid white;
                box-shadow:0 2px 6px rgba(0,0,0,0.3);
              ">${count}</div>`,
              className: '',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })
          }}
        >
          {visits.map(v => (
            <Marker
              key={v.id}
              position={[v.lat, v.lng]}
              icon={visitIcon(v)}
              eventHandlers={{ click: () => onVisitClick(v.id) }}
            >
              {/* Small tooltip — click opens full DetailModal */}
              <Popup className="mfs-popup" maxWidth={180}>
                <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px 0' }}>
                  <p style={{ fontWeight: 700, fontSize: 12, color: '#16205B', margin: '0 0 3px' }}>
                    {v.customer_name}
                    {v.is_prospect && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: '#EB6619', fontWeight: 600 }}>
                        Prospect
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 2px' }}>
                    {v.visit_type.replace(/_/g, ' ')} · {v.rep}
                  </p>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>
                    Tap to see full details
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      )}
    </MapContainer>
  )
}
