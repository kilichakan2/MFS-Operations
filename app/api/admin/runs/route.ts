/**
 * app/api/admin/runs/route.ts
 *
 * GET  — List all routes for a given week window (defaults to current week).
 *        Returns lightweight rows with stop_count aggregated server-side.
 *
 * Query params:
 *   ?from=YYYY-MM-DD  Start of date range (inclusive)
 *   ?to=YYYY-MM-DD    End of date range   (inclusive)
 *   Defaults to Mon–Sun of current UK week if omitted.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function getUKWeekBounds(): { from: string; to: string } {
  const now  = new Date()
  const ukDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const d    = new Date(ukDateStr + 'T12:00:00')
  const day  = d.getDay()                           // 0=Sun … 6=Sat
  const mon  = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7))
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6)
  return {
    from: mon.toLocaleDateString('en-CA'),
    to:   sun.toLocaleDateString('en-CA'),
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const bounds = getUKWeekBounds()
    const from   = searchParams.get('from') ?? bounds.from
    const to     = searchParams.get('to')   ?? bounds.to

    const { data, error } = await supabase
      .from('routes')
      .select(`
        id, name, planned_date, departure_time, status, end_point,
        total_distance_km, total_duration_min,
        assignee:users!routes_assigned_to_fkey (id, name),
        route_stops (id)
      `)
      .gte('planned_date', from)
      .lte('planned_date', to)
      .order('planned_date',   { ascending: true })
      .order('departure_time', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Shape: add stop_count, drop the full route_stops array
    const runs = (data ?? []).map(r => ({
      id:               r.id,
      name:             r.name,
      planned_date:     r.planned_date,
      departure_time:   r.departure_time,
      status:           r.status,
      end_point:        r.end_point,
      total_distance_km:  r.total_distance_km,
      total_duration_min: r.total_duration_min,
      assignee:         r.assignee ?? null,
      stop_count:       (r.route_stops as { id: string }[]).length,
    }))

    return NextResponse.json({ runs, from, to })

  } catch (err) {
    console.error('[admin/runs GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
