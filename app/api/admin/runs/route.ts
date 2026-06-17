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
 *
 * Re-pointed through `routesService` (F-14 PR2): the Mon–Sun week boundary
 * now lives in the service (getUKWeekBounds); the adapter aggregates
 * stop_count. The route owns auth + the snake_case wire mapping. The wire
 * is byte-identical to the pre-F-14 shape. No `@supabase/*` import here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { routesService } from '@/lib/wiring/routes'
import { ServiceError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const fromParam = searchParams.get('from') ?? undefined
    const toParam   = searchParams.get('to')   ?? undefined

    // The service defaults omitted bounds to the current UK Mon–Sun week and
    // returns the resolved bounds it used (echoed on the wire below).
    const { runs: summaries, from, to } = await routesService.listWeekRuns(
      fromParam,
      toParam,
    )

    // Map each lightweight summary back to today's snake_case wire shape.
    const runs = summaries.map(s => ({
      id:               s.id,
      name:             s.name,
      planned_date:     s.plannedDate,
      departure_time:   s.departureTime,
      status:           s.status,
      end_point:        s.endPoint,
      total_distance_km:  s.totalDistanceKm,
      total_duration_min: s.totalDurationMin,
      assignee:         s.assignee
        ? { id: s.assignee.id, name: s.assignee.name }
        : null,
      stop_count:       s.stopCount,
    }))

    return NextResponse.json({ runs, from, to })

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[admin/runs GET]', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[admin/runs GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
