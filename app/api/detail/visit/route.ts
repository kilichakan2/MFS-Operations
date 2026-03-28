export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const params = new URLSearchParams({
      select: [
        'id', 'created_at', 'visit_type', 'outcome', 'pipeline_status',
        'commitment_made', 'commitment_detail', 'notes',
        'prospect_name', 'prospect_postcode',
        'customers(id,name)',
        'users!visits_user_id_fkey(name)',
      ].join(','),
      id: `eq.${id}`,
    })

    const res = await fetch(`${SUPA_URL}/rest/v1/visits?${params}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })

    if (!res.ok) return NextResponse.json({ error: 'DB error' }, { status: 500 })
    const rows = await res.json()
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const r = rows[0]
    return NextResponse.json({
      id:               r.id,
      createdAt:        r.created_at,
      visitType:        String(r.visit_type ?? '').replace(/_/g, ' '),
      outcome:          String(r.outcome ?? '').replace(/_/g, ' '),
      commitmentMade:   r.commitment_made ?? false,
      commitmentDetail: r.commitment_detail ?? null,
      notes:            r.notes ?? null,
      customer:         r.customers?.name ?? null,
      prospectName:     r.prospect_name ?? null,
      prospectPostcode: r.prospect_postcode ?? null,
      loggedBy:         r.users?.name ?? 'Unknown',
      pipelineStatus:   r.pipeline_status ?? 'Logged',
    })
  } catch (err) {
    console.error('[detail/visit]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
