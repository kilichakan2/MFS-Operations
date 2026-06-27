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
import { mapDataServiceForCaller } from '@/lib/wiring/mapData'
import { requireRole } from '@/lib/auth/session'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'

// MapCustomer / MapVisit were DECLARED here; F-24 PR2 relocated them into
// lib/services/mapScene.ts (so buildMarkerScene doesn't import UPWARD from
// app/**). This route RE-EXPORTS them so every existing import site keeps
// resolving unchanged. Mirrors PR1's RouteStop relocation.
export type { MapCustomer, MapVisit } from '@/lib/services/mapScene'

export async function GET(req: NextRequest) {
  try {
    const caller = requireRole(req, ['admin'])

    // F-RLS-04i: read as the caller (authenticated role → customers + visits RLS
    // fire under the one key). Admin-only route → is_admin() grants ALL reps'
    // rows (cross-rep). Rollback = swap
    // `mapDataServiceForCaller(caller.userId)` → `mapDataService`.
    const mapDataService = await mapDataServiceForCaller(caller.userId!)

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
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    console.error('[map/data GET] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
