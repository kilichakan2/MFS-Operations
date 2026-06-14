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
import { supabaseService } from '@/lib/adapters/supabase/client'
import { deriveCommitmentStatus } from '@/lib/adminDerivations'

const supabase = supabaseService

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

    let query = supabase
      .from('visits')
      .select('id, created_at, commitment_detail, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)')
      .eq('commitment_made', true)
      .lt('created_at', to)
      .order('created_at', { ascending: true })

    if (from) query = query.gte('created_at', from)

    const res = await query

    if (res.error) {
      console.error('[admin/commitments] DB error:', res.error.code, res.error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const rows = (res.data ?? []).map((v: Record<string, unknown>) => {
      const cust = v.customers as { name: string } | null
      const usr  = (v['users'] as { name: string } | null)
      const hoursAgo = Math.round((now.getTime() - new Date(v.created_at as string).getTime()) / 3_600_000)
      return {
        id:       v.id,
        customer: cust?.name ?? (v.prospect_name as string) ?? 'Unknown',
        detail:   v.commitment_detail as string ?? '',
        rep:      usr?.name ?? 'Unknown',
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
