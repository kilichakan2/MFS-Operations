/**
 * app/api/haccp/overview/route.ts
 *
 * GET /api/haccp/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Admin-only. Returns aggregated HACCP data for a date range.
 * Used by the weekly/monthly overview overlay on the reviews page.
 *
 * F-19 PR8: thin doorman — role-check → require both dates → ask the reporting
 * service → return. All shaping lives in HaccpReportingService (PR7).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpReportingServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const svc = await haccpReportingServiceForCaller(userId)

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to date parameters required' }, { status: 400 })
    }

    const result = await svc.getOverview(from, to)
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/overview] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
