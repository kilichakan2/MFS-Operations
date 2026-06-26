export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard
 *
 * Returns all data for Screen 4 (Management Dashboard) in one request.
 *
 * F-21: re-pointed off raw Supabase onto the owned DashboardService (the
 * "dashboard desk", composed in lib/wiring/dashboard.ts over service-role
 * singletons — the same RLS-bypass posture this route used before). The route
 * is now thin: guard → parse the from/to window exactly as today → read the
 * clock ONCE → call dashboardService.load({ now, window }) → return the payload
 * unchanged. It imports ZERO adapters and ZERO vendor SDKs.
 *
 * Byte-identity: the service returns the same 19-key payload the route built
 * inline before; all the aggregation + presentation transforms moved into the
 * service verbatim. NextResponse.json(payload) is unchanged.
 *
 * Accessible to admin role only (middleware enforces via ROLE_PERMISSIONS on
 * the /api/dashboard path; the handler also verifies x-mfs-user-id is present).
 */

import { NextRequest, NextResponse } from 'next/server'
import { dashboardService } from '@/lib/wiring/dashboard'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    // Read the clock ONCE (R2) and hand it to the service — the service derives
    // every ago-window from this same instant, so the time maths is consistent.
    const now = new Date()

    // Zone 2 + 3 use client-supplied ISO strings so timezone is correct (the
    // browser computes midnight in local time and sends the ISO string). If
    // absent (e.g. a direct API call), fall back to UTC today / now — exactly
    // as before the re-point.
    const todayUTC = new Date(now)
    todayUTC.setUTCHours(0, 0, 0, 0)
    const searchParams = req.nextUrl.searchParams
    const zoneFrom = searchParams.get('from') ?? todayUTC.toISOString()
    const zoneTo   = searchParams.get('to')   ?? now.toISOString()

    const payload = await dashboardService.load({
      now,
      window: { from: zoneFrom, to: zoneTo },
    })

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[dashboard] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
