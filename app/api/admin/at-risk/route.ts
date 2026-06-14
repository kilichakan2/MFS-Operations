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
import { supabaseService } from '@/lib/adapters/supabase/client'
import { deriveAtRiskReason } from '@/lib/adminDerivations'

const supabase = supabaseService

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

    const res = await supabase
      .from('visits')
      .select('id, created_at, outcome, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)')
      .in('outcome', ['at_risk', 'lost'])
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })

    if (res.error) {
      console.error('[admin/at-risk] DB error:', res.error.code, res.error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const rows = (res.data ?? []).map((v: Record<string, unknown>) => {
      const cust = v.customers as { name: string } | null
      const usr  = (v['users'] as { name: string } | null)
      const outcome = v.outcome as 'at_risk' | 'lost'
      const hoursAgo = Math.round((now.getTime() - new Date(v.created_at as string).getTime()) / 3_600_000)
      return {
        id:       v.id,
        customer: cust?.name ?? (v.prospect_name as string) ?? 'Unknown',
        outcome,
        rep:      usr?.name ?? 'Unknown',
        hoursAgo,
        reason:   deriveAtRiskReason(outcome, hoursAgo),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[admin/at-risk] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
