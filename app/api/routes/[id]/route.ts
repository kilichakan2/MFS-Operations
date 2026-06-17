/**
 * app/api/routes/[id]/route.ts
 *
 * GET  — Fetch a full route with ordered stops for edit hydration.
 * PUT  — Replace a route's header fields and stops entirely.
 *        Sequential: update header → delete old stops → insert new stops.
 *        If the insert fails, the route is left with zero stops — a
 *        correctable state (re-save restores them). The header is always
 *        saved first so route metadata is never lost.
 *
 * Re-pointed through `routesService` (F-14 PR2). The route owns auth +
 * validation + the snake_case wire mapping; the adapter owns the atomic
 * delete-then-insert replace and reproduces the exact partial-failure
 * messages (carried through the ServiceError). The GET wire is byte-identical
 * to today EXCEPT stops now include `visited` (N2 — approved: aligns /[id]
 * with /today). NO created_at/creator on the wire. No `@supabase/*` import.
 */

import { NextRequest, NextResponse } from 'next/server'
import { routesService } from '@/lib/wiring/routes'
import { ServiceError } from '@/lib/errors'
import type { RouteWithStops, RouteEndPoint, StopPriority } from '@/lib/domain'

// ── GET ────────────────────────────────────────────────────────────────────────

/** Map a full route aggregate back to the snake_case wire shape. Explicit
 *  per-key list — NEVER spread the domain object. Omits created_at/creator;
 *  stops include `visited` (N2). */
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { id } = await params

    const route = await routesService.getRouteById(id)

    if (route === null) return NextResponse.json({ error: 'Route not found' }, { status: 404 })

    return NextResponse.json({ route: toWire(route) })

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[GET /api/routes/:id]', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[GET /api/routes/:id] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PUT ────────────────────────────────────────────────────────────────────────

interface StopPayload {
  customerId:           string
  position:             number
  priority:             string
  lockedPosition:       boolean
  priorityNote:         string | null
  estimatedArrival:     string | null
  driveTimeFromPrevMin: number | null
  distanceFromPrevKm:   number | null
}

interface PutBody {
  name?:             string | null
  plannedDate:       string
  assignedTo:        string
  departureTime:     string
  endPoint:          string
  stops:             StopPayload[]
  totalDistanceKm?:  number | null
  totalDurationMin?: number | null
  googleMapsUrl?:    string | null
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { id } = await params
    const body   = await req.json() as PutBody

    if (!body.plannedDate || !body.assignedTo || !body.departureTime || !body.endPoint) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!body.stops?.length) {
      return NextResponse.json({ error: 'Route must have at least one stop' }, { status: 400 })
    }

    // The adapter does the atomic header-update → delete-stops → insert-stops
    // replace and throws a ServiceError carrying the exact partial-failure
    // message shape on a stop-delete or stop-insert failure.
    await routesService.saveRoute(id, {
      name:             body.name ?? null,
      plannedDate:      body.plannedDate,
      assignedTo:       body.assignedTo,
      departureTime:    body.departureTime,
      endPoint:         body.endPoint as RouteEndPoint,
      stops: body.stops.map(s => ({
        customerId:           s.customerId,
        position:             s.position,
        priority:             s.priority as StopPriority,
        lockedPosition:       s.lockedPosition,
        priorityNote:         s.priorityNote          ?? null,
        estimatedArrival:     s.estimatedArrival      ?? null,
        driveTimeFromPrevMin: s.driveTimeFromPrevMin  ?? null,
        distanceFromPrevKm:   s.distanceFromPrevKm    ?? null,
      })),
      totalDistanceKm:  body.totalDistanceKm  ?? null,
      totalDurationMin: body.totalDurationMin ?? null,
      googleMapsUrl:    body.googleMapsUrl    ?? null,
    })

    console.log(`[PUT /api/routes/:id] route ${id} updated — ${body.stops.length} stops`)
    return NextResponse.json({ id, updated: true })

  } catch (err) {
    if (err instanceof ServiceError) {
      // The adapter's ServiceError message reproduces today's exact strings:
      //  "Header saved but could not clear old stops: …"
      //  "Route header saved but stops could not be written: …. Please re-save to restore stops."
      //  (and the bare header-update error message).
      console.error('[PUT /api/routes/:id]', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[PUT /api/routes/:id] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
