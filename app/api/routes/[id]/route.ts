/**
 * app/api/routes/[id]/route.ts
 *
 * GET  — Fetch a full route with ordered stops for edit hydration.
 * PUT  — Replace a route's header fields and stops entirely.
 *        Sequential: update header → delete old stops → insert new stops.
 *        If the insert fails, the route is left with zero stops — a
 *        correctable state (re-save restores them). The header is always
 *        saved first so route metadata is never lost.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { id } = await params

    const { data, error } = await supabase
      .from('routes')
      .select(`
        id, name, planned_date, departure_time, end_point, status,
        total_distance_km, total_duration_min, google_maps_url,
        assigned_to,
        assignee:users!routes_assigned_to_fkey (id, name, role),
        route_stops (
          id, position, priority, locked_position, priority_note,
          estimated_arrival, drive_time_from_prev_min, distance_from_prev_km,
          customer:customers (id, name, postcode, lat, lng)
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('[GET /api/routes/:id]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Route not found' }, { status: 404 })

    // Sort stops by position
    const route = {
      ...data,
      route_stops: [...(data.route_stops ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0)
      ),
    }

    return NextResponse.json({ route })

  } catch (err) {
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

    // Step 1: Update route header (always persisted — metadata never lost)
    const { error: updateErr } = await supabase
      .from('routes')
      .update({
        name:             body.name ?? null,
        planned_date:     body.plannedDate,
        assigned_to:      body.assignedTo,
        departure_time:   body.departureTime,
        end_point:        body.endPoint,
        total_distance_km:  body.totalDistanceKm  ?? null,
        total_duration_min: body.totalDurationMin ?? null,
        google_maps_url:    body.googleMapsUrl    ?? null,
      })
      .eq('id', id)

    if (updateErr) {
      console.error('[PUT /api/routes/:id] header update failed:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Step 2: Delete existing stops
    const { error: deleteErr } = await supabase
      .from('route_stops')
      .delete()
      .eq('route_id', id)

    if (deleteErr) {
      // Header already updated — stops are stale but route is not lost
      console.error('[PUT /api/routes/:id] stop delete failed:', deleteErr.message)
      return NextResponse.json(
        { error: `Header saved but could not clear old stops: ${deleteErr.message}` },
        { status: 500 }
      )
    }

    // Step 3: Insert new stops
    const stopRows = body.stops.map(s => ({
      route_id:               id,
      customer_id:            s.customerId,
      position:               s.position,
      priority:               s.priority,
      locked_position:        s.lockedPosition,
      priority_note:          s.priorityNote          ?? null,
      estimated_arrival:      s.estimatedArrival      ?? null,
      drive_time_from_prev_min: s.driveTimeFromPrevMin ?? null,
      distance_from_prev_km:  s.distanceFromPrevKm    ?? null,
    }))

    const { error: insertErr } = await supabase
      .from('route_stops')
      .insert(stopRows)

    if (insertErr) {
      // Stops deleted but insert failed — route exists but is empty.
      // Dispatcher must re-save to restore stops (handled via error message).
      console.error('[PUT /api/routes/:id] stop insert failed:', insertErr.message)
      return NextResponse.json(
        { error: `Route header saved but stops could not be written: ${insertErr.message}. Please re-save to restore stops.` },
        { status: 500 }
      )
    }

    console.log(`[PUT /api/routes/:id] route ${id} updated — ${body.stops.length} stops`)
    return NextResponse.json({ id, updated: true })

  } catch (err) {
    console.error('[PUT /api/routes/:id] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
