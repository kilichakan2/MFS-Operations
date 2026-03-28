/**
 * /api/screen3/visit
 *
 * DELETE ?id=<uuid>  — permanently delete a visit (owner only)
 * PATCH              — update pipeline_status for a visit
 *   Body: { id: string, pipeline_status: string }
 *   Admin/office can update any visit; sales can only update their own.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const VALID_PIPELINE_STATUSES = [
  'Logged',
  'In Talks',
  'Not Progressing',
  'Trial Order Placed',
  'Awaiting Feedback',
  'Won',
  'Not Won',
] as const

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only allow deletion of visits owned by this user
  const res = await fetch(
    `${SUPA_URL}/rest/v1/visits?id=eq.${id}&user_id=eq.${userId}`,
    {
      method: 'DELETE',
      headers: {
        'apikey':         SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Prefer':        'return=minimal',
      },
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('[screen3/visit DELETE] error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  let body: { id?: string; pipeline_status?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }
  if (!body?.id)              return NextResponse.json({ error: 'id required' },              { status: 400 })
  if (!body?.pipeline_status) return NextResponse.json({ error: 'pipeline_status required' }, { status: 400 })

  const statusVal = body.pipeline_status as string
  if (!VALID_PIPELINE_STATUSES.includes(statusVal as typeof VALID_PIPELINE_STATUSES[number])) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_PIPELINE_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  // Admin/office can update any visit; sales restricted to their own
  const isManager  = role === 'admin' || role === 'office'
  const ownerFilter = isManager ? '' : `&user_id=eq.${userId}`
  const patchUrl   = `${SUPA_URL}/rest/v1/visits?id=eq.${body.id}${ownerFilter}`

  const res = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'apikey':         SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: JSON.stringify({ pipeline_status: statusVal }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[screen3/visit PATCH] error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  const rows = await res.json() as { id: string }[]
  if (!rows.length) return NextResponse.json({ error: 'Visit not found or not authorised' }, { status: 404 })

  console.log(`[screen3/visit PATCH] visit ${body.id} pipeline_status → ${statusVal}`)
  return NextResponse.json({ id: body.id, pipeline_status: statusVal })
}
