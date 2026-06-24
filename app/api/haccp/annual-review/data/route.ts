/**
 * app/api/haccp/annual-review/data/route.ts
 *
 * Returns live reference data for annual review data panels.
 * Data is for context only — not stored with the review record.
 *
 * Query params:
 *   from  — review period start (ISO date) — for period-filtered sections
 *   to    — review period end   (ISO date)
 *
 * F-19 PR8: thin doorman — role-check → ask the reporting service → return.
 * `from`/`to` are optional (period-filtered sections fall back to empties when
 * absent). All shaping lives in HaccpReportingService (PR7).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpReportingService }     from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')  // ISO date e.g. 2025-05-01
    const to   = searchParams.get('to')    // ISO date e.g. 2026-05-01

    const result = await haccpReportingService.getAnnualReviewData(from, to)
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/annual-review/data]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
