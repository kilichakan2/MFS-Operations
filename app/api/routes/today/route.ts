/**
 * app/api/routes/today/route.ts
 *
 * GET — Returns the next active route for the currently logged-in user.
 *
 * Logic (now owned by RoutesService):
 *   1. The service computes the current time in Europe/London and applies the
 *      7 PM auto-rollover: after 19:00 UK, "today" rolls to tomorrow, so
 *      drivers see tomorrow's route from 7 PM even if today's was never marked
 *      complete. The route only supplies the target user; the service hands
 *      the adapter a plain date string.
 *   2. The adapter queries planned_date >= effectiveMinDate, status in
 *      [active, draft], ordered planned_date ASC then departure_time ASC,
 *      limit 1 → the chronologically next route, stops position-sorted.
 *
 * Query params:
 *   ?userId=uuid   Admin-only override to preview another user's route.
 *
 * Re-pointed through `routesService` (F-14 PR2). The route owns auth + the
 * snake_case wire mapping; the wire is byte-identical to the pre-F-14 shape
 * (header + position-sorted stops incl. `visited`; NO created_at/creator).
 * No `@supabase/*` import here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { routesService, routesServiceForCaller } from '@/lib/wiring/routes'
import { ServiceError } from '@/lib/errors'
import type { RouteWithStops } from '@/lib/domain'

/** Map a full route aggregate back to today's snake_case wire shape.
 *  Explicit per-key list — NEVER spread the domain object. The /today and
 *  /[id] endpoints deliberately omit `created_at` and `creator`. */
function toWire(r: RouteWithStops) {
  return {
    id:                 r.id,
    name:               r.name,
    planned_date:       r.plannedDate,
    departure_time:     r.departureTime,
    end_point:          r.endPoint,
    status:             r.status,
    total_distance_km:  r.totalDistanceKm,
    total_duration_min: r.totalDurationMin,
    google_maps_url:    r.googleMapsUrl,
    assigned_to:        r.assignedTo,
    assignee:           r.assignee
      ? { id: r.assignee.id, name: r.assignee.name, role: r.assignee.role }
      : null,
    route_stops: r.stops.map(s => ({
      id:                       s.id,
      position:                 s.position,
      priority:                 s.priority,
      locked_position:          s.lockedPosition,
      priority_note:            s.priorityNote,
      estimated_arrival:        s.estimatedArrival,
      drive_time_from_prev_min: s.driveTimeFromPrevMin,
      distance_from_prev_km:    s.distanceFromPrevKm,
      visited:                  s.visited,
      customer: s.customer
        ? {
            id:       s.customer.id,
            name:     s.customer.name,
            postcode: s.customer.postcode,
            lat:      s.customer.lat,
            lng:      s.customer.lng,
          }
        : null,
    })),
  }
}

export async function GET(req: NextRequest) {
  try {
    const sessionUserId = req.headers.get('x-mfs-user-id')
    if (!sessionUserId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // F-RLS-04c: run under the per-caller authenticated client (RLS fires).
    // Rollback = swap `routesServiceForCaller(sessionUserId)` → `routesService`.
    const routesService = await routesServiceForCaller(sessionUserId)

    const { searchParams } = new URL(req.url)
    const targetUserId = searchParams.get('userId') ?? sessionUserId

    // The service owns the 7 PM rollover (uses the current UK time).
    const route = await routesService.getNextRouteForUser(targetUserId)

    if (route === null) {
      return NextResponse.json({ route: null })
    }

    return NextResponse.json({ route: toWire(route) })

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[routes/today GET] query error:', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[routes/today GET] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
