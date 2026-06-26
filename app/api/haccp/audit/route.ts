/**
 * app/api/haccp/audit/route.ts
 *
 * GET /api/haccp/audit?section=deliveries&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns section-specific audit data within a date range.
 * Lazy-loaded per tab — each section fetched only when clicked.
 * Admin only.
 *
 * F-19 PR8: thin doorman — role-check → require section → ask the reporting
 * service → return. All shaping lives in HaccpReportingService (PR7). DB
 * failures now throw out of the service and fall through to the outer
 * 'Server error' catch (R6) — no raw Postgres text is echoed to the client.
 * An unknown section still returns HTTP 400 with the service's `{ error }`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpReportingServiceForCaller } from '@/lib/wiring/haccp'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const svc = await haccpReportingServiceForCaller(userId)

    const { searchParams } = req.nextUrl
    const section = searchParams.get('section')
    const from    = searchParams.get('from') ?? daysAgo(30)
    const to      = searchParams.get('to')   ?? todayUK()

    if (!section) {
      return NextResponse.json({ error: 'section param required' }, { status: 400 })
    }

    const result = await svc.getAuditSection(section, from, to)

    // Unknown section → the service returns `{ error: 'Unknown section: …' }`;
    // preserve the route's historical HTTP 400 for that case (byte-identical).
    if ('error' in result) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/audit]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
