/**
 * app/api/haccp/handbook/route.ts
 *
 * GET /api/haccp/handbook?section=cold_storage
 * Returns SOP content from haccp_sop_content for a given section key.
 * Single source of truth — content lives in DB, not hardcoded.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpHandbookService }      from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const section = req.nextUrl.searchParams.get('section')
    const doc     = req.nextUrl.searchParams.get('doc')

    const result = await haccpHandbookService.getHandbook({ section, doc })
    if ('ok' in result && result.ok === false) {
      return NextResponse.json({ error: result.message }, { status: result.status })
    }

    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/handbook] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
