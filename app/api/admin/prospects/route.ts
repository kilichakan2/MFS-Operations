export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/prospects
 *
 * Row-level prospects-this-week list for the /admin/prospects page.
 *
 * Mirrors the dashboard's prospects query at /api/dashboard:131-138,
 * with one shape addition: `stage` sourced from the existing
 * `pipeline_status` column (already in schema and surfaced
 * elsewhere — e.g. /api/dashboard:104 in the visits-today select).
 * The other amendment column (`value`) is dropped because the
 * `visits` table has no `deal_value` / `quoted_value` column; the
 * no-schema-change hard constraint binds.
 *
 * Auth: middleware enforces admin role via the /api/admin prefix.
 *
 * Window defaults to this week (rolling 7-day). Optional
 * ?from=ISO&to=ISO override.
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsService } from '@/lib/wiring/visits'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const params = req.nextUrl.searchParams
    const from = params.get('from') ?? defaultFrom
    const to   = params.get('to')   ?? now.toISOString()

    // F-20 PR2: read through the owned VisitsService over the VisitsRepository
    // port — no raw supabaseService in app code. The window-default + projection
    // stay here (presentation). `listProspects` preserves a raw null
    // pipeline_status (R1) so `stage` reproduces today's `… ? String(…) : null`.
    const visits = await visitsService.listProspects({ from, to })

    const rows = visits.map((v) => ({
      id:        v.id,
      name:      String(v.prospectName ?? ''),
      postcode:  String(v.prospectPostcode ?? ''),
      outcome:   String(v.outcome ?? '').replace(/_/g, ' '),
      visitType: String(v.visitType ?? '').replace(/_/g, ' '),
      rep:       v.loggedByName ?? 'Unknown',
      stage:     v.pipelineStatus ? String(v.pipelineStatus) : null,
    }))

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[admin/prospects] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
