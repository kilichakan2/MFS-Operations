/**
 * app/api/routes/route.ts
 *
 * POST — Save a finalised route and its stops to the database.
 *        Called after the user has reviewed the optimised preview.
 *
 * GET  — List routes.
 *        Query params:
 *          ?date=YYYY-MM-DD   filter by planned_date (default: today)
 *          ?assignedTo=uuid   filter by assigned_to user
 *          ?all=true          skip date filter, return all routes
 *
 * Re-pointed through `routesService` (F-14 PR2). The route owns auth +
 * validation + the field defaults + the snake_case wire mapping; the adapter
 * owns the atomic insert+rollback (POST) and the embedded join (GET). The
 * wire is byte-identical to the pre-F-14 shape — the GET list keeps BOTH the
 * bare `assigned_to` column AND the `assignee`/`creator` joins, plus
 * `created_at`. No `@supabase/*` import here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { routesService, routesServiceForCaller } from '@/lib/wiring/routes'
import { ServiceError } from '@/lib/errors'
import type { RouteWithStops, RouteEndPoint, StopPriority } from '@/lib/domain'

// ─── POST /api/routes ─────────────────────────────────────────────────────────

interface StopPayload {
  customerId:            string
  position:              number
  priority:              'none' | 'urgent' | 'priority'
  lockedPosition:        boolean
  priorityNote?:         string | null
  estimatedArrival?:     string | null  // "HH:MM"
  driveTimeFromPrevMin?: number | null
  distanceFromPrevKm?:   number | null
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // F-RLS-04c: run under the per-caller authenticated client (RLS fires).
    // Rollback = swap `routesServiceForCaller(userId)` → `routesService`.
    const routesService = await routesServiceForCaller(userId)

    const body = await req.json() as {
      name?:           string
      plannedDate:     string
      assignedTo:      string
      departureTime:   string
      endPoint:        'mfs' | 'ozmen_john_street'
      stops:           StopPayload[]
      totalDistanceKm?:  number | null
      totalDurationMin?: number | null
      googleMapsUrl?:    string | null
    }

    const {
      name, plannedDate, assignedTo, departureTime,
      endPoint, stops, totalDistanceKm, totalDurationMin, googleMapsUrl,
    } = body

    if (!plannedDate)    return NextResponse.json({ error: 'plannedDate required' },  { status: 400 })
    if (!assignedTo)     return NextResponse.json({ error: 'assignedTo required' },   { status: 400 })
    if (!stops?.length)  return NextResponse.json({ error: 'stops required' },        { status: 400 })

    // Preserve today's field defaults (the route owned them before F-14).
    const created = await routesService.createRoute({
      name:             name ?? null,
      plannedDate,
      assignedTo,
      createdBy:        userId,
      departureTime:    departureTime ?? '08:00',
      endPoint:         (endPoint ?? 'mfs') as RouteEndPoint,
      stops: stops.map(s => ({
        customerId:           s.customerId,
        position:             s.position,
        priority:             (s.priority ?? 'none') as StopPriority,
        lockedPosition:       s.lockedPosition ?? false,
        priorityNote:         s.priorityNote          ?? null,
        estimatedArrival:     s.estimatedArrival      ?? null,
        driveTimeFromPrevMin: s.driveTimeFromPrevMin  ?? null,
        distanceFromPrevKm:   s.distanceFromPrevKm    ?? null,
      })),
      totalDistanceKm:  totalDistanceKm  ?? null,
      totalDurationMin: totalDurationMin ?? null,
      googleMapsUrl:    googleMapsUrl ?? null,
    })

    console.log(`[routes POST] saved route ${created.id} with ${stops.length} stops for user ${assignedTo}`)

    // Map the created header back to today's snake_case `route` echo.
    return NextResponse.json(
      {
        route: {
          id:           created.id,
          name:         created.name,
          planned_date: created.plannedDate,
          assigned_to:  created.assignedTo,
          status:       created.status,
          created_at:   created.createdAt,
        },
        stopCount: stops.length,
      },
      { status: 201 },
    )

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[routes POST]', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[routes POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── GET /api/routes ──────────────────────────────────────────────────────────

/** Map a full route aggregate back to the LIST snake_case wire shape. Unlike
 *  /[id] and /today, the list INCLUDES `created_at` and the `creator` join,
 *  alongside both the bare `assigned_to` column and the `assignee` join.
 *  Explicit per-key list — NEVER spread the domain object. */
function toListWire(r: RouteWithStops) {
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
    created_at:         r.createdAt,
    assigned_to:        r.assignedTo,
    assignee:           r.assignee
      ? { id: r.assignee.id, name: r.assignee.name, role: r.assignee.role }
      : null,
    creator:            r.creator
      ? { id: r.creator.id, name: r.creator.name }
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
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // F-RLS-04c: run under the per-caller authenticated client (RLS fires).
    // Rollback = swap `routesServiceForCaller(userId)` → `routesService`.
    const routesService = await routesServiceForCaller(userId)

    const { searchParams } = new URL(req.url)
    const dateParam       = searchParams.get('date')
    const assignedToParam = searchParams.get('assignedTo')
    const allParam        = searchParams.get('all') === 'true'

    const today = new Date().toISOString().slice(0, 10)
    const filterDate = dateParam ?? today

    const list = await routesService.listRoutes({
      all:         allParam,
      plannedDate: filterDate,
      ...(assignedToParam ? { assignedTo: assignedToParam } : {}),
    })

    const routes = list.map(toListWire)

    return NextResponse.json({ routes })

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[routes GET]', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[routes GET] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
