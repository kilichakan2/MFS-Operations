export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/at-risk
 *
 * Row-level at-risk accounts list for the /admin/at-risk page.
 *
 * Mirrors the dashboard's at-risk query at /api/dashboard:67-73, with
 * one shape addition: a server-side derived `reason` string per the
 * Item 5a.1 PR B Gate 2 column-gap amendment. The other amendment
 * column (`avg_order_value`) is dropped because the orders/order_lines
 * schema carries no price column today and the no-schema-change
 * hard constraint binds.
 *
 * Auth: middleware enforces admin role via the /api/admin prefix.
 * The route handler verifies x-mfs-user-id is present (mirrors
 * /api/dashboard:22).
 *
 * Window defaults to the rolling 7-day at-risk window the dashboard
 * uses. Optional ?from=ISO&to=ISO override.
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsServiceForCaller } from '@/lib/wiring/visits'
import { deriveAtRiskReason } from '@/lib/adminDerivations'
import { requireRole } from '@/lib/auth/session'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const caller = requireRole(req, ['admin'])

    // F-RLS-04i: read as the caller (authenticated role → visits RLS fires).
    // is_admin() in the visits policy grants admin ALL reps' rows (cross-rep).
    // Rollback = swap `visitsServiceForCaller(caller.userId)` → `visitsService`.
    const visitsService = await visitsServiceForCaller(caller.userId!)

    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const params = req.nextUrl.searchParams
    const from = params.get('from') ?? defaultFrom
    const to   = params.get('to')   ?? now.toISOString()

    // F-20 PR2: read through the owned VisitsService over the VisitsRepository
    // port — no raw supabaseService in app code. `now`/window-default + the
    // hoursAgo projection + deriveAtRiskReason stay here (presentation).
    const visits = await visitsService.listAtRisk({ from, to })

    const rows = visits.map((v) => {
      const outcome = v.outcome as 'at_risk' | 'lost'
      const hoursAgo = Math.round((now.getTime() - new Date(v.createdAt).getTime()) / 3_600_000)
      return {
        id:       v.id,
        customer: v.customerName ?? v.prospectName ?? 'Unknown',
        outcome,
        rep:      v.loggedByName ?? 'Unknown',
        hoursAgo,
        reason:   deriveAtRiskReason(outcome, hoursAgo),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    console.error('[admin/at-risk] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
