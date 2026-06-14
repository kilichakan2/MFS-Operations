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
import { supabaseService } from '@/lib/adapters/supabase/client'

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
      .select('id, created_at, prospect_name, prospect_postcode, outcome, visit_type, pipeline_status, users!visits_user_id_fkey(name)')
      .not('prospect_name', 'is', null)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })

    if (res.error) {
      console.error('[admin/prospects] DB error:', res.error.code, res.error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const rows = (res.data ?? []).map((v: Record<string, unknown>) => {
      const usr = (v['users'] as { name: string } | null)
      return {
        id:        v.id,
        name:      String(v.prospect_name ?? ''),
        postcode:  String(v.prospect_postcode ?? ''),
        outcome:   String(v.outcome ?? '').replace(/_/g, ' '),
        visitType: String(v.visit_type ?? '').replace(/_/g, ' '),
        rep:       usr?.name ?? 'Unknown',
        stage:     v.pipeline_status ? String(v.pipeline_status) : null,
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[admin/prospects] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
