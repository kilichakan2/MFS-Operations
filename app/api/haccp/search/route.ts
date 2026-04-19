/**
 * app/api/haccp/search/route.ts
 *
 * GET /api/haccp/search?q=steriliser
 * Full-text search across all haccp_sop_content using Postgres tsvector.
 * Returns ranked results with highlighted snippets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const q = req.nextUrl.searchParams.get('q')?.trim()
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const { data, error } = await supabase.rpc('haccp_search', { query: q })

    if (error) {
      console.error('[GET /api/haccp/search]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ results: data ?? [], query: q })

  } catch (err) {
    console.error('[GET /api/haccp/search] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
