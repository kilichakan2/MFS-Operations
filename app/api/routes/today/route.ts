/**
 * app/api/routes/today/route.ts
 *
 * GET — Returns today's active route for the currently logged-in user.
 *       Used by:
 *         - /driver page  → shows the driver their stops for today
 *         - /screen3      → shows reps their pre-planned visit checklist
 *
 * Returns null if no route is assigned to this user for today.
 *
 * Query params:
 *   ?userId=uuid   Override the session user (admin use only — to preview
 *                  another user's route). Falls back to x-mfs-user-id header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPA_URL, SUPA_KEY)

export async function GET(req: NextRequest) {
  try {
    const sessionUserId = req.headers.get('x-mfs-user-id')
    if (!sessionUserId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // Allow admin to query any user's route for preview purposes
    const { searchParams } = new URL(req.url)
    const targetUserId = searchParams.get('userId') ?? sessionUserId

    const today = new Date().toISOString().slice(0, 10)

    const { data: routes, error } = await supabase
      .from('routes')
      .select(`
        id, name, planned_date, departure_time, end_point, status,
        total_distance_km, total_duration_min, google_maps_url,
        assigned_to,
        assignee:users!routes_assigned_to_fkey (id, name, role),
        route_stops (
          id, position, priority, locked_position, priority_note,
          estimated_arrival, drive_time_from_prev_min, distance_from_prev_km, visited,
          customer:customers (id, name, postcode, lat, lng)
        )
      `)
      .eq('assigned_to', targetUserId)
      .eq('planned_date', today)
      .in('status', ['active', 'draft'])   // exclude completed routes
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[routes/today GET] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!routes || routes.length === 0) {
      return NextResponse.json({ route: null })
    }

    // Sort stops by position before returning
    const route = {
      ...routes[0],
      route_stops: [...(routes[0].route_stops ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0)
      ),
    }

    return NextResponse.json({ route })

  } catch (err) {
    console.error('[routes/today GET] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
