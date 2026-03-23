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
        'id', 'created_at', 'status', 'reason',
        'ordered_qty', 'sent_qty', 'unit', 'note',
        'customers(id,name)',
        'products(id,name,category)',
        'users!discrepancies_user_id_fkey(name)',
      ].join(','),
      id: `eq.${id}`,
    })

    const res = await fetch(`${SUPA_URL}/rest/v1/discrepancies?${params}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })

    if (!res.ok) return NextResponse.json({ error: 'DB error' }, { status: 500 })
    const rows = await res.json()
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const r = rows[0]
    return NextResponse.json({
      id:         r.id,
      createdAt:  r.created_at,
      status:     r.status,
      reason:     String(r.reason ?? '').replace(/_/g, ' '),
      orderedQty: r.ordered_qty != null ? Number(r.ordered_qty) : null,
      sentQty:    r.sent_qty    != null ? Number(r.sent_qty)    : null,
      unit:       r.unit ?? '',
      note:       r.note ?? null,
      customer:   r.customers?.name ?? 'Unknown',
      product:    r.products?.name  ?? 'Unknown',
      category:   r.products?.category ?? null,
      loggedBy:   r.users?.name ?? 'Unknown',
    })
  } catch (err) {
    console.error('[detail/discrepancy]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
