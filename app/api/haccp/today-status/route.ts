/**
 * app/api/haccp/today-status/route.ts
 * Returns today's HACCP completion state for the home screen tiles.
 *
 * F-19 PR8: thin doorman — role-check → ask the reporting service → return.
 * All shaping lives in HaccpReportingService (PR7); this route imports no
 * vendor SDK directly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpReportingServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpReportingServiceForCaller(userId)

    const result = await svc.getTodayStatus(new Date())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/haccp/today-status]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
