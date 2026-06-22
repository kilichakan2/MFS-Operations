export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/visits
 *
 * Row-level all-reps visits list for the /admin/visits page.
 *
 * Mirrors the dashboard's visits-today query at /api/dashboard:101-108
 * but is parameterised on a wider date window plus optional rep /
 * type / outcome filters. The dashboard query is hard-coded to today;
 * this endpoint accepts any range so the admin page can filter by
 * RangeTabs (Today / This week / This month / This quarter).
 *
 * The "admin sees all reps" semantics are inherent — the query has
 * never had a user_id filter; the dashboard already shows all-rep
 * aggregates via weekVisitsByRep. Pulling row-level here just
 * surfaces the same data without aggregation.
 *
 * Auth: middleware enforces admin role via the /api/admin prefix.
 *
 * Query params:
 *   from         ISO timestamp (default: today midnight)
 *   to           ISO timestamp (default: now)
 *   rep_id?      UUID — narrow to one rep
 *   type?        visit_type literal — narrow to one type
 *   outcome?     outcome literal — narrow to one outcome
 */

import { NextRequest, NextResponse } from 'next/server'
import { isValidRepId, isValidVisitType, isValidOutcome } from '@/lib/adminFilters'
import { visitsServiceForCaller } from '@/lib/wiring/visits'
import { toAdminVisitWireDto } from '@/lib/api/visits/dto'
import { ServiceError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    // F-RLS-04g: run reads as the caller (authenticated role → visits RLS fires).
    // Admin-only route (middleware enforces the /api/admin prefix) → is_admin()
    // in the visits policies grants admin ALL reps' rows. Per-request, never shared.
    const visitsService = await visitsServiceForCaller(userId)

    const now = new Date()
    const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0)
    const params = req.nextUrl.searchParams
    const from    = params.get('from') ?? todayMidnight.toISOString()
    const to      = params.get('to')   ?? now.toISOString()
    const repId   = params.get('rep_id')
    const type    = params.get('type')
    const outcome = params.get('outcome')

    // Input validation — reject malformed params with a clean 400
    // rather than letting Supabase return a 500 on a bad UUID/enum.
    // The validators live in lib/adminFilters.ts as the canonical
    // server-side source-of-truth, mirroring the page-private
    // VisitType / Outcome unions in app/visits/page.tsx:76-77.
    if (!isValidRepId(repId)) {
      return NextResponse.json({ error: 'invalid rep_id' }, { status: 400 })
    }
    if (!isValidVisitType(type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 })
    }
    if (!isValidOutcome(outcome)) {
      return NextResponse.json({ error: 'invalid outcome' }, { status: 400 })
    }

    let visits
    try {
      visits = await visitsService.listAllWithFilters({ from, to, repId, type, outcome })
    } catch (err) {
      // R3: preserve the exact DB-failure 500 body the route emitted today.
      if (err instanceof ServiceError) {
        console.error('[admin/visits] DB error:', err.message)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
      throw err
    }

    // Route-edge prettify (enums carried RAW by the dto). Spread re-assigns
    // visitType/outcome in place so key ORDER is unchanged.
    const rows = visits.map(v => {
      const dto = toAdminVisitWireDto(v)
      return {
        ...dto,
        visitType: String(dto.visitType ?? '').replace(/_/g, ' '),
        outcome:   String(dto.outcome ?? '').replace(/_/g, ' '),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[admin/visits] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
