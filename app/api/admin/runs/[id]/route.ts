/**
 * app/api/admin/runs/[id]/route.ts
 *
 * PATCH { status } — update route status
 * DELETE          — delete route (route_stops cascade automatically)
 *
 * Re-pointed through `routesService` (F-14 PR2): the route owns auth +
 * validation + the snake_case wire mapping; the service/adapter own the DB.
 * Byte-identical to the pre-F-14 wire. No `@supabase/*` import here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { routesService } from '@/lib/wiring/routes'
import { ServiceError } from '@/lib/errors'

const VALID_STATUSES = ['draft', 'active', 'completed'] as const
type RouteStatus = typeof VALID_STATUSES[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }


    const { id }  = await params
    const body    = await req.json() as { status?: string }
    const status  = body.status as RouteStatus | undefined

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const row = await routesService.setRouteStatus(id, status)

    // Today's route used .select(...).single(), which errors (→500) when no
    // row matched the id. Preserve a non-2xx for the no-match case rather
    // than inventing a 200/404. The UI only ever PATCHes existing runs.
    if (row === null) {
      return NextResponse.json({ error: 'Route not found' }, { status: 500 })
    }

    console.log(`[admin/runs/:id PATCH] route ${id} → ${status}`)
    // Map the trimmed domain row back to the bare snake_case wire shape.
    return NextResponse.json({
      id:           row.id,
      name:         row.name,
      planned_date: row.plannedDate,
      status:       row.status,
    })

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[admin/runs/:id PATCH]', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[admin/runs/:id PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }


    const { id } = await params

    // route_stops has ON DELETE CASCADE — single delete removes all stops too
    await routesService.deleteRoute(id)

    console.log(`[admin/runs/:id DELETE] route ${id} deleted`)
    return new NextResponse(null, { status: 204 })

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[admin/runs/:id DELETE]', err.message)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[admin/runs/:id DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
