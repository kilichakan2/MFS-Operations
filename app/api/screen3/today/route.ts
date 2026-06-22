/**
 * GET /api/screen3/today
 *
 * Returns visits for the My Visits tab on /visits.
 *
 * Role logic:
 *   admin / office → returns ALL visits from all reps (no user_id filter)
 *   sales / other  → returns only the current user's own visits
 *
 * Date filtering:
 *   The "Today only" restriction has been removed — the frontend date chips
 *   (Today / Yesterday / This Week / This Month / All Time) do client-side
 *   filtering on the full result set. The API now returns all visits in scope.
 *
 * Auth: middleware injects x-mfs-user-id and x-mfs-user-role headers.
 *
 * F-18 PR2: re-pointed onto visitsService + toTodayVisitWireDto — no direct
 * @supabase / /rest/v1 access. Wire output is byte-identical (snake_case).
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsService } from '@/lib/wiring/visits'
import { toTodayVisitWireDto, type TodayVisitDto } from '@/lib/api/visits/dto'
import { ServiceError } from '@/lib/errors'

// Re-export the wire shape under its historical name. app/visits/page.tsx
// imports `TodayVisit` from this route; TodayVisitDto is the same shape (the
// dto is now the single source of truth), so the consumer keeps compiling
// unchanged (F-18 PR2 — zero behaviour change).
export type TodayVisit = TodayVisitDto

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  try {
    // Admin and office see all reps' visits; sales sees only their own
    const isManager = role === 'admin' || role === 'office'

    const visits = await visitsService.listForCaller({ userId, isManager })

    return NextResponse.json({ visits: visits.map(toTodayVisitWireDto) })
  } catch (err) {
    // R3: preserve the exact DB-failure 500 body the route emitted today.
    if (err instanceof ServiceError) {
      console.error('[screen3/today] fetch error:', err.message)
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
    }
    console.error('[screen3/today GET] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
