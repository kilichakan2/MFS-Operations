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
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export interface TodayVisit {
  id:                string
  created_at:        string
  visit_type:        string
  outcome:           string
  pipeline_status:   string
  commitment_made:   boolean
  commitment_detail: string | null
  notes:             string | null
  customer_id:       string | null
  customer_name:     string | null
  prospect_name:     string | null
  prospect_postcode: string | null
  logged_by_name:    string | null   // populated for admin/office views
  logged_by_id:      string | null
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  try {
  // Admin and office see all reps' visits; sales sees only their own
  const isManager = role === 'admin' || role === 'office'

  const selectFields = [
    'id', 'created_at', 'visit_type', 'outcome', 'pipeline_status',
    'commitment_made', 'commitment_detail', 'notes',
    'customer_id', 'prospect_name', 'prospect_postcode',
    'customers!visits_customer_id_fkey(name)',
    'rep:users!visits_user_id_fkey(id,name)',
  ].join(',')

  // Build query — only apply user_id filter for non-managers
  const userFilter = isManager ? '' : `&user_id=eq.${userId}`

  const url =
    `${SUPA_URL}/rest/v1/visits` +
    `?select=${encodeURIComponent(selectFields)}` +
    userFilter +
    `&order=created_at.desc`

  const res = await fetch(url, {
    headers: {
      'apikey':         SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
    },
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[screen3/today] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
  }

  const raw = await res.json() as {
    id: string; created_at: string; visit_type: string; outcome: string
    pipeline_status: string; commitment_made: boolean
    commitment_detail: string | null; notes: string | null
    customer_id: string | null; prospect_name: string | null; prospect_postcode: string | null
    customers: { name: string } | null
    rep: { id: string; name: string } | null
  }[]

  const visits: TodayVisit[] = raw.map(r => ({
    id:                r.id,
    created_at:        r.created_at,
    visit_type:        r.visit_type,
    outcome:           r.outcome,
    pipeline_status:   r.pipeline_status ?? 'Logged',
    commitment_made:   r.commitment_made,
    commitment_detail: r.commitment_detail,
    notes:             r.notes,
    customer_id:       r.customer_id,
    customer_name:     r.customers?.name ?? null,
    prospect_name:     r.prospect_name,
    prospect_postcode: r.prospect_postcode,
    logged_by_name:    r.rep?.name ?? null,
    logged_by_id:      r.rep?.id   ?? null,
  }))

  return NextResponse.json({ visits })
  } catch (err) {
    console.error('[screen3/today GET] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
