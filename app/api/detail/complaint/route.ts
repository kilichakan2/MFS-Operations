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
        'id', 'created_at', 'category', 'description', 'received_via',
        'status', 'resolution_note', 'resolved_at',
        'customers(id,name)',
        'users!complaints_user_id_fkey(name)',
        'resolvedBy:users!complaints_resolved_by_fkey(name)',
      ].join(','),
      id: `eq.${id}`,
    })

    const res = await fetch(`${SUPA_URL}/rest/v1/complaints?${params}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })

    if (!res.ok) return NextResponse.json({ error: 'DB error' }, { status: 500 })
    const rows = await res.json()
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const r = rows[0]
    return NextResponse.json({
      id:             r.id,
      createdAt:      r.created_at,
      category:       String(r.category ?? '').replace(/_/g, ' '),
      description:    r.description ?? '',
      receivedVia:    String(r.received_via ?? '').replace(/_/g, ' '),
      status:         r.status,
      resolutionNote: r.resolution_note ?? null,
      resolvedAt:     r.resolved_at ?? null,
      customer:       r.customers?.name ?? 'Unknown',
      loggedBy:       r.users?.name ?? 'Unknown',
      resolvedBy:     r.resolvedBy?.name ?? null,
    })
  } catch (err) {
    console.error('[detail/complaint]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
