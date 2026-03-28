/**
 * lib/hubs.ts
 *
 * Single source of truth for MFS and Ozmen hub coordinates.
 * Used by both the routing engine (API) and the RouteMap component (UI).
 * Source: OS/Royal Mail postcode centroids via doogal.co.uk.
 */

export const MFS_COORDS = {
  lat:      53.392371,
  lng:      -1.479496,
  label:    'MFS Sheffield',
  postcode: 'S3 8DG',
} as const

export const OZMEN_COORDS = {
  lat:      53.370449,
  lng:      -1.475525,
  label:    'Ozmen John Street',
  postcode: 'S2 4QT',
} as const

export type HubCoords = { lat: number; lng: number; label: string; postcode: string }
