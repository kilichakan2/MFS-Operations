/**
 * app/api/haccp/search/route.ts
 *
 * GET /api/haccp/search?q=steriliser
 * Full-text search across all haccp_sop_content using Postgres tsvector.
 * Returns ranked results with highlighted snippets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpHandbookService }      from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const q = req.nextUrl.searchParams.get('q')?.trim()

    const result = await haccpHandbookService.search(q)
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/search] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
