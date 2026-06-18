'use client'

/**
 * lib/adapters/leaflet/MarkerMapCanvas.tsx
 *
 * The Leaflet adapter (F-24 PR2) for the admin Map View (Screen 6) — the ONE
 * place allowed to import leaflet / react-leaflet / leaflet.markercluster /
 * react-leaflet-cluster for the clustered marker map. It implements the owned
 * MarkerMapCanvasProps contract: it takes a vendor-neutral MarkerMapScene and
 * turns it into actual Leaflet elements (clustered marker layers, teardrop /
 * circle / square divIcons, cluster badges, the OSM tile layer, fit-to-bounds).
 *
 * Every drawing decision below — the icon-fix hack + cdnjs URLs, the teardrop /
 * shape SVG builders, both cluster-badge HTML strings, the BoundsFitter, the
 * tile URL, and both popup markups — is moved BYTE-IDENTICALLY from
 * components/MapView.tsx; only the INPUTS are renamed (read shape/colour/opacity/
 * popup from the owned MarkerPin / MarkerLayer data instead of local variables).
 * The recipe that BUILDS the scene (buildMarkerScene) lives in lib/services/,
 * vendor-free. See ADR-0002 / F-24.
 */

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useEffect, useRef } from 'react'
import type {
  ClusterBadge,
  LatLng,
  MarkerLayer,
  MarkerMapCanvasProps,
  MarkerPin,
} from '@/lib/ports/MapProvider'

// ── Leaflet default icon fix (broken in Webpack/Next.js) ──────────────────────
// Must run before any marker is created.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// ── SVG DivIcon helpers ───────────────────────────────────────────────────────

// Customer: navy teardrop (fill + approximate come from the owned pin)
function teardropIcon(colour: string, approximate: boolean): L.DivIcon {
  const fill    = colour
  const opacity = approximate ? '0.55' : '1'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30" opacity="${opacity}">
    <path d="M11 0C4.9 0 0 4.9 0 11c0 8.3 11 19 11 19S22 19.3 22 11C22 4.9 17.1 0 11 0z"
          fill="${fill}" stroke="white" stroke-width="1.5" stroke-dasharray="${approximate ? '3,2' : 'none'}"/>
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

// Visit: circle (Omer) / square (Mehmet) — shape + colour + approximate from the owned pin
function shapeIcon(shape: 'circle' | 'square', colour: string, approximate: boolean): L.DivIcon {
  const opacity = approximate ? '0.55' : '1'
  const dash    = approximate ? 'stroke-dasharray="3,2"' : ''

  const inner = shape === 'circle'
    ? `<circle cx="12" cy="12" r="8" fill="${colour}" stroke="white" stroke-width="2" ${dash}/>`
    : `<rect x="4" y="4" width="16" height="16" rx="2" fill="${colour}" stroke="white" stroke-width="2" ${dash}/>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" opacity="${opacity}">
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

/** Pick the right Leaflet divIcon for a scene pin. */
function iconFor(pin: MarkerPin): L.DivIcon {
  if (pin.shape === 'teardrop') return teardropIcon(pin.colour, pin.approximate)
  return shapeIcon(pin.shape, pin.colour, pin.approximate)
}

/** Build the cluster-badge iconCreateFunction from the layer's owned ClusterBadge. */
function badgeFor(cluster: ClusterBadge) {
  const radius = cluster.shape === 'circle' ? '50%' : '4px'
  return (clusterMarker: { getChildCount(): number }): L.DivIcon => {
    const count = clusterMarker.getChildCount()
    return L.divIcon({
      html: `<div style="
        background:${cluster.background};color:${cluster.colour};
        width:${cluster.size}px;height:${cluster.size}px;border-radius:${radius};
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;
        border:2px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
      ">${count}</div>`,
      className: '',
      iconSize: [cluster.size, cluster.size],
      iconAnchor: [cluster.size / 2, cluster.size / 2],
    })
  }
}

