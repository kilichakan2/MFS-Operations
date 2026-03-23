export const dynamic = 'force-dynamic'

/**
 * GET /api/screen2/open
 * Returns ALL OPEN complaints (any user), newest first, with logger name.
 * Uses raw fetch() to the Supabase REST API (avoids cold-start client issues).
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const params = new URLSearchParams({
      select: 'id,created_at,category,description,customers(name),users!complaints_user_id_fkey(name)',
      status: 'eq.open',
      order:  'created_at.desc',
    })

    const res = await fetch(`${SUPA_URL}/rest/v1/complaints?${params}`, {
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[screen2/open] Supabase error:', res.status, text.slice(0, 200))
      return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 })
    }

    const rows = await res.json() as {
      id: string
      created_at: string
      category: string
      description: string
      customers: { name: string } | null
      users:     { name: string } | null
    }[]

    const complaints = rows.map((r) => ({
      id:          r.id,
      createdAt:   r.created_at,
      category:    r.category.replace(/_/g, ' '),
      description: r.description,
      customer:    r.customers?.name ?? 'Unknown',
      loggedBy:    r.users?.name     ?? 'Unknown',
    }))

    return NextResponse.json(complaints)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screen2/open] Unhandled error:', msg)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
