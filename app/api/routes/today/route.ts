/**
 * app/api/routes/today/route.ts
 *
 * GET — Returns the next active route for the currently logged-in user.
 *
 * Logic:
 *   1. Compute the current time in Europe/London (Vercel runs UTC in Washington DC;
 *      we must not use new Date().getHours() server-side — it gives UTC not UK time).
 *   2. If UK time >= 19:00, treat "today" as tomorrow (7 PM auto-rollover):
 *      drivers see tomorrow's route from 7 PM onwards, even if today's route was
 *      never manually marked complete.
 *   3. Query: planned_date >= effectiveMinDate, status in [active, draft],
 *      ordered by planned_date ASC then departure_time ASC → returns the
 *      chronologically next route, not the most recently created one.
 *
 * Query params:
 *   ?userId=uuid   Admin-only override to preview another user's route.
 */

import { NextRequest, NextResponse } from 'next/server'

const supabase = supabaseService

import { getUKDateAndHour, getEffectiveMinDate } from '@/lib/utils/ukDateAndHour'
import { supabaseService }           from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const sessionUserId = req.headers.get('x-mfs-user-id')
    if (!sessionUserId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const targetUserId = searchParams.get('userId') ?? sessionUserId

    const { dateStr: ukToday, hour: ukHour } = getUKDateAndHour()

    // 7 PM rollover: after 19:00 UK time, skip today and fetch the next future route
    const effectiveMinDate = getEffectiveMinDate(ukToday, ukHour)

    console.log(`[routes/today] ukToday=${ukToday} ukHour=${ukHour} effectiveMinDate=${effectiveMinDate} targetUser=${targetUserId}`)

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
      .eq('assigned_to',  targetUserId)
      .gte('planned_date', effectiveMinDate)   // on or after effective date (not strictly today)
      .in('status', ['active', 'draft'])
      .order('planned_date',   { ascending: true })  // soonest date first
      .order('departure_time', { ascending: true })  // tiebreak by departure time
      .limit(1)

    if (error) {
      console.error('[routes/today GET] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!routes || routes.length === 0) {
      return NextResponse.json({ route: null })
    }

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
