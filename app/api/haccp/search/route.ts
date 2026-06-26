/**
 * app/api/haccp/search/route.ts
 *
 * GET /api/haccp/search?q=steriliser
 * Full-text search across all haccp_sop_content using Postgres tsvector.
 * Returns ranked results with highlighted snippets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpHandbookServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpHandbookServiceForCaller(userId)

    const q = req.nextUrl.searchParams.get('q')?.trim()

    const result = await svc.search(q)
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/search] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
