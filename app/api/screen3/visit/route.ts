/**
 * /api/screen3/visit
 *
 * DELETE ?id=<uuid>  — permanently delete a visit (owner only)
 * PATCH              — update pipeline_status for a visit
 *   Body: { id: string, pipeline_status: string }
 *   Admin/office can update any visit; sales can only update their own.
 *
 * F-18 PR2: re-pointed onto visitsService — no direct @supabase / /rest/v1
 * access. Validation cascade lives in the service. The PATCH success echo is an
 * inline {id, pipeline_status} literal built from request values (plan §3.6 —
 * no dto helper). Wire output is byte-identical (snake_case).
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsServiceForCaller } from '@/lib/wiring/visits'
import { ServiceError } from '@/lib/errors'

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // F-RLS-04g: run as the caller (authenticated role → visits RLS fires). Per-request.
  const visitsService = await visitsServiceForCaller(userId)

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only allow deletion of visits owned by this user (owner filter in service)
  try {
    await visitsService.deleteOwnVisit(id, userId)
  } catch (err) {
    // R3: preserve the exact DB-failure 500 body the route emitted today.
    if (err instanceof ServiceError) {
      console.error('[screen3/visit DELETE] error:', err.message)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    throw err
  }

  return NextResponse.json({ deleted: true })
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // F-RLS-04g: run as the caller (authenticated role → visits RLS fires). Per-request.
  const visitsService = await visitsServiceForCaller(userId)

  let body: { id?: string; pipeline_status?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }

  const valid = visitsService.validatePipelineStatus({
    id: body?.id,
    status: body?.pipeline_status,
  })
  if (!valid.ok) {
    return NextResponse.json({ error: valid.message }, { status: valid.status })
  }

  const statusVal = body!.pipeline_status as string

  // Admin/office can update any visit; sales restricted to their own
  const isManager = role === 'admin' || role === 'office'

  let res
  try {
    res = await visitsService.updatePipelineStatus({
      id: body!.id as string,
      status: statusVal,
      userId,
      isManager,
    })
  } catch (err) {
    // R3: preserve the exact DB-failure 500 body the route emitted today.
    if (err instanceof ServiceError) {
      console.error('[screen3/visit PATCH] error:', err.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    throw err
  }

  if (res === null) {
    return NextResponse.json({ error: 'Visit not found or not authorised' }, { status: 404 })
  }

  console.log(`[screen3/visit PATCH] visit ${body!.id} pipeline_status → ${statusVal}`)
  // Inline 2-key echo (plan §3.6) — built from request values, not a domain obj.
  return NextResponse.json({ id: body!.id, pipeline_status: statusVal })
}