// ── Map bounds fitter ─────────────────────────────────────────────────────────
// One-shot: fits ONCE on first load (the `fitted` guard), matching MapView's
// BoundsFitter (NOT MapCanvas's re-fit-on-count-change semantics).
function BoundsFitter({ positions }: { positions: [number, number][] }) {
  const map    = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    if (positions.length === 0) return
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 13 })
    fitted.current = true
  }, [map, positions])

  return null
}

const toTuple = (p: LatLng): [number, number] => [p.lat, p.lng]

// ── Popups ──────────────────────────────────────────────────────────────────
// Rendered from the owned MarkerPopup data. Markup, styles, class names byte-
// identical to MapView's two popup blocks.

function CustomerPopup({ pin }: { pin: MarkerPin }) {
  const { popup } = pin
  return (
    <Popup className="mfs-popup" maxWidth={200}>
      <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px 0' }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: '#16205B', margin: '0 0 4px' }}>
          {popup.title}
        </p>
        <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 2px' }}>
          {popup.subtitle}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {popup.statusPill && (
            <span style={{
              display: 'inline-block',
              fontSize: 10, fontWeight: 600,
              padding: '1px 6px', borderRadius: 999,
              background: popup.statusPill.background,
              color:      popup.statusPill.colour,
            }}>
              {popup.statusPill.label}
            </span>
          )}
          {popup.approxPill && (
            <span style={{
              display: 'inline-block',
              fontSize: 10, fontWeight: 600,
              padding: '1px 6px', borderRadius: 999,
              background: '#FEF9C3', color: '#854D0E',
            }}>
              {popup.approxPill.label}
            </span>
          )}
        </div>
      </div>
    </Popup>
  )
}

function VisitPopup({ pin }: { pin: MarkerPin }) {
  const { popup } = pin
  return (
    <Popup className="mfs-popup" maxWidth={180}>
      <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px 0' }}>
        <p style={{ fontWeight: 700, fontSize: 12, color: '#16205B', margin: '0 0 3px' }}>
          {popup.title}
          {popup.prospectTag && (
            <span style={{ marginLeft: 4, fontSize: 10, color: '#EB6619', fontWeight: 600 }}>
              {popup.prospectTag.label}
            </span>
          )}
        </p>
        <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 2px' }}>
          {popup.subtitle}
        </p>
        {popup.approxPill && (
          <span style={{
            display: 'inline-block', marginBottom: 2,
            fontSize: 10, fontWeight: 600,
            padding: '1px 6px', borderRadius: 999,
            background: '#FEF9C3', color: '#854D0E',
          }}>{popup.approxPill.label}</span>
        )}
        {popup.footnote && (
          <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>
            {popup.footnote}
          </p>
        )}
      </div>
    </Popup>
  )
}

// ── Adapter ───────────────────────────────────────────────────────────────────
export function MarkerMapCanvas({ scene, onPinClick, style, className }: MarkerMapCanvasProps) {
  const { viewport, layers } = scene
  const fitPositions: [number, number][] = viewport.fitBounds.map(toTuple)

  return (
    <MapContainer
      center={[viewport.center.lat, viewport.center.lng]}
      zoom={viewport.zoom}
      style={style}
      className={className}
      zoomControl={viewport.zoomControl}
    >
      {/* Tile layer — OpenStreetMap, no API key required */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Auto-fit bounds on first load */}
      <BoundsFitter positions={fitPositions} />

      {/* One clustered layer per shown layer */}
      {layers.map((layer: MarkerLayer) => (
        <MarkerClusterGroup
          key={layer.id}
          chunkedLoading
          maxClusterRadius={layer.maxClusterRadius}
          showCoverageOnHover={false}
          iconCreateFunction={badgeFor(layer.cluster)}
        >
          {layer.pins.map(pin => (
            <Marker
              key={pin.id}
              position={[pin.at.lat, pin.at.lng]}
              icon={iconFor(pin)}
              eventHandlers={
                pin.clickable && onPinClick
                  ? { click: () => onPinClick(pin.id) }
                  : undefined
              }
            >
              {pin.shape === 'teardrop'
                ? <CustomerPopup pin={pin} />
                : <VisitPopup pin={pin} />}
            </Marker>
          ))}
        </MarkerClusterGroup>
      ))}
    </MapContainer>
  )
}
