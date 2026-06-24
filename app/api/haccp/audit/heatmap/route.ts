/**
 * app/api/haccp/audit/heatmap/route.ts
 *
 * GET /api/haccp/audit/heatmap?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns heatmap data for ALL sections in one call.
 * Lightweight — only fetches date, session, status fields.
 * No full row data. Fires on page load so heatmap is always
 * fully populated regardless of which section tab is active.
 *
 * Admin only.
 *
 * F-19 PR8: thin doorman — role-check → ask the reporting service → return.
 * All shaping lives in HaccpReportingService (PR7).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpReportingService }     from '@/lib/wiring/haccp'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl
    const from = searchParams.get('from') ?? daysAgo(30)
    const to   = searchParams.get('to')   ?? todayUK()

    const result = await haccpReportingService.getAuditHeatmap(from, to)
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/audit/heatmap]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
