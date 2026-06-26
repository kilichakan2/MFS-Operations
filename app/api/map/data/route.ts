/**
 * GET /api/map/data?layer=all|customers|visits&from=ISO&to=ISO
 *
 * Returns geocoded customers and/or visits for the Map View (Screen 6).
 * Admin-only: requires x-mfs-user-id header.
 *
 * F-20 PR3: re-pointed off the hand-rolled PostgREST fetches onto MapDataService
 * (CustomersRepository.listGeocodedForMap + VisitsRepository.listForMap, composed
 * by a layer switch). NO vendor import. A read failure now returns 500
 * 'Server error' (the Locked-item-1 accepted deviation from the old
 * silent-empty-at-200, consistent with every other admin read route).
 */

import { NextRequest, NextResponse } from 'next/server'
import { mapDataService } from '@/lib/wiring/mapData'

// MapCustomer / MapVisit were DECLARED here; F-24 PR2 relocated them into
// lib/services/mapScene.ts (so buildMarkerScene doesn't import UPWARD from
// app/**). This route RE-EXPORTS them so every existing import site keeps
// resolving unchanged. Mirrors PR1's RouteStop relocation.
export type { MapCustomer, MapVisit } from '@/lib/services/mapScene'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    const { searchParams } = req.nextUrl
    const layer = searchParams.get('layer') ?? 'all'
    const from  = searchParams.get('from')  ?? null
    const to    = searchParams.get('to')    ?? null

    const { customers, visits } = await mapDataService.load({
      layer,
      window: { from, to },
    })

    return NextResponse.json({ customers, visits })
  } catch (err) {
    console.error('[map/data GET] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
