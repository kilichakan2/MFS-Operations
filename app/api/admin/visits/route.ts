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
import { supabaseService } from '@/lib/adapters/supabase/client'
import { isValidRepId, isValidVisitType, isValidOutcome } from '@/lib/adminFilters'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

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

    let query = supabase
      .from('visits')
      .select('id, created_at, outcome, visit_type, notes, pipeline_status, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(200)

    if (repId)   query = query.eq('user_id',     repId)
    if (type)    query = query.eq('visit_type',  type)
    if (outcome) query = query.eq('outcome',     outcome)

    const res = await query

    if (res.error) {
      console.error('[admin/visits] DB error:', res.error.code, res.error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const rows = (res.data ?? []).map((v: Record<string, unknown>) => {
      const cust = v.customers as { name: string } | null
      const usr  = (v['users'] as { name: string } | null)
      return {
        id:             v.id,
        customer:       cust?.name ?? (v.prospect_name as string) ?? 'Unknown',
        rep:            usr?.name ?? 'Unknown',
        visitType:      String(v.visit_type ?? '').replace(/_/g, ' '),
        outcome:        String(v.outcome ?? '').replace(/_/g, ' '),
        notes:          v.notes ? String(v.notes) : null,
        pipelineStatus: v.pipeline_status ? String(v.pipeline_status) : null,
        createdAt:      v.created_at as string,
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[admin/visits] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
