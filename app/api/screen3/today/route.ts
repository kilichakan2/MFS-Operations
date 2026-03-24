/**
 * GET /api/screen3/today
 *
 * Returns today's visits logged by the current user.
 * Used by the Screen 3 activity feed and daily progress stats.
 * Auth: middleware injects x-mfs-user-id header.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export interface TodayVisit {
  id:                string
  created_at:        string
  visit_type:        string
  outcome:           string
  commitment_made:   boolean
  commitment_detail: string | null
  notes:             string | null
  customer_id:       string | null
  customer_name:     string | null
  prospect_name:     string | null
  prospect_postcode: string | null
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // Today midnight in UTC — consistent with the rest of the app
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Fetch visits with customer name joined
  const res = await fetch(
    `${SUPA_URL}/rest/v1/visits` +
    `?select=id,created_at,visit_type,outcome,commitment_made,commitment_detail,notes,` +
    `customer_id,prospect_name,prospect_postcode,` +
    `customers!visits_customer_id_fkey(name)` +
    `&user_id=eq.${userId}` +
    `&created_at=gte.${todayStart.toISOString()}` +
    `&order=created_at.desc`,
    {
      headers: {
        'apikey':         SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('[screen3/today] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
  }

  const raw = await res.json() as {
    id: string; created_at: string; visit_type: string; outcome: string
    commitment_made: boolean; commitment_detail: string | null; notes: string | null
    customer_id: string | null; prospect_name: string | null; prospect_postcode: string | null
    customers: { name: string } | null
  }[]

  const visits: TodayVisit[] = raw.map(r => ({
    id:                r.id,
    created_at:        r.created_at,
    visit_type:        r.visit_type,
    outcome:           r.outcome,
    commitment_made:   r.commitment_made,
    commitment_detail: r.commitment_detail,
    notes:             r.notes,
    customer_id:       r.customer_id,
    customer_name:     r.customers?.name ?? null,
    prospect_name:     r.prospect_name,
    prospect_postcode: r.prospect_postcode,
  }))

  return NextResponse.json({ visits })
}
