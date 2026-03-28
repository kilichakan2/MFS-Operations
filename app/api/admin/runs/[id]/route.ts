/**
 * app/api/admin/runs/[id]/route.ts
 *
 * PATCH — Update a route's status.
 *   Body: { status: 'completed' | 'active' | 'draft' }
 *   Only admins can call this (middleware enforces /api/admin/*).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_STATUSES = ['draft', 'active', 'completed'] as const
type RouteStatus = typeof VALID_STATUSES[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }   = await params
    const body     = await req.json() as { status?: string }
    const status   = body.status as RouteStatus | undefined

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('routes')
      .update({ status })
      .eq('id', id)
      .select('id, name, planned_date, status')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    console.log(`[admin/runs/:id PATCH] route ${id} → ${status}`)
    return NextResponse.json(data)

  } catch (err) {
    console.error('[admin/runs/:id PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
