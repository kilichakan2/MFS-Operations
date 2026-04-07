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
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = supabaseService

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

    // ── Insert route ────────────────────────────────────────────────────────
    const { data: route, error: routeErr } = await supabase
      .from('routes')
      .insert({
        name:              name ?? null,
        planned_date:      plannedDate,
        assigned_to:       assignedTo,
        created_by:        userId,
        departure_time:    departureTime ?? '08:00',
        end_point:         endPoint ?? 'mfs',
        status:            'active',
        total_distance_km: totalDistanceKm  ?? null,
        total_duration_min: totalDurationMin ?? null,
        google_maps_url:   googleMapsUrl ?? null,
      })
      .select('id, name, planned_date, assigned_to, status, created_at')
      .single()

    if (routeErr) {
      console.error('[routes POST] route insert error:', routeErr)
      return NextResponse.json({ error: routeErr.message }, { status: 500 })
    }

    // ── Insert stops ────────────────────────────────────────────────────────
    const stopRows = stops.map(s => ({
      route_id:                route.id,
      customer_id:             s.customerId,
      position:                s.position,
      priority:                s.priority      ?? 'none',
      locked_position:         s.lockedPosition ?? false,
      priority_note:           s.priorityNote  ?? null,
      estimated_arrival:       s.estimatedArrival     ?? null,
      drive_time_from_prev_min: s.driveTimeFromPrevMin ?? null,
      distance_from_prev_km:   s.distanceFromPrevKm   ?? null,
      visited:                 false,
    }))

    const { error: stopsErr } = await supabase
      .from('route_stops')
      .insert(stopRows)

    if (stopsErr) {
      console.error('[routes POST] stops insert error:', stopsErr)
      // Roll back the route row to keep data consistent
      await supabase.from('routes').delete().eq('id', route.id)
      return NextResponse.json({ error: stopsErr.message }, { status: 500 })
    }

    console.log(`[routes POST] saved route ${route.id} with ${stops.length} stops for user ${assignedTo}`)

    return NextResponse.json({ route, stopCount: stops.length }, { status: 201 })

  } catch (err) {
    console.error('[routes POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── GET /api/routes ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const dateParam       = searchParams.get('date')
    const assignedToParam = searchParams.get('assignedTo')
    const allParam        = searchParams.get('all') === 'true'

    const today = new Date().toISOString().slice(0, 10)
    const filterDate = dateParam ?? today

    let query = supabase
      .from('routes')
      .select(`
        id, name, planned_date, departure_time, end_point, status,
        total_distance_km, total_duration_min, google_maps_url, created_at,
        assigned_to,
        assignee:users!routes_assigned_to_fkey (id, name, role),
        creator:users!routes_created_by_fkey   (id, name),
        route_stops (
          id, position, priority, locked_position, priority_note,
          estimated_arrival, drive_time_from_prev_min, distance_from_prev_km, visited,
          customer:customers (id, name, postcode, lat, lng)
        )
      `)
      .order('planned_date', { ascending: false })
      .order('created_at',   { ascending: false })

    if (!allParam)       query = query.eq('planned_date', filterDate)
    if (assignedToParam) query = query.eq('assigned_to',  assignedToParam)

    const { data, error } = await query

    if (error) {
      console.error('[routes GET] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sort stops within each route by position
    const routes = (data ?? []).map(r => ({
      ...r,
      route_stops: [...(r.route_stops ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0)
      ),
    }))

    return NextResponse.json({ routes })

  } catch (err) {
    console.error('[routes GET] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
