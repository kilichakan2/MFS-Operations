export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/commitments
 *
 * Row-level unreviewed commitments list for the /admin/commitments page.
 *
 * Mirrors the dashboard's commitments query at /api/dashboard:75-81,
 * with one shape addition: a server-side derived `status` enum per
 * the Item 5a.1 PR B Gate 2 column-gap amendment. The other amendment
 * column (`due_date`) is dropped because the `visits` table has no
 * `commitment_due` (or similarly-named) column today; the no-schema-
 * change hard constraint binds. As a pragmatic substitute the status
 * is derived from the same `hoursAgo > 24` threshold the dashboard
 * already uses for its red overdue pill.
 *
 * Auth: middleware enforces admin role via the /api/admin prefix.
 *
 * Window defaults to "commitments older than 24h" (the dashboard's
 * rolling window). Optional ?from=ISO&to=ISO override.
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsService } from '@/lib/wiring/visits'
import { deriveCommitmentStatus } from '@/lib/adminDerivations'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const now = new Date()
    const defaultTo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const params = req.nextUrl.searchParams
    const from = params.get('from')
    const to   = params.get('to') ?? defaultTo

    // F-20 PR2: read through the owned VisitsService over the VisitsRepository
    // port — no raw supabaseService in app code. `now`/window-default + the
    // hoursAgo projection + deriveCommitmentStatus stay here (presentation).
    // R2: the repo uses lt('created_at', to) and applies `from` only when present.
    const visits = await visitsService.listCommitments({ from, to })

    const rows = visits.map((v) => {
      const hoursAgo = Math.round((now.getTime() - new Date(v.createdAt).getTime()) / 3_600_000)
      return {
        id:       v.id,
        customer: v.customerName ?? v.prospectName ?? 'Unknown',
        detail:   v.commitmentDetail ?? '',
        rep:      v.loggedByName ?? 'Unknown',
        hoursAgo,
        status:   deriveCommitmentStatus(hoursAgo),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[admin/commitments] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
